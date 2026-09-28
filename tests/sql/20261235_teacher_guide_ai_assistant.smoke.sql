-- 2026-09-28 갱신: 20261270 파일에서 AI 길잡이를 승인 교사 전체에 공개(stage 'public')로 바꿈. 관리자만 단계를 바꿀 수 있다.
DO $$
BEGIN
    IF (SELECT value #>> '{}' FROM public.system_settings WHERE key = 'teacher_guide_ai_stage') IS DISTINCT FROM 'public' THEN
        RAISE EXCEPTION 'teacher guide AI must be public after 20261270';
    END IF;
    IF has_function_privilege('authenticated', 'public.consume_teacher_guide_ai_request_v1(uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.release_teacher_guide_ai_request_v1(uuid,bigint)', 'EXECUTE') THEN
        RAISE EXCEPTION 'browser roles can consume or release AI quota';
    END IF;
    IF NOT has_function_privilege('service_role', 'public.consume_teacher_guide_ai_request_v1(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service role cannot consume AI quota';
    END IF;
    IF has_function_privilege('anon', 'public.get_teacher_guide_ai_availability_v1()', 'EXECUTE') THEN
        RAISE EXCEPTION 'anonymous users must not inspect guide AI availability';
    END IF;
END;
$$;
-- 관리자가 아닌 로그인 사용자는 공개 단계를 되돌릴 수 없다.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('request.jwt.claim.sub'), 'role', 'authenticated'
)::TEXT, TRUE);
DO $$
DECLARE
    v_blocked BOOLEAN := FALSE;
BEGIN
    BEGIN
        PERFORM public.admin_set_teacher_guide_ai_stage_v1('admin_only');
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'non-admin changed the teacher guide AI stage';
    END IF;
END;
$$;
RESET ROLE;
