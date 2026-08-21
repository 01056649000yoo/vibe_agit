-- 교사 부트스트랩이 공지의 `is_popup` 을 함께 준다 (2026-08-21)
--
-- 배경: 관리자 화면에 `팝업으로 띄우기` 설정이 있는데 **아무 일도 하지 않았다.**
--       화면 쪽 조회에도 부트스트랩 RPC 에도 `is_popup` 이 빠져 있어서, 켜도 값이 오지 않았다.
--       화면 쪽은 같은 날 함께 고쳤고, 여기서는 부트스트랩이 주는 값에 한 열을 더한다.
--
-- 함수 본문은 20261014 의 것을 그대로 두고 공지 SELECT 한 줄만 바꾼다.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_teacher_app_bootstrap_v1(p_touch_login BOOLEAN DEFAULT TRUE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_profile_row public.profiles%ROWTYPE;
    v_profile JSONB;
    v_teacher JSONB;
    v_classes JSONB := '[]'::JSONB;
    v_announcements JSONB := '[]'::JSONB;
    v_can_operate BOOLEAN := false;
BEGIN
    SELECT * INTO v_profile_row FROM public.profiles WHERE id = v_user_id;
    IF v_user_id IS NULL OR v_profile_row.role NOT IN ('TEACHER', 'ADMIN') THEN
        RAISE EXCEPTION 'teacher authentication required' USING ERRCODE = '42501';
    END IF;
    v_can_operate := v_profile_row.role = 'ADMIN'
        OR (v_profile_row.is_approved IS TRUE AND v_profile_row.approval_revoked_at IS NULL);

    IF p_touch_login THEN
        UPDATE public.profiles SET last_login_at = NOW() WHERE id = v_user_id;
        SELECT * INTO v_profile_row FROM public.profiles WHERE id = v_user_id;
    END IF;

    v_profile := jsonb_build_object(
        'id', v_profile_row.id, 'role', v_profile_row.role,
        'full_name', v_profile_row.full_name, 'is_approved', v_profile_row.is_approved,
        'primary_class_id', v_profile_row.primary_class_id, 'api_mode', v_profile_row.api_mode,
        'created_at', v_profile_row.created_at, 'last_login_at', v_profile_row.last_login_at,
        'ai_prompt_template', v_profile_row.ai_prompt_template,
        'frequent_tags', COALESCE(v_profile_row.frequent_tags, '[]'::jsonb),
        'default_rubric', v_profile_row.default_rubric,
        'mission_default_settings', v_profile_row.mission_default_settings
    );
    SELECT jsonb_build_object('name', t.name, 'school_name', t.school_name, 'phone', t.phone)
    INTO v_teacher FROM public.teachers t WHERE t.id = v_user_id;

    IF v_can_operate THEN
        SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC), '[]'::jsonb)
        INTO v_classes FROM (
            SELECT id, name, created_at, teacher_id FROM public.classes
            WHERE teacher_id = v_user_id AND deleted_at IS NULL
            ORDER BY created_at DESC LIMIT 100
        ) c;
        SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC), '[]'::jsonb)
        INTO v_announcements FROM (
            SELECT id, title, content, created_at, target_role, is_popup FROM public.announcements
            WHERE target_role IN ('TEACHER', 'ALL') ORDER BY created_at DESC LIMIT 50
        ) a;
    END IF;

    RETURN jsonb_build_object(
        'version', 1, 'profile', COALESCE(v_profile, '{}'::jsonb),
        'teacher', COALESCE(v_teacher, '{}'::jsonb), 'classes', v_classes,
        'announcements', v_announcements
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_app_bootstrap_v1(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_app_bootstrap_v1(BOOLEAN) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
