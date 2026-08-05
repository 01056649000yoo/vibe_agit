-- 학생 자율 글쓰기의 두 번째 유형: 일기.
--
-- 독서록 모듈을 복사하지 않는다. 독서록 부피의 절반 이상이 책 카탈로그·내 서재·책 기준 초안이라
-- 일기에는 버릴 코드다. 이미 유형별로 일반화되어 있는 층(writing_types / class_writing_policies /
-- writing_reward_claims)에 유형 하나를 더 얹고, 일기 전용 저장 RPC만 새로 둔다.
--
-- 축이 다르다: 독서록은 `책 한 권에 하나`, 일기는 **`하루에 하나`** 다.
-- 그래서 보상 원장의 source_key 를 일기 날짜로 잡는다. 지웠다 다시 써도 그 날짜의 보상은 한 번뿐이고,
-- `한 날짜 한 일기` 도 DB 유일 인덱스로 보장한다.
--
-- 공개 기본값은 **비공개**다(사용자 결정). 독서록은 서로 읽으라고 기본 공개지만 일기는 개인적인 글이라
-- 학생이 원할 때만 친구에게 연다.

BEGIN;

INSERT INTO public.writing_types (id, label, completion_flow, default_policy, is_active)
VALUES (
    'diary',
    '일기',
    'student_complete',
    jsonb_build_object(
        'min_chars', 150,
        'min_paragraphs', 1,
        'base_reward', 80,
        'bonus_enabled', false,
        'bonus_threshold', 0,
        'bonus_reward', 0,
        'daily_reward_limit', 1
    ),
    true
)
ON CONFLICT (id) DO NOTHING;

-- 정책 시드 트리거는 학급이 새로 만들어질 때만 돈다. 기존 학급에도 일기 정책을 채워 준다.
INSERT INTO public.class_writing_policies (
    class_id, writing_type, min_chars, min_paragraphs, base_reward,
    bonus_enabled, bonus_threshold, bonus_reward, daily_reward_limit
)
SELECT
    c.id, 'diary',
    COALESCE((wt.default_policy ->> 'min_chars')::INTEGER, 0),
    COALESCE((wt.default_policy ->> 'min_paragraphs')::INTEGER, 0),
    COALESCE((wt.default_policy ->> 'base_reward')::INTEGER, 0),
    COALESCE((wt.default_policy ->> 'bonus_enabled')::BOOLEAN, false),
    COALESCE((wt.default_policy ->> 'bonus_threshold')::INTEGER, 0),
    COALESCE((wt.default_policy ->> 'bonus_reward')::INTEGER, 0),
    GREATEST(1, COALESCE((wt.default_policy ->> 'daily_reward_limit')::INTEGER, 1))
FROM public.classes c
CROSS JOIN public.writing_types wt
WHERE wt.id = 'diary'
ON CONFLICT (class_id, writing_type) DO NOTHING;

-- 한 학생이 같은 날짜로 일기를 두 편 만들 수 없다.
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_diary_per_day
    ON public.student_posts (student_id, ((structured_content ->> 'diaryDate')))
    WHERE writing_context = 'self' AND self_writing_type = 'diary';

-- 내 일기 목록·달력을 학급·학생으로 직접 좁혀 읽는다.
CREATE INDEX IF NOT EXISTS idx_student_posts_diary_date
    ON public.student_posts (class_id, student_id, ((structured_content ->> 'diaryDate')) DESC)
    WHERE writing_context = 'self' AND self_writing_type = 'diary';

/**
 * 일기 저장·완료.
 *
 * 독서록의 `upsert_my_reading_log_rewarded` 와 같은 계약을 따른다 —
 * 분량 검증 → 저장 → 최초 1회 보상 → 일일 상한. 다른 점은 열쇠가 책이 아니라 날짜라는 것뿐이다.
 */
