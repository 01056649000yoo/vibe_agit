-- 어휘 어댑터 — 덱마스터 시험 출제·채점.
--
-- 엔진(20261121)은 자격·합격·기록을 갖고, 문제를 만드는 일은 콘텐츠가 한다. 이 파일이 그 부분이다.
-- 어휘는 1,573개 항목에 5가지 형태 문항이 이미 검수돼 있으므로 출제는 **만드는 게 아니라 고르는 일**이다.
--
-- 출제 방식(고르게 분산): 덱을 12구간으로 나눠 구간마다 하나씩 뽑는다. 개인 연습의 약점 우선 출제와
-- 일부러 다르게 했다. 시험은 공정한 표본이어야 하는데 약점만 모아 내면 자격을 얻은 학생도 부당하게 어렵다.
--
-- 난이도(사용자와 정한 값, 교사가 조정 가능):
--   · 12문항 = 선택형 7(뜻 고르기 3 + 빈칸 고르기 4) + 직접 입력 5(뜻→낱말, 빈칸 채우기)
--   · 합격 = 전체 10/12 **그리고** 직접 입력 3/5
--     두 기준을 함께 두는 이유는 선택형만 찍어서 통과하는 길을 막기 위해서다.
--   · 문항당 45초. 전체 시간을 재지 않는 이유는 ROADMAP의 "빠른 시간에 점수를 주지 않는다"와
--     "같은 SP는 시간으로 가르지 않는다"에 맞추기 위해서다. 찾아볼 여유는 없고 생각할 여유는 준다.
--   · 2문항까지 틀려도 통과한다. 만점을 요구하면 실수 한 번에 좌절하고, 8/12면 대충 해도 통과한다.
--
-- 이 값들은 첫 추정치다. 실제 학급이 치는 것을 보고 마이그레이션 없이 조정할 수 있게 학급 설정으로 뺐다.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. 학급 설정
-- ---------------------------------------------------------------------------
ALTER TABLE public.classes
    ADD COLUMN IF NOT EXISTS vocab_master_question_count SMALLINT NOT NULL DEFAULT 12,
    ADD COLUMN IF NOT EXISTS vocab_master_input_count SMALLINT NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS vocab_master_pass_correct SMALLINT NOT NULL DEFAULT 10,
    ADD COLUMN IF NOT EXISTS vocab_master_pass_input SMALLINT NOT NULL DEFAULT 3,
    ADD COLUMN IF NOT EXISTS vocab_master_seconds_per_question SMALLINT NOT NULL DEFAULT 45,
    ADD COLUMN IF NOT EXISTS vocab_master_required_mastered_ratio NUMERIC(3,2) NOT NULL DEFAULT 0.80;

ALTER TABLE public.classes
    DROP CONSTRAINT IF EXISTS classes_vocab_master_settings_check;
ALTER TABLE public.classes
    ADD CONSTRAINT classes_vocab_master_settings_check CHECK (
        vocab_master_question_count BETWEEN 5 AND 30
        AND vocab_master_input_count BETWEEN 0 AND vocab_master_question_count
        AND vocab_master_pass_correct BETWEEN 1 AND vocab_master_question_count
        AND vocab_master_pass_input BETWEEN 0 AND vocab_master_input_count
        AND vocab_master_seconds_per_question BETWEEN 10 AND 300
        AND vocab_master_required_mastered_ratio BETWEEN 0.50 AND 1.00
    );

-- ---------------------------------------------------------------------------
-- 2. 시험 문항
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vocab_master_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID NOT NULL REFERENCES public.learning_challenge_attempts(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    sequence_number SMALLINT NOT NULL,
    item_key TEXT NOT NULL,
    question_type TEXT NOT NULL,
    is_input BOOLEAN NOT NULL,
    prompt TEXT NOT NULL,
    options JSONB,
    accepted_answers TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    word TEXT NOT NULL,
    definition TEXT,
    answered_at TIMESTAMPTZ,
    submitted_answer TEXT,
    is_correct BOOLEAN,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (attempt_id, sequence_number)
);

CREATE INDEX IF NOT EXISTS vocab_master_questions_attempt_idx
    ON public.vocab_master_questions (attempt_id, sequence_number);

