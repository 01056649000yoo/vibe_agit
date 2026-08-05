-- ============================================================================
-- 교사용 글 콘텐츠 학생별 공용 내보내기
--
-- 미션·독서록·향후 student_posts 기반 자율 글쓰기를 같은 행 계약으로 반환한다.
-- 콘텐츠별 Excel 열/Google Docs 표현은 프론트의 export profile이 담당한다.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_teacher_writing_content_export(
    p_class_id UUID,
    p_student_id UUID,
    p_content_type TEXT,
    p_limit INTEGER DEFAULT 500
)
RETURNS TABLE (
    post_id UUID,
    student_id UUID,
    student_name TEXT,
    student_code TEXT,
    content_type TEXT,
    content_type_label TEXT,
    group_title TEXT,
    post_title TEXT,
    content TEXT,
    visibility TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    source_title TEXT,
    source_authors TEXT[],
    review_status TEXT,
    teacher_comment TEXT,
    reviewed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.classes c
        WHERE c.id = p_class_id
          AND c.teacher_id = auth.uid()
    ) AND public.auth_user_role() IS DISTINCT FROM 'ADMIN' THEN
        RAISE EXCEPTION '이 학급의 글을 내보낼 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.students s
        WHERE s.id = p_student_id
          AND s.class_id = p_class_id
          AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
    ) THEN
        RAISE EXCEPTION '이 학급의 학생을 찾을 수 없습니다.' USING ERRCODE = '22023';
    END IF;

    IF p_content_type <> 'assignment' AND NOT EXISTS (
        SELECT 1 FROM public.writing_types wt
        WHERE wt.id = p_content_type AND wt.is_active = true
    ) THEN
        RAISE EXCEPTION '지원하지 않는 글 콘텐츠 유형입니다.' USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        p.student_id,
        s.name,
        s.student_code,
        CASE WHEN p.writing_context = 'assignment' THEN 'assignment' ELSE p.self_writing_type END,
        CASE WHEN p.writing_context = 'assignment' THEN '선생님 과제' ELSE COALESCE(wt.label, p.self_writing_type) END,
        CASE WHEN p.writing_context = 'assignment' THEN m.title ELSE COALESCE(wt.label, p.self_writing_type) END,
        p.title,
        p.content,
        p.visibility,
        p.created_at,
        p.updated_at,
        p.approved_at,
        CASE
            WHEN p.self_writing_type = 'reading_log' THEN COALESCE(b.title, p.structured_content ->> 'bookTitle')
            ELSE NULL
        END,
        CASE
            WHEN p.self_writing_type = 'reading_log' THEN COALESCE(b.authors, '{}'::TEXT[])
            ELSE '{}'::TEXT[]
        END,
        CASE
            WHEN p.self_writing_type = 'reading_log' THEN COALESCE(rr.review_status, 'unreviewed')
            WHEN p.is_confirmed IS TRUE THEN 'approved'
            ELSE 'unreviewed'
        END,
        CASE WHEN p.self_writing_type = 'reading_log' THEN rr.teacher_comment ELSE NULL END,
        CASE WHEN p.self_writing_type = 'reading_log' THEN rr.reviewed_at ELSE NULL END
    FROM public.student_posts p
    JOIN public.students s
      ON s.id = p.student_id
     AND s.class_id = p.class_id
    LEFT JOIN public.writing_missions m
      ON m.id = p.mission_id
     AND m.class_id = p.class_id
    LEFT JOIN public.writing_types wt
      ON wt.id = p.self_writing_type
    LEFT JOIN public.reading_log_entries rle
      ON rle.post_id = p.id
     AND rle.class_id = p.class_id
    LEFT JOIN public.student_library_items li
      ON li.id = rle.library_item_id
     AND li.class_id = p.class_id
    LEFT JOIN public.book_catalog b
      ON b.id = li.book_id
    LEFT JOIN public.reading_log_teacher_reviews rr
      ON rr.post_id = p.id
     AND rr.class_id = p.class_id
    WHERE p.class_id = p_class_id
      AND p.student_id = p_student_id
      AND p.is_submitted IS TRUE
      AND (
          (p_content_type = 'assignment' AND p.writing_context = 'assignment')
          OR
          (p_content_type <> 'assignment'
              AND p.writing_context = 'self'
              AND p.self_writing_type = p_content_type)
      )
    ORDER BY p.created_at DESC, p.id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 500), 1), 2000);
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_writing_content_export(UUID, UUID, TEXT, INTEGER)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_teacher_writing_content_export(UUID, UUID, TEXT, INTEGER)
    TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
