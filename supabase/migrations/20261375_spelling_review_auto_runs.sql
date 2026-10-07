-- 맞춤법 AI 검수 자동화(2026-10-07, 선생님 결정: "50개 모이면 자동 검수, 주 1회 반영할 것만 보고 반영").
-- ① 회차를 `한 주(월요일)` 에서 `하루(서울 날짜)` 로 — 한 주에 여러 번 돌 수 있게. 칸 이름 week_start 는 그대로.
--    수집 기준은 그대로 `이전 회차가 끝난 시각 이후` 라 자료가 새거나 겹치지 않는다.
-- ② "새로 볼 것" 숫자를 함수 하나로(spelling_review_new_source_counts_v1) — 화면과 자동 검수가 같은 숫자를 본다.
-- ③ 자동 검수용 상태 함수(서버 전용): 오늘 회차 상태·새로 볼 것·먼저 볼 것 대기 수.
-- 학생 표현을 OpenAI 로 자동으로 보내는 것은 선생님이 승인(2026-10-07). 공개 AI 끄기(public_api_enabled)는 그대로 지킨다.

CREATE OR REPLACE FUNCTION public.spelling_review_run_date_v1()
RETURNS DATE
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$ SELECT (now() AT TIME ZONE 'Asia/Seoul')::date $$;