ALTER TABLE public.vocab_master_questions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.vocab_master_questions FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. 시험 시작 — 자격 확인 → 출제 → 도전 열기
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_my_vocab_tower_master_v1(p_deck_number SMALLINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student public.students%ROWTYPE;
    v_class public.classes%ROWTYPE;
    v_key TEXT;
    v_item_count INTEGER;
    v_eligibility JSONB;
    v_attempt UUID;
    v_existing INTEGER;
    v_choice_count SMALLINT;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    IF p_deck_number IS NULL OR p_deck_number NOT BETWEEN 1 AND 10 THEN
        RAISE EXCEPTION '층 번호가 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT s.* INTO v_student FROM public.students s
    WHERE s.auth_id = auth.uid() AND s.is_active IS DISTINCT FROM FALSE
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW()) LIMIT 1;
    IF v_student.id IS NULL THEN
        RAISE EXCEPTION '현재 로그인과 연결된 학생을 찾을 수 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT c.* INTO v_class FROM public.classes c
    WHERE c.id = v_student.class_id AND c.deleted_at IS NULL
      AND c.vocab_tower_enabled IS TRUE AND c.vocab_tower_content_version = 'v2';
    IF v_class.id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', '선생님이 지금은 어휘의 탑을 열어두지 않았어요.');
    END IF;

    v_key := public.vocab_tower_v2_collection_key(v_class.vocab_tower_grade::SMALLINT, p_deck_number);

    SELECT count(*)::INTEGER INTO v_item_count
    FROM public.vocab_tower_v2_review_items item
    JOIN public.vocab_tower_v2_review_decks deck ON deck.deck_id = item.deck_id
    WHERE deck.grade = v_class.vocab_tower_grade AND deck.deck_number = p_deck_number;

    v_eligibility := public.learning_engine_challenge_eligibility_v1(
        v_student.id, v_student.class_id, 'vocab', v_key, v_item_count,
        v_class.vocab_master_required_mastered_ratio);

    IF NOT (v_eligibility->>'eligible')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE, 'error', '아직 덱마스터에 도전할 수 없어요.', 'eligibility', v_eligibility);
    END IF;

    v_attempt := public.learning_engine_open_challenge_v1(
        v_student.id, v_student.class_id, 'vocab', v_key,
        v_class.vocab_master_question_count, v_class.vocab_master_input_count);

    -- 이미 문항이 만들어져 있으면 다시 뽑지 않는다(새로고침·재접속 시 같은 시험을 이어서 본다).
    SELECT count(*)::INTEGER INTO v_existing
    FROM public.vocab_master_questions WHERE attempt_id = v_attempt;

    IF v_existing = 0 THEN
        v_choice_count := v_class.vocab_master_question_count - v_class.vocab_master_input_count;

        -- 덱을 문항 수만큼 구간으로 나눠 구간마다 하나씩 뽑는다(고르게 분산).
        -- 앞쪽 구간에는 선택형, 뒤쪽에는 직접 입력을 배정한 뒤 출제 순서는 섞는다.
        INSERT INTO public.vocab_master_questions (
            attempt_id, student_id, class_id, sequence_number, item_key,
            question_type, is_input, prompt, options, accepted_answers, word, definition
        )
        SELECT
            v_attempt, v_student.id, v_student.class_id,
            ROW_NUMBER() OVER (ORDER BY random())::SMALLINT,
            chosen.item_key, chosen.question_type, chosen.is_input,
            chosen.question->>'prompt',
            CASE WHEN chosen.is_input THEN NULL ELSE chosen.question->'options' END,
            CASE
                WHEN chosen.is_input THEN COALESCE(
                    ARRAY(SELECT jsonb_array_elements_text(chosen.question->'acceptedAnswers')),
                    ARRAY[chosen.word])
                ELSE ARRAY(SELECT option->>'value'
                           FROM jsonb_array_elements(chosen.question->'options') option
                           WHERE (option->>'isCorrect')::BOOLEAN)
            END,
            chosen.word, chosen.definition
        FROM (
            SELECT
                one_per_band.item_key, one_per_band.word, one_per_band.definition,
                one_per_band.is_input, one_per_band.question_type,
                one_per_band.questions -> one_per_band.question_type AS question
            FROM (
                SELECT
                    banded.item_key, banded.word, banded.definition, banded.questions,
                    (banded.band > v_choice_count) AS is_input,
                    CASE WHEN banded.band > v_choice_count
                         THEN (ARRAY['definitionInput', 'clozeInput'])[1 + (banded.band % 2)]
                         ELSE (ARRAY['meaningChoice', 'clozeChoice'])[1 + (banded.band % 2)]
                    END AS question_type,
                    ROW_NUMBER() OVER (PARTITION BY banded.band ORDER BY random()) AS pick
                FROM (
                    SELECT
                        item.item_key, item.word, item.definition, item.questions,
                        NTILE(v_class.vocab_master_question_count)
                            OVER (ORDER BY item.item_order, item.item_key) AS band
                    FROM public.vocab_tower_v2_review_items item
                    JOIN public.vocab_tower_v2_review_decks deck ON deck.deck_id = item.deck_id
                    WHERE deck.grade = v_class.vocab_tower_grade
                      AND deck.deck_number = p_deck_number
                      AND item.questions IS NOT NULL
                ) banded
            ) one_per_band
            WHERE one_per_band.pick = 1
        ) chosen
        WHERE chosen.question IS NOT NULL;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'version', 1,
        'attempt_id', v_attempt,
        'deck_number', p_deck_number,
        'question_count', (SELECT count(*) FROM public.vocab_master_questions WHERE attempt_id = v_attempt),
        'seconds_per_question', v_class.vocab_master_seconds_per_question,
        'pass_correct', v_class.vocab_master_pass_correct,
        'pass_input', v_class.vocab_master_pass_input
    );
