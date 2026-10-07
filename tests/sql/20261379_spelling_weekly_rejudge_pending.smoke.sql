-- 대기 후보 다시 판정해 닫기 스모크(롤백된다): 대기만 닫고 이유를 남기며, 되돌린 것·빈 이유는 그대로, 브라우저는 못 부른다.
BEGIN;
DO $$
DECLARE v_a UUID; v_b UUID; v_n INTEGER; v_list JSONB;
BEGIN
    IF has_function_privilege('authenticated', 'public.close_rejudged_spelling_items_v1(jsonb)', 'EXECUTE') THEN RAISE EXCEPTION '브라우저에 열림'; END IF;
    INSERT INTO public.spelling_weekly_review_runs(week_start, status, source_since_at) VALUES (DATE '2099-03-01', 'ready', now());
    INSERT INTO public.spelling_weekly_review_items(week_start, review_key, source_kinds, primary_source, expression, ai_verdict, ai_label, ai_explanation, ai_reason)
    VALUES (DATE '2099-03-01', repeat('c', 64), ARRAY['search'], 'search', '스모크아영하세요', 'caution', 'x', 'x', 'x') RETURNING id INTO v_a;
    INSERT INTO public.spelling_weekly_review_items(week_start, review_key, source_kinds, primary_source, expression, ai_verdict, ai_label, ai_explanation, ai_reason, triage_locked)
    VALUES (DATE '2099-03-01', repeat('d', 64), ARRAY['search'], 'search', '스모크참아주시고', 'caution', 'x', 'x', 'x', TRUE) RETURNING id INTO v_b;
    v_list := public.spelling_weekly_pending_expressions_v1();
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_list) e WHERE e->>'id' = v_a::TEXT AND e ? 'source_kinds' AND e ? 'class_count') THEN RAISE EXCEPTION '대기 목록 칸이 모자람'; END IF;
    v_n := public.close_rejudged_spelling_items_v1(jsonb_build_array(
        jsonb_build_object('id', v_a, 'reason', '알 수 없는 오타'),
        jsonb_build_object('id', v_b, 'reason', '제47항 허용')));
    IF v_n <> 1 THEN RAISE EXCEPTION '닫은 수가 1이 아님: %', v_n; END IF;
    IF (SELECT auto_reason || '/' || ai_verdict || '/' || ai_reason FROM public.spelling_weekly_review_items WHERE id = v_a) <> 'ai_reject/reject/알 수 없는 오타' THEN RAISE EXCEPTION '닫은 기록이 이상함'; END IF;
    RAISE NOTICE '다시 판정 스모크 통과';
END;
$$;
ROLLBACK;
