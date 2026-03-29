CREATE OR REPLACE FUNCTION public.admin_force_teacher_withdrawal(
    p_teacher_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
BEGIN
    v_role := public.auth_user_role();

    IF v_role <> 'ADMIN' THEN
        RAISE EXCEPTION 'Only admins can force teacher withdrawal';
    END IF;

    IF p_teacher_id IS NULL THEN
        RAISE EXCEPTION 'Teacher id is required';
    END IF;

    IF auth.uid() = p_teacher_id THEN
        RAISE EXCEPTION 'Admins cannot delete their own account from admin dashboard';
    END IF;

    DELETE FROM public.teachers
    WHERE id = p_teacher_id;

    DELETE FROM public.profiles
    WHERE id = p_teacher_id
      AND role IN ('TEACHER', 'ADMIN');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target teacher profile not found';
    END IF;

    RETURN json_build_object(
        'success', true,
        'teacher_id', p_teacher_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_force_teacher_withdrawal(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_force_teacher_withdrawal(UUID) TO authenticated, service_role;
