BEGIN;

DO $$
DECLARE
    v_admin UUID;
    v_teacher UUID;
    v_result JSONB;
    v_email TEXT;
BEGIN
    IF has_function_privilege(
        'anon',
        'public.admin_get_teacher_accounts_page_v1(text,text,integer,integer)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION '교사 계정 페이지 RPC가 anon에 공개됨';
    END IF;

    IF NOT has_function_privilege(
        'authenticated',
        'public.admin_get_teacher_accounts_page_v1(text,text,integer,integer)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'authenticated 실행 권한이 없음';
    END IF;

    SELECT p.id INTO v_admin
    FROM public.profiles p
    WHERE p.role = 'ADMIN'
    LIMIT 1;

    SELECT p.id INTO v_teacher
    FROM public.profiles p
    WHERE p.role = 'TEACHER'
    LIMIT 1;

    IF v_admin IS NULL OR v_teacher IS NULL THEN
        RAISE EXCEPTION '스모크용 관리자 또는 교사 계정이 없음';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_admin::TEXT, TRUE);
    PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('sub', v_admin, 'role', 'authenticated')::TEXT,
        TRUE
    );

    v_result := public.admin_get_teacher_accounts_page_v1('APPROVED', NULL, 10, 0);
    IF jsonb_array_length(v_result->'items') > 10 THEN
        RAISE EXCEPTION '페이지 상한이 지켜지지 않음';
    END IF;
    IF NOT (v_result ? 'total_count' AND v_result ? 'counts') THEN
        RAISE EXCEPTION '전체 건수 또는 상태 건수가 없음';
    END IF;

    SELECT p.email INTO v_email FROM public.profiles p WHERE p.id = v_teacher;
    v_result := public.admin_get_teacher_accounts_page_v1(
        CASE
            WHEN (SELECT COALESCE(p.is_approved, FALSE) FROM public.profiles p WHERE p.id = v_teacher)
                THEN 'APPROVED'
            WHEN (SELECT p.approval_revoked_at FROM public.profiles p WHERE p.id = v_teacher) IS NULL
                THEN 'PENDING_NEW'
            ELSE 'PENDING_REVOKED'
        END,
        v_email,
        10,
        0
    );
    IF NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_result->'items') item
        WHERE item->>'id' = v_teacher::TEXT
    ) THEN
        RAISE EXCEPTION '이메일 서버 검색이 대상 교사를 반환하지 않음';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_teacher::TEXT, TRUE);
    PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('sub', v_teacher, 'role', 'authenticated')::TEXT,
        TRUE
    );

    BEGIN
        PERFORM public.admin_get_teacher_accounts_page_v1('APPROVED', NULL, 10, 0);
        RAISE EXCEPTION '일반 교사가 관리자 교사 목록을 읽음';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM = '일반 교사가 관리자 교사 목록을 읽음' THEN
                RAISE;
            END IF;
    END;
END;
$$;

ROLLBACK;
