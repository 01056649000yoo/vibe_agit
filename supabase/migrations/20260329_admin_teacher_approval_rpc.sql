CREATE OR REPLACE FUNCTION public.admin_set_teacher_approval(
    p_teacher_id UUID,
    p_is_approved BOOLEAN
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
        RAISE EXCEPTION 'Only admins can change teacher approval status';
    END IF;

    IF p_teacher_id IS NULL THEN
        RAISE EXCEPTION 'Teacher id is required';
    END IF;

    IF auth.uid() = p_teacher_id THEN
        RAISE EXCEPTION 'Admins cannot change their own approval status';
    END IF;

    UPDATE public.profiles
    SET is_approved = p_is_approved
    WHERE id = p_teacher_id
      AND role IN ('TEACHER', 'ADMIN');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target teacher profile not found';
    END IF;

    RETURN json_build_object(
        'success', true,
        'teacher_id', p_teacher_id,
        'is_approved', p_is_approved
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_teacher_approval(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_teacher_approval(UUID, BOOLEAN) TO authenticated, service_role;
