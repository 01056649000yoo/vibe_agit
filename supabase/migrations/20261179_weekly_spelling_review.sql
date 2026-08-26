-- 모든 학급의 맞춤법 근거를 주 1회 모아, 기존 자료와 겹치지 않는 후보만 AI 검수 뒤 관리자에게 보여 준다.
-- 학생 글·학생/학급 식별자는 저장하지 않고 짧은 표현과 집계 숫자만 다룬다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.spelling_weekly_review_runs (
    week_start DATE PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('running', 'ready', 'empty', 'failed')),
    source_since_at TIMESTAMPTZ NOT NULL,
    collected_count INTEGER NOT NULL DEFAULT 0 CHECK (collected_count >= 0),
    known_filtered_count INTEGER NOT NULL DEFAULT 0 CHECK (known_filtered_count >= 0),
    cache_hit_count INTEGER NOT NULL DEFAULT 0 CHECK (cache_hit_count >= 0),
    ai_reviewed_count INTEGER NOT NULL DEFAULT 0 CHECK (ai_reviewed_count >= 0),
    catalog_version TEXT NOT NULL DEFAULT '' CHECK (char_length(catalog_version) <= 80),
    model TEXT NOT NULL DEFAULT '' CHECK (char_length(model) <= 80),
    error_code TEXT CHECK (error_code IS NULL OR char_length(error_code) <= 80),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.spelling_weekly_ai_review_cache (
    review_key TEXT PRIMARY KEY CHECK (review_key ~ '^[a-f0-9]{64}$'),
    expression TEXT NOT NULL CHECK (char_length(expression) BETWEEN 1 AND 40),
    source_correction TEXT NOT NULL DEFAULT '' CHECK (char_length(source_correction) <= 40),
    verdict TEXT NOT NULL CHECK (verdict IN ('recommend', 'caution', 'reject')),
    correct_expression TEXT NOT NULL DEFAULT '' CHECK (char_length(correct_expression) <= 40),
    label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 40),
    explanation TEXT NOT NULL CHECK (char_length(explanation) BETWEEN 1 AND 600),
    examples JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(examples) = 'array'),
    reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 300),
    model TEXT NOT NULL CHECK (char_length(model) BETWEEN 1 AND 80),
    review_version TEXT NOT NULL CHECK (char_length(review_version) BETWEEN 1 AND 40),
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.spelling_weekly_review_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    week_start DATE NOT NULL REFERENCES public.spelling_weekly_review_runs(week_start) ON DELETE CASCADE,
    review_key TEXT NOT NULL CHECK (review_key ~ '^[a-f0-9]{64}$'),
    source_kinds TEXT[] NOT NULL CHECK (
        cardinality(source_kinds) BETWEEN 1 AND 3
        AND source_kinds <@ ARRAY['ai', 'search', 'teacher']::TEXT[]
    ),
    primary_source TEXT NOT NULL CHECK (primary_source IN ('ai', 'search', 'manual')),
    expression TEXT NOT NULL CHECK (char_length(expression) BETWEEN 1 AND 40),
    source_correction TEXT NOT NULL DEFAULT '' CHECK (char_length(source_correction) <= 40),
    hit_count BIGINT NOT NULL DEFAULT 0 CHECK (hit_count >= 0),
    class_count INTEGER NOT NULL DEFAULT 0 CHECK (class_count >= 0),
    similar_matches JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(similar_matches) = 'array'),
    ai_verdict TEXT NOT NULL CHECK (ai_verdict IN ('recommend', 'caution', 'reject')),
    ai_correct_expression TEXT NOT NULL DEFAULT '' CHECK (char_length(ai_correct_expression) <= 40),
    ai_label TEXT NOT NULL CHECK (char_length(ai_label) BETWEEN 1 AND 40),
    ai_explanation TEXT NOT NULL CHECK (char_length(ai_explanation) BETWEEN 1 AND 600),
    ai_examples JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(ai_examples) = 'array'),
    ai_reason TEXT NOT NULL CHECK (char_length(ai_reason) BETWEEN 1 AND 300),
    cache_hit BOOLEAN NOT NULL DEFAULT FALSE,
    decision TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending', 'published', 'rejected')),
    common_entry_id UUID REFERENCES public.spelling_learning_entries(id) ON DELETE SET NULL,
    decided_by UUID REFERENCES auth.users(id),
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (week_start, review_key)
);

