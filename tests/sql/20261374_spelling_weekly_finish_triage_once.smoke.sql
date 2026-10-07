-- 주간 검수 마무리 200개가 8초 제한 안에 끝나고, 자동 정리가 끝에 한 번 제대로 도는지 (롤백된다).
BEGIN;
SET LOCAL statement_timeout = '8s';

DO $$
DECLARE
    v_week DATE := DATE '2099-01-05';
    v_items JSONB;
    v_res JSONB;
    v_started TIMESTAMPTZ := clock_timestamp();
    v_ms NUMERIC;
BEGIN
    INSERT INTO public.spelling_weekly_review_runs(week_start, status, source_since_at) VALUES (v_week, 'running', NOW());
    -- 200개: 1~3번은 AI 가 아니라고 본 것(reject), 4·5번은 같은 표현(중복) — 정리가 돌면 닫혀야 한다
    SELECT jsonb_agg(jsonb_build_object(
        'review_key', encode(sha256(convert_to('smoke-' || g, 'UTF8')), 'hex'),
        'source_kinds', jsonb_build_array('search'), 'primary_source', 'search',
        'expression', CASE WHEN g IN (4, 5) THEN '스모크중복표현' ELSE '스모크표현' || g END,
        'source_correction', '', 'verdict', CASE WHEN g <= 3 THEN 'reject' ELSE 'caution' END,
        'correct_expression', '', 'label', '스모크', 'explanation', '스모크 설명', 'reason', '스모크 이유',
        'examples', '[]'::JSONB, 'similar_matches', '[]'::JSONB, 'hit_count', 1, 'class_count', 1, 'cache_hit', FALSE
    )) INTO v_items FROM generate_series(1, 200) g;

    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', TRUE);
    v_res := public.finish_spelling_weekly_review_v1(v_week, v_items, '{"model":"smoke","review_version":"smoke"}');
    v_ms := EXTRACT(EPOCH FROM clock_timestamp() - v_started) * 1000;

    IF v_res->>'status' <> 'ready' OR (v_res->>'items')::INT <> 200 THEN RAISE EXCEPTION '마무리 결과가 이상함: %', v_res; END IF;
    IF (SELECT count(*) FROM public.spelling_weekly_review_items WHERE week_start = v_week AND auto_reason = 'ai_reject') <> 3 THEN
        RAISE EXCEPTION '끝에 한 번 정리가 돌지 않음(ai_reject)';
    END IF;
    IF (SELECT count(*) FROM public.spelling_weekly_review_items WHERE week_start = v_week AND auto_reason = 'duplicate') <> 1 THEN
        RAISE EXCEPTION '끝에 한 번 정리가 돌지 않음(duplicate)';
    END IF;
    IF current_setting('app.spelling_triage_deferred', TRUE) = 'on' THEN RAISE EXCEPTION '정리 쉬기 표시가 남음'; END IF;
    RAISE NOTICE '200개 마무리 % ms', round(v_ms);
    IF v_ms > 4000 THEN RAISE EXCEPTION '마무리가 너무 느림: % ms', round(v_ms); END IF;
END;
$$;

ROLLBACK;
