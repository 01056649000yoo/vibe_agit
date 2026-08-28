-- 쌓인 양 조회는 관리자만 볼 수 있고, 읽기만 하며, 이번 주 회차가 없어도 can_run 이 참·거짓으로 정해져야 한다.
-- (can_run 이 NULL 로 새면 관리자 화면이 버튼을 켤지 끌지 못 정한다 — 2026-08-28 롤백 검증에서 잡은 결함이다.)

\echo '--- 관리자가 아니면 막힌다 ---'
DO $$
BEGIN
    PERFORM public.admin_get_spelling_weekly_intake_v1();
    RAISE EXCEPTION '관리자가 아닌데 통과했다';
EXCEPTION WHEN insufficient_privilege THEN
    NULL;
END $$;

\echo '--- 관리자면 값이 나오고 can_run 이 NULL 이 아니다 ---'
DO $$
DECLARE
    v_admin UUID;
    v_out JSONB;
BEGIN
    SELECT id INTO v_admin FROM public.profiles WHERE role = 'ADMIN' LIMIT 1;
    IF v_admin IS NULL THEN
        RAISE NOTICE 'ADMIN 계정이 없어 본문 확인을 건너뛴다';
        RETURN;
    END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, TRUE);
    v_out := public.admin_get_spelling_weekly_intake_v1();

    IF v_out->'can_run' IS NULL OR jsonb_typeof(v_out->'can_run') <> 'boolean' THEN
        RAISE EXCEPTION 'can_run 이 참·거짓이 아니다: %', v_out->'can_run';
    END IF;
    IF jsonb_typeof(v_out->'ai_finding_count') <> 'number'
       OR jsonb_typeof(v_out->'search_count') <> 'number'
       OR jsonb_typeof(v_out->'teacher_entry_count') <> 'number' THEN
        RAISE EXCEPTION '원자료 수가 숫자가 아니다: %', v_out::text;
    END IF;
    -- start 함수가 월요일만 받으므로 화면에 주는 주간도 월요일이어야 한다.
    IF EXTRACT(ISODOW FROM (v_out->>'week_start')::DATE) <> 1 THEN
        RAISE EXCEPTION 'week_start 가 월요일이 아니다: %', v_out->>'week_start';
    END IF;
END $$;