CREATE OR REPLACE FUNCTION public.upsert_my_diary(
    p_post_id UUID,
    p_diary_date DATE,
    p_title TEXT,
    p_content TEXT,
    p_visibility TEXT DEFAULT 'private'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID;
    v_total_points INTEGER := 0;
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
    v_diary_date DATE := COALESCE(p_diary_date, (NOW() AT TIME ZONE 'Asia/Seoul')::DATE);
    v_visibility TEXT := CASE WHEN p_visibility = 'class' THEN 'class' ELSE 'private' END;
    v_char_count INTEGER;
    v_paragraph_count INTEGER;
    v_policy_enabled BOOLEAN;
    v_min_chars INTEGER;
    v_min_paragraphs INTEGER;
    v_base_reward INTEGER;
    v_bonus_enabled BOOLEAN;
    v_bonus_threshold INTEGER;
    v_bonus_reward INTEGER;
    v_daily_limit INTEGER;
    v_daily_awarded INTEGER := 0;
    v_points_to_award INTEGER := 0;
    v_reward_status TEXT := 'no_reward';
    v_post_id UUID;
    v_claim_id UUID;
    v_policy_snapshot JSONB;
    v_is_new_completion BOOLEAN := p_post_id IS NULL;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    IF v_diary_date > v_today THEN
        RAISE EXCEPTION '아직 오지 않은 날의 일기는 쓸 수 없어요.' USING ERRCODE = 'P0001';
    END IF;

    -- 같은 학생의 동시 완료를 직렬화해 일일 상한과 포인트 합계를 안전하게 계산한다.
    SELECT s.class_id, COALESCE(s.total_points, 0)
    INTO v_class_id, v_total_points
    FROM public.students s
    WHERE s.id = v_student_id
      AND s.is_active IS DISTINCT FROM false
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
    FOR UPDATE;

    IF v_class_id IS NULL THEN
        RAISE EXCEPTION '현재 로그인과 연결된 학생을 찾을 수 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT
        p.is_enabled, p.min_chars, p.min_paragraphs, p.base_reward,
        p.bonus_enabled, p.bonus_threshold, p.bonus_reward, p.daily_reward_limit
    INTO
        v_policy_enabled, v_min_chars, v_min_paragraphs, v_base_reward,
        v_bonus_enabled, v_bonus_threshold, v_bonus_reward, v_daily_limit
    FROM public.class_writing_policies p
    WHERE p.class_id = v_class_id
      AND p.writing_type = 'diary';

    v_policy_enabled := COALESCE(v_policy_enabled, true);
    v_min_chars := COALESCE(v_min_chars, 150);
    v_min_paragraphs := COALESCE(v_min_paragraphs, 1);
    v_base_reward := COALESCE(v_base_reward, 80);
    v_bonus_enabled := COALESCE(v_bonus_enabled, false);
    v_bonus_threshold := COALESCE(v_bonus_threshold, 0);
    v_bonus_reward := COALESCE(v_bonus_reward, 0);
    v_daily_limit := GREATEST(1, COALESCE(v_daily_limit, 1));

    v_char_count := public.writing_content_char_count(p_content);
    v_paragraph_count := public.writing_content_paragraph_count(p_content);

    IF v_policy_enabled AND v_char_count < v_min_chars THEN
        RAISE EXCEPTION '일기를 작성 완료하려면 최소 %자 이상 써야 해요. (현재 %자)', v_min_chars, v_char_count
            USING ERRCODE = 'P0001';
    END IF;
    IF v_policy_enabled AND v_paragraph_count < v_min_paragraphs THEN
        RAISE EXCEPTION '일기를 작성 완료하려면 최소 %문단 이상 써야 해요. (현재 %문단)', v_min_paragraphs, v_paragraph_count
            USING ERRCODE = 'P0001';
    END IF;

    IF p_post_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.student_posts post
        WHERE post.id = p_post_id
          AND post.student_id = v_student_id
          AND post.class_id = v_class_id
          AND post.writing_context = 'self'
          AND post.self_writing_type = 'diary'
    ) THEN
        RAISE EXCEPTION '수정할 내 일기를 찾을 수 없습니다.' USING ERRCODE = '42501';
    END IF;

    v_policy_snapshot := jsonb_build_object(
        'min_chars', v_min_chars,
        'min_paragraphs', v_min_paragraphs,
        'base_reward', v_base_reward,
        'bonus_enabled', v_bonus_enabled,
        'bonus_threshold', v_bonus_threshold,
        'bonus_reward', v_bonus_reward,
        'daily_reward_limit', v_daily_limit
    );

    IF p_post_id IS NULL THEN
        INSERT INTO public.student_posts (
            student_id, class_id, mission_id, writing_context, self_writing_type,
            title, content, char_count, paragraph_count, structured_content,
            visibility, is_submitted, awarded_base_reward,
            awarded_bonus_threshold, awarded_bonus_reward
        ) VALUES (
            v_student_id, v_class_id, NULL, 'self', 'diary',
            btrim(p_title), p_content, v_char_count, v_paragraph_count,
            jsonb_build_object('type', 'diary', 'diaryDate', v_diary_date::TEXT),
            v_visibility, true, v_base_reward,
            CASE WHEN v_bonus_enabled THEN v_bonus_threshold ELSE 0 END,
            CASE WHEN v_bonus_enabled THEN v_bonus_reward ELSE 0 END
        )
        RETURNING id INTO v_post_id;
    ELSE
        UPDATE public.student_posts
        SET title = btrim(p_title),
            content = p_content,
            char_count = v_char_count,
            paragraph_count = v_paragraph_count,
            structured_content = jsonb_build_object('type', 'diary', 'diaryDate', v_diary_date::TEXT),
            visibility = v_visibility,
            is_submitted = true
        WHERE id = p_post_id
          AND student_id = v_student_id
          AND class_id = v_class_id
          AND writing_context = 'self'
          AND self_writing_type = 'diary'
        RETURNING id INTO v_post_id;

        IF v_post_id IS NULL THEN
            RAISE EXCEPTION '수정할 내 일기를 찾을 수 없습니다.' USING ERRCODE = '42501';
        END IF;
    END IF;

    IF v_is_new_completion THEN
        IF NOT v_policy_enabled THEN
            v_reward_status := 'policy_disabled';
        ELSE
            SELECT count(*)::INTEGER
            INTO v_daily_awarded
            FROM public.writing_reward_claims claim
            WHERE claim.student_id = v_student_id
              AND claim.class_id = v_class_id
              AND claim.writing_type = 'diary'
              AND claim.reward_kind = 'completion'
              AND claim.awarded_points > 0
              AND claim.created_at >= (
                  date_trunc('day', NOW() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul'
              );

            IF v_daily_awarded >= v_daily_limit THEN
                v_reward_status := 'daily_limit';
            ELSE
                v_points_to_award := v_base_reward;
                IF v_bonus_enabled
                   AND v_bonus_threshold > 0
                   AND v_bonus_reward > 0
                   AND v_char_count >= v_min_chars + v_bonus_threshold THEN
                    v_points_to_award := v_points_to_award + v_bonus_reward;
                END IF;
                v_reward_status := CASE WHEN v_points_to_award > 0 THEN 'awarded' ELSE 'no_reward' END;
            END IF;
        END IF;

        -- 열쇠가 날짜다. 지웠다 같은 날짜로 다시 써도 보상은 한 번뿐이다.
        INSERT INTO public.writing_reward_claims (
            class_id, student_id, writing_type, source_key, source_post_id,
            reward_kind, awarded_points, reward_status, policy_snapshot
        ) VALUES (
            v_class_id, v_student_id, 'diary', v_diary_date::TEXT, v_post_id,
            'completion', v_points_to_award, v_reward_status, v_policy_snapshot
        )
        ON CONFLICT (student_id, writing_type, source_key, reward_kind) DO NOTHING
        RETURNING id INTO v_claim_id;

        IF v_claim_id IS NULL THEN
            v_points_to_award := 0;
            v_reward_status := 'already_claimed';
        ELSIF v_points_to_award > 0 THEN
            PERFORM set_config('app.bypass_student_trigger', 'true', true);
            UPDATE public.students
            SET total_points = COALESCE(total_points, 0) + v_points_to_award
            WHERE id = v_student_id
            RETURNING total_points INTO v_total_points;

            INSERT INTO public.point_logs (
                student_id, class_id, amount, reason, post_id, activity_type
            ) VALUES (
                v_student_id, v_class_id, v_points_to_award,
                '일기 작성 완료 보상', v_post_id, 'writing_reward'
            );
            PERFORM set_config('app.bypass_student_trigger', 'false', true);
        END IF;
    ELSE
        v_reward_status := 'already_completed';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'post_id', v_post_id,
        'diary_date', v_diary_date::TEXT,
        'char_count', v_char_count,
        'paragraph_count', v_paragraph_count,
        'points_awarded', v_points_to_award,
        'reward_status', v_reward_status,
        'total_points', v_total_points
    );
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.bypass_student_trigger', 'false', true);
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_my_diary(UUID, DATE, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_my_diary(UUID, DATE, TEXT, TEXT, TEXT) TO authenticated, service_role;

/** 오늘 일기를 쓸 수 있는지·이미 쓴 날짜인지. 화면이 새 글 버튼을 막는 데 쓴다. */
CREATE OR REPLACE FUNCTION public.get_my_diary_daily_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID;
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
    v_daily_limit INTEGER;
    v_completed_today INTEGER := 0;
    v_has_today BOOLEAN := false;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT s.class_id INTO v_class_id FROM public.students s WHERE s.id = v_student_id;

    SELECT GREATEST(1, COALESCE(p.daily_reward_limit, 1))
    INTO v_daily_limit
    FROM public.class_writing_policies p
    WHERE p.class_id = v_class_id AND p.writing_type = 'diary';
    v_daily_limit := GREATEST(1, COALESCE(v_daily_limit, 1));

    SELECT count(*)::INTEGER
    INTO v_completed_today
    FROM public.writing_reward_claims claim
    WHERE claim.student_id = v_student_id
      AND claim.class_id = v_class_id
      AND claim.writing_type = 'diary'
      AND claim.reward_kind = 'completion'
      AND claim.created_at >= (date_trunc('day', NOW() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul');

    SELECT EXISTS (
        SELECT 1 FROM public.student_posts post
        WHERE post.class_id = v_class_id
          AND post.student_id = v_student_id
          AND post.writing_context = 'self'
          AND post.self_writing_type = 'diary'
          AND post.structured_content ->> 'diaryDate' = v_today::TEXT
    ) INTO v_has_today;

    RETURN jsonb_build_object(
        'today', v_today::TEXT,
        'daily_limit', v_daily_limit,
        'completed_today', v_completed_today,
        'remaining_today', GREATEST(0, v_daily_limit - v_completed_today),
        'can_complete', v_completed_today < v_daily_limit,
        'has_today_diary', v_has_today
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_diary_daily_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_diary_daily_status() TO authenticated, service_role;

/** 내 일기 삭제. 글만 지우고 완료 원장은 남겨 같은 날짜 재작성으로 포인트가 다시 나가지 않게 한다. */
CREATE OR REPLACE FUNCTION public.delete_my_diary(p_post_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT s.class_id INTO v_class_id FROM public.students s WHERE s.id = v_student_id;

    DELETE FROM public.student_posts post
    WHERE post.id = p_post_id
      AND post.student_id = v_student_id
      AND post.class_id = v_class_id
      AND post.writing_context = 'self'
      AND post.self_writing_type = 'diary';

    IF NOT FOUND THEN
        RAISE EXCEPTION '삭제할 일기를 찾지 못했습니다.' USING ERRCODE = 'P0002';
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_diary(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_diary(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
