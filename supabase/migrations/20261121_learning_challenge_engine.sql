-- 공통 학습 엔진 2단계 — 공식 도전(덱 마스터)의 자격·기록을 엔진이 소유한다.
--
-- ROADMAP `2단계 공식 도전`을 어휘 전용이 아니라 콘텐츠 중립으로 만든다. 도전이라는 개념(자격 판정,
-- 시도 기록, 합격 판정, 최고 기록 보존)은 속담·맞춤법에도 그대로 필요하고, 어휘에만 만들면 콘텐츠를
-- 붙일 때마다 다시 만들게 된다. 2026-08-17에 학습 상태를 엔진으로 옮긴 이유와 같다.
--
-- 이 마이그레이션이 소유하는 것:
--   · 도전 자격 — 그 묶음을 충분히 익혔는가
--   · 시도 기록과 최고 기록 — 한 번의 완전한 도전 결과를 보존한다
--   · 합격 판정 — 전체 정답률과 **직접 입력 최소 기준**을 함께 본다
-- 콘텐츠가 소유하는 것: 문제를 실제로 만드는 일(어휘는 선택 4·직접 입력 4·빈칸 4), 채점.
--
-- 설계 근거(ROADMAP):
--   · "빠른 시간·반복 클릭에는 점수나 포인트를 주지 않는다" → 소요 시간을 기록만 하고 점수에 넣지 않는다.
--   · "재도전은 부족한 낱말의 보충 수련 뒤 열고" → 실패하면 그 묶음의 익힘 비율이 다시 기준을 넘어야
--     재도전이 열린다. 같은 문제를 계속 두드려 통과하는 길을 막는다.
--   · "한 번의 완전한 도전 최고 기록을 보존한다" → 중도 종료는 최고 기록을 갱신하지 않는다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.learning_challenge_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL,
    collection_key TEXT NOT NULL,
    -- 'collection' = 묶음 하나(덱 마스터), 'summit' = 모든 묶음(어휘 마스터)
    challenge_kind TEXT NOT NULL DEFAULT 'collection',
    status TEXT NOT NULL DEFAULT 'in_progress',
    question_count SMALLINT NOT NULL DEFAULT 0,
    answered_count SMALLINT NOT NULL DEFAULT 0,
    correct_count SMALLINT NOT NULL DEFAULT 0,
    -- 직접 입력은 따로 센다. 선택형만 잘 찍어서 통과하는 것을 막는 기준이다.
    input_question_count SMALLINT NOT NULL DEFAULT 0,
    input_correct_count SMALLINT NOT NULL DEFAULT 0,
    passed BOOLEAN,
    elapsed_seconds INTEGER,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT learning_challenge_attempts_kind_check
        CHECK (challenge_kind = ANY (ARRAY['collection', 'summit'])),
    CONSTRAINT learning_challenge_attempts_status_check
        CHECK (status = ANY (ARRAY['in_progress', 'completed', 'abandoned'])),
    CONSTRAINT learning_challenge_attempts_counts_check
        CHECK (answered_count >= 0 AND correct_count >= 0 AND correct_count <= answered_count
               AND input_correct_count >= 0 AND input_correct_count <= input_question_count),
    CONSTRAINT learning_challenge_attempts_elapsed_check
        CHECK (elapsed_seconds IS NULL OR elapsed_seconds >= 0)
);

-- 한 학생이 같은 묶음에 동시에 두 도전을 열지 못하게 한다.
CREATE UNIQUE INDEX IF NOT EXISTS learning_challenge_attempts_one_open_idx
    ON public.learning_challenge_attempts (student_id, content_type, collection_key, challenge_kind)
    WHERE status = 'in_progress';
CREATE INDEX IF NOT EXISTS learning_challenge_attempts_best_idx
    ON public.learning_challenge_attempts
       (student_id, content_type, collection_key, correct_count DESC, finished_at DESC)
    WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS learning_challenge_attempts_class_idx
    ON public.learning_challenge_attempts (class_id, content_type, updated_at DESC);

