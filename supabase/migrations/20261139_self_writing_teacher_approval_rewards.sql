-- 독서록·일기는 자유롭게 제출하고, 포인트는 담당 교사가 확인한 뒤에만 지급한다.
-- 보완 요청 사유와 확인 한마디는 모두 선택이며 교사 반응 상태는 두 가지만 둔다.
-- 기존 제출 즉시 지급 원장은 회수하지 않고 중복 지급 방지 기록으로 그대로 보존한다.

BEGIN;

ALTER TABLE public.reading_log_teacher_reviews
    DROP CONSTRAINT IF EXISTS reading_log_teacher_reviews_review_status_check,
    DROP CONSTRAINT IF EXISTS reading_log_teacher_reviews_comment_rule,
    DROP CONSTRAINT IF EXISTS reading_log_teacher_reviews_comment_length,
    DROP CONSTRAINT IF EXISTS reading_log_review_comment_shape;

UPDATE public.reading_log_teacher_reviews
SET review_status = 'checked',
    updated_at = NOW()
WHERE review_status = 'commented';

ALTER TABLE public.reading_log_teacher_reviews
    ADD CONSTRAINT reading_log_teacher_reviews_review_status_check
        CHECK (review_status IN ('checked', 'revision_requested')),
    ADD CONSTRAINT reading_log_teacher_reviews_comment_length
        CHECK (char_length(COALESCE(teacher_comment, '')) <= 500);

