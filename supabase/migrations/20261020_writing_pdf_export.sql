BEGIN;

-- 보고서 PDF는 본문 문자열뿐 아니라 칸 구조와 비공개 사진 경로가 필요하다.
-- 교사 내보내기 RPC에 필요한 두 열만 추가하고 기존 학급·권한·상한 계약은 유지한다.
DROP FUNCTION IF EXISTS public.get_writing_export_data(UUID, TEXT, UUID);

CREATE FUNCTION public.get_writing_export_data(
    p_class_id UUID,
    p_type TEXT,
    p_target_id UUID
)
RETURNS TABLE (
    post_id UUID,
    student_id UUID,
    mission_id UUID,
    student_name TEXT,
    student_code TEXT,
    student_created_at TIMESTAMPTZ,
    mission_title TEXT,
    post_title TEXT,
    content TEXT,
    is_confirmed BOOLEAN,
    approved_at TIMESTAMPTZ,
    structured_content JSONB,
    input_template TEXT
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
    ) AND NOT EXISTS (
        SELECT 1
        FROM public.profiles profile
        WHERE profile.id = auth.uid()
          AND profile.role = 'ADMIN'
    ) THEN
        RAISE EXCEPTION '이 학급의 글을 내보낼 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    IF p_type NOT IN ('student', 'mission') THEN
        RAISE EXCEPTION '지원하지 않는 내보내기 유형입니다.' USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        p.student_id,
        p.mission_id,
        s.name,
        s.student_code,
        s.created_at,
        m.title,
        p.title,
        p.content,
        p.is_confirmed,
        p.approved_at,
        p.structured_content,
        m.input_template
    FROM public.student_posts p
    JOIN public.students s
      ON s.id = p.student_id
     AND s.class_id = p.class_id
    JOIN public.writing_missions m
      ON m.id = p.mission_id
     AND m.class_id = p.class_id
    WHERE p.class_id = p_class_id
      AND p.is_submitted IS TRUE
      AND (
          (p_type = 'student' AND p.student_id = p_target_id)
          OR (p_type = 'mission' AND p.mission_id = p_target_id)
      )
    ORDER BY p.created_at, p.id
    LIMIT 5000;
END;
$$;

REVOKE ALL ON FUNCTION public.get_writing_export_data(UUID, TEXT, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_writing_export_data(UUID, TEXT, UUID)
    TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
