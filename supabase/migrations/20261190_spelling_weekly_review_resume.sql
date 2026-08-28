-- 주간 맞춤법 AI 검수를 **여러 번에 나눠** 돌릴 수 있게 한다.
--
-- 2026-08-28 첫 실행이 통째로 날아갔다. 엣지 함수 작업자의 제한이 60초(`workerTimeoutMs`)인데
-- 후보 155건은 12개씩 13번 AI 를 불러야 해서 도중에 supervisor 가 작업자를 끊었다. 끊기는 방식이라
-- 함수의 오류 처리도 못 돌아 회차가 `running` 에 멈췄고, 이미 쓴 AI 호출 결과는 하나도 안 남았다.
-- `finish_` 가 결과와 캐시를 한꺼번에 쓰기 때문이다.
--
-- 그래서 두 가지를 더한다.
--   1. `start_` 가 이미 도는 회차를 **이어받을** 수 있다(`p_allow_resume`). 이어받으면 `started_at` 을
--      새로 찍어 두 시간 자동 만료를 미룬다.
--   2. 배치 하나가 끝날 때마다 결과를 **캐시에 먼저 적립**한다(`save_spelling_weekly_ai_cache_v1`).
--      다음 호출은 `start_` 가 주는 `cached_reviews` 로 그것을 그대로 재사용하므로 같은 후보에
--      AI 를 두 번 부르지 않는다. 중간에 끊겨도 이미 낸 비용은 남는다.
--
-- 회차를 실제로 마치는 것은 여전히 `finish_` 뿐이다. 남은 후보가 없을 때만 부른다.

BEGIN;

-- 인자가 늘어 옛 서명을 지운다. 되돌림 스크립트는 두 인자로 부르므로 기본값으로 그대로 동작한다.
DROP FUNCTION IF EXISTS public.start_spelling_weekly_review_v1(DATE, TEXT);

CREATE OR REPLACE FUNCTION public.start_spelling_weekly_review_v1(
    p_week_start DATE,
    p_catalog_version TEXT,
    p_allow_resume BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

/**
 * 배치 하나가 끝날 때마다 AI 검수 결과를 캐시에 적립한다.
 *
 * 회차를 마치지는 않는다. 중간에 끊겨도 여기 남은 것은 다음 호출이 재사용한다.
 * 저장 모양은 `finish_spelling_weekly_review_v1` 의 캐시 기록과 같아야 한다.
 */
CREATE OR REPLACE FUNCTION public.save_spelling_weekly_ai_cache_v1(p_items JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item JSONB;
    v_count INTEGER := 0;
BEGIN
    IF session_user <> 'supabase_admin' AND COALESCE(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'server role required' USING ERRCODE = '42501';
    END IF;
    IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) > 200 THEN
        RAISE EXCEPTION '캐시에 적립할 결과를 확인해 주세요.' USING ERRCODE = '22023';
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
        CONTINUE WHEN COALESCE(v_item->>'review_key', '') !~ '^[a-f0-9]{64}$';
        CONTINUE WHEN COALESCE(v_item->>'verdict', '') NOT IN ('recommend', 'caution', 'reject');

        INSERT INTO public.spelling_weekly_ai_review_cache(
            review_key, expression, source_correction, verdict, correct_expression,
            label, explanation, examples, reason, model, review_version, reviewed_at
        ) VALUES (
            v_item->>'review_key',
            left(btrim(COALESCE(v_item->>'expression', '')), 40),
            left(btrim(COALESCE(v_item->>'source_correction', '')), 40),
            v_item->>'verdict',
            left(btrim(COALESCE(v_item->>'correct_expression', '')), 40),
            COALESCE(NULLIF(left(btrim(COALESCE(v_item->>'label', '')), 40), ''), '미분류'),
            COALESCE(NULLIF(left(btrim(COALESCE(v_item->>'explanation', '')), 600), ''), '관리자가 직접 확인해 주세요.'),
            CASE WHEN jsonb_typeof(v_item->'examples') = 'array' THEN v_item->'examples' ELSE '[]'::JSONB END,
            COALESCE(NULLIF(left(btrim(COALESCE(v_item->>'reason', '')), 300), ''), '관리자 확인이 필요합니다.'),
            left(btrim(COALESCE(v_item->>'model', '')), 80),
            left(btrim(COALESCE(v_item->>'review_version', '')), 40),
            NOW()
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
            reviewed_at = NOW();
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.start_spelling_weekly_review_v1(DATE, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_spelling_weekly_ai_cache_v1(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_spelling_weekly_review_v1(DATE, TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_spelling_weekly_ai_cache_v1(JSONB) TO service_role;

COMMENT ON FUNCTION public.save_spelling_weekly_ai_cache_v1(JSONB) IS
    '배치마다 AI 검수 결과를 캐시에 적립해, 60초 제한으로 끊겨도 이미 낸 비용이 남게 한다.';

NOTIFY pgrst, 'reload schema';

COMMIT;
