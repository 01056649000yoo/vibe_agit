-- 검수가 어디까지 왔는지 화면에 계속 보이게 한다.
--
-- 한 덩어리를 끝내면 알림으로 "몇 건 했고 몇 건 남았다" 를 띄웠는데, 바로 뒤에 도는 목록 새로고침이
-- 알림을 지워 버려 **아무 정보도 안 남았다**(2026-08-28 지적). 알림은 새로 고쳐도 사라진다.
--
-- 그래서 진행 수를 회차 원장에 적어 두고 화면이 그것을 읽는다. 새 칸을 만들지 않고 이미 있는
-- `collected_count`(후보 전체)와 `ai_reviewed_count`(끝낸 수)를 쓴다 — `finish_` 가 마지막에
-- 같은 뜻의 최종값으로 덮어쓰므로 뜻이 어긋나지 않는다.

BEGIN;

/**
 * 도는 중인 회차의 진행 수를 적는다. 회차를 마치지는 않는다.
 * `running` 인 회차에만 쓴다 — 이미 끝난 회차의 최종 집계를 덮어쓰면 안 된다.
 */
CREATE OR REPLACE FUNCTION public.update_spelling_weekly_progress_v1(
    p_week_start DATE,
    p_total_count INTEGER,
    p_done_count INTEGER
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
    SET collected_count = GREATEST(COALESCE(p_total_count, 0), 0),
        ai_reviewed_count = GREATEST(COALESCE(p_done_count, 0), 0)
    WHERE run.week_start = p_week_start
      AND run.status = 'running';
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

REVOKE ALL ON FUNCTION public.admin_get_spelling_weekly_intake_v1() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_spelling_weekly_progress_v1(DATE, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_spelling_weekly_intake_v1() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_spelling_weekly_progress_v1(DATE, INTEGER, INTEGER) TO service_role;

COMMENT ON FUNCTION public.update_spelling_weekly_progress_v1(DATE, INTEGER, INTEGER) IS
    '도는 중인 회차의 진행 수를 적어 관리자 화면이 어디까지 왔는지 계속 보게 한다.';

NOTIFY pgrst, 'reload schema';

COMMIT;