END;
$$;

REVOKE ALL ON FUNCTION public.start_my_vocab_tower_master_v1(SMALLINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_my_vocab_tower_master_v1(SMALLINT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. 다음 문항 — 정답을 절대 함께 내려보내지 않는다
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_vocab_tower_master_question_v1(p_attempt_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_q public.vocab_master_questions%ROWTYPE;
    v_total INTEGER;
    v_done INTEGER;
BEGIN
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT count(*)::INTEGER, count(*) FILTER (WHERE answered_at IS NOT NULL)::INTEGER
      INTO v_total, v_done
    FROM public.vocab_master_questions
    WHERE attempt_id = p_attempt_id AND student_id = v_student_id;

    SELECT * INTO v_q FROM public.vocab_master_questions
    WHERE attempt_id = p_attempt_id AND student_id = v_student_id AND answered_at IS NULL
    ORDER BY sequence_number LIMIT 1;

    IF v_q.id IS NULL THEN
        RETURN jsonb_build_object('version', 1, 'finished', TRUE,
                                  'total', v_total, 'answered', v_done);
    END IF;

    -- 직접 입력 문항은 `accepted_answers`와 `word`를 내려보내면 정답이 그대로 노출된다.
    -- 선택형도 어느 보기가 정답인지 표시를 지우고 보낸다.
    RETURN jsonb_build_object(
        'version', 1, 'finished', FALSE,
        'question_id', v_q.id,
        'sequence_number', v_q.sequence_number,
        'question_type', v_q.question_type,
        'is_input', v_q.is_input,
        'prompt', v_q.prompt,
        'options', CASE WHEN v_q.is_input THEN NULL ELSE
            (SELECT jsonb_agg(option->>'value' ORDER BY random())
             FROM jsonb_array_elements(v_q.options) option) END,
        'total', v_total,
        'answered', v_done
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_vocab_tower_master_question_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_vocab_tower_master_question_v1(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. 답안 제출 — 채점은 서버가 한다
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_my_vocab_tower_master_answer_v1(
    p_question_id UUID,
    p_answer TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_q public.vocab_master_questions%ROWTYPE;
    v_correct BOOLEAN;
BEGIN
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_q FROM public.vocab_master_questions
    WHERE id = p_question_id AND student_id = v_student_id
    FOR UPDATE;
    IF v_q.id IS NULL THEN
        RAISE EXCEPTION '문항을 찾을 수 없습니다.' USING ERRCODE = 'P0002';
    END IF;
    IF v_q.answered_at IS NOT NULL THEN
        RAISE EXCEPTION '이미 답한 문항입니다.' USING ERRCODE = '23505';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.learning_challenge_attempts
                   WHERE id = v_q.attempt_id AND status = 'in_progress') THEN
        RAISE EXCEPTION '진행 중인 도전이 아닙니다.' USING ERRCODE = '22023';
    END IF;

    -- 직접 입력은 기존 어휘 정규화 규칙을 그대로 쓴다(띄어쓰기·공백 흔들림 허용).
    v_correct := EXISTS (
        SELECT 1 FROM unnest(v_q.accepted_answers) answer
        WHERE public.normalize_vocab_tower_v2_answer(answer)
            = public.normalize_vocab_tower_v2_answer(COALESCE(p_answer, ''))
    );

    UPDATE public.vocab_master_questions
       SET answered_at = NOW(), submitted_answer = left(COALESCE(p_answer, ''), 200), is_correct = v_correct
     WHERE id = p_question_id;

    -- 시험 중에는 정답을 알려 주지 않는다. 결과 화면에서 한 번에 보여 준다.
    RETURN jsonb_build_object('version', 1, 'recorded', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_my_vocab_tower_master_answer_v1(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_my_vocab_tower_master_answer_v1(UUID, TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. 시험 종료 — 합격 판정과 정상 휘장
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finish_my_vocab_tower_master_v1(
    p_attempt_id UUID,
    p_completed BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student public.students%ROWTYPE;
    v_class public.classes%ROWTYPE;
    v_answered SMALLINT; v_correct SMALLINT; v_input_correct SMALLINT;
    v_result JSONB;
    v_summit BOOLEAN := FALSE;
    v_wrong JSONB;
BEGIN
    SELECT s.* INTO v_student FROM public.students s
    WHERE s.auth_id = auth.uid() AND s.is_active IS DISTINCT FROM FALSE LIMIT 1;
    IF v_student.id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    SELECT c.* INTO v_class FROM public.classes c WHERE c.id = v_student.class_id;

    SELECT count(*) FILTER (WHERE answered_at IS NOT NULL)::SMALLINT,
           count(*) FILTER (WHERE is_correct)::SMALLINT,
           count(*) FILTER (WHERE is_correct AND is_input)::SMALLINT
      INTO v_answered, v_correct, v_input_correct
    FROM public.vocab_master_questions
    WHERE attempt_id = p_attempt_id AND student_id = v_student.id;

    v_result := public.learning_engine_close_challenge_v1(
        p_attempt_id, v_answered, v_correct, v_input_correct, p_completed,
        (v_class.vocab_master_pass_correct::NUMERIC / NULLIF(v_class.vocab_master_question_count, 0)),
        (v_class.vocab_master_pass_input::NUMERIC / NULLIF(v_class.vocab_master_input_count, 0))
    );

    -- 통과했으면 10개를 다 채웠는지 보고 정상 휘장을 준다.
    IF (v_result->>'passed')::BOOLEAN THEN
        v_summit := public.learning_engine_grant_summit_v1(v_student.id, v_student.class_id, 'vocab');
    END IF;

    -- 틀린 낱말은 결과에 담아 카드함으로 이어 준다(ROADMAP: 공식 오답은 개인 카드함으로).
    SELECT COALESCE(jsonb_agg(jsonb_build_object('word', word, 'definition', definition)
                              ORDER BY sequence_number), '[]'::JSONB)
      INTO v_wrong
    FROM public.vocab_master_questions
    WHERE attempt_id = p_attempt_id AND student_id = v_student.id AND is_correct IS NOT TRUE;

    RETURN v_result || jsonb_build_object(
        'correct_count', v_correct,
        'question_count', v_class.vocab_master_question_count,
        'input_correct_count', v_input_correct,
        'input_question_count', v_class.vocab_master_input_count,
        'summit_reached', v_summit,
        'wrong_items', v_wrong
    );
END;
$$;

REVOKE ALL ON FUNCTION public.finish_my_vocab_tower_master_v1(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_my_vocab_tower_master_v1(UUID, BOOLEAN) TO authenticated, service_role;

COMMIT;
