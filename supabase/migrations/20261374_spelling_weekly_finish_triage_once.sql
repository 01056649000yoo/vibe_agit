-- 주간 맞춤법 AI 검수 마무리가 8초 제한에 걸려 실패(2026-10-07, 2026-10-05 주 200개).
-- [원인] 20261362 의 자동 정리 트리거는 `문장마다` 한 번인데, 마무리 함수가 결과를 **한 줄씩 INSERT** 해
-- 200줄이면 정리(약 0.1초)가 200번 돌았다(약 19초). 마무리 동안은 트리거를 쉬게 하고 끝에 한 번만 정리한다.
-- 다른 곳(관리자가 직접 넣는 경우)의 트리거 동작은 그대로다.

CREATE OR REPLACE FUNCTION public.spelling_weekly_auto_triage_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- 정리 자체가 이 표를 고치므로 되부름을 막는다.
    IF pg_trigger_depth() > 1 THEN
        RETURN NULL;
    END IF;
    -- 주간 검수 마무리(finish_spelling_weekly_review_v1)는 다 넣은 뒤 한 번만 정리한다.
    IF current_setting('app.spelling_triage_deferred', TRUE) = 'on' THEN
        RETURN NULL;
    END IF;
    PERFORM public.spelling_weekly_auto_triage_v1();
    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finish_spelling_weekly_review_v1(p_week_start date, p_items jsonb, p_summary jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_verdict TEXT;
    v_item JSONB;
    v_sources TEXT[];
    v_examples JSONB;
    v_similar JSONB;
    v_count INTEGER;
    v_model TEXT := btrim(COALESCE(p_summary->>'model', ''));
    v_review_version TEXT := btrim(COALESCE(p_summary->>'review_version', ''));
BEGIN
    IF session_user <> 'supabase_admin' AND COALESCE(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'server role required' USING ERRCODE = '42501';
    END IF;
    IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) > 200
       OR char_length(v_model) NOT BETWEEN 1 AND 80
       OR char_length(v_review_version) NOT BETWEEN 1 AND 40 THEN
        RAISE EXCEPTION '주간 검수 결과 범위를 확인해 주세요.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.spelling_weekly_review_runs run
        WHERE run.week_start = p_week_start AND run.status = 'running'
    ) THEN
        RAISE EXCEPTION '실행 중인 주간 검수를 찾지 못했습니다.' USING ERRCODE = '22023';
    END IF;

    DELETE FROM public.spelling_weekly_review_items item WHERE item.week_start = p_week_start;

    -- 자동 정리는 줄마다가 아니라 끝에 한 번(아래). 줄마다 돌면 200줄 × 0.1초로 8초 제한을 넘는다(2026-10-07).
    PERFORM set_config('app.spelling_triage_deferred', 'on', TRUE);

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
        v_sources := ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_item->'source_kinds', '[]'::JSONB)));
        v_examples := COALESCE(v_item->'examples', '[]'::JSONB);
        v_similar := COALESCE(v_item->'similar_matches', '[]'::JSONB);

        IF COALESCE(v_item->>'review_key', '') !~ '^[a-f0-9]{64}$'
           OR cardinality(v_sources) NOT BETWEEN 1 AND 3
           OR NOT (v_sources <@ ARRAY['ai', 'search', 'teacher']::TEXT[])
           OR COALESCE(v_item->>'primary_source', '') NOT IN ('ai', 'search', 'manual')
           OR char_length(btrim(COALESCE(v_item->>'expression', ''))) NOT BETWEEN 1 AND 40
           OR char_length(btrim(COALESCE(v_item->>'source_correction', ''))) > 40
           OR COALESCE(v_item->>'verdict', '') NOT IN ('recommend', 'caution', 'reject')
           OR char_length(btrim(COALESCE(v_item->>'correct_expression', ''))) > 40
           OR char_length(btrim(COALESCE(v_item->>'label', ''))) NOT BETWEEN 1 AND 40
           OR char_length(btrim(COALESCE(v_item->>'explanation', ''))) NOT BETWEEN 1 AND 600
           OR char_length(btrim(COALESCE(v_item->>'reason', ''))) NOT BETWEEN 1 AND 300
           OR jsonb_typeof(v_examples) <> 'array' OR jsonb_array_length(v_examples) > 4
           OR EXISTS (
                SELECT 1 FROM jsonb_array_elements(v_examples) example
                WHERE jsonb_typeof(example) <> 'string' OR char_length(example #>> '{}') > 150
           )
           OR jsonb_typeof(v_similar) <> 'array' OR jsonb_array_length(v_similar) > 3 THEN
            RAISE EXCEPTION '주간 검수 항목 형식을 확인해 주세요.' USING ERRCODE = '22023';
        END IF;

        INSERT INTO public.spelling_weekly_ai_review_cache(
            review_key, expression, source_correction, verdict, correct_expression,
            label, explanation, examples, reason, model, review_version, reviewed_at
        ) VALUES (
            v_item->>'review_key', btrim(v_item->>'expression'), btrim(COALESCE(v_item->>'source_correction', '')),
            v_item->>'verdict', btrim(COALESCE(v_item->>'correct_expression', '')),
            btrim(v_item->>'label'), btrim(v_item->>'explanation'), v_examples,
            btrim(v_item->>'reason'), v_model, v_review_version, NOW()
        )
        ON CONFLICT (review_key) DO UPDATE SET
            verdict = EXCLUDED.verdict,
            correct_expression = EXCLUDED.correct_expression,
            label = EXCLUDED.label,
            explanation = EXCLUDED.explanation,
            examples = EXCLUDED.examples,
            reason = EXCLUDED.reason,
            model = EXCLUDED.model,
            review_version = EXCLUDED.review_version,
            reviewed_at = CASE
                WHEN COALESCE((v_item->>'cache_hit')::BOOLEAN, FALSE)
                    THEN public.spelling_weekly_ai_review_cache.reviewed_at
                ELSE NOW()
            END;

        /*
         * **모든 학급이 함께 쓰는 자료**이므로 한 학급에서만 나온 표현은 `반영 권장`이 될 수 없다.
         * 지시문에 적어 두는 것만으로는 부족했다 — AI 가 자기 지시문의 `주의 검토` 보기(`븍지런함`,
         * `잔고 싶어`)조차 `반영 권장`으로 올렸다(2026-08-28). 그래서 서버가 마지막에 내린다.
         * 버리지 않고 `주의 검토`로 두므로 관리자가 규칙이라고 판단하면 직접 올릴 수 있고,
         * 다른 학급에서 같은 표현이 또 나오면 다음 회차에 스스로 `반영 권장` 자격을 얻는다.
         */
        v_verdict := v_item->>'verdict';
        IF v_verdict = 'recommend'
           AND COALESCE((v_item->>'class_count')::INTEGER, 0) < 2 THEN
            v_verdict := 'caution';
        END IF;

        INSERT INTO public.spelling_weekly_review_items(
            week_start, review_key, source_kinds, primary_source, expression,
            source_correction, hit_count, class_count, similar_matches,
            ai_verdict, ai_correct_expression, ai_label, ai_explanation,
            ai_examples, ai_reason, cache_hit
        ) VALUES (
            p_week_start, v_item->>'review_key', v_sources, v_item->>'primary_source',
            btrim(v_item->>'expression'), btrim(COALESCE(v_item->>'source_correction', '')),
            GREATEST(COALESCE((v_item->>'hit_count')::BIGINT, 0), 0),
            GREATEST(COALESCE((v_item->>'class_count')::INTEGER, 0), 0), v_similar,
            v_verdict, btrim(COALESCE(v_item->>'correct_expression', '')),
            btrim(v_item->>'label'), btrim(v_item->>'explanation'), v_examples,
            btrim(v_item->>'reason'), COALESCE((v_item->>'cache_hit')::BOOLEAN, FALSE)
        );
    END LOOP;

    PERFORM set_config('app.spelling_triage_deferred', 'off', TRUE);
    PERFORM public.spelling_weekly_auto_triage_v1();

    v_count := jsonb_array_length(p_items);
    UPDATE public.spelling_weekly_review_runs run
    SET status = CASE WHEN v_count = 0 THEN 'empty' ELSE 'ready' END,
        collected_count = GREATEST(COALESCE((p_summary->>'collected_count')::INTEGER, 0), 0),
        known_filtered_count = GREATEST(COALESCE((p_summary->>'known_filtered_count')::INTEGER, 0), 0),
        cache_hit_count = GREATEST(COALESCE((p_summary->>'cache_hit_count')::INTEGER, 0), 0),
        ai_reviewed_count = GREATEST(COALESCE((p_summary->>'ai_reviewed_count')::INTEGER, 0), 0),
        model = v_model,
        finished_at = NOW(),
        error_code = NULL
    WHERE run.week_start = p_week_start;

    RETURN jsonb_build_object('status', CASE WHEN v_count = 0 THEN 'empty' ELSE 'ready' END, 'items', v_count);
END;
$function$;
