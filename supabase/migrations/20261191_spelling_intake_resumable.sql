-- 돌다 만 회차가 관리자를 가둬 버리던 것을 푼다.
--
-- 엣지 함수가 60초 제한에 끊기면 회차가 `running` 인 채로 남는다. 그런데 화면이 보는 `can_run` 이
-- `running` 을 "지금 돌고 있음" 으로 읽어 단추를 잠갔다. 그래서 관리자에게는 **"지금 검수가 돌고
-- 있습니다" 라는 문구만 뜨고 아무것도 할 수 없는** 상태가 됐다(2026-08-28). 이어받기를 만들어 두고도
-- 화면에서 쓸 수가 없었다.
--
-- 이제 끝난 주(`ready`·`empty`)만 막는다. `running` 은 **이어서 할 수 있는 상태**로 보고,
-- 화면이 단추 이름을 `이어서 하기` 로 바꾼다. 같은 회차를 동시에 두 번 돌리는 것은
-- `start_` 안의 advisory lock 과 화면의 실행 중 표시가 막는다.

BEGIN;

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
GRANT EXECUTE ON FUNCTION public.admin_get_spelling_weekly_intake_v1() TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_get_spelling_weekly_intake_v1() IS
    '관리자 화면이 주간 AI 검수를 돌릴지 판단하도록 아직 검수하지 않은 원자료 수만 읽는다. AI 호출·쓰기 없음. 돌다 만 회차는 이어서 할 수 있는 상태로 알린다.';

NOTIFY pgrst, 'reload schema';

COMMIT;
