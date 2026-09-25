-- 댓글 상한을 1000자에서 200자로 축소한다.
-- 초등학생 댓글의 호흡에 맞게 간결한 표현을 유도하고 비정상적인 장문 입력을 원천 방지한다.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_my_post_comment_v1(p_post_id uuid, p_content text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    IF char_length(regexp_replace(v_content, '\s', '', 'g')) < 8 OR char_length(v_content) > 200 THEN
        RAISE EXCEPTION '댓글은 8~200자로 작성해주세요.' USING ERRCODE = '22023';
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
    PERFORM public.consume_comment_review_quota_v1(v_student.id);
    RETURN jsonb_build_object('version', 2, 'comment', to_jsonb(v_comment) || jsonb_build_object('student_name', v_student.name));
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_my_post_comment_v1(p_comment_id uuid, p_content text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_student public.students%ROWTYPE;
    v_comment public.post_comments%ROWTYPE;
    v_content TEXT := btrim(COALESCE(p_content, ''));
    v_now TIMESTAMPTZ := NOW();
BEGIN
    SELECT * INTO v_student FROM public.students
    WHERE auth_id = auth.uid() AND is_active IS DISTINCT FROM false AND deleted_at IS NULL LIMIT 1;
    IF v_student.id IS NULL THEN RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501'; END IF;
    IF char_length(regexp_replace(v_content, '\s', '', 'g')) < 8 OR char_length(v_content) > 200 THEN
        RAISE EXCEPTION '댓글은 8~200자로 작성해주세요.' USING ERRCODE = '22023';
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
    PERFORM public.consume_comment_review_quota_v1(v_student.id);
    RETURN jsonb_build_object('version', 2, 'comment', to_jsonb(v_comment) || jsonb_build_object('student_name', v_student.name));
END;
$function$;

COMMIT;
