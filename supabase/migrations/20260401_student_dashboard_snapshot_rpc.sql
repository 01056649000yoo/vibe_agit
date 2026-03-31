CREATE OR REPLACE FUNCTION public.get_student_dashboard_snapshot()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_student RECORD;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'No auth session');
    END IF;

    SELECT
        s.id,
        s.name,
        s.class_id,
        s.total_points,
        s.pet_data,
        s.last_feedback_check
    INTO v_student
    FROM public.students s
    WHERE s.auth_id = auth.uid()
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Student binding not found');
    END IF;

    RETURN json_build_object(
        'success', true,
        'student', json_build_object(
            'id', v_student.id,
            'name', v_student.name,
            'class_id', v_student.class_id,
            'total_points', v_student.total_points,
            'pet_data', v_student.pet_data,
            'last_feedback_check', v_student.last_feedback_check
        )
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_student_dashboard_snapshot() TO authenticated;
