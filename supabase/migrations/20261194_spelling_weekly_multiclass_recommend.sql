-- 반영 권장은 여러 학급에서 되풀이된 표현만, 문장형은 아예 후보로 올리지 않는다.
--
-- 첫 회차 결과를 실제로 재 보니 두 가지가 드러났다(2026-08-28).
--   · `반영 권장` 90건이 **모두 한 학급**에서만 나온 것이었다. 기준은 "여러 학급 아이들이
--     되풀이해 틀릴 규칙인가" 인데 그 판단 근거가 데이터에 없었다.
--   · 문장 19건이 후보에 섞여 있었다. 전부 `ai` 출처였다 — 검색 원장에는 모양 조건이 있는데
--     AI 발견에만 없었다. 학생 화면의 검사는 정확히 같은 글자를 찾으므로 문장은 못 쓴다.
--
-- 그래서 앞에서는 문장형을 거르고, 뒤에서는 서버가 `반영 권장` 자격을 학급 2개 이상으로 제한한다.
-- 지금은 자격을 갖춘 표현이 거의 없지만 **버리지 않는다** — 원자료는 계속 쌓이고,
-- 다른 학급에서 같은 표현이 또 나오면 다음 회차에 스스로 올라온다.

BEGIN;

CREATE OR REPLACE FUNCTION public.start_spelling_weekly_review_v1(p_week_start date, p_catalog_version text, p_allow_resume boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_since TIMESTAMPTZ;
    v_existing public.spelling_weekly_review_runs%ROWTYPE;
    v_result JSONB;
    v_resumed BOOLEAN := FALSE;
BEGIN
    IF session_user <> 'supabase_admin' AND COALESCE(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'server role required' USING ERRCODE = '42501';
    END IF;
    IF p_week_start IS NULL
       OR EXTRACT(ISODOW FROM p_week_start) <> 1
       OR p_week_start > CURRENT_DATE
       OR char_length(COALESCE(p_catalog_version, '')) NOT BETWEEN 1 AND 80 THEN
        RAISE EXCEPTION '주간 검수 기준값을 확인해 주세요.' USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('weekly-spelling-review'));
    SELECT * INTO v_existing
    FROM public.spelling_weekly_review_runs run
    WHERE run.week_start = p_week_start
    FOR UPDATE;

    IF v_existing.status IN ('ready', 'empty') THEN
        RETURN jsonb_build_object('should_run', FALSE, 'reason', 'already_finished');
    END IF;
    -- 엣지 함수는 60초 안에 끝나야 해서 큰 회차를 여러 번에 나눠 돌린다. 이어서 부르는 호출은
    -- 같은 회차를 이어받는다. 이어받을 때 started_at 을 새로 찍어 두 시간 자동 만료를 미룬다.
    IF v_existing.status = 'running' AND v_existing.started_at > NOW() - INTERVAL '2 hours' THEN
        IF NOT COALESCE(p_allow_resume, FALSE) THEN
            RETURN jsonb_build_object('should_run', FALSE, 'reason', 'already_running');
        END IF;
        v_resumed := TRUE;
    END IF;

    SELECT COALESCE(max(run.finished_at), '-infinity'::TIMESTAMPTZ)
    INTO v_since
    FROM public.spelling_weekly_review_runs run
    WHERE run.status IN ('ready', 'empty')
      AND run.week_start < p_week_start;

    INSERT INTO public.spelling_weekly_review_runs(
        week_start, status, source_since_at, catalog_version, started_at, finished_at, error_code
    ) VALUES (
        p_week_start, 'running', v_since, p_catalog_version, NOW(), NULL, NULL
    )
    ON CONFLICT (week_start) DO UPDATE SET
        status = 'running',
        source_since_at = EXCLUDED.source_since_at,
        catalog_version = EXCLUDED.catalog_version,
        started_at = NOW(),
        finished_at = NULL,
        error_code = NULL;

    SELECT jsonb_build_object(
        'should_run', TRUE,
        'resumed', v_resumed,
        'week_start', p_week_start,
        'source_since_at', v_since,
        'public_api_enabled', COALESCE((
            SELECT setting.value = 'true'::JSONB
            FROM public.system_settings setting
            WHERE setting.key = 'public_api_enabled'
            LIMIT 1
        ), TRUE),
        'ai_findings', COALESCE((
            SELECT jsonb_agg(to_jsonb(source_row) ORDER BY source_row.last_seen_at DESC)
            FROM (
                SELECT finding.expression, finding.correction, finding.hit_count,
                       finding.class_count, finding.last_seen_at
                FROM public.spelling_ai_findings finding
                WHERE finding.last_seen_at > v_since
                  -- 검색 원장과 **같은 모양 조건**을 건다. 여기에만 조건이 없어서
                  -- `약간 미안한 마음이있습니다.` 같은 문장이 후보로 올라왔다(2026-08-28).
                  -- 학생 화면의 검사는 정확히 같은 글자를 찾으므로 문장은 다시 걸릴 일이 없다.
                  AND char_length(finding.expression) BETWEEN 2 AND 15
                  AND finding.expression !~ '[.!?]$'
                  AND finding.expression ~ '^[가-힣ㄱ-ㅎㅏ-ㅣ]+( [가-힣ㄱ-ㅎㅏ-ㅣ]+)?$'
                  AND NOT EXISTS (
                      SELECT 1 FROM public.spelling_common_reviews review
                      WHERE review.source_kind = 'ai'
                        AND review.expression = finding.expression
                        AND review.source_correction = finding.correction
                  )
                ORDER BY finding.last_seen_at DESC
                LIMIT 300
            ) source_row
        ), '[]'::JSONB),
        'searched', COALESCE((
            SELECT jsonb_agg(to_jsonb(source_row) ORDER BY source_row.last_seen_at DESC)
            FROM (
                SELECT corpus.expression, corpus.search_count, corpus.class_count, corpus.last_seen_at
                FROM public.spelling_search_corpus corpus
                WHERE corpus.last_seen_at > v_since
                  AND corpus.matched IS FALSE
                  AND char_length(corpus.expression) BETWEEN 2 AND 15
                  AND array_length(regexp_split_to_array(corpus.expression, '\s+'), 1) <= 2
                  AND corpus.expression ~ '^[가-힣ㄱ-ㅎㅏ-ㅣ]+( [가-힣ㄱ-ㅎㅏ-ㅣ]+)?$'
                  AND NOT EXISTS (
                      SELECT 1 FROM public.spelling_common_reviews review
                      WHERE review.source_kind = 'search'
                        AND review.expression = corpus.expression
                        AND review.source_correction = ''
                  )
                ORDER BY corpus.last_seen_at DESC
                LIMIT 300
            ) source_row
        ), '[]'::JSONB),
        'teacher_entries', COALESCE((
            SELECT jsonb_agg(to_jsonb(source_row) ORDER BY source_row.last_seen_at DESC)
            FROM (
                SELECT max(entry.wrong_expression) AS expression,
                       max(entry.correct_expression) AS correction,
                       count(*)::BIGINT AS hit_count,
                       count(DISTINCT entry.class_id)::INTEGER AS class_count,
                       max(entry.updated_at) AS last_seen_at
                FROM public.spelling_learning_entries entry
                WHERE entry.scope = 'class'
                  AND entry.status = 'approved'
                  AND entry.updated_at > v_since
                GROUP BY lower(btrim(entry.wrong_expression)), lower(btrim(entry.correct_expression))
                ORDER BY max(entry.updated_at) DESC
                LIMIT 300
            ) source_row
        ), '[]'::JSONB),
        'common_entries', COALESCE((
            SELECT jsonb_agg(to_jsonb(common_row) ORDER BY common_row.updated_at DESC)
            FROM (
                SELECT entry.id, entry.wrong_expression, entry.correct_expression,
                       entry.label, entry.updated_at
                FROM public.spelling_learning_entries entry
                WHERE entry.scope = 'common'
                  AND entry.status = 'approved'
                ORDER BY entry.updated_at DESC
                LIMIT 500
            ) common_row
        ), '[]'::JSONB),
        'cached_reviews', COALESCE((
            SELECT jsonb_agg(to_jsonb(cache_row) ORDER BY cache_row.reviewed_at DESC)
            FROM (
                SELECT cache.review_key, cache.expression, cache.source_correction,
                       cache.verdict, cache.correct_expression, cache.label,
                       cache.explanation, cache.examples, cache.reason,
                       cache.model, cache.review_version, cache.reviewed_at
                FROM public.spelling_weekly_ai_review_cache cache
                ORDER BY cache.reviewed_at DESC
                LIMIT 2000
            ) cache_row
        ), '[]'::JSONB)
    ) INTO v_result;

    RETURN v_result;
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

REVOKE ALL ON FUNCTION public.start_spelling_weekly_review_v1(DATE, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_spelling_weekly_review_v1(DATE, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_spelling_weekly_review_v1(DATE, TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_spelling_weekly_review_v1(DATE, JSONB, JSONB) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
