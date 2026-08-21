-- 부트스트랩이 공지의 팝업 표시를 함께 주는지 본다.
DO $$
DECLARE
    v_source TEXT;
BEGIN
    SELECT prosrc INTO v_source FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_teacher_app_bootstrap_v1';

    IF v_source IS NULL THEN
        RAISE EXCEPTION '교사 부트스트랩 함수가 없습니다.';
    END IF;
    IF v_source NOT LIKE '%target_role, is_popup FROM public.announcements%' THEN
        RAISE EXCEPTION '부트스트랩이 공지의 is_popup 을 주지 않습니다. 팝업 설정이 다시 죽습니다.';
    END IF;

    -- 권한 경계는 그대로여야 한다.
    IF has_function_privilege('anon', 'public.get_teacher_app_bootstrap_v1(boolean)', 'EXECUTE') THEN
        RAISE EXCEPTION '익명 사용자에게 교사 부트스트랩이 열려 있습니다.';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.get_teacher_app_bootstrap_v1(boolean)', 'EXECUTE') THEN
        RAISE EXCEPTION '인증 교사가 부트스트랩을 실행할 수 없습니다.';
    END IF;
END;
$$;
