BEGIN;
CREATE OR REPLACE FUNCTION public.get_teacher_post_detail_v1(p_post_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result JSONB;
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.student_posts p JOIN public.classes c ON c.id=p.class_id
        WHERE p.id=p_post_id AND c.deleted_at IS NULL AND (c.teacher_id=auth.uid() OR public.auth_user_role()='ADMIN')
    ) THEN RAISE EXCEPTION '이 글을 확인할 권한이 없습니다.' USING ERRCODE='42501'; END IF;
    SELECT jsonb_build_object(
        'version',1,
        'post',to_jsonb(p),
        'student',jsonb_build_object('id',s.id,'name',s.name),
        'mission',CASE WHEN m.id IS NULL THEN NULL ELSE to_jsonb(m) END,
        'reactions',COALESCE((SELECT jsonb_agg(to_jsonb(r) || jsonb_build_object('student_name',rs.name) ORDER BY r.created_at) FROM public.post_reactions r LEFT JOIN public.students rs ON rs.id=r.student_id AND rs.class_id=p.class_id WHERE r.post_id=p.id AND r.class_id=p.class_id),'[]'::jsonb),
        'comments',COALESCE((SELECT jsonb_agg(to_jsonb(pc) || jsonb_build_object('student_name',cs.name) ORDER BY pc.created_at) FROM public.post_comments pc LEFT JOIN public.students cs ON cs.id=pc.student_id AND cs.class_id=p.class_id WHERE pc.post_id=p.id AND pc.class_id=p.class_id),'[]'::jsonb)
    ) INTO v_result
    FROM public.student_posts p
    JOIN public.students s ON s.id=p.student_id AND s.class_id=p.class_id
    LEFT JOIN public.writing_missions m ON m.id=p.mission_id AND m.class_id=p.class_id
    WHERE p.id=p_post_id;
    RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION public.get_teacher_post_detail_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_post_detail_v1(UUID) TO authenticated, service_role;
COMMIT;
