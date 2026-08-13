-- 이 파일은 바깥 트랜잭션에서 실행되고 마지막에 전부 롤백된다.

DO $$
BEGIN
    IF NOT has_function_privilege(
        'authenticated',
        'public.get_my_lab_results_v1(integer,timestamp with time zone,uuid,text[])',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION '학생의 본인 연구소 결과 조회 권한이 없습니다.';
    END IF;

    IF has_function_privilege(
        'anon',
        'public.get_my_lab_results_v1(integer,timestamp with time zone,uuid,text[])',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION '비로그인 사용자가 연구소 결과를 조회할 수 있습니다.';
    END IF;

    IF pg_get_functiondef(
        'public.get_my_lab_results_v1(integer,timestamp with time zone,uuid,text[])'::regprocedure
    ) ~ 'auth\\.jwt|app_metadata' THEN
        RAISE EXCEPTION '연구소 결과 조회가 검증되지 않은 JWT 메타데이터를 신뢰합니다.';
    END IF;
END;
$$;
