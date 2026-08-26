-- 학생 댓글을 저장과 동시에 공개하지 않고, 전역 3칸 대기열에서 차례로 AI 검사한다.
-- 댓글 내용은 post_comments 한 곳에만 두며 슬롯에는 ID와 짧은 오류 코드만 남긴다.

BEGIN;

ALTER TABLE public.post_comments
    ADD COLUMN IF NOT EXISTS ai_review_attempts SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ai_review_enqueued_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ai_review_next_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ai_review_lease_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ai_review_last_error_code TEXT;

ALTER TABLE public.post_comments
    DROP CONSTRAINT IF EXISTS post_comments_ai_review_attempts_check,
    DROP CONSTRAINT IF EXISTS post_comments_ai_review_error_code_check;
ALTER TABLE public.post_comments
    ADD CONSTRAINT post_comments_ai_review_attempts_check
        CHECK (ai_review_attempts BETWEEN 0 AND 2),
    ADD CONSTRAINT post_comments_ai_review_error_code_check
        CHECK (
            ai_review_last_error_code IS NULL
            OR (
                char_length(ai_review_last_error_code) BETWEEN 1 AND 50
                AND ai_review_last_error_code ~ '^[a-z0-9_:-]+$'
            )
        );

-- 배포 전부터 있던 pending 댓글을 갑자기 외부 AI로 보내지 않는다. 기존 댓글은 교사 검토에 남기고,
-- 새 댓글과 학생이 다시 수정한 댓글만 아래 create/update RPC가 대기열에 넣는다.
UPDATE public.post_comments
SET ai_review_attempts = 2,
    ai_review_enqueued_at = NULL,
    ai_review_next_at = NULL,
    ai_review_lease_until = NULL,
    ai_review_last_error_code = 'legacy_pending',
    ai_review_token = NULL,
    moderated_at = NULL,
    moderated_by = NULL
WHERE status = 'pending';

UPDATE public.post_comments
SET ai_review_enqueued_at = NULL,
    ai_review_next_at = NULL,
    ai_review_lease_until = NULL,
    ai_review_last_error_code = NULL,
    ai_review_token = NULL
WHERE status <> 'pending';

CREATE INDEX IF NOT EXISTS idx_post_comments_ai_review_queue
    ON public.post_comments (ai_review_next_at, ai_review_enqueued_at, created_at, id)
    WHERE status = 'pending' AND student_id IS NOT NULL AND ai_review_attempts < 2;

CREATE TABLE IF NOT EXISTS public.comment_ai_review_slots (
    slot_no SMALLINT PRIMARY KEY CHECK (slot_no BETWEEN 1 AND 3),
    -- 댓글을 검사 중 삭제해도 삭제 자체를 막지 않는다. 작업기는 완료 시 ID+토큰으로 슬롯을 비운다.
    comment_id UUID,
    review_token UUID,
    leased_at TIMESTAMPTZ,
    lease_until TIMESTAMPTZ,
    CONSTRAINT comment_ai_review_slot_shape CHECK (
        (comment_id IS NULL AND review_token IS NULL AND leased_at IS NULL AND lease_until IS NULL)
        OR
        (comment_id IS NOT NULL AND review_token IS NOT NULL AND leased_at IS NOT NULL AND lease_until IS NOT NULL)
    )
);

INSERT INTO public.comment_ai_review_slots(slot_no)
VALUES (1), (2), (3)
ON CONFLICT (slot_no) DO NOTHING;

ALTER TABLE public.comment_ai_review_slots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.comment_ai_review_slots FROM PUBLIC, anon, authenticated, service_role;

-- 댓글 보상을 범용 조정이 아닌 독립 활동으로 남긴다. 기존 댓글 보상은 같은 글에서 다시 지급되지 않도록
-- 안정적인 event_key를 채우고 새 포인트 엔진 허용 목록도 함께 맞춘다.
ALTER TABLE public.point_logs DROP CONSTRAINT IF EXISTS point_logs_activity_type_check;
ALTER TABLE public.point_logs ADD CONSTRAINT point_logs_activity_type_check CHECK (activity_type IN (
    'writing_reward', 'meeting_activity', 'vocab_tower', 'dragon_care',
    'hideout_purchase', 'starting_bonus', 'private_adjustment', 'comment_reward'
));

