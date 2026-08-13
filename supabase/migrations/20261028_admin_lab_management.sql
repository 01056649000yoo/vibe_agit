BEGIN;

-- 연구소의 별도 서비스 관리자 화면을 없애고 아지트 관리자 모드에서
-- 통합 DB의 연구소 현황과 기존 AI 교사 매핑 활성 상태만 관리한다.
CREATE OR REPLACE FUNCTION public.admin_get_lab_service_summary_v1()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_stats JSONB;
    v_linked_teachers JSONB;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION 'admin access required' USING ERRCODE = '42501';
    END IF;

    SELECT jsonb_build_object(
        'teacher_count', (SELECT COUNT(*) FROM writing_helper.teacher_profiles),
        'class_count', (SELECT COUNT(*) FROM writing_helper.classes),
        'room_count', (SELECT COUNT(*) FROM writing_helper.rooms),
        'active_room_count', (
            SELECT COUNT(*)
            FROM writing_helper.rooms room
            WHERE room.is_active IS TRUE
        ),
        'student_session_count', (SELECT COUNT(*) FROM writing_helper.student_sessions),
        'completed_session_count', (
            SELECT COUNT(*)
            FROM writing_helper.student_sessions session
            WHERE session.status = 'done'
        )
    )
    INTO v_stats;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'agit_user_id', link.agit_user_id,
                'name', COALESCE(
                    NULLIF(lab_profile.name, ''),
                    NULLIF(profile.full_name, ''),
                    NULLIF(profile.email, ''),
                    '이름 없음'
                ),
                'email', COALESCE(profile.email, ''),
                'is_approved', profile.role = 'ADMIN' OR (
                    profile.role = 'TEACHER'
                    AND profile.is_approved IS TRUE
                    AND profile.approval_revoked_at IS NULL
                ),
                'active', link.active,
                'can_use_ai', link.active IS TRUE AND (
                    profile.role = 'ADMIN' OR (
                        profile.role = 'TEACHER'
                        AND profile.is_approved IS TRUE
                        AND profile.approval_revoked_at IS NULL
                    )
                ),
                'class_count', (
                    SELECT COUNT(*)
                    FROM writing_helper.classes class
                    WHERE class.teacher_id = link.agit_user_id
                ),
                'room_count', (
                    SELECT COUNT(*)
                    FROM writing_helper.rooms room
                    WHERE room.teacher_id = link.agit_user_id
                )
            )
            ORDER BY COALESCE(NULLIF(lab_profile.name, ''), NULLIF(profile.full_name, ''), profile.email)
        ),
        '[]'::JSONB
    )
    INTO v_linked_teachers
    FROM public.lab_ai_teacher_links link
    JOIN public.profiles profile ON profile.id = link.agit_user_id
    LEFT JOIN writing_helper.teacher_profiles lab_profile ON lab_profile.user_id = link.agit_user_id;

    RETURN jsonb_build_object(
        'version', 1,
        'source', 'integrated_db',
        'stats', v_stats,
        'linked_teachers', v_linked_teachers
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_lab_teacher_access_v1(
    p_agit_user_id UUID,
    p_active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_link public.lab_ai_teacher_links%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION 'admin access required' USING ERRCODE = '42501';
    END IF;
    IF p_agit_user_id IS NULL OR p_active IS NULL THEN
        RAISE EXCEPTION 'teacher and active state are required' USING ERRCODE = '22023';
    END IF;

    UPDATE public.lab_ai_teacher_links
    SET active = p_active,
        updated_at = NOW()
    WHERE agit_user_id = p_agit_user_id
    RETURNING * INTO v_link;

    IF v_link.agit_user_id IS NULL THEN
        RAISE EXCEPTION 'linked lab teacher not found' USING ERRCODE = 'P0002';
    END IF;

    RETURN jsonb_build_object(
        'version', 1,
        'agit_user_id', v_link.agit_user_id,
        'active', v_link.active
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_lab_service_summary_v1()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_lab_service_summary_v1()
TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_set_lab_teacher_access_v1(UUID, BOOLEAN)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_lab_teacher_access_v1(UUID, BOOLEAN)
TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
