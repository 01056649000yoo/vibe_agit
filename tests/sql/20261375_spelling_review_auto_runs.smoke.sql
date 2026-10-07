-- 맞춤법 AI 검수 자동화 스모크 (롤백된다).
-- ① 화면 intake 가 예전과 같은 칸을 돌려주고 회차 날짜는 서울 오늘 ② 월요일이 아닌 날도 회차가 열림
-- ③ 자동 상태 함수는 서버 전용, 숫자는 화면과 같은 기준 ④ 어제 끝난 회차 뒤 오늘 회차는 그 뒤 자료만 본다
BEGIN;

DO $$
DECLARE
    v_admin UUID; v_res JSONB; v_keys TEXT; v_status JSONB; v_blocked BOOLEAN;
    v_today DATE := (now() AT TIME ZONE 'Asia/Seoul')::date;
BEGIN
    SELECT id INTO v_admin FROM public.profiles WHERE role = 'ADMIN' LIMIT 1;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::TEXT, TRUE);
    v_res := public.admin_get_spelling_weekly_intake_v1();
    SELECT string_agg(k, ',' ORDER BY k) INTO v_keys FROM jsonb_object_keys(v_res) k;
    IF v_keys <> 'ai_finding_count,can_run,current_done_count,current_finished_at,current_started_at,current_status,current_total_count,is_resuming,priority_ai_finding_count,reused_count,search_count,source_since_at,teacher_entry_count,week_start' THEN
        RAISE EXCEPTION '화면 intake 칸이 달라짐: %', v_keys;
    END IF;
    IF (v_res->>'week_start')::DATE <> v_today THEN RAISE EXCEPTION '회차 날짜가 서울 오늘이 아님: %', v_res->>'week_start'; END IF;

    -- ③ 브라우저(관리자라도)는 자동 상태 함수를 못 부른다
    v_blocked := FALSE;
    BEGIN
        SET LOCAL ROLE authenticated;
        PERFORM public.spelling_review_auto_status_v1();
    EXCEPTION WHEN insufficient_privilege THEN v_blocked := TRUE;
    END;
    RESET ROLE;
    IF NOT v_blocked THEN RAISE EXCEPTION '브라우저가 자동 상태 함수를 부름'; END IF;
    IF has_function_privilege('authenticated', 'public.spelling_review_new_source_counts_v1(timestamptz)', 'EXECUTE') THEN
        RAISE EXCEPTION '숫자 함수가 브라우저에 열림';
    END IF;

    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', TRUE);
    v_status := public.spelling_review_auto_status_v1();
    IF (v_status->>'new_count')::INT <> COALESCE((v_res->>'ai_finding_count')::INT, 0) + COALESCE((v_res->>'search_count')::INT, 0) + COALESCE((v_res->>'teacher_entry_count')::INT, 0) THEN
        RAISE EXCEPTION '자동 검수 숫자가 화면과 다름: % vs %', v_status, v_res;
    END IF;
    IF NOT (v_status ? 'priority_pending' AND v_status ? 'later_pending' AND v_status ? 'runs_last_7_days') THEN
        RAISE EXCEPTION '자동 상태 칸이 빠짐: %', v_status;
    END IF;

    -- ② ④ 어제 끝난 회차를 하나 두고 오늘(요일 무관) 회차를 연다 → 수집 기준이 어제 끝난 시각
    DELETE FROM public.spelling_weekly_review_runs WHERE week_start >= v_today - 1;
    INSERT INTO public.spelling_weekly_review_runs(week_start, status, source_since_at, started_at, finished_at)
    VALUES (v_today - 1, 'ready', now() - INTERVAL '2 days', now() - INTERVAL '1 hour', now() - INTERVAL '50 minutes');
    v_res := public.start_spelling_weekly_review_v1(v_today, 'smoke', TRUE);
    IF NOT (v_res->>'should_run')::BOOLEAN THEN RAISE EXCEPTION '오늘 회차가 열리지 않음: %', v_res->>'reason'; END IF;
    IF abs(EXTRACT(EPOCH FROM ((v_res->>'source_since_at')::TIMESTAMPTZ - (now() - INTERVAL '50 minutes')))) > 1 THEN
        RAISE EXCEPTION '수집 기준이 어제 회차 끝난 시각이 아님: %', v_res->>'source_since_at';
    END IF;
    -- 내일 날짜는 거절
    v_blocked := FALSE;
    BEGIN PERFORM public.start_spelling_weekly_review_v1(v_today + 1, 'smoke', TRUE);
    EXCEPTION WHEN invalid_parameter_value THEN v_blocked := TRUE; END;
    IF NOT v_blocked THEN RAISE EXCEPTION '내일 회차를 받음'; END IF;
    RAISE NOTICE '자동 검수 스모크 통과: %', v_status;
END;
$$;

ROLLBACK;
