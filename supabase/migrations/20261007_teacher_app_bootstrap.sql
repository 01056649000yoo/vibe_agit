BEGIN;

CREATE OR REPLACE FUNCTION public.get_teacher_app_bootstrap_v1(
    p_touch_login BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_role TEXT := public.auth_user_role();
    v_profile JSONB;
    v_teacher JSONB;
    v_classes JSONB;
    v_announcements JSONB;
BEGIN
    IF v_user_id IS NULL OR v_role NOT IN ('TEACHER', 'ADMIN') THEN
        RAISE EXCEPTION 'teacher authentication required' USING ERRCODE = '42501';
    END IF;

    IF p_touch_login THEN
        UPDATE public.profiles
        SET last_login_at = NOW()
        WHERE id = v_user_id;
    END IF;

    SELECT jsonb_build_object(
        'id', p.id,
        'role', p.role,
        'full_name', p.full_name,
        'is_approved', p.is_approved,
        'primary_class_id', p.primary_class_id,
        'api_mode', p.api_mode,
        'created_at', p.created_at,
        'last_login_at', p.last_login_at,
        'ai_prompt_template', p.ai_prompt_template,
        'frequent_tags', COALESCE(p.frequent_tags, '[]'::jsonb),
        'default_rubric', p.default_rubric,
        'mission_default_settings', p.mission_default_settings
    )
    INTO v_profile
    FROM public.profiles p
    WHERE p.id = v_user_id;

    SELECT jsonb_build_object(
        'name', t.name,
        'school_name', t.school_name,
        'phone', t.phone
    )
    INTO v_teacher
    FROM public.teachers t
    WHERE t.id = v_user_id;

    SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC), '[]'::jsonb)
    INTO v_classes
    FROM (
        SELECT id, name, created_at, teacher_id
        FROM public.classes
        WHERE teacher_id = v_user_id
          AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 100
    ) c;

    SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC), '[]'::jsonb)
    INTO v_announcements
    FROM (
        SELECT id, title, content, created_at, target_role
        FROM public.announcements
        WHERE target_role IN ('TEACHER', 'ALL')
        ORDER BY created_at DESC
        LIMIT 50
    ) a;

    RETURN jsonb_build_object(
        'version', 1,
        'profile', COALESCE(v_profile, '{}'::jsonb),
        'teacher', COALESCE(v_teacher, '{}'::jsonb),
        'classes', v_classes,
        'announcements', v_announcements
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_app_bootstrap_v1(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_app_bootstrap_v1(BOOLEAN) TO authenticated, service_role;

COMMIT;
