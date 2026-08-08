BEGIN;
CREATE OR REPLACE FUNCTION public.get_my_reading_library_v1(p_limit INTEGER DEFAULT 50)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_student public.students%ROWTYPE; v_limit INTEGER:=LEAST(GREATEST(COALESCE(p_limit,50),1),100); v_result JSONB;
BEGIN
    SELECT * INTO v_student FROM public.students WHERE auth_id=auth.uid() AND is_active IS DISTINCT FROM false AND deleted_at IS NULL LIMIT 1;
    IF v_student.id IS NULL THEN RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE='42501'; END IF;
    WITH items AS MATERIALIZED (
        SELECT li.* FROM public.student_library_items li WHERE li.student_id=v_student.id AND li.class_id=v_student.class_id ORDER BY li.updated_at DESC LIMIT v_limit
    ), links AS MATERIALIZED (
        SELECT e.* FROM public.reading_log_entries e WHERE e.student_id=v_student.id AND e.class_id=v_student.class_id AND (e.library_item_id IN (SELECT id FROM items)) ORDER BY e.updated_at DESC LIMIT 100
    ), posts AS MATERIALIZED (
        SELECT p.id,p.title,p.structured_content,p.visibility,p.published_at,p.created_at,p.updated_at FROM public.student_posts p
        WHERE p.student_id=v_student.id AND p.class_id=v_student.class_id AND p.writing_context='self' AND p.self_writing_type='reading_log' ORDER BY p.updated_at DESC LIMIT 100
    )
    SELECT jsonb_build_object(
      'version',1,
      'logs',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.updated_at DESC) FROM posts p),'[]'::jsonb),
      'library_items',COALESCE((SELECT jsonb_agg(to_jsonb(i) || jsonb_build_object('book',to_jsonb(b)) ORDER BY i.updated_at DESC) FROM items i JOIN public.book_catalog b ON b.id=i.book_id),'[]'::jsonb),
      'links',COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.updated_at DESC) FROM links e),'[]'::jsonb),
      'reviews',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.reviewed_at DESC) FROM public.reading_log_teacher_reviews r WHERE r.student_id=v_student.id AND r.class_id=v_student.class_id AND r.post_id IN (SELECT id FROM posts)),'[]'::jsonb),
      'draft_statuses',COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.updated_at DESC) FROM public.get_my_reading_log_draft_statuses() d),'[]'::jsonb)
    ) INTO v_result;
    RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION public.get_my_reading_library_v1(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_reading_library_v1(INTEGER) TO authenticated, service_role;
COMMIT;
