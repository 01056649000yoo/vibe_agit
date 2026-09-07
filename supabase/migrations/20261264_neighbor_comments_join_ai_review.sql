-- 이웃 학급으로 가는 댓글도 우리 반 댓글과 같은 검사를 지난다(2026-09-07, 점검에서 발견).
--
-- 문제: 우리 반 안에서 다는 댓글은 `pending` 으로 들어가 AI 검사를 통과해야 보인다(실제로 79건이 걸러졌다).
-- 그런데 **다른 학교 아이에게 가는 이웃 댓글은 `visible` 로 바로 게시**됐다. 길이(300자)와 줄바꿈만 봤다.
-- 서로 모르는 사이라 위험이 더 큰 쪽에 안전장치가 없는, 방향이 뒤집힌 구조였다.
--
-- 고침: `neighbor_comments` 도 같은 대기열을 쓴다. 대기열 슬롯(`comment_ai_review_slots`)에 외래키가 없어
-- 두 표를 함께 태울 수 있고, **작업기(Edge Function `vibe-ai`)는 고치지 않아도 된다** — 세 RPC 가
-- 댓글 id 로 두 표를 모두 찾도록 넓히기만 하면 된다.
--
-- 상태 이름은 각 표의 기존 이름을 그대로 둔다(우리 반은 `approved`, 이웃은 `visible`).
-- 읽는 쪽이 이미 그 이름으로 거르고 있어 바꾸면 조용히 깨진다.
BEGIN;

ALTER TABLE public.neighbor_comments
    ADD COLUMN IF NOT EXISTS moderation_reason TEXT,
    ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS moderated_by TEXT,
    ADD COLUMN IF NOT EXISTS ai_review_token UUID,
    ADD COLUMN IF NOT EXISTS ai_review_attempts SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ai_review_enqueued_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ai_review_next_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ai_review_lease_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ai_review_last_error_code TEXT;

-- 검사 대기(`pending`)와 차단(`blocked`)을 상태에 더한다. 본문 규칙은 그대로 지킨다.
ALTER TABLE public.neighbor_comments DROP CONSTRAINT IF EXISTS neighbor_comments_status_check;
ALTER TABLE public.neighbor_comments DROP CONSTRAINT IF EXISTS neighbor_comments_check;
ALTER TABLE public.neighbor_comments
    ADD CONSTRAINT neighbor_comments_status_check
    CHECK (status = ANY (ARRAY['pending', 'visible', 'hidden', 'blocked', 'deleted']));
ALTER TABLE public.neighbor_comments
    ADD CONSTRAINT neighbor_comments_check
    CHECK (
        (status = 'deleted' AND content = '')
        OR (status = ANY (ARRAY['pending', 'visible', 'hidden', 'blocked'])
            AND char_length(btrim(content)) BETWEEN 1 AND 300
            AND content !~ '[\r\n]')
    );

CREATE INDEX IF NOT EXISTS neighbor_comments_review_queue_idx
    ON public.neighbor_comments (ai_review_enqueued_at, created_at, id)
    WHERE status = 'pending';

/**
 * 이웃 댓글을 남긴다. 이제 바로 보이지 않고 **검사를 기다린다.**
 *
 * 우리 반 댓글(`create_my_post_comment_v1`)과 같은 자리에 같은 값을 넣어, 같은 작업기가 집어 간다.
 * 읽는 쪽은 예전부터 `status = 'visible'` 만 보여 주므로 검사 전 댓글은 상대 학급에 노출되지 않는다.
 */
