CREATE OR REPLACE FUNCTION public.admin_dashboard_snapshot()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_settings JSONB := '{}'::jsonb;
    v_teacher_student_counts JSONB := '{}'::jsonb;
    v_registered_student_count INTEGER := 0;
    v_pending_feedback_count INTEGER := 0;
BEGIN
    IF public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION 'Only admins can read dashboard snapshot';
    END IF;

    v_settings := (
        SELECT COALESCE(jsonb_object_agg("key", value), '{}'::jsonb)
        FROM public.system_settings
        WHERE "key" IN ('auto_approval', 'public_api_enabled')
    );

    v_registered_student_count := (
        SELECT COUNT(*)::INTEGER
        FROM public.students
        WHERE deleted_at IS NULL
    );

    v_pending_feedback_count := (
        SELECT COUNT(*)::INTEGER
        FROM public.feedback_reports
        WHERE status = 'open'
    );

    v_teacher_student_counts := (
        SELECT COALESCE(jsonb_object_agg(teacher_id, student_count), '{}'::jsonb)
        FROM (
        SELECT
            c.teacher_id,
            COUNT(s.id)::INTEGER AS student_count
        FROM public.classes c
        LEFT JOIN public.students s
          ON s.class_id = c.id
         AND s.deleted_at IS NULL
        WHERE c.teacher_id IS NOT NULL
        GROUP BY c.teacher_id
        ) counts
    );

    RETURN json_build_object(
        'success', true,
        'settings', v_settings,
        'registered_student_count', COALESCE(v_registered_student_count, 0),
        'pending_feedback_count', COALESCE(v_pending_feedback_count, 0),
        'teacher_student_counts', v_teacher_student_counts
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_dashboard_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_snapshot() TO authenticated, service_role;
