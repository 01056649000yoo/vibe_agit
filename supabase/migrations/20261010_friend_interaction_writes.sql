BEGIN;

CREATE OR REPLACE FUNCTION public.toggle_my_post_reaction_v1(
    p_post_id UUID,
    p_reaction_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student public.students%ROWTYPE;
    v_post public.student_posts%ROWTYPE;
    v_existing public.post_reactions%ROWTYPE;
    v_selected BOOLEAN := true;
BEGIN
    SELECT * INTO v_student FROM public.students
    WHERE auth_id = auth.uid() AND is_active IS DISTINCT FROM false AND deleted_at IS NULL LIMIT 1;
    IF v_student.id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    IF p_reaction_type NOT IN ('heart','laugh','wow','bulb','star','agree','supplement','disagree') THEN
        RAISE EXCEPTION '허용되지 않은 반응입니다.' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_post FROM public.student_posts
    WHERE id = p_post_id AND class_id = v_student.class_id
      AND is_submitted IS TRUE AND visibility = 'class';
    IF v_post.id IS NULL THEN
        RAISE EXCEPTION '반응할 수 있는 글을 찾지 못했습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_existing FROM public.post_reactions
    WHERE post_id = p_post_id AND student_id = v_student.id FOR UPDATE;
    IF v_existing.id IS NOT NULL AND v_existing.reaction_type = p_reaction_type THEN
        DELETE FROM public.post_reactions WHERE id = v_existing.id;
        v_selected := false;
    ELSE
        INSERT INTO public.post_reactions (post_id, student_id, class_id, reaction_type)
        VALUES (p_post_id, v_student.id, v_student.class_id, p_reaction_type)
        ON CONFLICT (post_id, student_id) DO UPDATE
        SET reaction_type = EXCLUDED.reaction_type;
    END IF;

    RETURN jsonb_build_object(
        'version', 1, 'selected', v_selected, 'reaction_type', p_reaction_type,
        'student_id', v_student.id,
        'total_count', (SELECT count(*) FROM public.post_reactions WHERE post_id = p_post_id)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_my_post_comment_v1(p_post_id UUID, p_content TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_student public.students%ROWTYPE; v_post public.student_posts%ROWTYPE; v_comment public.post_comments%ROWTYPE; v_content TEXT := btrim(COALESCE(p_content,''));
BEGIN
    SELECT * INTO v_student FROM public.students WHERE auth_id=auth.uid() AND is_active IS DISTINCT FROM false AND deleted_at IS NULL LIMIT 1;
    IF v_student.id IS NULL THEN RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE='42501'; END IF;
    IF char_length(regexp_replace(v_content,'\s','','g')) < 8 OR char_length(v_content) > 1000 THEN RAISE EXCEPTION '댓글은 8~1000자로 작성해주세요.' USING ERRCODE='22023'; END IF;
    SELECT * INTO v_post FROM public.student_posts WHERE id=p_post_id AND class_id=v_student.class_id AND is_submitted IS TRUE AND visibility='class';
    IF v_post.id IS NULL THEN RAISE EXCEPTION '댓글을 남길 수 있는 글이 아닙니다.' USING ERRCODE='42501'; END IF;
    INSERT INTO public.post_comments(post_id,student_id,class_id,content,status)
    VALUES(p_post_id,v_student.id,v_student.class_id,v_content,'pending') RETURNING * INTO v_comment;
    RETURN jsonb_build_object('version',1,'comment',to_jsonb(v_comment) || jsonb_build_object('student_name',v_student.name));
END; $$;

CREATE OR REPLACE FUNCTION public.update_my_post_comment_v1(p_comment_id UUID, p_content TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_student public.students%ROWTYPE; v_comment public.post_comments%ROWTYPE; v_content TEXT := btrim(COALESCE(p_content,''));
BEGIN
    SELECT * INTO v_student FROM public.students WHERE auth_id=auth.uid() AND is_active IS DISTINCT FROM false AND deleted_at IS NULL LIMIT 1;
    IF v_student.id IS NULL THEN RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE='42501'; END IF;
    IF char_length(regexp_replace(v_content,'\s','','g')) < 8 OR char_length(v_content) > 1000 THEN RAISE EXCEPTION '댓글은 8~1000자로 작성해주세요.' USING ERRCODE='22023'; END IF;
    UPDATE public.post_comments SET content=v_content,status='pending',moderation_reason=NULL,moderated_at=NULL,moderated_by=NULL
    WHERE id=p_comment_id AND student_id=v_student.id AND class_id=v_student.class_id RETURNING * INTO v_comment;
    IF v_comment.id IS NULL THEN RAISE EXCEPTION '수정할 수 있는 댓글이 아닙니다.' USING ERRCODE='42501'; END IF;
    RETURN jsonb_build_object('version',1,'comment',to_jsonb(v_comment) || jsonb_build_object('student_name',v_student.name));
END; $$;

CREATE OR REPLACE FUNCTION public.delete_my_post_comment_v1(p_comment_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_student public.students%ROWTYPE; v_deleted UUID;
BEGIN
    SELECT * INTO v_student FROM public.students WHERE auth_id=auth.uid() AND is_active IS DISTINCT FROM false AND deleted_at IS NULL LIMIT 1;
    IF v_student.id IS NULL THEN RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE='42501'; END IF;
    DELETE FROM public.post_comments WHERE id=p_comment_id AND student_id=v_student.id AND class_id=v_student.class_id RETURNING id INTO v_deleted;
    IF v_deleted IS NULL THEN RAISE EXCEPTION '삭제할 수 있는 댓글이 아닙니다.' USING ERRCODE='42501'; END IF;
    RETURN jsonb_build_object('version',1,'deleted',true,'comment_id',v_deleted);
END; $$;

REVOKE ALL ON FUNCTION public.toggle_my_post_reaction_v1(UUID,TEXT), public.create_my_post_comment_v1(UUID,TEXT), public.update_my_post_comment_v1(UUID,TEXT), public.delete_my_post_comment_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_my_post_reaction_v1(UUID,TEXT), public.create_my_post_comment_v1(UUID,TEXT), public.update_my_post_comment_v1(UUID,TEXT), public.delete_my_post_comment_v1(UUID) TO authenticated, service_role;
COMMIT;