CREATE OR REPLACE FUNCTION public.save_neighbor_comment_v1(
    p_space_id UUID, p_shared_post_id UUID, p_content TEXT, p_action TEXT DEFAULT 'save')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID;
    v_class_id UUID;
    v_owner_student_id UUID;
    v_student_name TEXT;
    v_content TEXT := btrim(COALESCE(p_content, ''));
    v_comment public.neighbor_comments%ROWTYPE;
    v_public_class_name TEXT;
    v_comment_count INTEGER;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    IF p_action NOT IN ('save', 'delete') THEN
        RAISE EXCEPTION '댓글 작업이 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;
    IF p_action = 'save' AND (char_length(v_content) NOT BETWEEN 1 AND 300 OR v_content ~ E'[\r\n]') THEN
        RAISE EXCEPTION '댓글은 줄바꿈 없이 1~300자로 작성해 주세요.' USING ERRCODE = '22023';
    END IF;
    SELECT access.requester_student_id, access.requester_class_id, access.owner_student_id
    INTO v_student_id, v_class_id, v_owner_student_id
    FROM public.assert_neighbor_student_post_access_v1(p_space_id, p_shared_post_id) access;
    SELECT left(btrim(student.name), 30) INTO v_student_name
    FROM public.students student WHERE student.id = v_student_id AND student.class_id = v_class_id;

    SELECT comment.* INTO v_comment FROM public.neighbor_comments comment
    WHERE comment.shared_post_id = p_shared_post_id AND comment.student_id = v_student_id FOR UPDATE;

    IF p_action = 'delete' THEN
        -- 검사 대기 중인 내 댓글도 거둘 수 있어야 한다.
        IF v_comment.id IS NULL OR v_comment.status NOT IN ('visible', 'pending') THEN
            RAISE EXCEPTION '삭제할 내 댓글이 없습니다.' USING ERRCODE = '55000';
        END IF;
        UPDATE public.neighbor_comments
        SET content = '', status = 'deleted', hidden_at = NULL, hidden_by = NULL,
            hidden_by_class_id = NULL, hidden_reason = '',
            ai_review_token = NULL, ai_review_next_at = NULL, ai_review_lease_until = NULL
        WHERE id = v_comment.id RETURNING * INTO v_comment;
    ELSIF v_comment.id IS NULL THEN
        INSERT INTO public.neighbor_comments (
            shared_post_id, space_id, class_id, student_id, content, status,
            ai_review_attempts, ai_review_enqueued_at, ai_review_next_at,
            ai_review_lease_until, ai_review_last_error_code, ai_review_token)
        VALUES (p_shared_post_id, p_space_id, v_class_id, v_student_id, v_content, 'pending',
            0, v_now, v_now, NULL, NULL, NULL)
        RETURNING * INTO v_comment;
    ELSE
        IF v_comment.status = 'hidden' THEN
            RAISE EXCEPTION '선생님이 숨긴 댓글은 직접 다시 공개할 수 없습니다.' USING ERRCODE = '42501';
        END IF;
        -- 고쳐 쓴 댓글도 처음처럼 다시 검사받는다. 검사 뒤 몰래 바꿔치기하지 못하게 한다.
        UPDATE public.neighbor_comments
        SET content = v_content, status = 'pending',
            hidden_at = NULL, hidden_by = NULL, hidden_by_class_id = NULL, hidden_reason = '',
            moderation_reason = NULL, moderated_at = NULL, moderated_by = NULL,
            ai_review_attempts = 0, ai_review_enqueued_at = v_now, ai_review_next_at = v_now,
            ai_review_lease_until = NULL, ai_review_last_error_code = NULL, ai_review_token = NULL
        WHERE id = v_comment.id RETURNING * INTO v_comment;
    END IF;

    SELECT membership.public_class_name INTO v_public_class_name
    FROM public.neighbor_space_classes membership
    WHERE membership.space_id = p_space_id AND membership.class_id = v_class_id
      AND membership.status = 'active';
    SELECT count(*)::INTEGER INTO v_comment_count FROM public.neighbor_comments comment
    WHERE comment.shared_post_id = p_shared_post_id AND comment.status = 'visible';

    -- 원장 기록 모양은 예전 그대로 둔다(표에 허용된 event_type·열만 쓴다).
    INSERT INTO public.neighbor_space_events (
        space_id, class_id, actor_user_id, actor_role, event_type, target_type, target_id
    ) VALUES (
        p_space_id, v_class_id, auth.uid(), 'student', 'comment_changed', 'comment', v_comment.id
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'status', v_comment.status,
        'comment_id', v_comment.id,
        'comment_count', v_comment_count,
        -- 화면이 “검사 중”을 알려 줄 수 있어야 아이가 댓글이 사라진 줄 알지 않는다.
        'pending_review', v_comment.status = 'pending',
        'comment', CASE WHEN v_comment.status = 'visible' THEN jsonb_build_object(
            'comment_id', v_comment.id, 'content', v_comment.content,
            'author_name', v_student_name, 'class_name', v_public_class_name,
            'created_at', v_comment.created_at, 'updated_at', v_comment.updated_at, 'is_mine', TRUE
        ) ELSE NULL END);
END;
$$;

