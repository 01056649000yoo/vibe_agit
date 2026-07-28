-- ============================================================================
-- 교사용 학생 독서록 — 학생별 요약
--
-- 목록을 "학생별로 묶어 보기" 위한 집계. 글 목록을 전부 내려받아 세는 대신
-- 학생 한 명당 한 줄만 돌려준다. 아직 한 편도 쓰지 않은 학생도 0편으로
-- 포함해야 "누가 안 썼는지"가 보이므로 students에서 LEFT JOIN 한다.
--
-- 본문·제목은 반환하지 않는다. 펼칠 때 기존
-- get_teacher_reading_log_overview(p_student_id := ...)로 그 학생 것만 읽는다.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_teacher_reading_log_student_summary(
    p_class_id UUID,
    p_query TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_admin BOOLEAN := false;
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    v_is_admin := public.auth_user_role() = 'ADMIN';
    IF NOT v_is_admin AND NOT EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = p_class_id AND c.teacher_id = auth.uid()
    ) THEN
        RAISE EXCEPTION '이 학급의 독서록을 관리할 권한이 없습니다.'
            USING ERRCODE = '42501';
    END IF;

    WITH logs AS (
        -- reading_log_entries.post_id 가 PK 이므로 글 한 편이 여러 줄로 늘지 않는다.
        SELECT
            p.student_id,
            p.updated_at,
            CASE WHEN rr.post_id IS NULL THEN 'unreviewed' ELSE rr.review_status END AS review_status
        FROM public.student_posts p
        JOIN public.students s ON s.id = p.student_id
        LEFT JOIN public.reading_log_entries re ON re.post_id = p.id
        LEFT JOIN public.student_library_items li ON li.id = re.library_item_id
        LEFT JOIN public.book_catalog b ON b.id = li.book_id
        LEFT JOIN public.reading_log_teacher_reviews rr ON rr.post_id = p.id
        WHERE p.class_id = p_class_id
          AND p.writing_context = 'self'
          AND p.self_writing_type = 'reading_log'
          AND p.is_submitted = true
          AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
          AND (
              NULLIF(btrim(COALESCE(p_query, '')), '') IS NULL
              OR position(lower(btrim(p_query)) IN lower(COALESCE(s.name, ''))) > 0
              OR position(lower(btrim(p_query)) IN lower(COALESCE(p.title, ''))) > 0
              OR position(lower(btrim(p_query)) IN lower(COALESCE(b.title, ''))) > 0
          )
    ), per_student AS (
        SELECT
            s.id AS student_id,
            s.name AS student_name,
            count(l.student_id)::INTEGER AS total_count,
            count(l.student_id) FILTER (WHERE l.review_status = 'unreviewed')::INTEGER
                AS unreviewed_count,
            max(l.updated_at) AS last_written_at
        FROM public.students s
        LEFT JOIN logs l ON l.student_id = s.id
        WHERE s.class_id = p_class_id
          AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
        GROUP BY s.id, s.name
    )
    SELECT jsonb_build_object(
        'students', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'student_id', per_student.student_id,
                    'student_name', per_student.student_name,
                    'total_count', per_student.total_count,
                    'unreviewed_count', per_student.unreviewed_count,
                    'reviewed_count', per_student.total_count - per_student.unreviewed_count,
                    'last_written_at', per_student.last_written_at
                ) ORDER BY per_student.student_name, per_student.student_id
            )
            FROM per_student
        ), '[]'::JSONB)
    )
    INTO v_result;

    RETURN COALESCE(v_result, jsonb_build_object('students', '[]'::JSONB));
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_reading_log_student_summary(UUID, TEXT)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_reading_log_student_summary(UUID, TEXT)
    TO authenticated, service_role;

COMMIT;
