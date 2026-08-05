-- 독서록을 지우면 등록해 둔 책도 함께 사라지게 한다.
--
-- 학생에게 `책 + 내가 쓴 글` 은 한 덩어리다. 그런데 삭제하면 글만 없어지고 책은 책장에 남아
-- "지웠는데 왜 그대로지?" 가 됐다. 학생이 쓰는 화면이므로 보이는 대로 동작해야 한다.
--
-- 함께 바꾸는 것: 독서록 보상 원장의 source_key 를 `student_library_items.id` → `book_id` 로 옮긴다.
-- 원장은 같은 책을 지웠다 다시 써도 포인트를 다시 주지 않으려고 두는 것인데, 책까지 지우면
-- 다시 등록할 때 새 library_item_id 가 생겨 그 방어가 뚫린다. 책 자체를 가리키는 book_id 로
-- 잡으면 삭제·재등록해도 같은 열쇠가 되어 중복 지급이 계속 막힌다.
-- `writing_reward_claims` 는 아직 0행이라 과거 기록 변환은 필요 없다.

BEGIN;

CREATE OR REPLACE FUNCTION public.upsert_my_reading_log_rewarded(p_post_id uuid, p_book jsonb, p_title text, p_content text, p_visibility text DEFAULT 'private'::text, p_reading_status text DEFAULT 'completed'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_student_id UUID;
    v_class_id UUID;
    v_char_count INTEGER;
    v_paragraph_count INTEGER;
    v_min_chars INTEGER := 100;
    v_min_paragraphs INTEGER := 1;
    v_base_reward INTEGER := 50;
    v_bonus_enabled BOOLEAN := false;
    v_bonus_threshold INTEGER := 0;
    v_bonus_reward INTEGER := 0;
    v_daily_limit INTEGER := 3;
    v_policy_enabled BOOLEAN := true;
    v_daily_awarded INTEGER := 0;
    v_points_to_award INTEGER := 0;
    v_total_points INTEGER := 0;
    v_reward_status TEXT := 'no_reward';
    v_result JSONB;
    v_post_id UUID;
    v_library_item_id UUID;
    v_book_id UUID;
    v_claim_id UUID;
    v_policy_snapshot JSONB;
    v_is_new_completion BOOLEAN := p_post_id IS NULL;
BEGIN
    v_student_id := public.auth_student_id();
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    -- 같은 학생의 동시 완료를 직렬화해 일일 상한과 포인트 합계를 안전하게 계산한다.
    SELECT s.class_id, COALESCE(s.total_points, 0)
    INTO v_class_id, v_total_points
    FROM public.students s
    WHERE s.id = v_student_id
      AND s.auth_id = auth.uid()
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
      AND p.writing_type = 'reading_log';

    -- 과거/비정상 학급에 정책 행이 없어도 안전한 기본값으로 동작한다.
    v_policy_enabled := COALESCE(v_policy_enabled, true);
    v_min_chars := COALESCE(v_min_chars, 100);
    v_min_paragraphs := COALESCE(v_min_paragraphs, 1);
    v_base_reward := COALESCE(v_base_reward, 50);
    v_bonus_enabled := COALESCE(v_bonus_enabled, false);
    v_bonus_threshold := COALESCE(v_bonus_threshold, 0);
    v_bonus_reward := COALESCE(v_bonus_reward, 0);
    v_daily_limit := GREATEST(1, COALESCE(v_daily_limit, 3));

    v_char_count := public.writing_content_char_count(p_content);
    v_paragraph_count := public.writing_content_paragraph_count(p_content);

    IF v_policy_enabled AND v_char_count < v_min_chars THEN
        RAISE EXCEPTION '독서록을 작성 완료하려면 최소 %자 이상 써야 해요. (현재 %자)', v_min_chars, v_char_count
            USING ERRCODE = 'P0001';
    END IF;
    IF v_policy_enabled AND v_paragraph_count < v_min_paragraphs THEN
        RAISE EXCEPTION '독서록을 작성 완료하려면 최소 %문단 이상 써야 해요. (현재 %문단)', v_min_paragraphs, v_paragraph_count
            USING ERRCODE = 'P0001';
    END IF;

    IF p_post_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.student_posts p
        WHERE p.id = p_post_id
          AND p.student_id = v_student_id
          AND p.class_id = v_class_id
          AND p.writing_context = 'self'
          AND p.self_writing_type = 'reading_log'
    ) THEN
        RAISE EXCEPTION '수정할 내 독서록을 찾을 수 없습니다.' USING ERRCODE = '42501';
    END IF;

    v_result := public.upsert_my_reading_log_storage(
        p_post_id, p_book, p_title, p_content, p_visibility, p_reading_status
    );
    v_post_id := (v_result ->> 'post_id')::UUID;
    v_library_item_id := (v_result ->> 'library_item_id')::UUID;
    v_book_id := (v_result ->> 'book_id')::UUID;

    v_policy_snapshot := jsonb_build_object(
        'min_chars', v_min_chars,
        'min_paragraphs', v_min_paragraphs,
        'base_reward', v_base_reward,
        'bonus_enabled', v_bonus_enabled,
        'bonus_threshold', v_bonus_threshold,
        'bonus_reward', v_bonus_reward,
        'daily_reward_limit', v_daily_limit
    );

    UPDATE public.student_posts
    SET char_count = v_char_count,
        paragraph_count = v_paragraph_count,
        awarded_base_reward = v_base_reward,
        awarded_bonus_threshold = CASE WHEN v_bonus_enabled THEN v_bonus_threshold ELSE 0 END,
        awarded_bonus_reward = CASE WHEN v_bonus_enabled THEN v_bonus_reward ELSE 0 END
    WHERE id = v_post_id
      AND student_id = v_student_id;

    IF v_is_new_completion THEN
        IF NOT v_policy_enabled THEN
            v_reward_status := 'policy_disabled';
        ELSE
            SELECT count(*)::INTEGER
            INTO v_daily_awarded
            FROM public.writing_reward_claims claim
            WHERE claim.student_id = v_student_id
              AND claim.writing_type = 'reading_log'
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

        INSERT INTO public.writing_reward_claims (
            class_id, student_id, writing_type, source_key, source_post_id,
            reward_kind, awarded_points, reward_status, policy_snapshot
        ) VALUES (
            v_class_id, v_student_id, 'reading_log', v_book_id::TEXT, v_post_id,
            'completion', v_points_to_award, v_reward_status, v_policy_snapshot
        )
        ON CONFLICT (student_id, writing_type, source_key, reward_kind) DO NOTHING
        RETURNING id INTO v_claim_id;

        -- 삭제 후 같은 책을 다시 완료한 경우에도 기존 원장이 남아 있으므로 지급하지 않는다.
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
                '독서록 작성 완료 보상', v_post_id, 'writing_reward'
            );
            PERFORM set_config('app.bypass_student_trigger', 'false', true);
        END IF;
    ELSE
        v_reward_status := 'already_completed';
    END IF;

    RETURN v_result || jsonb_build_object(
        'char_count', v_char_count,
        'paragraph_count', v_paragraph_count,
        'points_awarded', v_points_to_award,
        'total_points', v_total_points,
        'reward_status', v_reward_status,
        'daily_reward_limit', v_daily_limit,
        'daily_rewards_used', v_daily_awarded + CASE WHEN v_points_to_award > 0 THEN 1 ELSE 0 END
    );
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.bypass_student_trigger', 'false', true);
    RAISE;
