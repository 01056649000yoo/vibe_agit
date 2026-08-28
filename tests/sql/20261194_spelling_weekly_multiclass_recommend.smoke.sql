-- 반영 권장이 학급 2개 이상에서만 나오는지, 문장형이 후보에서 빠지는지 실제 DB에서 확인한다.
BEGIN;

DO $$
DECLARE
    v_week DATE := date_trunc('week', CURRENT_DATE)::DATE;
    v_verdict TEXT;
    v_intake JSONB;
BEGIN
    -- 앞선 회차 기록이 있으면 이 주에 새로 넣을 수 없으므로 검증용으로 비운다(트랜잭션 끝에 되돌린다).
    DELETE FROM public.spelling_weekly_review_items WHERE week_start = v_week;
    DELETE FROM public.spelling_weekly_review_runs WHERE week_start = v_week;

    v_intake := public.start_spelling_weekly_review_v1(v_week, 'smoke-catalog', FALSE);

    -- ① 한 학급에서만 나온 표현은 AI 가 recommend 로 줘도 서버가 caution 으로 내린다.
    PERFORM public.finish_spelling_weekly_review_v1(
        v_week,
        jsonb_build_array(jsonb_build_object(
            'review_key', encode(sha256('smoke-one-class'::bytea), 'hex'), 'expression', '한학급표현',
            'source_correction', '한 학급 표현', 'primary_source', 'search',
            'source_kinds', jsonb_build_array('search'),
            'hit_count', 9, 'class_count', 1,
            'verdict', 'recommend', 'correct_expression', '한 학급 표현',
            'label', '띄어쓰기', 'explanation', '띄어 써요.',
            'examples', jsonb_build_array('한 학급 표현이에요.'),
            'reason', '검증용', 'cache_hit', FALSE, 'similar_matches', jsonb_build_array()
        )),
        jsonb_build_object('collected_count', 1, 'model', 'smoke', 'review_version', 'smoke-v1')
    );
    SELECT ai_verdict INTO v_verdict
    FROM public.spelling_weekly_review_items
    WHERE week_start = v_week AND expression = '한학급표현';
    IF v_verdict IS DISTINCT FROM 'caution' THEN
        RAISE EXCEPTION '한 학급 표현이 반영 권장으로 남았습니다: %', v_verdict;
    END IF;

    -- ② 두 학급 이상이면 반영 권장이 그대로 유지된다.
    DELETE FROM public.spelling_weekly_review_items WHERE week_start = v_week;
    UPDATE public.spelling_weekly_review_runs SET status = 'running' WHERE week_start = v_week;
    PERFORM public.finish_spelling_weekly_review_v1(
        v_week,
        jsonb_build_array(jsonb_build_object(
            'review_key', encode(sha256('smoke-two-class'::bytea), 'hex'), 'expression', '두학급표현',
            'source_correction', '두 학급 표현', 'primary_source', 'search',
            'source_kinds', jsonb_build_array('search'),
            'hit_count', 9, 'class_count', 2,
            'verdict', 'recommend', 'correct_expression', '두 학급 표현',
            'label', '띄어쓰기', 'explanation', '띄어 써요.',
            'examples', jsonb_build_array('두 학급 표현이에요.'),
            'reason', '검증용', 'cache_hit', FALSE, 'similar_matches', jsonb_build_array()
        )),
        jsonb_build_object('collected_count', 1, 'model', 'smoke', 'review_version', 'smoke-v1')
    );
    SELECT ai_verdict INTO v_verdict
    FROM public.spelling_weekly_review_items
    WHERE week_start = v_week AND expression = '두학급표현';
    IF v_verdict IS DISTINCT FROM 'recommend' THEN
        RAISE EXCEPTION '두 학급 표현이 반영 권장으로 남지 않았습니다: %', v_verdict;
    END IF;

    -- ③ 문장형은 AI 발견 원장에서 후보로 올라오지 않는다.
    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_intake->'sources'->'ai_findings') item
        WHERE item->>'expression' ~ '[.!?]$'
           OR item->>'expression' LIKE '% % %'
           OR char_length(item->>'expression') > 15
    ) THEN
        RAISE EXCEPTION 'AI 발견 후보에 문장형이 남아 있습니다.';
    END IF;
END $$;

ROLLBACK;
