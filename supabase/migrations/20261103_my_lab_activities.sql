BEGIN;

CREATE INDEX IF NOT EXISTS rooms_active_agit_class_created_id_idx
  ON writing_helper.rooms(agit_class_id, created_at DESC, id DESC)
  WHERE agit_class_id IS NOT NULL AND is_active IS TRUE;

CREATE OR REPLACE FUNCTION public.get_my_lab_activities_v1(
    p_limit INTEGER DEFAULT 20,
    p_before_created_at TIMESTAMPTZ DEFAULT NULL,
    p_before_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    activity_type TEXT,
    title TEXT,
    topic TEXT,
    created_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    session_id UUID,
    participation_status TEXT,
    has_more BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, writing_helper
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID;
    v_teacher_id UUID;
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
BEGIN
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION 'student authentication required' USING ERRCODE = '42501';
    END IF;

    IF (p_before_created_at IS NULL) <> (p_before_id IS NULL) THEN
        RAISE EXCEPTION 'both cursor values are required' USING ERRCODE = '22023';
    END IF;

    SELECT student.class_id, class.teacher_id
      INTO v_class_id, v_teacher_id
    FROM public.students student
    JOIN public.classes class ON class.id = student.class_id
    WHERE student.id = v_student_id
      AND student.is_active IS DISTINCT FROM FALSE
      AND student.deleted_at IS NULL;

    IF v_class_id IS NULL OR v_teacher_id IS NULL THEN
        RAISE EXCEPTION 'active student class required' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH page AS (
        SELECT
            room.id,
            COALESCE(NULLIF(room.activity_type, ''), 'outline_builder') AS activity_type,
            room.title,
            room.topic,
            room.created_at,
            room.expires_at,
            session.id AS session_id,
            CASE
                WHEN session.status = 'done' THEN 'done'
                WHEN session.id IS NULL THEN 'not_started'
                ELSE 'in_progress'
            END AS participation_status
        FROM writing_helper.rooms room
        LEFT JOIN writing_helper.student_sessions session
          ON session.room_id = room.id
         AND session.agit_student_id = v_student_id
        WHERE room.agit_class_id = v_class_id
          AND room.teacher_id = v_teacher_id
          AND room.is_active IS TRUE
          AND (room.expires_at IS NULL OR room.expires_at > NOW())
          AND COALESCE(NULLIF(room.activity_type, ''), 'outline_builder') = ANY(ARRAY[
              'outline_builder',
              'question_generator',
              'question_voting',
              'one_line_share',
              'hanja_writing'
          ]::TEXT[])
          AND (
              p_before_created_at IS NULL
              OR (room.created_at, room.id) < (p_before_created_at, p_before_id)
          )
        ORDER BY room.created_at DESC, room.id DESC
        LIMIT v_limit + 1
    ), page_meta AS (
        SELECT COUNT(*) > v_limit AS has_more
        FROM page
    )
    SELECT
        page.id,
        page.activity_type,
        page.title,
        page.topic,
        page.created_at,
        page.expires_at,
        page.session_id,
        page.participation_status,
        page_meta.has_more
    FROM page
    CROSS JOIN page_meta
    ORDER BY page.created_at DESC, page.id DESC
    LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_lab_activities_v1(INTEGER, TIMESTAMPTZ, UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_lab_activities_v1(INTEGER, TIMESTAMPTZ, UUID)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
