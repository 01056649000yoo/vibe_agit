-- 재도전 제한 — "부족한 낱말 보충 수련 뒤 열기"(ROADMAP).
--
-- 지금까지 시험은 진도와 **완전히 분리**돼 있었다. 세 RPC 중 어느 것도 `learning_item_progress` 를
-- 건드리지 않아, 시험에서 틀려도 그 낱말은 `완전히 익힘`으로 남고 자격도 그대로였다.
-- 그래서 떨어져도 곧바로 다시 칠 수 있었다 — 보충이 일어날 근거 자체가 없었다.
--
-- 두 가지를 넣는다.
--   ① 시험에서 틀린 낱말을 **연습에서 틀린 것과 똑같이** 다룬다(`learning_engine_record_answer_v1`).
--      새 규칙을 만들지 않고 기존 판정을 그대로 쓰므로 `다시 볼 낱말`이 되고 연습에서 먼저 나온다.
--      **맞힌 낱말은 반영하지 않는다** — 시험이 익힘을 만들어 주면 "시험과 연습을 섞지 않는다"가 깨진다.
--   ② 그 낱말이 **전부 다시 익힘이 될 때까지** 같은 도전을 다시 열지 못하게 한다.
--
-- 왜 ②가 따로 필요한가: ①만으로는 넉넉히 익힌 학생이 안 잠긴다.
-- 40낱말 층에서 자격은 익힘 32개인데, 38개를 익힌 학생이 3개 틀려도 35개라 자격이 유지된다.
-- 정상 관문은 자격이 비율이 아니라 덱마스터 10개라 아예 걸리지 않는다.
--
-- 통과했을 때도 오답을 내린다(사용자 결정). 10/12로 통과해도 틀린 2개는 아직 모르는 낱말이다.
-- 이미 받은 덱마스터·휘장은 회수하지 않는다 — `learning_challenge_attempts.passed` 는 그대로다.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. 도전 기록에 "보충해야 할 항목"을 남긴다
-- ---------------------------------------------------------------------------
-- 엔진은 항목 키를 해석하지 않는다. 콘텐츠가 준 것을 그대로 담아 두었다가 그대로 비교한다.
ALTER TABLE public.learning_challenge_attempts
    ADD COLUMN IF NOT EXISTS pending_review_items TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

COMMENT ON COLUMN public.learning_challenge_attempts.pending_review_items IS
    '이 도전에서 틀린 항목 키. 전부 다시 익힘이 될 때까지 같은 도전을 다시 열 수 없다.';

