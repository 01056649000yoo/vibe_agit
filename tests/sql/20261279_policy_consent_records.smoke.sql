-- 동의 기록이 서버 시계로 남고, 남의 학급은 확인할 수 없는지 본다. 모두 롤백된다.
DO $$
DECLARE
    v_teacher UUID;
    v_other UUID;
    v_class UUID;
    v_other_class UUID;
    v_result JSONB;
    v_backfilled INTEGER;
BEGIN
    -- 1) 기존 교사가 가입일로 소급 기록됐는가
    SELECT count(*) INTO v_backfilled FROM public.profiles
    WHERE role = 'TEACHER' AND terms_agreed_at IS NULL;
    IF v_backfilled > 0 THEN
        RAISE EXCEPTION '동의 기록이 비어 있는 교사가 %명 있습니다 — 소급 기록이 빠졌습니다.', v_backfilled;
    END IF;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE role = 'TEACHER' AND agreed_policy_version = 'backfill'
               AND terms_agreed_at <> created_at) THEN
        RAISE EXCEPTION '소급 기록의 동의 시각이 가입일과 다릅니다.';
    END IF;

    -- 2) 학급 둘을 서로 다른 교사로 찾는다(교사가 없으면 건너뛴다)
    SELECT c.id, c.teacher_id INTO v_class, v_teacher
    FROM public.classes c WHERE c.deleted_at IS NULL LIMIT 1;
    SELECT c.id, c.teacher_id INTO v_other_class, v_other
    FROM public.classes c WHERE c.deleted_at IS NULL AND c.teacher_id <> v_teacher LIMIT 1;
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
    IF has_function_privilege('anon', 'public.record_policy_consent_v1(TEXT)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.confirm_class_student_consent_v1(UUID[])', 'EXECUTE') THEN
        RAISE EXCEPTION '동의 기록 함수가 비로그인에 열려 있습니다.';
    END IF;
END;
$$;