ALTER TABLE public.learning_challenge_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.learning_challenge_attempts FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 도전 자격
-- ---------------------------------------------------------------------------
-- "각 층 덱의 모든 낱말을 확인하고 숙달 조건을 채운 학생만" 도전한다(ROADMAP).
-- 아직 한 번도 만나지 않은 항목이 있으면 자격이 없고, 익힘 비율이 기준 미만이어도 없다.
-- 기준 비율은 콘텐츠가 정한다(기본 0.8). 엔진은 묶음 크기를 모르므로 항목 수를 받는다.
CREATE OR REPLACE FUNCTION public.learning_engine_challenge_eligibility_v1(
    p_student_id UUID,
    p_class_id UUID,
    p_content_type TEXT,
    p_collection_key TEXT,
    p_item_count INTEGER,
    p_required_mastered_ratio NUMERIC DEFAULT 0.8
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_seen INTEGER := 0;
    v_mastered INTEGER := 0;
    v_required INTEGER;
    v_items INTEGER := GREATEST(COALESCE(p_item_count, 0), 0);
    v_ratio NUMERIC := LEAST(1.0, GREATEST(0.0, COALESCE(p_required_mastered_ratio, 0.8)));
BEGIN
    SELECT count(*)::INTEGER,
           count(*) FILTER (WHERE learning_state = 'mastered')::INTEGER
      INTO v_seen, v_mastered
    FROM public.learning_item_progress
    WHERE student_id = p_student_id
      AND class_id = p_class_id
      AND content_type = p_content_type
      AND collection_key = p_collection_key;

    v_required := CEIL(v_items * v_ratio)::INTEGER;

    RETURN jsonb_build_object(
        'version', 1,
        'eligible', v_items > 0 AND v_seen >= v_items AND v_mastered >= v_required,
        'item_count', v_items,
        'seen_count', v_seen,
        'mastered_count', v_mastered,
        'required_mastered', v_required,
        -- 학생에게 "무엇이 모자란지" 그대로 보여 주기 위한 값이다.
        'unseen_count', GREATEST(v_items - v_seen, 0),
        'missing_mastered', GREATEST(v_required - v_mastered, 0)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.learning_engine_challenge_eligibility_v1(UUID, UUID, TEXT, TEXT, INTEGER, NUMERIC)
    FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 합격 판정
-- ---------------------------------------------------------------------------
-- 전체 정답률과 직접 입력 정답률을 **함께** 본다. 선택형만 찍어서 통과하지 못하게 하려는 기준이라
-- 둘 중 하나라도 못 채우면 불합격이다. 소요 시간은 합격 판정에 넣지 않는다
-- (ROADMAP: "빠른 시간·반복 클릭에는 점수나 포인트를 주지 않는다").
CREATE OR REPLACE FUNCTION public.learning_engine_challenge_passed_v1(
    p_correct_count SMALLINT,
    p_question_count SMALLINT,
    p_input_correct_count SMALLINT,
    p_input_question_count SMALLINT,
    p_required_ratio NUMERIC DEFAULT 0.75,
    p_required_input_ratio NUMERIC DEFAULT 0.5
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT COALESCE(p_question_count, 0) > 0
       AND p_correct_count >= CEIL(p_question_count * LEAST(1.0, GREATEST(0.0, COALESCE(p_required_ratio, 0.75))))
       AND (
            COALESCE(p_input_question_count, 0) = 0
            OR p_input_correct_count >= CEIL(p_input_question_count
                 * LEAST(1.0, GREATEST(0.0, COALESCE(p_required_input_ratio, 0.5))))
       );
$$;

REVOKE ALL ON FUNCTION public.learning_engine_challenge_passed_v1(SMALLINT, SMALLINT, SMALLINT, SMALLINT, NUMERIC, NUMERIC)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.learning_engine_challenge_passed_v1(SMALLINT, SMALLINT, SMALLINT, SMALLINT, NUMERIC, NUMERIC)
    TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 최고 기록 조회
-- ---------------------------------------------------------------------------
-- "한 번의 완전한 도전 최고 기록을 보존한다"(ROADMAP). 중도 종료(abandoned)는 세지 않는다.
CREATE OR REPLACE FUNCTION public.learning_engine_challenge_best_v1(
    p_student_id UUID,
    p_class_id UUID,
    p_content_type TEXT,
    p_collection_key TEXT,
    p_challenge_kind TEXT DEFAULT 'collection'
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (SELECT jsonb_build_object(
            'version', 1,
            'attempt_id', attempt.id,
            'correct_count', attempt.correct_count,
            'question_count', attempt.question_count,
            'input_correct_count', attempt.input_correct_count,
            'input_question_count', attempt.input_question_count,
            'passed', attempt.passed,
            'elapsed_seconds', attempt.elapsed_seconds,
            'finished_at', attempt.finished_at
         )
         FROM public.learning_challenge_attempts attempt
         WHERE attempt.student_id = p_student_id
           AND attempt.class_id = p_class_id
           AND attempt.content_type = p_content_type
           AND attempt.collection_key = p_collection_key
           AND attempt.challenge_kind = p_challenge_kind
           AND attempt.status = 'completed'
         ORDER BY attempt.passed DESC NULLS LAST, attempt.correct_count DESC, attempt.finished_at DESC
         LIMIT 1),
        jsonb_build_object('version', 1, 'attempt_id', NULL, 'passed', NULL)
    );
$$;

REVOKE ALL ON FUNCTION public.learning_engine_challenge_best_v1(UUID, UUID, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 도전 열기 / 끝내기
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.learning_engine_open_challenge_v1(
    p_student_id UUID,
    p_class_id UUID,
    p_content_type TEXT,
    p_collection_key TEXT,
    p_question_count SMALLINT,
    p_input_question_count SMALLINT,
    p_challenge_kind TEXT DEFAULT 'collection'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_open UUID;
    v_id UUID;
BEGIN
    IF COALESCE(p_question_count, 0) <= 0 THEN
        RAISE EXCEPTION '도전 문항 수가 필요합니다.' USING ERRCODE = '22023';
    END IF;

    -- 이미 열린 도전이 있으면 새로 만들지 않고 이어서 쓴다(새로고침·재접속 대비).
    SELECT id INTO v_open
    FROM public.learning_challenge_attempts
    WHERE student_id = p_student_id
      AND content_type = p_content_type
      AND collection_key = p_collection_key
      AND challenge_kind = p_challenge_kind
      AND status = 'in_progress';
    IF v_open IS NOT NULL THEN
        RETURN v_open;
    END IF;

    INSERT INTO public.learning_challenge_attempts (
        student_id, class_id, content_type, collection_key, challenge_kind,
        question_count, input_question_count
    ) VALUES (
        p_student_id, p_class_id, p_content_type, p_collection_key, p_challenge_kind,
        p_question_count, GREATEST(COALESCE(p_input_question_count, 0), 0)
    )
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.learning_engine_open_challenge_v1(UUID, UUID, TEXT, TEXT, SMALLINT, SMALLINT, TEXT)
    FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.learning_engine_close_challenge_v1(
    p_attempt_id UUID,
    p_answered_count SMALLINT,
    p_correct_count SMALLINT,
    p_input_correct_count SMALLINT,
    p_completed BOOLEAN,
    p_required_ratio NUMERIC DEFAULT 0.75,
    p_required_input_ratio NUMERIC DEFAULT 0.5
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
           elapsed_seconds = GREATEST(EXTRACT(EPOCH FROM (v_now - started_at))::INTEGER, 0),
           finished_at = v_now,
           updated_at = v_now
     WHERE id = p_attempt_id;

    RETURN jsonb_build_object(
        'version', 1,
        'attempt_id', p_attempt_id,
        'passed', v_passed,
        'completed', COALESCE(p_completed, FALSE)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.learning_engine_close_challenge_v1(UUID, SMALLINT, SMALLINT, SMALLINT, BOOLEAN, NUMERIC, NUMERIC)
    FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
