BEGIN;

-- 아지트와 /lab이 같은 인증 세션을 쓰기 시작할 때, 연구소 권한은 JWT 메타데이터가
-- 아니라 운영 DB의 실제 교사 연결·승인 상태로 판정한다. 승인된 교사는 첫 진입 때
-- 연구소 프로필과 AI 연결 행을 멱등 생성하며 기존 두 교사의 이름·자료는 덮어쓰지 않는다.
CREATE OR REPLACE FUNCTION public.ensure_lab_teacher_profile_v1()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_role TEXT;
    v_name TEXT;
    v_ai_enabled BOOLEAN := FALSE;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
    END IF;

    v_role := public.auth_user_role();
    IF v_role NOT IN ('TEACHER', 'ADMIN') THEN
        RAISE EXCEPTION 'approved teacher required' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(
        NULLIF(teacher.name, ''),
        NULLIF(profile.full_name, ''),
        NULLIF(profile.email, ''),
        '선생님'
    )
    INTO v_name
    FROM public.profiles profile
    LEFT JOIN public.teachers teacher ON teacher.id = profile.id
    WHERE profile.id = v_user_id;

    INSERT INTO writing_helper.teacher_profiles(user_id, name)
    VALUES (v_user_id, v_name)
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO public.lab_ai_teacher_links(lab_user_id, agit_user_id)
    VALUES (v_user_id, v_user_id)
    ON CONFLICT DO NOTHING;

    SELECT link.active
    INTO v_ai_enabled
    FROM public.lab_ai_teacher_links link
    WHERE link.agit_user_id = v_user_id;

    RETURN jsonb_build_object(
        'version', 1,
        'allowed', TRUE,
        'name', v_name,
        'ai_enabled', COALESCE(v_ai_enabled, FALSE)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_lab_teacher_profile_v1()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_lab_teacher_profile_v1()
TO authenticated, service_role;

-- 구 helper 도메인은 예전 연구소 auth ID로, 통합 /lab은 아지트 auth ID로 호출한다.
-- 컷오버 검증 동안 두 경로가 모두 같은 승인 교사로 해석되게 한다.
CREATE OR REPLACE FUNCTION public.resolve_lab_ai_teacher_v1(p_lab_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_link public.lab_ai_teacher_links%ROWTYPE;
    v_profile public.profiles%ROWTYPE;
    v_allowed BOOLEAN := FALSE;
BEGIN
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
    END IF;
    IF p_lab_user_id IS NULL THEN
        RAISE EXCEPTION 'lab user id required' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_link
    FROM public.lab_ai_teacher_links
    WHERE (lab_user_id = p_lab_user_id OR agit_user_id = p_lab_user_id)
      AND active IS TRUE
    ORDER BY CASE WHEN agit_user_id = p_lab_user_id THEN 0 ELSE 1 END
    LIMIT 1;

    IF v_link.lab_user_id IS NULL THEN
        RETURN jsonb_build_object('allowed', FALSE);
    END IF;

    SELECT * INTO v_profile
    FROM public.profiles
    WHERE id = v_link.agit_user_id;

    v_allowed := v_profile.role = 'ADMIN'
        OR (
            v_profile.role = 'TEACHER'
            AND v_profile.is_approved IS TRUE
            AND v_profile.approval_revoked_at IS NULL
        );

    IF v_allowed IS NOT TRUE THEN
        RETURN jsonb_build_object('allowed', FALSE);
    END IF;

    RETURN jsonb_build_object(
        'allowed', TRUE,
        'agit_user_id', v_link.agit_user_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_lab_ai_teacher_v1(UUID)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_lab_ai_teacher_v1(UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
