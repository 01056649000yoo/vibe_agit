-- 쌤링크 계정 연결표 스모크 (롤백된다).
-- ① 승인된 선생님은 연결표를 받고, 쌤링크(service_role)가 한 번만 바꿀 수 있다 ② 학생·로그인 안 한 사용자는 못 받는다
-- ③ 브라우저 역할(anon·authenticated)은 연결표를 바꾸지 못한다 ④ 표에는 원문이 아니라 해시만 남는다

DO $$
DECLARE
    v_teacher UUID;
    v_student UUID;
    v_ticket TEXT;
    v_user UUID;
    v_name TEXT;
    v_blocked BOOLEAN;
BEGIN
    SELECT id INTO v_teacher FROM public.profiles
    WHERE role = 'TEACHER' AND is_approved IS TRUE AND approval_revoked_at IS NULL
    ORDER BY created_at LIMIT 1;
    SELECT auth_id INTO v_student FROM public.students
    WHERE auth_id IS NOT NULL AND deleted_at IS NULL AND is_active IS DISTINCT FROM false LIMIT 1;
    IF v_teacher IS NULL OR v_student IS NULL THEN
        RAISE EXCEPTION '시험할 선생님·학생 계정이 없습니다.';
    END IF;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_teacher, 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('role', 'authenticated', true);
    v_ticket := public.issue_samlink_connect_ticket_v1();
    RESET ROLE;
    IF length(v_ticket) <> 48 THEN
        RAISE EXCEPTION '연결표 길이가 이상합니다: %', length(v_ticket);
    END IF;
    IF EXISTS (SELECT 1 FROM public.samlink_connect_tickets WHERE ticket_hash = v_ticket) THEN
        RAISE EXCEPTION '연결표 원문이 표에 남았습니다.';
    END IF;

    -- 브라우저 역할은 바꾸지 못한다.
    FOREACH v_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        v_blocked := false;
        BEGIN
            PERFORM set_config('role', v_name, true);
            PERFORM public.redeem_samlink_connect_ticket_v1(v_ticket);
        EXCEPTION WHEN insufficient_privilege THEN
            v_blocked := true;
        END;
        RESET ROLE;
        IF NOT v_blocked THEN
            RAISE EXCEPTION '% 역할이 연결표를 바꿨습니다.', v_name;
        END IF;
    END LOOP;

    PERFORM set_config('role', 'service_role', true);
    SELECT r.user_id, r.display_name INTO v_user, v_name FROM public.redeem_samlink_connect_ticket_v1(v_ticket) r;
    IF v_user IS DISTINCT FROM v_teacher OR v_name IS NULL THEN
        RAISE EXCEPTION '연결표가 선생님으로 바뀌지 않았습니다.';
    END IF;
    SELECT r.user_id INTO v_user FROM public.redeem_samlink_connect_ticket_v1(v_ticket) r;
    RESET ROLE;
    IF v_user IS NOT NULL THEN
        RAISE EXCEPTION '연결표를 두 번 쓸 수 있습니다.';
    END IF;

    -- 학생·로그인 안 한 사용자는 못 받는다.
    FOREACH v_name IN ARRAY ARRAY['student', 'anon'] LOOP
        v_blocked := false;
        BEGIN
            IF v_name = 'student' THEN
                PERFORM set_config('request.jwt.claims', json_build_object('sub', v_student, 'role', 'authenticated')::TEXT, true);
                PERFORM set_config('role', 'authenticated', true);
            ELSE
                PERFORM set_config('request.jwt.claims', '{}', true);
                PERFORM set_config('role', 'anon', true);
            END IF;
            PERFORM public.issue_samlink_connect_ticket_v1();
        EXCEPTION WHEN insufficient_privilege THEN
            v_blocked := true;
        END;
        RESET ROLE;
        IF NOT v_blocked THEN
            RAISE EXCEPTION '% 가 연결표를 받았습니다.', v_name;
        END IF;
    END LOOP;

    RAISE NOTICE '쌤링크 연결표 스모크 통과';
END;
$$;