REVOKE ALL ON FUNCTION public.save_neighbor_comment_v1(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_neighbor_comment_v1(UUID, UUID, TEXT, TEXT) TO authenticated;

-- ── 대기열 RPC 세 개를 두 표 모두 보도록 넓힌다. 작업기(`vibe-ai`)는 그대로 둔다. ──
-- 두 표의 id 는 모두 `gen_random_uuid()` 라 겹치지 않는다. 그래서 작업기가 넘겨주는 댓글 id 하나로
-- 어느 표의 댓글인지 찾을 수 있고, 작업기에 표 이름을 알려 줄 필요가 없다.

CREATE OR REPLACE FUNCTION public.claim_next_comment_ai_review_v2()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_slot public.comment_ai_review_slots%ROWTYPE;
    v_id UUID; v_student UUID; v_post UUID; v_content TEXT; v_attempts SMALLINT;
    v_source TEXT;
    v_token UUID := gen_random_uuid();
    v_now TIMESTAMPTZ := NOW();
BEGIN
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
    END IF;

    -- 작업기가 중단된 슬롯은 2분 뒤 회수한다. 댓글의 시도 횟수는 유지해 무한 재시도를 막는다.
    UPDATE public.post_comments comment SET
        ai_review_token = NULL, ai_review_lease_until = NULL, moderated_at = NULL, moderated_by = NULL,
        ai_review_next_at = CASE WHEN comment.ai_review_attempts < 2 THEN v_now ELSE NULL END,
        ai_review_last_error_code = 'lease_expired'
    FROM public.comment_ai_review_slots slot
    WHERE slot.lease_until <= v_now AND slot.comment_id = comment.id
      AND slot.review_token = comment.ai_review_token AND comment.status = 'pending';
    UPDATE public.neighbor_comments comment SET
        ai_review_token = NULL, ai_review_lease_until = NULL, moderated_at = NULL, moderated_by = NULL,
        ai_review_next_at = CASE WHEN comment.ai_review_attempts < 2 THEN v_now ELSE NULL END,
        ai_review_last_error_code = 'lease_expired'
    FROM public.comment_ai_review_slots slot
    WHERE slot.lease_until <= v_now AND slot.comment_id = comment.id
      AND slot.review_token = comment.ai_review_token AND comment.status = 'pending';

    UPDATE public.comment_ai_review_slots SET
        comment_id = NULL, review_token = NULL, leased_at = NULL, lease_until = NULL
    WHERE lease_until <= v_now;

    SELECT * INTO v_slot FROM public.comment_ai_review_slots
    WHERE comment_id IS NULL ORDER BY slot_no FOR UPDATE SKIP LOCKED LIMIT 1;
    IF v_slot.slot_no IS NULL THEN
        RETURN jsonb_build_object('claimed', false, 'status', 'busy', 'limit', 3);
    END IF;

    -- 우리 반 댓글을 먼저 본다. 없으면 이웃 댓글을 본다. 둘 다 오래 기다린 것부터 집는다.
    SELECT id, student_id, post_id, content, ai_review_attempts, 'class'
      INTO v_id, v_student, v_post, v_content, v_attempts, v_source
    FROM public.post_comments
    WHERE status = 'pending' AND student_id IS NOT NULL AND ai_review_attempts < 2
      AND ai_review_next_at IS NOT NULL AND ai_review_next_at <= v_now AND ai_review_token IS NULL
    ORDER BY ai_review_enqueued_at, created_at, id
    FOR UPDATE SKIP LOCKED LIMIT 1;

    IF v_id IS NULL THEN
        SELECT id, student_id, shared_post_id, content, ai_review_attempts, 'neighbor'
          INTO v_id, v_student, v_post, v_content, v_attempts, v_source
        FROM public.neighbor_comments
        WHERE status = 'pending' AND student_id IS NOT NULL AND ai_review_attempts < 2
          AND ai_review_next_at IS NOT NULL AND ai_review_next_at <= v_now AND ai_review_token IS NULL
        ORDER BY ai_review_enqueued_at, created_at, id
        FOR UPDATE SKIP LOCKED LIMIT 1;
    END IF;

    IF v_id IS NULL THEN
        RETURN jsonb_build_object('claimed', false, 'status', 'empty', 'limit', 3);
    END IF;

    UPDATE public.comment_ai_review_slots SET
        comment_id = v_id, review_token = v_token, leased_at = v_now,
        lease_until = v_now + INTERVAL '2 minutes'
    WHERE slot_no = v_slot.slot_no;

    IF v_source = 'class' THEN
        UPDATE public.post_comments SET
            ai_review_token = v_token, ai_review_attempts = ai_review_attempts + 1,
            ai_review_lease_until = v_now + INTERVAL '2 minutes',
            moderated_by = 'ai_processing', moderated_at = v_now
        WHERE id = v_id;
    ELSE
        UPDATE public.neighbor_comments SET
            ai_review_token = v_token, ai_review_attempts = ai_review_attempts + 1,
            ai_review_lease_until = v_now + INTERVAL '2 minutes',
            moderated_by = 'ai_processing', moderated_at = v_now
        WHERE id = v_id;
    END IF;

    RETURN jsonb_build_object(
        'claimed', true, 'status', 'processing', 'slot_no', v_slot.slot_no,
        'comment_id', v_id, 'student_id', v_student, 'post_id', v_post,
        'content', v_content, 'review_token', v_token, 'attempt', v_attempts + 1,
        'source', v_source);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_comment_ai_review_v2(
    p_comment_id UUID, p_review_token UUID, p_is_appropriate BOOLEAN,
    p_reason TEXT DEFAULT NULL, p_review_source TEXT DEFAULT 'ai')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_reason TEXT := NULLIF(left(btrim(COALESCE(p_reason, '')), 500), '');
    v_status TEXT;
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
        moderated_at = NOW(), moderated_by = p_review_source,
        ai_review_token = NULL, ai_review_next_at = NULL,
        ai_review_lease_until = NULL, ai_review_last_error_code = NULL
    WHERE id = p_comment_id AND student_id IS NOT NULL AND status = 'pending'
      AND ai_review_token = p_review_token
    RETURNING status INTO v_status;

    IF v_status IS NULL THEN
        -- 이웃 댓글은 통과하면 `visible` 이다(우리 반의 `approved` 와 이름만 다르다).
        UPDATE public.neighbor_comments SET
            status = CASE WHEN p_is_appropriate THEN 'visible' ELSE 'blocked' END,
            moderation_reason = CASE WHEN p_is_appropriate THEN NULL ELSE v_reason END,
            moderated_at = NOW(), moderated_by = p_review_source,
            ai_review_token = NULL, ai_review_next_at = NULL,
            ai_review_lease_until = NULL, ai_review_last_error_code = NULL
        WHERE id = p_comment_id AND student_id IS NOT NULL AND status = 'pending'
          AND ai_review_token = p_review_token
        RETURNING status INTO v_status;
    END IF;

    UPDATE public.comment_ai_review_slots SET
        comment_id = NULL, review_token = NULL, leased_at = NULL, lease_until = NULL
    WHERE comment_id = p_comment_id AND review_token = p_review_token;

    IF v_status IS NULL THEN
        RETURN jsonb_build_object('recorded', false, 'status', 'stale');
    END IF;
    RETURN jsonb_build_object('recorded', true, 'status', v_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_comment_ai_review_v2(
    p_comment_id UUID, p_review_token UUID, p_error_code TEXT)
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
        ai_review_token = NULL, ai_review_lease_until = NULL, moderated_at = NULL, moderated_by = NULL,
        ai_review_next_at = CASE WHEN ai_review_attempts < 2
            THEN NOW() + (INTERVAL '15 seconds' * ai_review_attempts) ELSE NULL END,
        ai_review_last_error_code = v_error_code
    WHERE id = p_comment_id AND status = 'pending' AND ai_review_token = p_review_token
    RETURNING ai_review_attempts INTO v_attempts;

    IF v_attempts IS NULL THEN
        UPDATE public.neighbor_comments SET
            ai_review_token = NULL, ai_review_lease_until = NULL, moderated_at = NULL, moderated_by = NULL,
            ai_review_next_at = CASE WHEN ai_review_attempts < 2
                THEN NOW() + (INTERVAL '15 seconds' * ai_review_attempts) ELSE NULL END,
            ai_review_last_error_code = v_error_code
        WHERE id = p_comment_id AND status = 'pending' AND ai_review_token = p_review_token
        RETURNING ai_review_attempts INTO v_attempts;
    END IF;

    UPDATE public.comment_ai_review_slots SET
        comment_id = NULL, review_token = NULL, leased_at = NULL, lease_until = NULL
    WHERE comment_id = p_comment_id AND review_token = p_review_token;

    RETURN jsonb_build_object(
        'released', v_attempts IS NOT NULL,
        'will_retry', COALESCE(v_attempts < 2, false),
        'attempts', COALESCE(v_attempts, 0));
END;
$$;

COMMIT;