WITH legacy_comment_rewards AS (
    SELECT id,
           format('comment-post:%s', post_id) AS event_key,
           row_number() OVER (PARTITION BY student_id, post_id ORDER BY created_at, id) AS occurrence
    FROM public.point_logs
    WHERE post_id IS NOT NULL
      AND event_key IS NULL
      AND reason LIKE '친구 글에 따뜻한 응원을 남겨주셨네요!%'
)
UPDATE public.point_logs log
SET activity_type = 'comment_reward',
    event_key = reward.event_key,
    metadata = COALESCE(log.metadata, '{}'::JSONB) || jsonb_build_object('source', 'legacy_comment_reward')
FROM legacy_comment_rewards reward
WHERE log.id = reward.id
  AND reward.occurrence = 1
  AND NOT EXISTS (
      SELECT 1 FROM public.point_logs existing
      WHERE existing.student_id = log.student_id
        AND existing.event_key = reward.event_key
        AND existing.id <> log.id
  );

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
        'hideout_purchase', 'starting_bonus', 'private_adjustment', 'comment_reward'
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

-- 새 댓글과 수정 댓글만 대기열로 넣는다. 화면이 보낸 학생·학급 ID는 받지 않고 실제 인증 연결을 쓴다.
CREATE OR REPLACE FUNCTION public.create_my_post_comment_v1(p_post_id UUID, p_content TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_student public.students%ROWTYPE;
    v_post public.student_posts%ROWTYPE;
    v_comment public.post_comments%ROWTYPE;
    v_content TEXT := btrim(COALESCE(p_content, ''));
    v_now TIMESTAMPTZ := NOW();
BEGIN
    SELECT * INTO v_student FROM public.students
    WHERE auth_id = auth.uid() AND is_active IS DISTINCT FROM false AND deleted_at IS NULL LIMIT 1;
    IF v_student.id IS NULL THEN RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501'; END IF;
    IF char_length(regexp_replace(v_content, '\s', '', 'g')) < 8 OR char_length(v_content) > 1000 THEN
        RAISE EXCEPTION '댓글은 8~1000자로 작성해주세요.' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_post FROM public.student_posts
    WHERE id = p_post_id AND class_id = v_student.class_id
      AND is_submitted IS TRUE AND visibility = 'class';
    IF v_post.id IS NULL THEN RAISE EXCEPTION '댓글을 남길 수 있는 글이 아닙니다.' USING ERRCODE = '42501'; END IF;
    INSERT INTO public.post_comments(
        post_id, student_id, class_id, content, status,
        ai_review_attempts, ai_review_enqueued_at, ai_review_next_at,
        ai_review_lease_until, ai_review_last_error_code, ai_review_token
    ) VALUES (
        p_post_id, v_student.id, v_student.class_id, v_content, 'pending',
        0, v_now, v_now, NULL, NULL, NULL
    ) RETURNING * INTO v_comment;
    RETURN jsonb_build_object('version', 2, 'comment', to_jsonb(v_comment) || jsonb_build_object('student_name', v_student.name));
END;
$$;

CREATE OR REPLACE FUNCTION public.update_my_post_comment_v1(p_comment_id UUID, p_content TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_student public.students%ROWTYPE;
    v_comment public.post_comments%ROWTYPE;
    v_content TEXT := btrim(COALESCE(p_content, ''));
    v_now TIMESTAMPTZ := NOW();
BEGIN
    SELECT * INTO v_student FROM public.students
    WHERE auth_id = auth.uid() AND is_active IS DISTINCT FROM false AND deleted_at IS NULL LIMIT 1;
    IF v_student.id IS NULL THEN RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501'; END IF;
    IF char_length(regexp_replace(v_content, '\s', '', 'g')) < 8 OR char_length(v_content) > 1000 THEN
        RAISE EXCEPTION '댓글은 8~1000자로 작성해주세요.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.post_comments SET
        content = v_content,
        status = 'pending',
        moderation_reason = NULL,
        moderated_at = NULL,
        moderated_by = NULL,
        ai_review_token = NULL,
        ai_review_attempts = 0,
        ai_review_enqueued_at = v_now,
        ai_review_next_at = v_now,
        ai_review_lease_until = NULL,
        ai_review_last_error_code = NULL
    WHERE id = p_comment_id
      AND student_id = v_student.id
      AND class_id = v_student.class_id
      AND ai_review_token IS NULL
    RETURNING * INTO v_comment;
    IF v_comment.id IS NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.post_comments
            WHERE id = p_comment_id AND student_id = v_student.id AND ai_review_token IS NOT NULL
        ) THEN
            RAISE EXCEPTION '댓글을 검사하고 있어요. 잠시 후에 다시 고쳐 주세요.' USING ERRCODE = '55000';
        END IF;
        RAISE EXCEPTION '수정할 수 있는 댓글이 아닙니다.' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object('version', 2, 'comment', to_jsonb(v_comment) || jsonb_build_object('student_name', v_student.name));
END;
$$;

REVOKE ALL ON FUNCTION public.create_my_post_comment_v1(UUID, TEXT), public.update_my_post_comment_v1(UUID, TEXT)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_my_post_comment_v1(UUID, TEXT), public.update_my_post_comment_v1(UUID, TEXT)
    TO authenticated, service_role;

-- 호출이 겹쳐도 슬롯 행 잠금 때문에 AI 처리 중인 댓글은 전역 최대 3개다.
CREATE OR REPLACE FUNCTION public.claim_next_comment_ai_review_v2()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_slot public.comment_ai_review_slots%ROWTYPE;
    v_comment public.post_comments%ROWTYPE;
    v_token UUID := gen_random_uuid();
    v_now TIMESTAMPTZ := NOW();
BEGIN
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
    END IF;

    -- 작업기가 중단된 슬롯은 2분 뒤 회수한다. 댓글의 시도 횟수는 유지해 무한 재시도를 막는다.
    UPDATE public.post_comments comment SET
        ai_review_token = NULL,
        ai_review_lease_until = NULL,
        moderated_at = NULL,
        moderated_by = NULL,
        ai_review_next_at = CASE WHEN comment.ai_review_attempts < 2 THEN v_now ELSE NULL END,
        ai_review_last_error_code = 'lease_expired'
    FROM public.comment_ai_review_slots slot
    WHERE slot.lease_until <= v_now
      AND slot.comment_id = comment.id
      AND slot.review_token = comment.ai_review_token
      AND comment.status = 'pending';

    UPDATE public.comment_ai_review_slots SET
        comment_id = NULL, review_token = NULL, leased_at = NULL, lease_until = NULL
    WHERE lease_until <= v_now;

    SELECT * INTO v_slot
    FROM public.comment_ai_review_slots
    WHERE comment_id IS NULL
    ORDER BY slot_no
    FOR UPDATE SKIP LOCKED
    LIMIT 1;
    IF v_slot.slot_no IS NULL THEN
        RETURN jsonb_build_object('claimed', false, 'status', 'busy', 'limit', 3);
    END IF;

    SELECT * INTO v_comment
    FROM public.post_comments
    WHERE status = 'pending'
      AND student_id IS NOT NULL
      AND ai_review_attempts < 2
      AND ai_review_next_at IS NOT NULL
      AND ai_review_next_at <= v_now
      AND ai_review_token IS NULL
    ORDER BY ai_review_enqueued_at, created_at, id
    FOR UPDATE SKIP LOCKED
    LIMIT 1;
    IF v_comment.id IS NULL THEN
        RETURN jsonb_build_object('claimed', false, 'status', 'empty', 'limit', 3);
    END IF;

    UPDATE public.comment_ai_review_slots SET
        comment_id = v_comment.id,
        review_token = v_token,
        leased_at = v_now,
        lease_until = v_now + INTERVAL '2 minutes'
    WHERE slot_no = v_slot.slot_no;

    UPDATE public.post_comments SET
        ai_review_token = v_token,
        ai_review_attempts = ai_review_attempts + 1,
        ai_review_lease_until = v_now + INTERVAL '2 minutes',
        moderated_by = 'ai_processing',
        moderated_at = v_now
    WHERE id = v_comment.id;

    RETURN jsonb_build_object(
        'claimed', true,
        'status', 'processing',
        'slot_no', v_slot.slot_no,
        'comment_id', v_comment.id,
        'student_id', v_comment.student_id,
        'post_id', v_comment.post_id,
        'content', v_comment.content,
        'review_token', v_token,
        'attempt', v_comment.ai_review_attempts + 1
    );
END;
$$;

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
    v_point_result JSONB := '{}'::JSONB;
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

    IF p_is_appropriate THEN
        v_point_result := public.point_engine_apply(
            v_comment.student_id,
            5,
            format('친구 글에 따뜻한 응원을 남겨주셨네요! ✨ (PostID:%s)', v_comment.post_id),
            'comment_reward',
            format('comment-post:%s', v_comment.post_id),
            NULL,
            NULL,
            jsonb_build_object(
                'source', 'comment_ai_review',
                'comment_id', v_comment.id,
                'target_post_id', v_comment.post_id
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'recorded', true,
        'status', v_comment.status,
        'points_awarded', COALESCE((v_point_result->>'applied_amount')::INTEGER, 0)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_comment_ai_review_v2(
    p_comment_id UUID,
    p_review_token UUID,
    p_error_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_attempts SMALLINT;
    v_error_code TEXT := left(lower(COALESCE(NULLIF(p_error_code, ''), 'unknown')), 50);
BEGIN
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
    END IF;
    IF v_error_code !~ '^[a-z0-9_:-]+$' THEN v_error_code := 'unknown'; END IF;

    UPDATE public.post_comments SET
        ai_review_token = NULL,
        ai_review_lease_until = NULL,
        moderated_at = NULL,
        moderated_by = NULL,
        ai_review_next_at = CASE
            WHEN ai_review_attempts < 2 THEN NOW() + (INTERVAL '15 seconds' * ai_review_attempts)
            ELSE NULL
        END,
        ai_review_last_error_code = v_error_code
    WHERE id = p_comment_id
      AND status = 'pending'
      AND ai_review_token = p_review_token
    RETURNING ai_review_attempts INTO v_attempts;

    UPDATE public.comment_ai_review_slots SET
        comment_id = NULL, review_token = NULL, leased_at = NULL, lease_until = NULL
    WHERE comment_id = p_comment_id AND review_token = p_review_token;

    RETURN jsonb_build_object(
        'released', v_attempts IS NOT NULL,
        'will_retry', COALESCE(v_attempts < 2, false),
        'attempts', COALESCE(v_attempts, 0)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_comment_ai_review_v2(),
    public.complete_comment_ai_review_v2(UUID, UUID, BOOLEAN, TEXT, TEXT),
    public.fail_comment_ai_review_v2(UUID, UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_comment_ai_review_v2(),
    public.complete_comment_ai_review_v2(UUID, UUID, BOOLEAN, TEXT, TEXT),
    public.fail_comment_ai_review_v2(UUID, UUID, TEXT)
    TO service_role;

-- 포인트는 이제 승인 RPC 안에서 지급한다. 과거 브라우저용 함수는 더 이상 학생에게 열지 않는다.
REVOKE ALL ON FUNCTION public.reward_for_comment(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reward_for_comment(UUID) TO service_role;

-- 기존 서비스 현황 RPC 한 번에 댓글 대기열도 포함해 관리자 화면의 추가 조회를 만들지 않는다.
CREATE OR REPLACE FUNCTION public.admin_get_service_overview_v1(p_trend_days INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_days INTEGER := LEAST(GREATEST(COALESCE(p_trend_days, 30), 7), 90);
    v_today_date DATE := timezone('Asia/Seoul', NOW())::DATE;
    v_today_start TIMESTAMPTZ;
    v_week_start TIMESTAMPTZ;
    v_scope_start TIMESTAMPTZ;
    v_today JSONB;
    v_week JSONB;
    v_ai_scopes JSONB;
    v_trend JSONB;
    v_latest JSONB;
    v_alerts JSONB;
    v_comment_queue JSONB;
BEGIN
    IF public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION '관리자만 볼 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    v_today_start := v_today_date::TIMESTAMP AT TIME ZONE 'Asia/Seoul';
    v_week_start := (v_today_date - 6)::TIMESTAMP AT TIME ZONE 'Asia/Seoul';
    v_scope_start := (v_today_date - (v_days - 1))::TIMESTAMP AT TIME ZONE 'Asia/Seoul';

    SELECT jsonb_build_object(
        'teachers', (SELECT count(*) FROM public.profiles WHERE role = 'TEACHER' AND last_login_at >= v_today_start),
        'students', (SELECT count(*) FROM public.students WHERE last_login >= v_today_start AND (deleted_at IS NULL OR deleted_at > NOW())),
        'ai_calls', (SELECT count(*) FROM public.ai_request_events WHERE created_at >= v_today_start),
        'posts', (SELECT count(*) FROM public.student_posts WHERE is_submitted IS TRUE AND COALESCE(first_submitted_at, created_at) >= v_today_start)
    ) INTO v_today;

    SELECT jsonb_build_object(
        'teachers', (SELECT count(*) FROM public.profiles WHERE role = 'TEACHER' AND last_login_at >= v_week_start),
        'students', (SELECT count(*) FROM public.students WHERE last_login >= v_week_start AND (deleted_at IS NULL OR deleted_at > NOW())),
        'ai_calls', (SELECT count(*) FROM public.ai_request_events WHERE created_at >= v_week_start),
        'posts', (SELECT count(*) FROM public.student_posts WHERE is_submitted IS TRUE AND COALESCE(first_submitted_at, created_at) >= v_week_start)
    ) INTO v_week;

    SELECT COALESCE(jsonb_object_agg(scope, cnt), '{}'::JSONB) INTO v_ai_scopes
    FROM (
        SELECT scope, count(*) AS cnt FROM public.ai_request_events
        WHERE created_at >= v_scope_start GROUP BY scope
    ) scope_counts;

    SELECT COALESCE(jsonb_agg(to_jsonb(day_row) ORDER BY day_row.metric_day), '[]'::JSONB) INTO v_trend
    FROM (
        SELECT metric_day, rx_bytes, tx_bytes,
               traffic_period_started_at, traffic_measured_at, traffic_complete,
               disk_free_gb, db_size_mb, container_total, container_healthy,
               resource_sampled_at, host_mem_available_pct, host_swap_used_mb,
               vm_mem_total_mb, vm_mem_available_current_mb, vm_mem_available_min_mb,
               vm_swap_used_current_mb, vm_swap_used_max_mb,
               gateway_cpu_current_pct, gateway_cpu_max_pct,
               gateway_mem_current_mb, gateway_mem_max_mb
        FROM public.system_daily_metrics
        WHERE metric_day >= v_today_date - (v_days - 1) AND metric_day <= v_today_date
        ORDER BY metric_day
    ) day_row;

    SELECT to_jsonb(latest_row) INTO v_latest FROM (
        SELECT metric_day, rx_bytes, tx_bytes,
               traffic_period_started_at, traffic_measured_at, traffic_complete,
               disk_free_gb, db_size_mb, container_total, container_healthy,
               resource_sampled_at, recorded_at,
               host_mem_available_pct, host_swap_used_mb,
               vm_mem_total_mb, vm_mem_available_current_mb, vm_mem_available_min_mb,
               vm_swap_used_current_mb, vm_swap_used_max_mb,
               gateway_cpu_current_pct, gateway_cpu_max_pct,
               gateway_mem_current_mb, gateway_mem_max_mb
        FROM public.system_daily_metrics
        WHERE metric_day <= v_today_date
        ORDER BY metric_day DESC LIMIT 1
    ) latest_row;

    SELECT COALESCE(jsonb_agg(to_jsonb(alert_row) ORDER BY alert_row.last_seen_at DESC), '[]'::JSONB) INTO v_alerts
    FROM (
        SELECT alert_key, status, detail, first_seen_at, last_seen_at, resolved_at, notified_at
        FROM public.system_alert_events ORDER BY last_seen_at DESC LIMIT 20
    ) alert_row;

    SELECT jsonb_build_object(
        'limit', 3,
        'queued', count(*) FILTER (
            WHERE status = 'pending' AND ai_review_attempts < 2
              AND ai_review_next_at IS NOT NULL AND ai_review_token IS NULL
        ),
        'processing', (SELECT count(*) FROM public.comment_ai_review_slots WHERE lease_until > NOW()),
        'needs_teacher', count(*) FILTER (
            WHERE status = 'pending' AND ai_review_attempts >= 2 AND ai_review_last_error_code IS NOT NULL
        ),
        'completed_today', count(*) FILTER (
            WHERE status IN ('approved', 'blocked') AND moderated_by IN ('ai', 'local_rule')
              AND moderated_at >= v_today_start
        ),
        'oldest_wait_seconds', COALESCE(floor(extract(epoch FROM NOW() - (
            min(ai_review_enqueued_at) FILTER (
                WHERE status = 'pending' AND ai_review_attempts < 2 AND ai_review_next_at IS NOT NULL
            )
        ))), 0)
    ) INTO v_comment_queue
    FROM public.post_comments;

    RETURN jsonb_build_object(
        'version', 3,
        'trend_days', v_days,
        'today', v_today,
        'week', v_week,
        'ai_scopes', v_ai_scopes,
        'comment_ai_queue', v_comment_queue,
        'trend', v_trend,
        'latest', COALESCE(v_latest, 'null'::JSONB),
        'alerts', v_alerts,
        'open_alerts', (SELECT count(*) FROM public.system_alert_events WHERE status = 'open')
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_get_service_overview_v1(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_service_overview_v1(INTEGER) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