CREATE OR REPLACE FUNCTION public.spelling_review_new_source_counts_v1(p_since TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_since TIMESTAMPTZ := p_since;
BEGIN
    -- 관리자 화면(admin_get_spelling_weekly_intake_v1)과 자동 검수(scripts/run-weekly-spelling-review.mjs --auto)가
    -- 같은 "새로 볼 것" 숫자를 쓰도록 한 곳에 둔다(2026-10-07).
    RETURN jsonb_build_object(
        'ai_finding_count', (
            SELECT count(*)
            FROM public.spelling_ai_findings finding
            WHERE finding.last_seen_at > v_since
              AND NOT EXISTS (
                  SELECT 1 FROM public.spelling_common_reviews review
                  WHERE review.source_kind = 'ai'
                    AND review.expression = finding.expression
                    AND review.source_correction = finding.correction
              )
              -- 2026-10-01: 이미 AI 가 본 표현은 저장된 결과를 다시 쓰므로 `새로 볼 것` 에서 뺀다.
              AND NOT EXISTS (
                  SELECT 1 FROM public.spelling_weekly_review_items item
                  WHERE public.spelling_norm(item.expression) = public.spelling_norm(finding.expression)
              )
        ),
        -- 새로 모인 학생 AI 검사 표현 중 먼저 볼 것(두 학급 이상·세 번 이상). AI 는 이 순서로 200개씩 본다.
        'priority_ai_finding_count', (
            SELECT count(*) FILTER (WHERE public.spelling_weekly_item_is_priority(finding.class_count, finding.hit_count))
            FROM public.spelling_ai_findings finding
            WHERE finding.last_seen_at > v_since
              AND NOT EXISTS (
                  SELECT 1 FROM public.spelling_common_reviews review
                  WHERE review.source_kind = 'ai'
                    AND review.expression = finding.expression
                    AND review.source_correction = finding.correction
              )
              -- 2026-10-01: 이미 AI 가 본 표현은 저장된 결과를 다시 쓰므로 `새로 볼 것` 에서 뺀다.
              AND NOT EXISTS (
                  SELECT 1 FROM public.spelling_weekly_review_items item
                  WHERE public.spelling_norm(item.expression) = public.spelling_norm(finding.expression)
              )
        ),
        'search_count', (
            SELECT count(*)
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
              AND NOT EXISTS (
                  SELECT 1 FROM public.spelling_weekly_review_items item
                  WHERE public.spelling_norm(item.expression) = public.spelling_norm(corpus.expression)
              )
        ),
        -- 이미 AI 가 본 표현 중 이번에 다시 나온 것(결과를 재사용해 비용이 들지 않는다).
        'reused_count', (
            SELECT count(DISTINCT public.spelling_norm(item.expression))
            FROM public.spelling_weekly_review_items item
            WHERE EXISTS (
                SELECT 1 FROM public.spelling_ai_findings finding
                WHERE finding.last_seen_at > v_since
                  AND public.spelling_norm(finding.expression) = public.spelling_norm(item.expression)
            )
        ),
        'teacher_entry_count', (
            SELECT count(*)
            FROM (
                SELECT 1
                FROM public.spelling_learning_entries entry
                WHERE entry.scope = 'class'
                  AND entry.status = 'approved'
                  AND entry.updated_at > v_since
                GROUP BY lower(btrim(entry.wrong_expression)), lower(btrim(entry.correct_expression))
            ) grouped
        )
    );
END;
$function$;
REVOKE ALL ON FUNCTION public.spelling_review_new_source_counts_v1(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_spelling_weekly_intake_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_since TIMESTAMPTZ;
    v_week DATE;
    v_current public.spelling_weekly_review_runs%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION '관리자만 볼 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    -- 회차 = 서울 날짜 하루(2026-10-07~). 50개가 모이면 자동 검수가 그날 돌고, 화면은 오늘 회차를 본다.
    -- 칸 이름(week_start)은 예전 그대로 둔다.
    v_week := public.spelling_review_run_date_v1();

    SELECT COALESCE(max(run.finished_at), '-infinity'::TIMESTAMPTZ)
    INTO v_since
    FROM public.spelling_weekly_review_runs run
    WHERE run.status IN ('ready', 'empty')
      AND run.week_start < v_week;

    SELECT * INTO v_current
    FROM public.spelling_weekly_review_runs run
    WHERE run.week_start = v_week;

    RETURN jsonb_build_object(
        'week_start', v_week,
        'source_since_at', CASE WHEN v_since = '-infinity'::TIMESTAMPTZ THEN NULL ELSE v_since END,
        -- 이번 주에 이미 돌렸는지. 'ready'/'empty' 면 start 가 already_finished 로 되돌려보낸다.
        'current_status', v_current.status,
        'current_started_at', v_current.started_at,
        'current_finished_at', v_current.finished_at,
        -- 돌다 만 회차는 **막지 않는다**. 엣지 함수가 60초에 끊기면 회차가 running 인 채로 남는데,
        -- 여기서 막아 버리면 이어받기를 화면에서 쓸 수가 없어 두 시간을 기다려야 했다(2026-08-28).
        -- 끝난 주(ready·empty)만 막는다. 동시에 두 번 누르는 것은 DB 잠금과 화면이 막는다.
        'can_run', COALESCE(v_current.status, '') NOT IN ('ready', 'empty'),
        'is_resuming', COALESCE(v_current.status, '') = 'running',
        -- 돌다 만 회차가 어디까지 왔는지. 알림은 새로 고치면 사라지므로 화면이 여기서 읽어
        -- 계속 보여 준다(2026-08-28 "진행 현황이 안 보인다").
        'current_total_count', COALESCE(v_current.collected_count, 0),
        'current_done_count', COALESCE(v_current.ai_reviewed_count, 0)
    ) || public.spelling_review_new_source_counts_v1(v_since);
END;
$function$;

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
       OR p_week_start > public.spelling_review_run_date_v1()
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

-- 회차 날짜를 쓰는 나머지 두 곳(다시 검수하기·원자료 목록)도 서울 오늘로.
CREATE OR REPLACE FUNCTION public.admin_restart_spelling_weekly_review_v1(p_week_start date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_week DATE;
    v_removed INTEGER := 0;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION '관리자만 다시 검수할 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    v_week := COALESCE(
        p_week_start,
        public.spelling_review_run_date_v1()
    );

    SELECT count(*)::INTEGER INTO v_removed
    FROM public.spelling_weekly_review_items item
    WHERE item.week_start = v_week;

    -- 회차를 지우면 그 주의 검토 후보가 함께 지워진다. 게시·보류 결정은 다른 표라 남는다.
    DELETE FROM public.spelling_weekly_review_runs run
    WHERE run.week_start = v_week;

    RETURN jsonb_build_object('week_start', v_week, 'removed_item_count', v_removed);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_get_spelling_intake_candidates_v1(p_source_kind text, p_excluded boolean DEFAULT false, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_since TIMESTAMPTZ;
    v_week DATE;
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 300);
    v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
    v_items JSONB;
    v_total BIGINT;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION '관리자만 볼 수 있습니다.' USING ERRCODE = '42501';
    END IF;
    IF p_source_kind NOT IN ('ai', 'search') THEN
        RAISE EXCEPTION '출처를 확인해 주세요.' USING ERRCODE = '22023';
    END IF;

    v_week := public.spelling_review_run_date_v1();
    SELECT COALESCE(max(run.finished_at), '-infinity'::TIMESTAMPTZ)
    INTO v_since
    FROM public.spelling_weekly_review_runs run
    WHERE run.status IN ('ready', 'empty')
      AND run.week_start < v_week;

    IF p_excluded THEN
        -- 빼 둔 것. 되돌리려면 이 목록이 필요하다. 게시된 것은 여기 없다(그건 공통 자료 화면에서 다룬다).
        SELECT COALESCE(jsonb_agg(to_jsonb(row_data) ORDER BY row_data.decided_at DESC), '[]'::JSONB)
        INTO v_items
        FROM (
            SELECT review.expression, review.source_correction, review.decided_at,
                   0::BIGINT AS hit_count, 0::INTEGER AS class_count, NULL::TIMESTAMPTZ AS last_seen_at
            FROM public.spelling_common_reviews review
            WHERE review.source_kind = p_source_kind
              AND review.decision = 'rejected'
            ORDER BY review.decided_at DESC
            LIMIT v_limit OFFSET v_offset
        ) row_data;

        SELECT count(*) INTO v_total
        FROM public.spelling_common_reviews review
        WHERE review.source_kind = p_source_kind AND review.decision = 'rejected';

    ELSIF p_source_kind = 'ai' THEN
        SELECT COALESCE(jsonb_agg(to_jsonb(row_data) ORDER BY row_data.hit_count DESC), '[]'::JSONB)
        INTO v_items
        FROM (
            SELECT finding.expression, finding.correction AS source_correction, finding.hit_count,
                   finding.class_count, finding.last_seen_at, NULL::TIMESTAMPTZ AS decided_at
            FROM public.spelling_ai_findings finding
            WHERE finding.last_seen_at > v_since
              AND NOT EXISTS (
                  SELECT 1 FROM public.spelling_common_reviews review
                  WHERE review.source_kind = 'ai'
                    AND review.expression = finding.expression
                    AND review.source_correction = finding.correction
              )
            ORDER BY finding.class_count DESC, finding.hit_count DESC, finding.last_seen_at DESC
            LIMIT v_limit OFFSET v_offset
        ) row_data;

        SELECT count(*) INTO v_total
        FROM public.spelling_ai_findings finding
        WHERE finding.last_seen_at > v_since
          AND NOT EXISTS (
              SELECT 1 FROM public.spelling_common_reviews review
              WHERE review.source_kind = 'ai'
                AND review.expression = finding.expression
                AND review.source_correction = finding.correction
          );

    ELSE
        SELECT COALESCE(jsonb_agg(to_jsonb(row_data) ORDER BY row_data.hit_count DESC), '[]'::JSONB)
        INTO v_items
        FROM (
            SELECT corpus.expression, ''::TEXT AS source_correction, corpus.search_count AS hit_count,
                   corpus.class_count, corpus.last_seen_at, NULL::TIMESTAMPTZ AS decided_at
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
            ORDER BY corpus.class_count DESC, corpus.search_count DESC, corpus.last_seen_at DESC
            LIMIT v_limit OFFSET v_offset
        ) row_data;

        SELECT count(*) INTO v_total
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
          );
    END IF;

    RETURN jsonb_build_object(
        'source_kind', p_source_kind,
        'excluded', p_excluded,
        'total', COALESCE(v_total, 0),
        'items', COALESCE(v_items, '[]'::JSONB)
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.spelling_review_auto_status_v1()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_today DATE := public.spelling_review_run_date_v1();
    v_since TIMESTAMPTZ;
    v_counts JSONB;
    v_current public.spelling_weekly_review_runs%ROWTYPE;
BEGIN
    IF session_user <> 'supabase_admin' AND COALESCE(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'server role required' USING ERRCODE = '42501';
    END IF;
    SELECT COALESCE(max(run.finished_at), '-infinity'::TIMESTAMPTZ) INTO v_since
    FROM public.spelling_weekly_review_runs run
    WHERE run.status IN ('ready', 'empty') AND run.week_start < v_today;
    SELECT * INTO v_current FROM public.spelling_weekly_review_runs run WHERE run.week_start = v_today;
    v_counts := public.spelling_review_new_source_counts_v1(v_since);
    RETURN jsonb_build_object(
        'run_date', v_today,
        'current_status', v_current.status,
        'new_count', COALESCE((v_counts->>'ai_finding_count')::INTEGER, 0)
            + COALESCE((v_counts->>'search_count')::INTEGER, 0)
            + COALESCE((v_counts->>'teacher_entry_count')::INTEGER, 0),
        -- 관리자 화면 `먼저 볼 것` 과 같은 기준(반영 권장이거나 두 학급·세 번 이상)
        'priority_pending', (
            SELECT count(*) FROM public.spelling_weekly_review_items item
            WHERE item.decision = 'pending'
              AND (item.ai_verdict = 'recommend' OR public.spelling_weekly_item_is_priority(item.class_count, item.hit_count))
        ),
        'later_pending', (
            SELECT count(*) FROM public.spelling_weekly_review_items item
            WHERE item.decision = 'pending'
              AND NOT (item.ai_verdict = 'recommend' OR public.spelling_weekly_item_is_priority(item.class_count, item.hit_count))
        ),
        'runs_last_7_days', (
            SELECT count(*) FROM public.spelling_weekly_review_runs run
            WHERE run.status IN ('ready', 'empty') AND run.finished_at > now() - INTERVAL '7 days'
        ),
        'ai_reviewed_last_7_days', (
            SELECT COALESCE(sum(run.ai_reviewed_count), 0) FROM public.spelling_weekly_review_runs run
            WHERE run.status IN ('ready', 'empty') AND run.finished_at > now() - INTERVAL '7 days'
        )
    );
END;
$function$;
REVOKE ALL ON FUNCTION public.spelling_review_auto_status_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spelling_review_auto_status_v1() TO service_role;

NOTIFY pgrst, 'reload schema';
