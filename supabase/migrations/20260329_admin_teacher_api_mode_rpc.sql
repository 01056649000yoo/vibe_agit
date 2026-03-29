CREATE OR REPLACE FUNCTION public.admin_set_teacher_api_mode(
    p_teacher_id UUID,
    p_api_mode TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_mode TEXT;
BEGIN
    v_role := public.auth_user_role();
    v_mode := UPPER(COALESCE(p_api_mode, ''));

    IF v_role <> 'ADMIN' THEN
        RAISE EXCEPTION 'Only admins can change teacher api mode';
    END IF;

    IF p_teacher_id IS NULL THEN
        RAISE EXCEPTION 'Teacher id is required';
    END IF;

    IF v_mode NOT IN ('SYSTEM', 'PERSONAL') THEN
        RAISE EXCEPTION 'Invalid api mode';
    END IF;

    UPDATE public.profiles
    SET api_mode = v_mode
    WHERE id = p_teacher_id
      AND role IN ('TEACHER', 'ADMIN');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target teacher profile not found';
    END IF;

    RETURN json_build_object(
        'success', true,
        'teacher_id', p_teacher_id,
        'api_mode', v_mode
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_teacher_api_mode(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_teacher_api_mode(UUID, TEXT) TO authenticated, service_role;