-- 학생 제출은 분량·소유권만 확인하고 글과 보상 기준만 저장한다.
-- 포인트 원장과 point_engine_apply()는 교사 확인 RPC에서만 다룬다.
CREATE OR REPLACE FUNCTION public.upsert_my_reading_log_rewarded(
    p_post_id UUID,
    p_book JSONB,
    p_title TEXT,
    p_content TEXT,
    p_visibility TEXT DEFAULT 'private',
    p_reading_status TEXT DEFAULT 'completed'
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
    v_char_count INTEGER;
    v_paragraph_count INTEGER;
    v_min_chars INTEGER := 100;
    v_min_paragraphs INTEGER := 1;
    v_policy_enabled BOOLEAN := TRUE;
    v_base_reward INTEGER := 50;
    v_bonus_enabled BOOLEAN := FALSE;
    v_bonus_threshold INTEGER := 0;
    v_bonus_reward INTEGER := 0;
    v_result JSONB;
    v_post_id UUID;
    v_had_review BOOLEAN := FALSE;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT student.class_id, COALESCE(student.total_points, 0)
    INTO v_class_id, v_total_points
    FROM public.students student
    WHERE student.id = v_student_id
      AND student.auth_id = auth.uid()
      AND student.is_active IS DISTINCT FROM FALSE
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW());
    IF v_class_id IS NULL THEN
        RAISE EXCEPTION '현재 로그인과 연결된 학생을 찾을 수 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT policy.is_enabled, policy.min_chars, policy.min_paragraphs, policy.base_reward,
           policy.bonus_enabled, policy.bonus_threshold, policy.bonus_reward
    INTO v_policy_enabled, v_min_chars, v_min_paragraphs, v_base_reward,
         v_bonus_enabled, v_bonus_threshold, v_bonus_reward
    FROM public.class_writing_policies policy
    WHERE policy.class_id = v_class_id AND policy.writing_type = 'reading_log';

    v_policy_enabled := COALESCE(v_policy_enabled, TRUE);
    v_min_chars := COALESCE(v_min_chars, 100);
    v_min_paragraphs := COALESCE(v_min_paragraphs, 1);
    v_base_reward := COALESCE(v_base_reward, 50);
    v_bonus_enabled := COALESCE(v_bonus_enabled, FALSE);
    v_bonus_threshold := COALESCE(v_bonus_threshold, 0);
    v_bonus_reward := COALESCE(v_bonus_reward, 0);
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
        SELECT 1 FROM public.student_posts post
        WHERE post.id = p_post_id AND post.student_id = v_student_id
          AND post.class_id = v_class_id AND post.writing_context = 'self'
          AND post.self_writing_type = 'reading_log'
    ) THEN
        RAISE EXCEPTION '수정할 내 독서록을 찾을 수 없습니다.' USING ERRCODE = '42501';
    END IF;

    v_result := public.upsert_my_reading_log_storage(
        p_post_id, p_book, p_title, p_content, p_visibility, p_reading_status
    );
    v_post_id := (v_result ->> 'post_id')::UUID;

    UPDATE public.student_posts
    SET char_count = v_char_count,
        paragraph_count = v_paragraph_count,
        awarded_base_reward = v_base_reward,
        awarded_bonus_threshold = CASE WHEN v_bonus_enabled THEN v_bonus_threshold ELSE 0 END,
        awarded_bonus_reward = CASE WHEN v_bonus_enabled THEN v_bonus_reward ELSE 0 END
    WHERE id = v_post_id AND student_id = v_student_id;

    -- 보완 뒤 다시 저장하거나 확인된 글을 다듬으면 새 내용은 다시 교사가 확인한다.
    IF p_post_id IS NOT NULL THEN
        DELETE FROM public.reading_log_teacher_reviews review
        WHERE review.post_id = v_post_id
        RETURNING TRUE INTO v_had_review;

        DELETE FROM public.student_notification_events event
        WHERE event.student_id = v_student_id AND event.class_id = v_class_id
          AND event.module_id = 'reading-log' AND event.entity_type = 'student_post'
          AND event.entity_id = v_post_id AND event.read_at IS NULL;

        IF v_had_review THEN
            PERFORM public.record_reading_marathon_contribution(v_post_id);
        END IF;
    END IF;

    RETURN v_result || jsonb_build_object(
        'char_count', v_char_count,
        'paragraph_count', v_paragraph_count,
        'points_awarded', 0,
        'total_points', v_total_points,
        'reward_status', 'pending_review'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_my_reading_log_rewarded(UUID, JSONB, TEXT, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;

-- 하루 상한은 작성 제한이 아니라 교사 확인 보상의 상한이다.
CREATE OR REPLACE FUNCTION public.upsert_my_reading_log(
    p_post_id UUID,
    p_book JSONB,
    p_title TEXT,
    p_content TEXT,
    p_visibility TEXT DEFAULT 'private',
    p_reading_status TEXT DEFAULT 'completed'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN public.upsert_my_reading_log_rewarded(
        p_post_id, p_book, p_title, p_content, p_visibility, p_reading_status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_my_reading_log(UUID, JSONB, TEXT, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_my_reading_log(UUID, JSONB, TEXT, TEXT, TEXT, TEXT)
    TO authenticated, service_role;

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
    v_min_chars INTEGER := 150;
    v_min_paragraphs INTEGER := 1;
    v_policy_enabled BOOLEAN := TRUE;
    v_base_reward INTEGER := 80;
    v_bonus_enabled BOOLEAN := FALSE;
    v_bonus_threshold INTEGER := 0;
    v_bonus_reward INTEGER := 0;
    v_post_id UUID;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    IF v_diary_date > v_today THEN
        RAISE EXCEPTION '아직 오지 않은 날의 일기는 쓸 수 없어요.' USING ERRCODE = 'P0001';
    END IF;

    SELECT student.class_id, COALESCE(student.total_points, 0)
    INTO v_class_id, v_total_points
    FROM public.students student
    WHERE student.id = v_student_id
      AND student.auth_id = auth.uid()
      AND student.is_active IS DISTINCT FROM FALSE
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW());
    IF v_class_id IS NULL THEN
        RAISE EXCEPTION '현재 로그인과 연결된 학생을 찾을 수 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT policy.is_enabled, policy.min_chars, policy.min_paragraphs, policy.base_reward,
           policy.bonus_enabled, policy.bonus_threshold, policy.bonus_reward
    INTO v_policy_enabled, v_min_chars, v_min_paragraphs, v_base_reward,
         v_bonus_enabled, v_bonus_threshold, v_bonus_reward
    FROM public.class_writing_policies policy
    WHERE policy.class_id = v_class_id AND policy.writing_type = 'diary';

    v_policy_enabled := COALESCE(v_policy_enabled, TRUE);
    v_min_chars := COALESCE(v_min_chars, 150);
    v_min_paragraphs := COALESCE(v_min_paragraphs, 1);
    v_base_reward := COALESCE(v_base_reward, 80);
    v_bonus_enabled := COALESCE(v_bonus_enabled, FALSE);
    v_bonus_threshold := COALESCE(v_bonus_threshold, 0);
    v_bonus_reward := COALESCE(v_bonus_reward, 0);
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
        WHERE post.id = p_post_id AND post.student_id = v_student_id
          AND post.class_id = v_class_id AND post.writing_context = 'self'
          AND post.self_writing_type = 'diary'
    ) THEN
        RAISE EXCEPTION '수정할 내 일기를 찾을 수 없습니다.' USING ERRCODE = '42501';
    END IF;

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
            v_visibility, TRUE, v_base_reward,
            CASE WHEN v_bonus_enabled THEN v_bonus_threshold ELSE 0 END,
            CASE WHEN v_bonus_enabled THEN v_bonus_reward ELSE 0 END
        ) RETURNING id INTO v_post_id;
    ELSE
        UPDATE public.student_posts
        SET title = btrim(p_title), content = p_content,
            char_count = v_char_count, paragraph_count = v_paragraph_count,
            structured_content = jsonb_build_object('type', 'diary', 'diaryDate', v_diary_date::TEXT),
            visibility = v_visibility, is_submitted = TRUE,
            awarded_base_reward = v_base_reward,
            awarded_bonus_threshold = CASE WHEN v_bonus_enabled THEN v_bonus_threshold ELSE 0 END,
            awarded_bonus_reward = CASE WHEN v_bonus_enabled THEN v_bonus_reward ELSE 0 END
        WHERE id = p_post_id AND student_id = v_student_id AND class_id = v_class_id
          AND writing_context = 'self' AND self_writing_type = 'diary'
        RETURNING id INTO v_post_id;
        IF v_post_id IS NULL THEN
            RAISE EXCEPTION '수정할 내 일기를 찾을 수 없습니다.' USING ERRCODE = '42501';
        END IF;

        DELETE FROM public.reading_log_teacher_reviews review WHERE review.post_id = v_post_id;
        DELETE FROM public.student_notification_events event
        WHERE event.student_id = v_student_id AND event.class_id = v_class_id
          AND event.module_id = 'diary' AND event.entity_type = 'student_post'
          AND event.entity_id = v_post_id AND event.read_at IS NULL;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE, 'post_id', v_post_id, 'diary_date', v_diary_date::TEXT,
        'char_count', v_char_count, 'paragraph_count', v_paragraph_count,
        'points_awarded', 0, 'reward_status', 'pending_review',
        'total_points', v_total_points
    );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_my_diary(UUID, DATE, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_my_diary(UUID, DATE, TEXT, TEXT, TEXT)
    TO authenticated, service_role;

-- 담당 교사 확인 뒤에만 호출되는 내부 보상 함수.
CREATE OR REPLACE FUNCTION public.award_self_writing_review_points_v1(p_post_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_post RECORD;
    v_book_id UUID;
    v_source_key TEXT;
    v_type_label TEXT;
    v_policy_enabled BOOLEAN := TRUE;
    v_min_chars INTEGER := 0;
    v_daily_limit INTEGER := 1;
    v_rewarded_on_submission_day INTEGER := 0;
    v_points INTEGER := 0;
    v_status TEXT := 'no_reward';
    v_claim_id UUID;
    v_existing RECORD;
    v_point_result JSONB;
    v_total_points INTEGER := 0;
    v_day_start TIMESTAMPTZ;
    v_day_end TIMESTAMPTZ;
    v_policy_snapshot JSONB;
BEGIN
    SELECT post.id, post.student_id, post.class_id, post.self_writing_type,
           post.created_at, post.char_count,
           COALESCE(post.awarded_base_reward, 0) AS base_reward,
           COALESCE(post.awarded_bonus_threshold, 0) AS bonus_threshold,
           COALESCE(post.awarded_bonus_reward, 0) AS bonus_reward,
           post.structured_content
    INTO v_post
    FROM public.student_posts post
    WHERE post.id = p_post_id AND post.writing_context = 'self'
      AND post.self_writing_type IN ('reading_log', 'diary')
      AND post.is_submitted IS TRUE
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION '보상할 자율 글을 찾지 못했습니다.' USING ERRCODE = 'P0002';
    END IF;

    SELECT COALESCE(student.total_points, 0)
    INTO v_total_points
    FROM public.students student
    WHERE student.id = v_post.student_id AND student.class_id = v_post.class_id
      AND student.is_active IS DISTINCT FROM FALSE
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION '활성 학생 정보를 찾지 못했습니다.' USING ERRCODE = 'P0002';
    END IF;

    IF v_post.self_writing_type = 'reading_log' THEN
        SELECT item.book_id INTO v_book_id
        FROM public.reading_log_entries entry
        JOIN public.student_library_items item
          ON item.id = entry.library_item_id AND item.class_id = entry.class_id
         AND item.student_id = entry.student_id
        WHERE entry.post_id = v_post.id AND entry.class_id = v_post.class_id
          AND entry.student_id = v_post.student_id;
        v_source_key := COALESCE(v_book_id::TEXT, format('post:%s', v_post.id));
        v_type_label := '독서록';
    ELSE
        v_source_key := COALESCE(
            NULLIF(v_post.structured_content ->> 'diaryDate', ''),
            (v_post.created_at AT TIME ZONE 'Asia/Seoul')::DATE::TEXT
        );
        v_type_label := '일기';
    END IF;

    SELECT claim.id, claim.awarded_points, claim.reward_status
    INTO v_existing
    FROM public.writing_reward_claims claim
    WHERE claim.student_id = v_post.student_id
      AND claim.writing_type = v_post.self_writing_type
      AND claim.reward_kind = 'completion'
      AND (claim.source_post_id = v_post.id OR claim.source_key = v_source_key)
    ORDER BY claim.created_at, claim.id
    LIMIT 1;
    IF FOUND THEN
        RETURN jsonb_build_object(
            'points_awarded', 0, 'reward_status', 'already_claimed',
            'original_reward_status', v_existing.reward_status,
            'original_points', v_existing.awarded_points,
            'total_points', v_total_points
        );
    END IF;

    SELECT COALESCE(policy.is_enabled, TRUE), COALESCE(policy.min_chars, 0),
           GREATEST(1, COALESCE(policy.daily_reward_limit, 1))
    INTO v_policy_enabled, v_min_chars, v_daily_limit
    FROM public.class_writing_policies policy
    WHERE policy.class_id = v_post.class_id
      AND policy.writing_type = v_post.self_writing_type;
    v_policy_enabled := COALESCE(v_policy_enabled, TRUE);
    v_daily_limit := GREATEST(1, COALESCE(v_daily_limit, 1));

    v_day_start := (
        (v_post.created_at AT TIME ZONE 'Asia/Seoul')::DATE::TIMESTAMP
        AT TIME ZONE 'Asia/Seoul'
    );
    v_day_end := v_day_start + INTERVAL '1 day';

    SELECT COUNT(*)::INTEGER INTO v_rewarded_on_submission_day
    FROM public.writing_reward_claims claim
    WHERE claim.student_id = v_post.student_id
      AND claim.class_id = v_post.class_id
      AND claim.writing_type = v_post.self_writing_type
      AND claim.reward_kind = 'completion'
      AND claim.awarded_points > 0
      AND claim.created_at >= v_day_start AND claim.created_at < v_day_end;

    IF NOT v_policy_enabled THEN
        v_status := 'policy_disabled';
    ELSIF v_rewarded_on_submission_day >= v_daily_limit THEN
        v_status := 'daily_limit';
    ELSE
        v_points := GREATEST(0, v_post.base_reward);
        IF v_post.bonus_threshold > 0 AND v_post.bonus_reward > 0
           AND v_post.char_count >= v_min_chars + v_post.bonus_threshold THEN
            v_points := v_points + v_post.bonus_reward;
        END IF;
        v_status := CASE WHEN v_points > 0 THEN 'awarded' ELSE 'no_reward' END;
    END IF;

    v_policy_snapshot := jsonb_build_object(
        'reward_gate', 'teacher_review',
        'submitted_at', v_post.created_at,
        'daily_reward_limit', v_daily_limit,
        'base_reward', v_post.base_reward,
        'bonus_threshold', v_post.bonus_threshold,
        'bonus_reward', v_post.bonus_reward
    );

    INSERT INTO public.writing_reward_claims (
        class_id, student_id, writing_type, source_key, source_post_id,
        reward_kind, awarded_points, reward_status, policy_snapshot, created_at
    ) VALUES (
        v_post.class_id, v_post.student_id, v_post.self_writing_type,
        v_source_key, v_post.id, 'completion', v_points, v_status,
        v_policy_snapshot, v_post.created_at
    )
    ON CONFLICT (student_id, writing_type, source_key, reward_kind) DO NOTHING
    RETURNING id INTO v_claim_id;

    IF v_claim_id IS NULL THEN
        RETURN jsonb_build_object(
            'points_awarded', 0, 'reward_status', 'already_claimed',
            'total_points', v_total_points
        );
    END IF;

    IF v_points > 0 THEN
        v_point_result := public.point_engine_apply(
            v_post.student_id,
            v_points,
            format('%s 선생님 확인 보상', v_type_label),
            'writing_reward',
            format('self-writing-review:%s', v_post.id),
            v_post.id,
            NULL,
            jsonb_build_object(
                'source', 'self_writing_teacher_review',
                'writing_type', v_post.self_writing_type
            )
        );
        v_total_points := COALESCE((v_point_result ->> 'total_points')::INTEGER, v_total_points);
    END IF;

    RETURN jsonb_build_object(
        'points_awarded', v_points,
        'reward_status', v_status,
        'total_points', v_total_points
    );
END;
$$;

REVOKE ALL ON FUNCTION public.award_self_writing_review_points_v1(UUID)
    FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_teacher_self_writing_review_v2(
    p_post_id UUID,
    p_teacher_comment TEXT DEFAULT '',
    p_decision TEXT DEFAULT 'accepted'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_post RECORD;
    v_old public.reading_log_teacher_reviews%ROWTYPE;
    v_comment TEXT := left(btrim(COALESCE(p_teacher_comment, '')), 500);
    v_status TEXT;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_module_id TEXT;
    v_event_type TEXT;
    v_type_label TEXT;
    v_marathon_applied BOOLEAN := FALSE;
    v_reward JSONB := jsonb_build_object(
        'points_awarded', 0, 'reward_status', 'not_awarded', 'total_points', NULL
    );
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    IF p_decision NOT IN ('accepted', 'revision_requested') THEN
        RAISE EXCEPTION '확인 결과가 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT post.id, post.student_id, post.class_id, post.title, post.self_writing_type
    INTO v_post
    FROM public.student_posts post
    WHERE post.id = p_post_id AND post.writing_context = 'self'
      AND post.self_writing_type IN ('reading_log', 'diary')
      AND post.is_submitted IS TRUE;
    IF NOT FOUND THEN
        RAISE EXCEPTION '확인할 학생 글을 찾지 못했습니다.' USING ERRCODE = 'P0002';
    END IF;

    IF public.auth_user_role() <> 'ADMIN' AND NOT EXISTS (
        SELECT 1 FROM public.classes class
        WHERE class.id = v_post.class_id AND class.teacher_id = auth.uid()
    ) THEN
        RAISE EXCEPTION '이 학급의 학생 글을 확인할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    v_status := CASE WHEN p_decision = 'revision_requested'
        THEN 'revision_requested' ELSE 'checked' END;

    SELECT review.* INTO v_old
    FROM public.reading_log_teacher_reviews review
    WHERE review.post_id = p_post_id
    FOR UPDATE;

    IF v_old.post_id IS NOT NULL
       AND v_old.review_status = v_status
       AND v_old.teacher_comment = v_comment THEN
        IF v_status = 'checked' THEN
            v_reward := public.award_self_writing_review_points_v1(p_post_id);
        END IF;
        RETURN jsonb_build_object(
            'success', TRUE, 'changed', FALSE, 'post_id', p_post_id,
            'review_status', v_status, 'teacher_comment', v_comment,
            'reviewed_at', v_old.reviewed_at
        ) || v_reward;
    END IF;

    INSERT INTO public.reading_log_teacher_reviews (
        post_id, student_id, class_id, teacher_id, review_status, teacher_comment, reviewed_at
    ) VALUES (
        p_post_id, v_post.student_id, v_post.class_id, auth.uid(), v_status, v_comment, v_now
    )
    ON CONFLICT (post_id) DO UPDATE
    SET student_id = EXCLUDED.student_id, class_id = EXCLUDED.class_id,
        teacher_id = EXCLUDED.teacher_id, review_status = EXCLUDED.review_status,
        teacher_comment = EXCLUDED.teacher_comment, reviewed_at = EXCLUDED.reviewed_at,
        updated_at = v_now;

    IF v_status = 'checked' THEN
        v_reward := public.award_self_writing_review_points_v1(p_post_id);
    END IF;

    v_module_id := CASE WHEN v_post.self_writing_type = 'reading_log' THEN 'reading-log' ELSE 'diary' END;
    v_type_label := CASE WHEN v_post.self_writing_type = 'reading_log' THEN '독서록' ELSE '일기' END;
    v_event_type := format('%s.%s', v_module_id, CASE
        WHEN v_status = 'revision_requested' THEN 'revision_requested'
        ELSE 'review_completed'
    END);

    DELETE FROM public.student_notification_events event
    WHERE event.student_id = v_post.student_id AND event.class_id = v_post.class_id
      AND event.module_id = v_module_id AND event.entity_type = 'student_post'
      AND event.entity_id = p_post_id AND event.read_at IS NULL;

    IF v_post.self_writing_type = 'reading_log' AND v_status = 'checked' THEN
        SELECT EXISTS (
            SELECT 1
            FROM public.reading_marathon_contributions contribution
            JOIN public.reading_marathon_campaigns campaign
              ON campaign.id = contribution.campaign_id
             AND campaign.class_id = contribution.class_id
            WHERE contribution.class_id = v_post.class_id
              AND contribution.student_id = v_post.student_id
              AND contribution.post_id = p_post_id
              AND campaign.archived_at IS NULL
        ) INTO v_marathon_applied;
    END IF;

    PERFORM public.notification_emit_v1(
        v_post.student_id, v_module_id, v_event_type,
        'student_post', p_post_id,
        jsonb_build_object(
            'post_id', p_post_id,
            'post_title', COALESCE(v_post.title, '제목 없는 글'),
            'content_type', v_post.self_writing_type,
            'content_type_label', v_type_label,
            'has_comment', v_comment <> '',
            'marathon_applied', v_marathon_applied,
            'points_awarded', COALESCE((v_reward ->> 'points_awarded')::INTEGER, 0)
        ),
        format('self-review:%s:%s:%s', p_post_id, v_status,
            floor(extract(epoch FROM v_now) * 1000000)::BIGINT)
    );

    RETURN jsonb_build_object(
        'success', TRUE, 'changed', TRUE, 'post_id', p_post_id,
        'review_status', v_status, 'teacher_comment', v_comment,
        'reviewed_at', v_now, 'marathon_applied', v_marathon_applied
    ) || v_reward;
END;
$$;

REVOKE ALL ON FUNCTION public.save_teacher_self_writing_review_v2(UUID, TEXT, TEXT)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_teacher_self_writing_review_v2(UUID, TEXT, TEXT)
    TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_reading_log_daily_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID;
    v_daily_limit INTEGER := 1;
    v_completed_today INTEGER := 0;
    v_rewarded_today INTEGER := 0;
    v_day_start TIMESTAMPTZ := date_trunc('day', NOW() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul';
BEGIN
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    SELECT student.class_id INTO v_class_id
    FROM public.students student
    WHERE student.id = v_student_id AND student.auth_id = auth.uid()
      AND student.is_active IS DISTINCT FROM FALSE
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW());
    IF v_class_id IS NULL THEN
        RAISE EXCEPTION '현재 로그인과 연결된 학생을 찾을 수 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT GREATEST(1, COALESCE(policy.daily_reward_limit, 1)) INTO v_daily_limit
    FROM public.class_writing_policies policy
    WHERE policy.class_id = v_class_id AND policy.writing_type = 'reading_log';
    v_daily_limit := GREATEST(1, COALESCE(v_daily_limit, 1));

    SELECT COUNT(*)::INTEGER INTO v_completed_today
    FROM public.student_posts post
    WHERE post.student_id = v_student_id AND post.class_id = v_class_id
      AND post.writing_context = 'self' AND post.self_writing_type = 'reading_log'
      AND post.is_submitted IS TRUE
      AND post.created_at >= v_day_start AND post.created_at < v_day_start + INTERVAL '1 day';

    SELECT COUNT(*)::INTEGER INTO v_rewarded_today
    FROM public.writing_reward_claims claim
    WHERE claim.student_id = v_student_id AND claim.class_id = v_class_id
      AND claim.writing_type = 'reading_log' AND claim.reward_kind = 'completion'
      AND claim.awarded_points > 0
      AND claim.created_at >= v_day_start AND claim.created_at < v_day_start + INTERVAL '1 day';

    RETURN jsonb_build_object(
        'daily_limit', v_daily_limit, 'completed_today', v_completed_today,
        'rewarded_today', v_rewarded_today,
        'remaining_today', GREATEST(0, v_daily_limit - v_rewarded_today),
        'can_complete', TRUE
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_reading_log_daily_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_reading_log_daily_status() TO authenticated, service_role;

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
    v_daily_limit INTEGER := 1;
    v_completed_today INTEGER := 0;
    v_rewarded_today INTEGER := 0;
    v_has_today BOOLEAN := FALSE;
    v_policy_enabled BOOLEAN := TRUE;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    SELECT student.class_id INTO v_class_id
    FROM public.students student
    WHERE student.id = v_student_id AND student.auth_id = auth.uid()
      AND student.is_active IS DISTINCT FROM FALSE
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW());
    IF v_class_id IS NULL THEN
        RAISE EXCEPTION '현재 로그인과 연결된 학생을 찾을 수 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(policy.is_enabled, TRUE), GREATEST(1, COALESCE(policy.daily_reward_limit, 1))
    INTO v_policy_enabled, v_daily_limit
    FROM public.class_writing_policies policy
    WHERE policy.class_id = v_class_id AND policy.writing_type = 'diary';
    v_policy_enabled := COALESCE(v_policy_enabled, TRUE);
    v_daily_limit := GREATEST(1, COALESCE(v_daily_limit, 1));

    SELECT COUNT(*)::INTEGER, COUNT(*) > 0
    INTO v_completed_today, v_has_today
    FROM public.student_posts post
    WHERE post.student_id = v_student_id AND post.class_id = v_class_id
      AND post.writing_context = 'self' AND post.self_writing_type = 'diary'
      AND post.is_submitted IS TRUE
      AND post.structured_content ->> 'diaryDate' = v_today::TEXT;

    SELECT COUNT(*)::INTEGER INTO v_rewarded_today
    FROM public.writing_reward_claims claim
    WHERE claim.student_id = v_student_id AND claim.class_id = v_class_id
      AND claim.writing_type = 'diary' AND claim.reward_kind = 'completion'
      AND claim.awarded_points > 0
      AND (claim.created_at AT TIME ZONE 'Asia/Seoul')::DATE = v_today;

    RETURN jsonb_build_object(
        'is_enabled', v_policy_enabled, 'today', v_today::TEXT,
        'daily_limit', v_daily_limit, 'completed_today', v_completed_today,
        'rewarded_today', v_rewarded_today,
        'remaining_today', GREATEST(0, v_daily_limit - v_rewarded_today),
        'can_complete', TRUE, 'has_today_diary', v_has_today
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_diary_daily_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_diary_daily_status() TO authenticated, service_role;

-- 수호룡은 포인트 지급 여부가 아니라 학생이 실제로 오늘 쓴 자율 글을 알아본다.
CREATE OR REPLACE FUNCTION public.bond_with_my_dragon()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID;
    v_pet_data JSONB;
    v_today DATE;
    v_day_start TIMESTAMPTZ;
    v_day_end TIMESTAMPTZ;
    v_bond_count INTEGER;
    v_already_bonded BOOLEAN;
    v_story_state TEXT := 'none';
    v_story_title TEXT;
    v_story_kind TEXT;
    v_mission_title TEXT;
    v_mission_at TIMESTAMPTZ;
    v_self_title TEXT;
    v_self_at TIMESTAMPTZ;
    v_self_kind TEXT;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    v_today := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
    v_day_start := v_today::TIMESTAMP AT TIME ZONE 'Asia/Seoul';
    v_day_end := (v_today + 1)::TIMESTAMP AT TIME ZONE 'Asia/Seoul';

    SELECT student.class_id, COALESCE(student.pet_data, '{}'::JSONB)
    INTO v_class_id, v_pet_data
    FROM public.students student
    WHERE student.id = v_student_id
      AND student.is_active IS DISTINCT FROM FALSE
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION '학생 정보를 찾지 못했습니다.' USING ERRCODE = 'P0002';
    END IF;

    SELECT NULLIF(btrim(COALESCE(post.title, '')), ''), post.approved_at
    INTO v_mission_title, v_mission_at
    FROM public.student_posts post
    WHERE post.class_id = v_class_id AND post.student_id = v_student_id
      AND post.approved_at >= v_day_start AND post.approved_at < v_day_end
      AND post.mission_id IS NOT NULL
    ORDER BY post.approved_at DESC, post.id DESC
    LIMIT 1;

    SELECT NULLIF(btrim(COALESCE(post.title, '')), ''), post.created_at, post.self_writing_type
    INTO v_self_title, v_self_at, v_self_kind
    FROM public.student_posts post
    WHERE post.class_id = v_class_id AND post.student_id = v_student_id
      AND post.writing_context = 'self'
      AND post.self_writing_type IN ('reading_log', 'diary')
      AND post.is_submitted IS TRUE
      AND post.created_at >= v_day_start AND post.created_at < v_day_end
    ORDER BY post.created_at DESC, post.id DESC
    LIMIT 1;

    IF v_mission_at IS NOT NULL OR v_self_at IS NOT NULL THEN
        v_story_state := 'submitted';
        IF v_self_at IS NOT NULL
           AND (v_mission_at IS NULL OR v_self_at >= v_mission_at) THEN
            v_story_title := v_self_title;
            v_story_kind := COALESCE(v_self_kind, 'reading_log');
        ELSE
            v_story_title := v_mission_title;
            v_story_kind := 'mission';
        END IF;
    ELSE
        SELECT NULLIF(btrim(COALESCE(post.title, '')), '')
        INTO v_story_title
        FROM public.student_posts post
        WHERE post.class_id = v_class_id AND post.student_id = v_student_id
          AND post.is_submitted IS TRUE AND post.approved_at IS NULL
          AND post.first_submitted_at >= v_day_start AND post.first_submitted_at < v_day_end
        ORDER BY post.first_submitted_at DESC, post.id DESC
        LIMIT 1;

        IF FOUND THEN
            v_story_state := 'writing';
            v_story_kind := 'mission';
        ELSE
            v_story_title := NULL;
            v_story_kind := NULL;
        END IF;
    END IF;

    v_bond_count := CASE
        WHEN jsonb_typeof(v_pet_data -> 'bondCount') = 'number'
        THEN GREATEST(0, (v_pet_data ->> 'bondCount')::INTEGER)
        ELSE 0
    END;
    v_already_bonded := (v_pet_data ->> 'lastFed') = v_today::TEXT;

    IF NOT v_already_bonded THEN
        v_bond_count := v_bond_count + 1;
        v_pet_data := v_pet_data || jsonb_build_object(
            'lastFed', v_today::TEXT,
            'bondCount', v_bond_count
        );
        PERFORM set_config('app.bypass_student_trigger', 'true', TRUE);
        UPDATE public.students SET pet_data = v_pet_data WHERE id = v_student_id;
        PERFORM set_config('app.bypass_student_trigger', 'false', TRUE);
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE, 'pet_data', v_pet_data,
        'already_bonded_today', v_already_bonded,
        'story_state', v_story_state,
        'story_title', v_story_title,
        'story_kind', v_story_kind
    );
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.bypass_student_trigger', 'false', TRUE);
    RAISE;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
