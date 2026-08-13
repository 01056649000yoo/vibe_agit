BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_lab_results_v1(
    p_limit INTEGER DEFAULT 20,
    p_before_completed_at TIMESTAMPTZ DEFAULT NULL,
    p_before_id UUID DEFAULT NULL,
    p_result_kinds TEXT[] DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    session_id UUID,
    room_id UUID,
    activity_type TEXT,
    activity_version INTEGER,
    schema_version INTEGER,
    result_kind TEXT,
    title TEXT,
    topic TEXT,
    chunks JSONB,
    completed_at TIMESTAMPTZ,
    has_more BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, writing_helper
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_limit INTEGER := LEAST(GREATEST(coalesce(p_limit, 20), 1), 50);
BEGIN
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION 'student authentication required' USING ERRCODE = '42501';
    END IF;

    IF (p_before_completed_at IS NULL) <> (p_before_id IS NULL) THEN
        RAISE EXCEPTION 'both cursor values are required' USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    WITH page AS (
        SELECT portable.*
        FROM writing_helper.portable_results portable
        JOIN public.students student
          ON student.id = portable.agit_student_id
         AND student.class_id = portable.class_id
         AND student.is_active IS DISTINCT FROM false
         AND student.deleted_at IS NULL
        WHERE portable.agit_student_id = v_student_id
          AND (
              p_result_kinds IS NULL
              OR cardinality(p_result_kinds) = 0
              OR portable.result_kind = ANY(p_result_kinds)
          )
          AND (
              p_before_completed_at IS NULL
              OR (portable.completed_at, portable.id) < (p_before_completed_at, p_before_id)
          )
        ORDER BY portable.completed_at DESC, portable.id DESC
        LIMIT v_limit + 1
    ), page_meta AS (
        SELECT count(*) > v_limit AS has_more
        FROM page
    )
    SELECT
        page.id,
        page.session_id,
        page.room_id,
        page.activity_type,
        page.activity_version,
        page.schema_version,
        page.result_kind,
        page.title,
        page.topic,
        page.chunks,
        page.completed_at,
        page_meta.has_more
    FROM page
    CROSS JOIN page_meta
    ORDER BY page.completed_at DESC, page.id DESC
    LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_lab_results_v1(INTEGER, TIMESTAMPTZ, UUID, TEXT[])
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_lab_results_v1(INTEGER, TIMESTAMPTZ, UUID, TEXT[])
    TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
