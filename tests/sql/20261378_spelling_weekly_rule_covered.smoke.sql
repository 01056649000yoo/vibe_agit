-- 기본 규칙이 잡는 대기 후보 자동 닫기 스모크(롤백된다): 대기만 닫고, 되돌린 것은 남기고, 브라우저는 못 부른다.
BEGIN;
DO $$
DECLARE v_pending UUID; v_locked UUID; v_list JSONB; v_closed INTEGER;
BEGIN
    IF has_function_privilege('authenticated', 'public.close_rule_covered_spelling_items_v1(uuid[])', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.spelling_weekly_pending_expressions_v1()', 'EXECUTE') THEN
        RAISE EXCEPTION '브라우저에 열림';
    END IF;
    INSERT INTO public.spelling_weekly_review_runs(week_start, status, source_since_at) VALUES (DATE '2099-02-01', 'ready', now());
    INSERT INTO public.spelling_weekly_review_items(week_start, review_key, source_kinds, primary_source, expression, ai_verdict, ai_label, ai_explanation, ai_reason)
    VALUES (DATE '2099-02-01', repeat('a', 64), ARRAY['search'], 'search', '스모크하지않고', 'caution', 'x', 'x', 'x') RETURNING id INTO v_pending;
    INSERT INTO public.spelling_weekly_review_items(week_start, review_key, source_kinds, primary_source, expression, ai_verdict, ai_label, ai_explanation, ai_reason, triage_locked)
    VALUES (DATE '2099-02-01', repeat('b', 64), ARRAY['search'], 'search', '스모크가고싶다', 'caution', 'x', 'x', 'x', TRUE) RETURNING id INTO v_locked;
    v_list := public.spelling_weekly_pending_expressions_v1();
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_list) e WHERE e->>'id' = v_pending::TEXT) THEN RAISE EXCEPTION '대기 목록에 없음'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_list) e WHERE e->>'id' = v_locked::TEXT) THEN RAISE EXCEPTION '되돌린 것이 목록에 있음'; END IF;
    v_closed := public.close_rule_covered_spelling_items_v1(ARRAY[v_pending, v_locked]);
    IF v_closed <> 1 THEN RAISE EXCEPTION '닫은 수가 1이 아님: %', v_closed; END IF;
    IF (SELECT auto_reason FROM public.spelling_weekly_review_items WHERE id = v_pending) <> 'base_rule' THEN RAISE EXCEPTION '이유가 base_rule 아님'; END IF;
    IF (SELECT decision FROM public.spelling_weekly_review_items WHERE id = v_locked) <> 'pending' THEN RAISE EXCEPTION '되돌린 것을 닫음'; END IF;
    RAISE NOTICE '규칙 닫기 스모크 통과';
END;
$$;
ROLLBACK;
