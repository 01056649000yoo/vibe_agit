-- 다시 검수하기는 관리자만 할 수 있고, 그 주의 결과만 지우며, 게시·보류 결정은 건드리지 않는다.

\echo '--- 관리자가 아니면 막힌다 ---'
DO $$
BEGIN
    PERFORM public.admin_restart_spelling_weekly_review_v1();
    RAISE EXCEPTION '관리자 확인 없이 통과했다';
EXCEPTION WHEN insufficient_privilege THEN
    NULL;
END $$;

\echo '--- 회차를 지우면 결과도 함께 지워지고, 게시·보류 결정은 남는다 ---'
DO $$
DECLARE
    v_admin UUID;
    v_week DATE := DATE '2026-01-05';   -- 월요일
    v_key TEXT := repeat('a', 64);
    v_out JSONB;
    v_runs INTEGER;
    v_items INTEGER;
    v_reviews INTEGER;
BEGIN
    SELECT id INTO v_admin FROM public.profiles WHERE role = 'ADMIN' LIMIT 1;
    IF v_admin IS NULL THEN
        RAISE NOTICE 'ADMIN 계정이 없어 본문 확인을 건너뛴다';
        RETURN;
    END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, TRUE);

    INSERT INTO public.spelling_weekly_review_runs(week_start, status, source_since_at, finished_at)
    VALUES (v_week, 'ready', NOW() - INTERVAL '7 days', NOW());
    INSERT INTO public.spelling_weekly_review_items(
        week_start, review_key, source_kinds, primary_source, expression,
        ai_verdict, ai_label, ai_explanation, ai_reason
    ) VALUES (
        v_week, v_key, ARRAY['ai']::TEXT[], 'ai', '검사용표현',
        'recommend', '검사', '검사용 설명', '검사용 이유'
    );
    -- 관리자가 이미 내린 결정. 다시 검수해도 남아야 한다.
    INSERT INTO public.spelling_common_reviews(source_kind, expression, source_correction, decision, decided_by)
    VALUES ('ai', '이미결정한표현', '', 'rejected', v_admin);

    v_out := public.admin_restart_spelling_weekly_review_v1(v_week);
    IF (v_out->>'removed_item_count')::INTEGER <> 1 THEN
        RAISE EXCEPTION '지운 결과 수가 다르다: %', v_out::text;
    END IF;

    SELECT count(*) INTO v_runs FROM public.spelling_weekly_review_runs WHERE week_start = v_week;
    SELECT count(*) INTO v_items FROM public.spelling_weekly_review_items WHERE week_start = v_week;
    SELECT count(*) INTO v_reviews FROM public.spelling_common_reviews WHERE expression = '이미결정한표현';
    IF v_runs <> 0 OR v_items <> 0 THEN
        RAISE EXCEPTION '회차나 결과가 안 지워졌다: 회차 % 결과 %', v_runs, v_items;
    END IF;
    IF v_reviews <> 1 THEN
        RAISE EXCEPTION '관리자 결정이 함께 지워졌다';
    END IF;
END $$;
