-- 맞춤법 주간 검수 자동 정리 (2026-10-01).
--
-- 선생님 요청: "공통인 것은 자동으로 빠지고, 넣을지 말지 내가 골라야 하는 것만 남게".
-- 대기 449개를 보니 관리자 화면은 **최신 주 것만** 보여 줘 예전 주 대기 305개가 묻혀 있었고, AI 가
-- `제외 권장` 이라 한 97개도 사람이 하나씩 눌러야 했다. 이제 아래는 사람이 안 봐도 저절로 빠진다.
--   ① AI 판정 `제외 권장`                         → auto_reason 'ai_reject'
--   ② 같은 틀린 표현이 이미 공통 자료로 게시됨      → 'already_common'
--   ③ 같은 표현이 여러 주에 대기 중                → 가장 새 것만 남기고 'duplicate'
-- 관리자가 되돌린 항목(triage_locked)은 다시 건드리지 않는다. 검수 결과가 들어오거나 공통 자료가
-- 바뀔 때마다 트리거가 돈다(엣지 함수·되돌림 스크립트 어느 길로 들어와도 같다).
-- `주의 검토` 중 한 학급·한두 번뿐인 것은 지우지 않고 화면에서 `나중에 볼 것` 으로 접는다
-- (기준은 spelling_weekly_item_is_priority 한 곳).
-- 정규화는 reviewCore.js normalizeSpellingValue 와 같은 규칙이다(NFC·소문자·공백과 문장부호 제거).

BEGIN;

ALTER TABLE public.spelling_weekly_review_items
    ADD COLUMN IF NOT EXISTS auto_reason TEXT,
    ADD COLUMN IF NOT EXISTS triage_locked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.spelling_weekly_review_items
    DROP CONSTRAINT IF EXISTS spelling_weekly_review_items_auto_reason_check;
ALTER TABLE public.spelling_weekly_review_items
    ADD CONSTRAINT spelling_weekly_review_items_auto_reason_check
    CHECK (auto_reason IS NULL OR auto_reason IN ('ai_reject', 'already_common', 'duplicate'));