CREATE INDEX IF NOT EXISTS idx_spelling_weekly_items_pending
    ON public.spelling_weekly_review_items (week_start DESC, ai_verdict, created_at DESC)
    WHERE decision = 'pending';

COMMENT ON TABLE public.spelling_weekly_review_runs IS
    '주간 맞춤법 검수 실행 요약. 표현 원문 외 학생 글·학생·학급 식별자는 저장하지 않는다.';
COMMENT ON TABLE public.spelling_weekly_ai_review_cache IS
    '같은 맞춤법 후보를 AI가 반복 검수하지 않도록 재사용하는 짧은 결과 캐시.';
COMMENT ON TABLE public.spelling_weekly_review_items IS
    '기본·공통 자료의 정확 일치 제거와 유사 항목 축약 뒤 AI 검수를 마친 관리자 선택 후보.';

ALTER TABLE public.spelling_weekly_review_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spelling_weekly_ai_review_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spelling_weekly_review_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.spelling_weekly_review_runs FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.spelling_weekly_ai_review_cache FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.spelling_weekly_review_items FROM PUBLIC, anon, authenticated, service_role;

-- launchd 호스트 기록기는 supabase_admin 연결로, 서버 경로는 service_role로만 실행한다.
CREATE OR REPLACE FUNCTION public.start_spelling_weekly_review_v1(
    p_week_start DATE,
    p_catalog_version TEXT
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
    IF v_existing.status = 'running' AND v_existing.started_at > NOW() - INTERVAL '2 hours' THEN
        RETURN jsonb_build_object('should_run', FALSE, 'reason', 'already_running');
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

CREATE OR REPLACE FUNCTION public.finish_spelling_weekly_review_v1(
    p_week_start DATE,
    p_items JSONB,
    p_summary JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
            v_item->>'verdict', btrim(COALESCE(v_item->>'correct_expression', '')),
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
$$;

CREATE OR REPLACE FUNCTION public.fail_spelling_weekly_review_v1(
    p_week_start DATE,
    p_error_code TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF session_user <> 'supabase_admin' AND COALESCE(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'server role required' USING ERRCODE = '42501';
    END IF;
    UPDATE public.spelling_weekly_review_runs run
    SET status = 'failed', error_code = left(btrim(COALESCE(p_error_code, 'unknown')), 80), finished_at = NOW()
    WHERE run.week_start = p_week_start AND run.status = 'running';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_spelling_promotion_workspace_v3()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_candidate_week DATE;
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION '관리자만 볼 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT run.week_start INTO v_candidate_week
    FROM public.spelling_weekly_review_runs run
    WHERE run.status IN ('ready', 'empty')
    ORDER BY run.week_start DESC
    LIMIT 1;

    SELECT jsonb_build_object(
        'latest_run', COALESCE((
            SELECT to_jsonb(run_row)
            FROM (
                SELECT run.week_start, run.status, run.collected_count, run.known_filtered_count,
                       run.cache_hit_count, run.ai_reviewed_count, run.catalog_version,
                       run.model, run.error_code, run.started_at, run.finished_at
                FROM public.spelling_weekly_review_runs run
                ORDER BY run.week_start DESC, run.started_at DESC
                LIMIT 1
            ) run_row
        ), 'null'::JSONB),
        'candidate_week', v_candidate_week,
        'weekly_candidates', COALESCE((
            SELECT jsonb_agg(to_jsonb(item_row)
                ORDER BY CASE item_row.ai_verdict WHEN 'recommend' THEN 0 WHEN 'caution' THEN 1 ELSE 2 END,
                         item_row.class_count DESC, item_row.hit_count DESC)
            FROM (
                SELECT item.id, item.source_kinds, item.primary_source, item.expression,
                       item.source_correction, item.hit_count, item.class_count, item.similar_matches,
                       item.ai_verdict, item.ai_correct_expression, item.ai_label,
                       item.ai_explanation, item.ai_examples, item.ai_reason, item.cache_hit,
                       item.created_at
                FROM public.spelling_weekly_review_items item
                WHERE item.week_start = v_candidate_week
                  AND item.decision = 'pending'
                ORDER BY item.created_at DESC
                LIMIT 200
            ) item_row
        ), '[]'::JSONB),
        'common_entries', COALESCE((
            SELECT jsonb_agg(to_jsonb(entry_row) ORDER BY entry_row.status, entry_row.updated_at DESC)
            FROM (
                SELECT entry.id, entry.wrong_expression, entry.correct_expression, entry.label,
                       entry.explanation, entry.examples, entry.status, entry.source_kind,
                       entry.approved_at, entry.updated_at
                FROM public.spelling_learning_entries entry
                WHERE entry.scope = 'common'
                ORDER BY entry.updated_at DESC
                LIMIT 100
            ) entry_row
        ), '[]'::JSONB)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_publish_weekly_spelling_entry_v1(
    p_item_id UUID,
    p_entry JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item public.spelling_weekly_review_items%ROWTYPE;
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION '관리자만 주간 맞춤법 후보를 게시할 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_item
    FROM public.spelling_weekly_review_items item
    WHERE item.id = p_item_id AND item.decision = 'pending'
    FOR UPDATE;
    IF v_item.id IS NULL THEN
        RAISE EXCEPTION '검토할 주간 후보를 찾지 못했습니다.' USING ERRCODE = '22023';
    END IF;

    v_result := public.admin_publish_common_spelling_entry_v1(
        v_item.primary_source,
        v_item.expression,
        v_item.source_correction,
        p_entry,
        NULL
    );

    UPDATE public.spelling_weekly_review_items item
    SET decision = 'published', common_entry_id = (v_result->>'id')::UUID,
        decided_by = auth.uid(), decided_at = NOW()
    WHERE item.id = v_item.id;
    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reject_weekly_spelling_entry_v1(p_item_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item public.spelling_weekly_review_items%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION '관리자만 주간 맞춤법 후보를 보류할 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_item
    FROM public.spelling_weekly_review_items item
    WHERE item.id = p_item_id AND item.decision = 'pending'
    FOR UPDATE;
    IF v_item.id IS NULL THEN
        RAISE EXCEPTION '보류할 주간 후보를 찾지 못했습니다.' USING ERRCODE = '22023';
    END IF;

    IF v_item.primary_source IN ('ai', 'search') THEN
        INSERT INTO public.spelling_common_reviews(
            source_kind, expression, source_correction, decision, decided_by, decided_at
        ) VALUES (
            v_item.primary_source, v_item.expression, v_item.source_correction,
            'rejected', auth.uid(), NOW()
        )
        ON CONFLICT (source_kind, expression, source_correction) DO UPDATE SET
            decision = 'rejected', common_entry_id = NULL,
            decided_by = EXCLUDED.decided_by, decided_at = NOW();
    END IF;

    UPDATE public.spelling_weekly_review_items item
    SET decision = 'rejected', common_entry_id = NULL,
        decided_by = auth.uid(), decided_at = NOW()
    WHERE item.id = v_item.id;
    RETURN jsonb_build_object('decision', 'rejected');
END;
$$;

REVOKE ALL ON FUNCTION public.start_spelling_weekly_review_v1(DATE, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_spelling_weekly_review_v1(DATE, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_spelling_weekly_review_v1(DATE, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_spelling_weekly_review_v1(DATE, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_spelling_weekly_review_v1(DATE, JSONB, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_spelling_weekly_review_v1(DATE, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.admin_get_spelling_promotion_workspace_v3() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_publish_weekly_spelling_entry_v1(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_reject_weekly_spelling_entry_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_spelling_promotion_workspace_v3() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_publish_weekly_spelling_entry_v1(UUID, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_reject_weekly_spelling_entry_v1(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