END;
$function$;


REVOKE ALL ON FUNCTION public.upsert_my_reading_log_rewarded(UUID, JSONB, TEXT, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;

-- 글과 책을 한 트랜잭션에서 지운다. 학생 본인 것만, 독서록 유형만 지운다.
CREATE OR REPLACE FUNCTION public.delete_my_reading_log(p_post_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID;
    v_library_item_id UUID;
    v_deleted_book BOOLEAN := false;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT s.class_id
    INTO v_class_id
    FROM public.students s
    WHERE s.id = v_student_id
      AND s.is_active IS DISTINCT FROM false
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
    FOR UPDATE;

    IF v_class_id IS NULL THEN
        RAISE EXCEPTION '학생 정보를 찾지 못했습니다.' USING ERRCODE = 'P0002';
    END IF;

    -- 글을 지우면 연결(reading_log_entries)이 함께 사라지므로 어떤 책이었는지 먼저 붙잡아 둔다.
    SELECT entry.library_item_id
    INTO v_library_item_id
    FROM public.reading_log_entries entry
    WHERE entry.post_id = p_post_id
      AND entry.student_id = v_student_id
      AND entry.class_id = v_class_id;

    DELETE FROM public.student_posts post
    WHERE post.id = p_post_id
      AND post.student_id = v_student_id
      AND post.class_id = v_class_id
      AND post.writing_context = 'self'
      AND post.self_writing_type = 'reading_log';

    IF NOT FOUND THEN
        RAISE EXCEPTION '삭제할 독서록을 찾지 못했습니다.' USING ERRCODE = 'P0002';
    END IF;

    -- 그 책을 참조하는 독서록이 더 없을 때만 책을 지운다.
    -- 보상 원장(writing_reward_claims)은 source_post_id 가 SET NULL 로 남으므로
    -- 같은 책을 다시 써도 포인트는 다시 지급되지 않는다.
    IF v_library_item_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.reading_log_entries other
        WHERE other.library_item_id = v_library_item_id
    ) THEN
        DELETE FROM public.student_library_items item
        WHERE item.id = v_library_item_id
          AND item.student_id = v_student_id
          AND item.class_id = v_class_id;
        v_deleted_book := FOUND;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'deleted_book', v_deleted_book
    );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_reading_log(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_reading_log(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