CREATE OR REPLACE FUNCTION public.spelling_norm(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
    SELECT regexp_replace(lower(normalize(COALESCE(p_value, ''), NFC)), '[[:space:]/·,?!."''’“”()_-]', '', 'g');
$$;

-- 관리자가 먼저 볼 후보인가: 두 학급 이상이거나 세 번 이상 나온 표현.
CREATE OR REPLACE FUNCTION public.spelling_weekly_item_is_priority(p_class_count INTEGER, p_hit_count BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
    SELECT COALESCE(p_class_count, 0) >= 2 OR COALESCE(p_hit_count, 0) >= 3;
$$;

CREATE OR REPLACE FUNCTION public.spelling_weekly_auto_triage_v1()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_closed INTEGER := 0;
    v_count INTEGER;
BEGIN
    -- ① AI 가 맞춤법 자료가 아니라고 본 것
    UPDATE public.spelling_weekly_review_items item
    SET decision = 'rejected', auto_reason = 'ai_reject', decided_at = NOW(), decided_by = NULL
    WHERE item.decision = 'pending' AND item.triage_locked IS FALSE AND item.ai_verdict = 'reject';
    GET DIAGNOSTICS v_count = ROW_COUNT; v_closed := v_closed + v_count;

    -- ② 이미 공통 자료로 게시된 표현(게시한 주간 후보 또는 켜진 공통 자료)
    UPDATE public.spelling_weekly_review_items item
    SET decision = 'rejected', auto_reason = 'already_common', decided_at = NOW(), decided_by = NULL
    WHERE item.decision = 'pending' AND item.triage_locked IS FALSE
      AND (
          EXISTS (
              SELECT 1 FROM public.spelling_learning_entries entry
              WHERE entry.scope = 'common' AND entry.status = 'approved'
                AND public.spelling_norm(entry.wrong_expression) = public.spelling_norm(item.expression)
          )
          OR EXISTS (
              SELECT 1 FROM public.spelling_weekly_review_items other
              WHERE other.decision = 'published' AND other.id <> item.id
                AND public.spelling_norm(other.expression) = public.spelling_norm(item.expression)
          )
      );
    GET DIAGNOSTICS v_count = ROW_COUNT; v_closed := v_closed + v_count;

    -- ③ 같은 표현이 여러 개 대기 중이면 하나만 남긴다(되돌린 것 → 새 주 → 새로 만든 순).
    WITH ranked AS (
        SELECT item.id, item.triage_locked,
               row_number() OVER (
                   PARTITION BY public.spelling_norm(item.expression)
                   ORDER BY item.triage_locked DESC, item.week_start DESC, item.created_at DESC, item.id
               ) AS rank_in_group
        FROM public.spelling_weekly_review_items item
        WHERE item.decision = 'pending'
    )
    UPDATE public.spelling_weekly_review_items item
    SET decision = 'rejected', auto_reason = 'duplicate', decided_at = NOW(), decided_by = NULL
    FROM ranked
    WHERE ranked.id = item.id AND ranked.rank_in_group > 1 AND ranked.triage_locked IS FALSE;
    GET DIAGNOSTICS v_count = ROW_COUNT; v_closed := v_closed + v_count;

    RETURN v_closed;
END;
$$;
REVOKE ALL ON FUNCTION public.spelling_weekly_auto_triage_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spelling_weekly_auto_triage_v1() TO service_role;

CREATE OR REPLACE FUNCTION public.spelling_weekly_auto_triage_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- 정리 자체가 이 표를 고치므로 되부름을 막는다.
    IF pg_trigger_depth() > 1 THEN
        RETURN NULL;
    END IF;
    PERFORM public.spelling_weekly_auto_triage_v1();
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.spelling_weekly_auto_triage_trigger() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS spelling_weekly_items_auto_triage ON public.spelling_weekly_review_items;
CREATE TRIGGER spelling_weekly_items_auto_triage
    AFTER INSERT ON public.spelling_weekly_review_items
    FOR EACH STATEMENT EXECUTE FUNCTION public.spelling_weekly_auto_triage_trigger();

DROP TRIGGER IF EXISTS spelling_common_entries_auto_triage ON public.spelling_learning_entries;
CREATE TRIGGER spelling_common_entries_auto_triage
    AFTER INSERT OR UPDATE ON public.spelling_learning_entries
    FOR EACH STATEMENT EXECUTE FUNCTION public.spelling_weekly_auto_triage_trigger();

-- 자동으로 뺀 것을 관리자가 되돌린다. 되돌린 항목은 다시 자동으로 빠지지 않는다.
CREATE OR REPLACE FUNCTION public.admin_restore_weekly_spelling_entry_v1(p_item_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION '관리자만 되돌릴 수 있습니다.' USING ERRCODE = '42501';
    END IF;
    UPDATE public.spelling_weekly_review_items item
    SET decision = 'pending', auto_reason = NULL, decided_at = NULL, decided_by = NULL, triage_locked = TRUE
    WHERE item.id = p_item_id AND item.decision = 'rejected' AND item.auto_reason IS NOT NULL
    RETURNING item.id INTO v_id;
    IF v_id IS NULL THEN
        RAISE EXCEPTION '되돌릴 후보를 찾지 못했습니다.' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object('decision', 'pending');
END;
$$;
REVOKE ALL ON FUNCTION public.admin_restore_weekly_spelling_entry_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_restore_weekly_spelling_entry_v1(UUID) TO authenticated, service_role;

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
                -- 2026-10-01: 최신 주만이 아니라 **모든 주의** 남은 후보를 보인다(예전 주 대기 305개가 화면에 없었다).
                -- 같은 표현은 자동 정리(spelling_weekly_auto_triage_v1)가 하나만 남긴다.
                SELECT item.id, item.week_start, item.source_kinds, item.primary_source, item.expression,
                       item.source_correction, item.hit_count, item.class_count, item.similar_matches,
                       item.ai_verdict, item.ai_correct_expression, item.ai_label,
                       item.ai_explanation, item.ai_examples, item.ai_reason, item.cache_hit,
                       item.created_at,
                       public.spelling_weekly_item_is_priority(item.class_count, item.hit_count) AS is_priority
                FROM public.spelling_weekly_review_items item
                WHERE item.decision = 'pending'
                ORDER BY item.week_start DESC, item.created_at DESC
                LIMIT 500
            ) item_row
        ), '[]'::JSONB),
        -- 자동으로 뺀 것(최근 200). 관리자가 보고 되돌릴 수 있다.
        'auto_closed', COALESCE((
            SELECT jsonb_agg(to_jsonb(closed_row) ORDER BY closed_row.decided_at DESC)
            FROM (
                SELECT item.id, item.week_start, item.expression, item.source_correction,
                       item.ai_verdict, item.ai_correct_expression, item.ai_reason,
                       item.class_count, item.hit_count, item.auto_reason, item.decided_at
                FROM public.spelling_weekly_review_items item
                WHERE item.decision = 'rejected' AND item.auto_reason IS NOT NULL
                ORDER BY item.decided_at DESC
                LIMIT 200
            ) closed_row
        ), '[]'::JSONB),
        'auto_closed_count', (
            SELECT count(*) FROM public.spelling_weekly_review_items item
            WHERE item.decision = 'rejected' AND item.auto_reason IS NOT NULL
        ),
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

CREATE OR REPLACE FUNCTION public.admin_get_spelling_weekly_intake_v1()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_since TIMESTAMPTZ;
    v_week DATE;
    v_current public.spelling_weekly_review_runs%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION '관리자만 볼 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    -- 이번 주 월요일. start 함수가 월요일만 받으므로 화면도 같은 값을 보여 준다.
    v_week := (CURRENT_DATE - ((EXTRACT(ISODOW FROM CURRENT_DATE)::INTEGER - 1) || ' days')::INTERVAL)::DATE;

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
        'current_done_count', COALESCE(v_current.ai_reviewed_count, 0),
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
$$;

REVOKE ALL ON FUNCTION public.admin_get_spelling_promotion_workspace_v3() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_spelling_promotion_workspace_v3() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_get_spelling_weekly_intake_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_spelling_weekly_intake_v1() TO authenticated, service_role;

-- 지금까지 쌓인 대기 후보를 한 번 정리한다.
SELECT public.spelling_weekly_auto_triage_v1();

NOTIFY pgrst, 'reload schema';

COMMIT;
