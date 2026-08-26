-- 댓글 활동은 독자 칭호로 인정하고 포인트와는 분리한다.
-- 기존 point_logs의 comment_reward 행과 학생 잔액은 그대로 두되, 앞으로 새 보상을 만드는 계약만 닫는다.

BEGIN;

CREATE OR REPLACE FUNCTION public.point_engine_apply(
    p_student_id UUID,
    p_amount INTEGER,
    p_reason TEXT,
    p_activity_type TEXT,
    p_event_key TEXT DEFAULT NULL,
    p_post_id UUID DEFAULT NULL,
    p_mission_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_points INTEGER;
    v_class_id UUID;
    v_log_id UUID;
    v_existing_amount INTEGER;
    v_post_student_id UUID;
    v_post_mission_id UUID;
    v_post_class_id UUID;
BEGIN
    IF p_student_id IS NULL OR p_amount = 0 THEN
        RAISE EXCEPTION '학생과 0이 아닌 포인트가 필요합니다.' USING ERRCODE = '22023';
    END IF;
    IF char_length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 1 AND 200 THEN
        RAISE EXCEPTION '포인트 사유는 1~200자로 입력해주세요.' USING ERRCODE = '22023';
    END IF;
    IF p_activity_type NOT IN (
        'writing_reward', 'meeting_activity', 'vocab_tower', 'dragon_care',
        'hideout_purchase', 'starting_bonus', 'private_adjustment'
    ) THEN
        RAISE EXCEPTION '지원하지 않는 포인트 활동 유형입니다: %', p_activity_type USING ERRCODE = '22023';
    END IF;
    IF p_event_key IS NOT NULL AND char_length(p_event_key) NOT BETWEEN 1 AND 200 THEN
        RAISE EXCEPTION '중복 방지 키는 1~200자여야 합니다.' USING ERRCODE = '22023';
    END IF;
    IF p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object' THEN
        RAISE EXCEPTION '포인트 부가 정보는 JSON 객체여야 합니다.' USING ERRCODE = '22023';
    END IF;

    SELECT s.class_id, COALESCE(s.total_points, 0)
    INTO v_class_id, v_current_points
    FROM public.students s
    WHERE s.id = p_student_id AND s.deleted_at IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION '활성 학생 정보를 찾을 수 없습니다.' USING ERRCODE = 'P0002';
    END IF;

    IF p_post_id IS NOT NULL THEN
        SELECT sp.student_id, sp.mission_id, sp.class_id
        INTO v_post_student_id, v_post_mission_id, v_post_class_id
        FROM public.student_posts sp WHERE sp.id = p_post_id;
        IF NOT FOUND
          OR v_post_student_id IS DISTINCT FROM p_student_id
          OR v_post_class_id IS DISTINCT FROM v_class_id
          OR (p_mission_id IS NOT NULL AND v_post_mission_id IS DISTINCT FROM p_mission_id) THEN
            RAISE EXCEPTION '글·학생·과제 정보가 서로 일치하지 않습니다.' USING ERRCODE = '22023';
        END IF;
    END IF;

    IF p_event_key IS NOT NULL THEN
        SELECT pl.id, pl.amount INTO v_log_id, v_existing_amount
        FROM public.point_logs pl
        WHERE pl.student_id = p_student_id AND pl.event_key = p_event_key;
        IF FOUND THEN
            RETURN jsonb_build_object(
                'status', 'duplicate', 'duplicate', true, 'log_id', v_log_id,
                'applied_amount', 0, 'original_amount', v_existing_amount,
                'total_points', v_current_points, 'event_key', p_event_key
            );
        END IF;
    END IF;

    IF p_amount < 0 AND v_current_points + p_amount < 0 THEN
        RAISE EXCEPTION '보유 포인트가 부족합니다. 필요: %P, 현재: %P', abs(p_amount), v_current_points
            USING ERRCODE = 'P0001';
    END IF;

    PERFORM set_config('app.bypass_student_trigger', 'true', true);
    UPDATE public.students SET total_points = v_current_points + p_amount WHERE id = p_student_id;
    INSERT INTO public.point_logs (
        student_id, amount, reason, activity_type, event_key, post_id, mission_id, metadata
    ) VALUES (
        p_student_id, p_amount, btrim(p_reason), p_activity_type, p_event_key,
        p_post_id, p_mission_id, p_metadata
    ) RETURNING id INTO v_log_id;
    PERFORM set_config('app.bypass_student_trigger', 'false', true);

    RETURN jsonb_build_object(
        'status', 'applied', 'duplicate', false, 'log_id', v_log_id,
        'applied_amount', p_amount, 'total_points', v_current_points + p_amount,
        'event_key', p_event_key
    );
EXCEPTION WHEN unique_violation THEN
    PERFORM set_config('app.bypass_student_trigger', 'false', true);
    SELECT pl.id, pl.amount INTO v_log_id, v_existing_amount
    FROM public.point_logs pl
    WHERE pl.student_id = p_student_id AND pl.event_key = p_event_key;
    RETURN jsonb_build_object(
        'status', 'duplicate', 'duplicate', true, 'log_id', v_log_id,
        'applied_amount', 0, 'original_amount', v_existing_amount,
        'total_points', v_current_points, 'event_key', p_event_key
    );
WHEN OTHERS THEN
    PERFORM set_config('app.bypass_student_trigger', 'false', true);
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.point_engine_apply(UUID, INTEGER, TEXT, TEXT, TEXT, UUID, UUID, JSONB)
    FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.complete_comment_ai_review_v2(
    p_comment_id UUID,
    p_review_token UUID,
    p_is_appropriate BOOLEAN,
    p_reason TEXT DEFAULT NULL,
    p_review_source TEXT DEFAULT 'ai'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_comment public.post_comments%ROWTYPE;
    v_reason TEXT := NULLIF(left(btrim(COALESCE(p_reason, '')), 500), '');
BEGIN
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
    END IF;
    IF p_review_source NOT IN ('ai', 'local_rule') THEN
        RAISE EXCEPTION 'invalid review source' USING ERRCODE = '22023';
    END IF;

    UPDATE public.post_comments SET
        status = CASE WHEN p_is_appropriate THEN 'approved' ELSE 'blocked' END,
        moderation_reason = CASE WHEN p_is_appropriate THEN NULL ELSE v_reason END,
        moderated_at = NOW(),
        moderated_by = p_review_source,
        ai_review_token = NULL,
        ai_review_next_at = NULL,
        ai_review_lease_until = NULL,
        ai_review_last_error_code = NULL
    WHERE id = p_comment_id
      AND student_id IS NOT NULL
      AND status = 'pending'
      AND ai_review_token = p_review_token
    RETURNING * INTO v_comment;

    UPDATE public.comment_ai_review_slots SET
        comment_id = NULL, review_token = NULL, leased_at = NULL, lease_until = NULL
    WHERE comment_id = p_comment_id AND review_token = p_review_token;

    IF v_comment.id IS NULL THEN
        RETURN jsonb_build_object('recorded', false, 'status', 'stale');
    END IF;

    RETURN jsonb_build_object('recorded', true, 'status', v_comment.status);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_comment_ai_review_v2(UUID, UUID, BOOLEAN, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_comment_ai_review_v2(UUID, UUID, BOOLEAN, TEXT, TEXT)
    TO service_role;

-- 직접 호출 가능한 구형 댓글 보상 계약도 제거한다. 원장 행과 잔액은 건드리지 않는다.
DROP FUNCTION IF EXISTS public.reward_for_comment(UUID);

NOTIFY pgrst, 'reload schema';
COMMIT;
