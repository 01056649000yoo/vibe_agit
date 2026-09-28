-- 2026-09-28 갱신: 20261280_policy_consent_history.sql 이 profiles 의 동의 열 세 개를 policy_consents 이력 표로 옮기고
-- record_policy_consent_v1 을 (text,text) 로 바꿨다. 약관 동의 기록은 20261280 스모크가 본다.
-- 여기서는 20261279 가 남긴 것 — 학급 동의서 확인(confirm_class_student_consent_v1)과 옛 열이 되살아나지 않았는지 — 만 본다.
DO $$
DECLARE
    v_teacher UUID;
    v_other UUID;
    v_class UUID;
    v_other_class UUID;
    v_result JSONB;
BEGIN
    -- 1) 동의 기록은 한 곳(이력 표)에만 있다 — profiles 에 옛 열이 되살아나면 두 곳이 어긋난다
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles'
               AND column_name IN ('terms_agreed_at', 'privacy_agreed_at', 'agreed_policy_version')) THEN
        RAISE EXCEPTION 'profiles 에 옛 동의 열이 남아 있습니다 — 동의 기록이 두 곳으로 갈립니다.';
    END IF;
    IF to_regclass('public.policy_consents') IS NULL THEN
        RAISE EXCEPTION '동의 이력 표가 없습니다.';
    END IF;

    -- 2) 학급 둘을 서로 다른 교사로 찾는다(교사가 없으면 건너뛴다)
    -- 아직 확인 전인 학급만 고른다. 이미 확인된 학급을 고르면 "남의 학급이 확인됐다" 로 잘못 실패한다(운영 데이터가 늘면서 생긴 흔들림).
    SELECT c.id, c.teacher_id INTO v_class, v_teacher
    FROM public.classes c WHERE c.deleted_at IS NULL AND c.student_consent_confirmed_at IS NULL ORDER BY c.id LIMIT 1;
    SELECT c.id, c.teacher_id INTO v_other_class, v_other
    FROM public.classes c WHERE c.deleted_at IS NULL AND c.student_consent_confirmed_at IS NULL
      AND c.teacher_id <> v_teacher ORDER BY c.id LIMIT 1;
    IF v_class IS NULL OR v_other_class IS NULL THEN
        RAISE NOTICE '학급이 둘 미만이라 RPC 검사는 건너뜁니다.'; RETURN;
    END IF;

    -- 3) 교사 세션을 흉내 내어 부른다
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_teacher, 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('role', 'authenticated', true);

    -- 약관 동의: 판 형식이 틀리면 막는다
    BEGIN
        PERFORM public.record_policy_consent_v1('아무거나');
        RAISE EXCEPTION '잘못된 판 이름이 기록됐습니다.';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
    v_result := public.record_policy_consent_v1('2026-09-14');
    IF v_result->>'agreed_policy_version' <> '2026-09-14' THEN
        RAISE EXCEPTION '약관 동의 판이 기록되지 않았습니다.';
    END IF;

    -- 학급 동의서 확인: 내 학급은 기록되고 남의 학급은 건너뛴다
    v_result := public.confirm_class_student_consent_v1(ARRAY[v_class, v_other_class]);
    IF (v_result->>'confirmed')::INTEGER <> 1 THEN
        RAISE EXCEPTION '남의 학급까지 확인됐거나 내 학급이 확인되지 않았습니다: %', v_result;
    END IF;

    PERFORM set_config('role', 'supabase_admin', true);
    IF (SELECT student_consent_confirmed_at FROM public.classes WHERE id = v_class) IS NULL THEN
        RAISE EXCEPTION '내 학급의 확인 시각이 비어 있습니다.';
    END IF;
    IF (SELECT student_consent_confirmed_at FROM public.classes WHERE id = v_other_class) IS NOT NULL THEN
        RAISE EXCEPTION '남의 학급이 확인됐습니다 — 권한 검사가 없습니다.';
    END IF;

    -- 4) 비로그인에는 닫혀 있어야 한다
    IF has_function_privilege('anon', 'public.record_policy_consent_v1(TEXT,TEXT)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.confirm_class_student_consent_v1(UUID[])', 'EXECUTE') THEN
        RAISE EXCEPTION '동의 기록 함수가 비로그인에 열려 있습니다.';
    END IF;
END;
$$;
