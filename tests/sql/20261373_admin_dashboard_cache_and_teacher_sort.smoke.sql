-- 관리자 화면 캐시·가입 교사 정렬 스모크 (롤백된다).
-- ① 캐시 읽기는 관리자만, 처음엔 계산해 저장하고 다음엔 저장된 값(cached) ② 미리 계산(cron 함수)이 세 기간을 채움
-- ③ 가입 교사 v2 정렬: 가입 최신순·오래된순 순서가 맞고 이상한 정렬값은 거절 ④ 브라우저·일반 교사 권한
BEGIN;

DO $$
DECLARE
    v_admin UUID; v_teacher UUID; v_res JSONB; v_items JSONB; v_blocked BOOLEAN; i INTEGER;
BEGIN
    IF has_function_privilege('anon', 'public.admin_get_dashboard_cache_v1(integer,integer,boolean)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.admin_refresh_dashboard_cache_v1()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.admin_compute_dashboard_cache_v1(integer,integer)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.admin_get_teacher_accounts_page_v2(text,text,integer,integer,text)', 'EXECUTE')
       OR has_table_privilege('authenticated', 'public.admin_dashboard_cache', 'SELECT') THEN
        RAISE EXCEPTION '캐시·목록 함수 권한이 너무 넓음';
    END IF;
    IF to_regprocedure('public.admin_get_teacher_accounts_page_v1(text,text,integer,integer)') IS NOT NULL THEN
        RAISE EXCEPTION '옛 판 v1 이 남아 있음';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'admin-dashboard-cache' AND schedule = '5 */2 * * *') THEN
        RAISE EXCEPTION '2시간 미리 계산 일정이 없음';
    END IF;

    SELECT id INTO v_admin FROM public.profiles WHERE role = 'ADMIN' LIMIT 1;
    SELECT id INTO v_teacher FROM public.profiles WHERE role = 'TEACHER' LIMIT 1;
    IF v_admin IS NULL OR v_teacher IS NULL THEN RAISE EXCEPTION '스모크용 관리자·교사가 없음'; END IF;

    -- ② 미리 계산(관리자 문맥 없이 — cron 과 같은 상태)
    DELETE FROM public.admin_dashboard_cache;
    PERFORM set_config('request.jwt.claims', '{}', TRUE);
    i := public.admin_refresh_dashboard_cache_v1();
    IF i <> 3 OR (SELECT count(*) FROM public.admin_dashboard_cache WHERE cache_key IN ('usage:90:7', 'usage:90:30', 'usage:90:90')) <> 3 THEN
        RAISE EXCEPTION '미리 계산이 세 기간을 채우지 않음';
    END IF;

    -- ① 관리자 읽기: 저장된 값
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::TEXT, TRUE);
    PERFORM set_config('role', 'authenticated', TRUE);
    v_res := public.admin_get_dashboard_cache_v1(90, 30);
    IF NOT (v_res->>'cached')::BOOLEAN OR v_res->'overview' IS NULL OR jsonb_typeof(v_res->'teachers') <> 'array' OR v_res->>'computed_at' IS NULL THEN
        RAISE EXCEPTION '저장된 값을 돌려주지 않음: %', left(v_res::TEXT, 200);
    END IF;
    -- 없는 조합은 그 자리에서 계산
    v_res := public.admin_get_dashboard_cache_v1(60, 30);
    IF (v_res->>'cached')::BOOLEAN THEN RAISE EXCEPTION '없는 조합을 저장된 값이라고 함'; END IF;
    v_res := public.admin_get_dashboard_cache_v1(90, 7, TRUE);
    IF (v_res->>'cached')::BOOLEAN THEN RAISE EXCEPTION '새로 계산이 저장된 값을 돌려줌'; END IF;

    -- ③ 정렬
    FOR i IN 1..2 LOOP
        v_items := public.admin_get_teacher_accounts_page_v2('APPROVED', NULL, 50, 0, CASE i WHEN 1 THEN 'joined_desc' ELSE 'joined_asc' END)->'items';
        IF EXISTS (
            SELECT 1 FROM (
                SELECT (e->>'created_at')::TIMESTAMPTZ AS c, lag((e->>'created_at')::TIMESTAMPTZ) OVER (ORDER BY o) AS prev
                FROM jsonb_array_elements(v_items) WITH ORDINALITY AS t(e, o)
            ) s
            WHERE CASE i WHEN 1 THEN s.c > s.prev ELSE s.c < s.prev END
        ) THEN
            RAISE EXCEPTION '가입일 정렬(%)이 맞지 않음', i;
        END IF;
    END LOOP;
    IF jsonb_array_length(public.admin_get_teacher_accounts_page_v2('APPROVED', NULL, 10, 0)->'items') > 10 THEN
        RAISE EXCEPTION '처음 값(최근 접속순) 목록이 깨짐';
    END IF;
    v_blocked := FALSE;
    BEGIN
        PERFORM public.admin_get_teacher_accounts_page_v2('APPROVED', NULL, 10, 0, 'name; drop');
    EXCEPTION WHEN invalid_parameter_value THEN v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN RAISE EXCEPTION '이상한 정렬값을 받음'; END IF;

    -- ④ 일반 교사는 못 읽음
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_teacher, 'role', 'authenticated')::TEXT, TRUE);
    v_blocked := FALSE;
    BEGIN PERFORM public.admin_get_dashboard_cache_v1(90, 30); EXCEPTION WHEN insufficient_privilege THEN v_blocked := TRUE; END;
    IF NOT v_blocked THEN RAISE EXCEPTION '일반 교사가 관리자 캐시를 읽음'; END IF;
    v_blocked := FALSE;
    BEGIN PERFORM public.admin_get_teacher_accounts_page_v2('APPROVED', NULL, 10, 0, 'joined_desc'); EXCEPTION WHEN OTHERS THEN v_blocked := TRUE; END;
    IF NOT v_blocked THEN RAISE EXCEPTION '일반 교사가 교사 목록을 읽음'; END IF;
    RESET ROLE;
    RAISE NOTICE '관리자 캐시·정렬 스모크 통과';
END;
$$;

ROLLBACK;
