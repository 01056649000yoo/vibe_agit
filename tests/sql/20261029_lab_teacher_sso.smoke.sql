-- 이 파일은 바깥 트랜잭션에서 실행되고 마지막에 전부 롤백된다.

SELECT set_config('test.lab_teacher_id', (
    SELECT profile.id::TEXT
    FROM public.profiles profile
    WHERE profile.role = 'TEACHER'
      AND profile.is_approved IS TRUE
      AND profile.approval_revoked_at IS NULL
    ORDER BY profile.created_at
    LIMIT 1
), TRUE);

DO $$
BEGIN
    IF has_function_privilege('anon', 'public.ensure_lab_teacher_profile_v1()', 'EXECUTE') THEN
        RAISE EXCEPTION '교사 연구소 준비 RPC가 anon에 노출되어 있습니다.';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.ensure_lab_teacher_profile_v1()', 'EXECUTE') THEN
        RAISE EXCEPTION '인증 교사가 연구소 준비 RPC를 호출할 수 없습니다.';
    END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('request.jwt.claim.sub'),
    'role', 'authenticated',
    'app_metadata', jsonb_build_object('role', 'ADMIN')
)::TEXT, TRUE);

DO $$
DECLARE
    v_blocked BOOLEAN := FALSE;
BEGIN
    BEGIN
        PERFORM public.ensure_lab_teacher_profile_v1();
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'DB 연결이 없는 위조 관리자 메타데이터로 연구소에 진입했습니다.';
    END IF;
END;
$$;

SELECT set_config('request.jwt.claim.sub', current_setting('test.lab_teacher_id'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.lab_teacher_id'),
    'role', 'authenticated'
)::TEXT, TRUE);

DO $$
DECLARE
    v_result JSONB;
BEGIN
    v_result := public.ensure_lab_teacher_profile_v1();
    IF v_result->>'version' <> '1' OR (v_result->>'allowed')::BOOLEAN IS NOT TRUE THEN
        RAISE EXCEPTION '승인 교사 연구소 준비 응답 계약 오류: %', v_result;
    END IF;
END;
$$;

RESET ROLE;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM writing_helper.teacher_profiles
        WHERE user_id = current_setting('test.lab_teacher_id')::UUID
    ) THEN
        RAISE EXCEPTION '승인 교사의 연구소 프로필을 준비하지 못했습니다.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.lab_ai_teacher_links
        WHERE agit_user_id = current_setting('test.lab_teacher_id')::UUID
    ) THEN
        RAISE EXCEPTION '승인 교사의 연구소 AI 연결을 준비하지 못했습니다.';
    END IF;
END;
$$;

SELECT set_config('request.jwt.claims', jsonb_build_object(
    'role', 'service_role'
)::TEXT, TRUE);

DO $$
DECLARE
    v_result JSONB;
BEGIN
    v_result := public.resolve_lab_ai_teacher_v1(current_setting('test.lab_teacher_id')::UUID);
    IF (v_result->>'allowed')::BOOLEAN IS NOT TRUE
       OR v_result->>'agit_user_id' <> current_setting('test.lab_teacher_id') THEN
        RAISE EXCEPTION '통합 아지트 사용자 ID를 연구소 AI 교사로 해석하지 못했습니다: %', v_result;
    END IF;
END;
$$;
