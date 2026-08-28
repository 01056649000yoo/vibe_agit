-- 관리자가 "이번에 AI 를 돌릴 만한가" 를 눈으로 보고 판단하도록, 아직 검수하지 않은 원자료의 양만
-- 읽어서 돌려준다. AI 를 부르지 않고 아무것도 쓰지 않는다.
--
-- 세는 기준은 start_spelling_weekly_review_v1 과 **같아야 한다**. 다르면 화면에 보이는 수와 실제로
-- AI 에 갈 수가 어긋나 관리자의 판단이 헛돈다. 그래서 기준 시각(v_since)과 세 원자료의 조건을
-- 그 함수에서 그대로 가져왔다. 한쪽을 고치면 다른 쪽도 함께 고친다.
--
-- 다만 여기 수는 **거르기 전** 이다. 기본 500개·공통 자료와 겹치는 것은 실행할 때 코드가 뺀다.

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
        -- 이번 주 회차가 아예 없으면 v_current 의 칸이 모두 NULL 이다. NULL 비교를 그대로 두면
        -- can_run 이 참도 거짓도 아닌 NULL 로 나와 화면이 버튼을 못 정한다(2026-08-28 롤백 검증에서 잡음).
        'can_run', COALESCE(v_current.status, '') NOT IN ('ready', 'empty')
            AND NOT COALESCE(
                v_current.status = 'running' AND v_current.started_at > NOW() - INTERVAL '2 hours',
                FALSE
            ),
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
    '관리자 화면이 주간 AI 검수를 돌릴지 판단하도록 아직 검수하지 않은 원자료 수만 읽는다. AI 호출·쓰기 없음.';

NOTIFY pgrst, 'reload schema';

COMMIT;