-- ---------------------------------------------------------------------------
-- 2. 도전 종료 — 틀린 항목을 함께 받는다
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.learning_engine_close_challenge_v1(
    p_attempt_id UUID,
    p_answered_count SMALLINT,
    p_correct_count SMALLINT,
    p_input_correct_count SMALLINT,
    p_completed BOOLEAN,
    p_required_ratio NUMERIC DEFAULT 0.75,
    p_required_input_ratio NUMERIC DEFAULT 0.5,
    p_wrong_item_keys TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_attempt public.learning_challenge_attempts%ROWTYPE;
    v_passed BOOLEAN;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    SELECT * INTO v_attempt
    FROM public.learning_challenge_attempts
    WHERE id = p_attempt_id AND status = 'in_progress'
    FOR UPDATE;
    IF v_attempt.id IS NULL THEN
        RAISE EXCEPTION '진행 중인 도전을 찾을 수 없습니다.' USING ERRCODE = 'P0002';
    END IF;

    -- 중도 종료는 합격으로 치지 않는다. 최고 기록도 완전한 도전만 남긴다.
    v_passed := CASE WHEN p_completed THEN public.learning_engine_challenge_passed_v1(
        p_correct_count, v_attempt.question_count,
        p_input_correct_count, v_attempt.input_question_count,
        p_required_ratio, p_required_input_ratio
    ) ELSE FALSE END;

    UPDATE public.learning_challenge_attempts
       SET status = CASE WHEN p_completed THEN 'completed' ELSE 'abandoned' END,
           answered_count = GREATEST(COALESCE(p_answered_count, 0), 0),
           correct_count = GREATEST(COALESCE(p_correct_count, 0), 0),
           input_correct_count = GREATEST(COALESCE(p_input_correct_count, 0), 0),
           passed = v_passed,
           -- 중도 종료한 도전은 보충 대상을 남기지 않는다. 끝까지 치르지 않았으므로
           -- 무엇을 모르는지 판단할 근거가 없고, 도중에 나가 잠금을 피하는 길도 막는다.
           pending_review_items = CASE
               WHEN p_completed THEN COALESCE(p_wrong_item_keys, ARRAY[]::TEXT[])
               ELSE ARRAY[]::TEXT[]
           END,
           elapsed_seconds = GREATEST(EXTRACT(EPOCH FROM (v_now - started_at))::INTEGER, 0),
           finished_at = v_now,
           updated_at = v_now
     WHERE id = p_attempt_id;

    RETURN jsonb_build_object(
        'version', 2,
        'attempt_id', p_attempt_id,
        'passed', v_passed,
        'completed', COALESCE(p_completed, FALSE)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.learning_engine_close_challenge_v1(UUID, SMALLINT, SMALLINT, SMALLINT, BOOLEAN, NUMERIC, NUMERIC, TEXT[])
    FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. 재도전 관문 — 직전 도전에서 틀린 항목이 전부 익힘인가
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.learning_engine_retry_gate_v1(
    p_student_id UUID,
    p_class_id UUID,
    p_content_type TEXT,
    p_collection_key TEXT,
    p_challenge_kind TEXT DEFAULT 'collection'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pending TEXT[];
    v_done INTEGER := 0;
    v_total INTEGER := 0;
    v_remaining TEXT[];
BEGIN
    -- **가장 최근에 끝낸** 도전 하나만 본다. 그 전 기록까지 누적하면 영원히 안 열린다.
    SELECT attempt.pending_review_items INTO v_pending
    FROM public.learning_challenge_attempts attempt
    WHERE attempt.student_id = p_student_id
      AND attempt.class_id = p_class_id
      AND attempt.content_type = p_content_type
      AND attempt.collection_key = p_collection_key
      AND attempt.challenge_kind = p_challenge_kind
      AND attempt.status = 'completed'
    ORDER BY attempt.finished_at DESC
    LIMIT 1;

    v_pending := COALESCE(v_pending, ARRAY[]::TEXT[]);
    v_total := cardinality(v_pending);

    IF v_total = 0 THEN
        RETURN jsonb_build_object(
            'version', 1, 'blocked', FALSE,
            'required_count', 0, 'done_count', 0, 'remaining_count', 0,
            'remaining_items', '[]'::JSONB);
    END IF;

    -- 항목 키는 콘텐츠 안에서 고유하므로 묶음을 가리지 않고 본다.
    -- 정상 관문의 오답은 열 개 층에 흩어져 있어 묶음을 좁히면 찾지 못한다.
    SELECT COALESCE(array_agg(item), ARRAY[]::TEXT[]) INTO v_remaining
    FROM unnest(v_pending) item
    WHERE NOT EXISTS (
        SELECT 1 FROM public.learning_item_progress progress
        WHERE progress.student_id = p_student_id
          AND progress.class_id = p_class_id
          AND progress.content_type = p_content_type
          AND progress.item_key = item
          AND progress.learning_state = 'mastered'
    );

    v_done := v_total - cardinality(v_remaining);

    RETURN jsonb_build_object(
        'version', 1,
        'blocked', cardinality(v_remaining) > 0,
        'required_count', v_total,
        'done_count', v_done,
        'remaining_count', cardinality(v_remaining),
        'remaining_items', to_jsonb(v_remaining)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.learning_engine_retry_gate_v1(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.learning_engine_retry_gate_v1(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;

COMMIT;
