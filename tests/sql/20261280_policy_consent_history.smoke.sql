-- 소급 기록이 표로 옮겨졌고, 추가 동의가 첫 동의를 덮지 않으며, 표·함수가 닫혀 있는지 본다. 모두 롤백된다.
DO $$
DECLARE
    v_teacher UUID;
    v_result JSONB;
    v_missing INTEGER;
BEGIN
    -- 1) 20261279 가 소급한 568명이 표에 kind='backfill' 로 있어야 한다
    SELECT count(*) INTO v_missing FROM public.profiles p
    WHERE p.role = 'TEACHER'
      AND NOT EXISTS (SELECT 1 FROM public.policy_consents c WHERE c.user_id = p.id AND c.kind = 'backfill');
    IF v_missing > 0 THEN
        RAISE EXCEPTION '소급 기록이 표에 없는 교사가 %명 있습니다.', v_missing;
    END IF;
    IF EXISTS (SELECT 1 FROM public.policy_consents c JOIN public.profiles p ON p.id = c.user_id
               WHERE c.kind = 'backfill' AND c.terms_agreed_at <> p.created_at) THEN
        RAISE EXCEPTION '소급 기록의 동의 시각이 가입일과 다릅니다.';
    END IF;
    -- profiles 의 옛 열은 없어야 한다(두 곳에 두면 어긋난다)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'agreed_policy_version') THEN
        RAISE EXCEPTION 'profiles 의 옛 동의 열이 남아 있습니다.';
    END IF;

    SELECT id INTO v_teacher FROM public.profiles WHERE role = 'TEACHER' LIMIT 1;
    IF v_teacher IS NULL THEN RAISE NOTICE '교사가 없어 건너뜁니다.'; RETURN; END IF;

    -- 2) 교사 세션으로 추가 동의
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_teacher, 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('role', 'authenticated', true);
    PERFORM public.record_policy_consent_v1('2026-09-21', 'reconsent');
    PERFORM public.record_policy_consent_v1('2026-09-21', 'reconsent');   -- 두 번 눌러도 한 줄
    v_result := public.get_my_policy_consent_v1();
    PERFORM set_config('role', 'supabase_admin', true);

    IF NOT EXISTS (SELECT 1 FROM public.policy_consents WHERE user_id = v_teacher AND kind = 'backfill') THEN
        RAISE EXCEPTION '추가 동의가 첫 동의(소급)를 지웠습니다.';
    END IF;
    IF (SELECT count(*) FROM public.policy_consents WHERE user_id = v_teacher AND policy_version = '2026-09-21') <> 1 THEN
        RAISE EXCEPTION '같은 판 동의가 중복으로 쌓였습니다.';
    END IF;
    IF NOT (v_result->'agreed_versions') ? '2026-09-21' THEN
        RAISE EXCEPTION '동의한 판 목록에 새 판이 없습니다: %', v_result;
    END IF;

    -- 3) 클라이언트는 소급 기록을 못 만들고, 판 형식이 틀리면 막힌다
    PERFORM set_config('role', 'authenticated', true);
    BEGIN
        PERFORM public.record_policy_consent_v1('2026-09-21', 'backfill');
        RAISE EXCEPTION '클라이언트가 소급 기록을 만들 수 있습니다.';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
    BEGIN
        PERFORM public.record_policy_consent_v1('아무거나', 'reconsent');
        RAISE EXCEPTION '잘못된 판 이름이 기록됐습니다.';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
    PERFORM set_config('role', 'supabase_admin', true);

    -- 4) 표와 함수가 비로그인·브라우저 역할에 닫혀 있는가
    IF has_table_privilege('authenticated', 'public.policy_consents', 'SELECT') THEN
        RAISE EXCEPTION '동의 이력 표가 브라우저 역할에 직접 공개됐습니다.';
    END IF;
    IF has_function_privilege('anon', 'public.record_policy_consent_v1(TEXT, TEXT)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.get_my_policy_consent_v1()', 'EXECUTE') THEN
        RAISE EXCEPTION '동의 함수가 비로그인에 열려 있습니다.';
    END IF;
END;
$$;
