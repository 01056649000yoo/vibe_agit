CREATE OR REPLACE FUNCTION public.get_student_classmates_for_hideout()
RETURNS TABLE (
    id UUID,
    name TEXT,
    pet_data JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_class_id UUID;
    v_student_id UUID;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' THEN
        RAISE EXCEPTION 'Only students can load classmates for hideout'
            USING ERRCODE = '42501';
    END IF;

    v_class_id := public.auth_user_class_id();
    v_student_id := public.auth_student_id();

    IF v_class_id IS NULL OR v_student_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        s.id,
        s.name,
        s.pet_data
    FROM public.students s
    WHERE s.class_id = v_class_id
      AND s.id <> v_student_id
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
    ORDER BY s.name;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_student_classmates_for_hideout() TO authenticated;
