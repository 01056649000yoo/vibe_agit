-- 모두의 아지트: 내 글에는 댓글을 달 수 없게 (2026-09-25, 선생님 결정 — 이웃 글 마당·같이 쓰기 광장, 반 친구 글 댓글은 그대로)
--
-- 두 공간은 같은 저장 함수(save_neighbor_comment_v1)를 쓴다. 저장(save)만 막고, 이미 단 내 댓글을 지우는(delete) 것은 된다.
-- 운영에 이미 있는 본인 글 댓글 1개는 그대로 둔다.

BEGIN;

-- 운영 정의(20261340) + 내 글 막기.
CREATE OR REPLACE FUNCTION public.save_neighbor_comment_v1(p_space_id uuid, p_shared_post_id uuid, p_content text, p_action text DEFAULT 'save'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    -- 내 글에는 새 댓글·고쳐 쓰기를 받지 않는다(2026-09-25 선생님 결정, 모두의 아지트만). 이미 단 댓글을 지우는 것은 된다.
    IF p_action = 'save' AND v_owner_student_id = v_student_id THEN
        RAISE EXCEPTION '내 글에는 댓글을 남길 수 없어요. 친구들이 남긴 댓글을 읽어 보세요.' USING ERRCODE = '42501';
    END IF;

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

    IF p_action = 'save' THEN
        PERFORM public.consume_comment_review_quota_v1(v_student_id);
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
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
