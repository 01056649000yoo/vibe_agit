-- 어휘 마스터(정상) 관문 — 어휘의 탑 꼭대기에서 치는 마지막 시험.
--
-- 그동안은 10개 층의 덱마스터를 채우면 그 자리에서 어휘 마스터 휘장이 나왔다. 시험이 없으니
-- "정상에 올랐다"는 장면이 없었다. 이제 10개를 채우면 지도 꼭대기의 관문이 **열리고**,
-- 그 시험을 통과해야 휘장을 받는다.
--
-- 덱마스터와 다른 점:
--   · 출제 범위가 한 층이 아니라 **그 학년 10개 층 전체**다(ROADMAP: 모든 덱에서 고르게).
--   · 문항이 더 많고 합격선이 더 높다(기본 20문항 · 17개 정답 · 직접입력 8개 중 6개).
--   · 자격은 익힘 비율이 아니라 **현재 학년 10개 층의 덱마스터를 모두 통과**하는 것이다.
--
-- 함께 고친 것 — 직접입력 문항이 늘 덱 뒷부분에서만 나오던 문제:
--   기존 출제는 덱을 문항 수만큼 구간으로 나눈 뒤 `구간 번호 > 선택형 수`인 구간을 직접입력으로 삼았다.
--   구간 번호는 낱말 순서대로 매겨지므로 **직접입력은 항상 덱의 뒤쪽 낱말**에서 나왔다.
--   시험을 몇 번 보면 학생이 그 규칙을 알아챌 수 있고, 정상 관문에서는 9·10층에만 직접입력이
--   몰리는 결과가 된다. 어느 구간을 직접입력으로 쓸지 **무작위로 고르도록** 바꿨다.
--   합격 기록이 아직 하나도 없으므로 지금 고치는 것이 가장 값이 싸다.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. 학급 설정 — 정상 관문은 덱마스터와 따로 정한다
-- ---------------------------------------------------------------------------
-- 문항당 시간은 덱마스터 설정(`vocab_master_seconds_per_question`)을 함께 쓴다.
-- 같은 학생이 같은 속도로 푸는데 시험마다 다른 시간을 주는 것은 설명하기 어렵다.
ALTER TABLE public.classes
    ADD COLUMN IF NOT EXISTS vocab_summit_question_count SMALLINT NOT NULL DEFAULT 20,
    ADD COLUMN IF NOT EXISTS vocab_summit_input_count SMALLINT NOT NULL DEFAULT 8,
    ADD COLUMN IF NOT EXISTS vocab_summit_pass_correct SMALLINT NOT NULL DEFAULT 17,
    ADD COLUMN IF NOT EXISTS vocab_summit_pass_input SMALLINT NOT NULL DEFAULT 6;

ALTER TABLE public.classes
    DROP CONSTRAINT IF EXISTS classes_vocab_summit_settings_check;
ALTER TABLE public.classes
    ADD CONSTRAINT classes_vocab_summit_settings_check CHECK (
        vocab_summit_question_count BETWEEN 10 AND 40
        AND vocab_summit_input_count BETWEEN 0 AND vocab_summit_question_count
        AND vocab_summit_pass_correct BETWEEN 1 AND vocab_summit_question_count
        AND vocab_summit_pass_input BETWEEN 0 AND vocab_summit_input_count
    );

-- ---------------------------------------------------------------------------
-- 2. 정상 관문 묶음 키
-- ---------------------------------------------------------------------------
-- 엔진은 `collection_key` 를 해석하지 않는다. 학년별로 다른 탑이므로 학년을 키에 담는다.
CREATE OR REPLACE FUNCTION public.vocab_tower_v2_summit_key(p_grade SMALLINT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT format('g%s:summit', GREATEST(3, LEAST(6, COALESCE(p_grade, 3)))) $$;

REVOKE ALL ON FUNCTION public.vocab_tower_v2_summit_key(SMALLINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vocab_tower_v2_summit_key(SMALLINT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. 정상 관문 자격 — 현재 학년 10개 층의 덱마스터를 모두 통과했는가
-- ---------------------------------------------------------------------------
-- 엔진의 `learning_engine_grant_summit_v1` 은 콘텐츠 중립이라 "10개 묶음"만 세고 학년을 모른다.
-- 학년을 바꾸면 3학년 덱마스터 10개로 4학년 정상에 도전할 수 있게 되므로, 어댑터가 학년을 좁힌다.
-- 지금 오르는 탑의 층을 다 통과해야 그 탑의 정상에 선다.
CREATE OR REPLACE FUNCTION public.vocab_tower_v2_summit_status_v1(
    p_student_id UUID,
    p_class_id UUID,
    p_grade SMALLINT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_required SMALLINT := 10;
    v_passed INTEGER := 0;
    v_awarded TIMESTAMPTZ;
BEGIN
    SELECT count(DISTINCT attempt.collection_key)::INTEGER INTO v_passed
    FROM public.learning_challenge_attempts attempt
    WHERE attempt.student_id = p_student_id
      AND attempt.class_id = p_class_id
      AND attempt.content_type = 'vocab'
      AND attempt.challenge_kind = 'collection'
      AND attempt.status = 'completed'
      AND attempt.passed IS TRUE
      AND attempt.collection_key IN (
          -- generate_series 는 integer 를 준다. 키 함수는 SMALLINT 두 개를 받으므로 맞춰 준다.
          SELECT public.vocab_tower_v2_collection_key(p_grade, deck_number::SMALLINT)
          FROM generate_series(1, 10) deck_number
      );

    SELECT award.awarded_at INTO v_awarded
    FROM public.learning_summit_awards award
    WHERE award.student_id = p_student_id AND award.content_type = 'vocab';

    RETURN jsonb_build_object(
        'version', 1,
        'eligible', v_passed >= v_required,
        'passed_count', v_passed,
        'required_count', v_required,
        'missing_count', GREATEST(v_required - v_passed, 0),
        'awarded', v_awarded IS NOT NULL,
        'awarded_at', v_awarded
    );
END;
$$;

REVOKE ALL ON FUNCTION public.vocab_tower_v2_summit_status_v1(UUID, UUID, SMALLINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vocab_tower_v2_summit_status_v1(UUID, UUID, SMALLINT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. 덱마스터 출제 — 직접입력 구간을 무작위로 고른다
-- ---------------------------------------------------------------------------
-- 파일 머리말에 적은 편중 문제를 고친 것 외에는 20261123 과 같다.
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
                picked.item_key, picked.word, picked.definition,
                role.is_input,
                CASE WHEN role.is_input
                     THEN (ARRAY['definitionInput', 'clozeInput'])[1 + (picked.band % 2)]
                     ELSE (ARRAY['meaningChoice', 'clozeChoice'])[1 + (picked.band % 2)]
                END AS question_type,
                picked.questions -> (CASE WHEN role.is_input
                     THEN (ARRAY['definitionInput', 'clozeInput'])[1 + (picked.band % 2)]
                     ELSE (ARRAY['meaningChoice', 'clozeChoice'])[1 + (picked.band % 2)]
                END) AS question
            FROM (
                SELECT ranked.item_key, ranked.word, ranked.definition, ranked.questions, ranked.band
                FROM (
                    -- NTILE 결과를 같은 층에서 PARTITION BY 로 다시 쓰면 중첩 윈도 함수가 되어 거절된다.
                    -- 구간 계산과 구간별 뽑기를 단계로 나눈다.
                    SELECT banded.*,
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
                ) ranked
                WHERE ranked.pick = 1
            ) picked
            -- 어느 구간을 직접입력으로 쓸지 무작위로 정한다(뒤쪽 낱말 편중 제거).
            JOIN (
                SELECT band,
                       (ROW_NUMBER() OVER (ORDER BY random()) <= v_class.vocab_master_input_count) AS is_input
                FROM generate_series(1, v_class.vocab_master_question_count) band
            ) role ON role.band = picked.band
        ) chosen
        WHERE chosen.question IS NOT NULL;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'version', 1,
        'challenge_kind', 'collection',
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
-- 5. 정상 관문 시작 — 10개 층 전체에서 고르게 출제
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_my_vocab_master_summit_v1()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student public.students%ROWTYPE;
    v_class public.classes%ROWTYPE;
    v_grade SMALLINT;
    v_key TEXT;
    v_status JSONB;
    v_attempt UUID;
    v_existing INTEGER;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
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

    v_grade := v_class.vocab_tower_grade::SMALLINT;
    v_status := public.vocab_tower_v2_summit_status_v1(v_student.id, v_student.class_id, v_grade);

    IF (v_status->>'awarded')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE, 'error', '이미 어휘 마스터가 되었어요.', 'summit', v_status);
    END IF;
    IF NOT (v_status->>'eligible')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE, 'error', '아직 어휘 마스터에 도전할 수 없어요.', 'summit', v_status);
    END IF;

    v_key := public.vocab_tower_v2_summit_key(v_grade);
    v_attempt := public.learning_engine_open_challenge_v1(
        v_student.id, v_student.class_id, 'vocab', v_key,
        v_class.vocab_summit_question_count, v_class.vocab_summit_input_count, 'summit');

    SELECT count(*)::INTEGER INTO v_existing
    FROM public.vocab_master_questions WHERE attempt_id = v_attempt;

    IF v_existing = 0 THEN
        -- 10개 층 낱말을 층·순서대로 한 줄로 세운 뒤 문항 수만큼 구간으로 나눈다.
        -- 20문항이면 층마다 2문항이 되어 어느 층도 빠지지 않는다.
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
                picked.item_key, picked.word, picked.definition,
                role.is_input,
                CASE WHEN role.is_input
                     THEN (ARRAY['definitionInput', 'clozeInput'])[1 + (picked.band % 2)]
                     ELSE (ARRAY['meaningChoice', 'clozeChoice'])[1 + (picked.band % 2)]
                END AS question_type,
                picked.questions -> (CASE WHEN role.is_input
                     THEN (ARRAY['definitionInput', 'clozeInput'])[1 + (picked.band % 2)]
                     ELSE (ARRAY['meaningChoice', 'clozeChoice'])[1 + (picked.band % 2)]
                END) AS question
            FROM (
                SELECT ranked.item_key, ranked.word, ranked.definition, ranked.questions, ranked.band
                FROM (
                    SELECT banded.*,
                           ROW_NUMBER() OVER (PARTITION BY banded.band ORDER BY random()) AS pick
                    FROM (
                        SELECT
                            item.item_key, item.word, item.definition, item.questions,
                            NTILE(v_class.vocab_summit_question_count)
                                OVER (ORDER BY deck.deck_number, item.item_order, item.item_key) AS band
                        FROM public.vocab_tower_v2_review_items item
                        JOIN public.vocab_tower_v2_review_decks deck ON deck.deck_id = item.deck_id
                        WHERE deck.grade = v_grade
                          AND deck.review_status = 'locked'
                          AND item.questions IS NOT NULL
                    ) banded
                ) ranked
                WHERE ranked.pick = 1
            ) picked
            JOIN (
                SELECT band,
                       (ROW_NUMBER() OVER (ORDER BY random()) <= v_class.vocab_summit_input_count) AS is_input
                FROM generate_series(1, v_class.vocab_summit_question_count) band
            ) role ON role.band = picked.band
        ) chosen
        WHERE chosen.question IS NOT NULL;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'version', 1,
        'challenge_kind', 'summit',
        'attempt_id', v_attempt,
        'question_count', (SELECT count(*) FROM public.vocab_master_questions WHERE attempt_id = v_attempt),
        'seconds_per_question', v_class.vocab_master_seconds_per_question,
        'pass_correct', v_class.vocab_summit_pass_correct,
        'pass_input', v_class.vocab_summit_pass_input
    );
END;
$$;

REVOKE ALL ON FUNCTION public.start_my_vocab_master_summit_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_my_vocab_master_summit_v1() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. 덱마스터 종료 — 정상 휘장을 더 이상 여기서 주지 않는다
-- ---------------------------------------------------------------------------
-- 10개를 채우면 휘장 대신 **정상 관문이 열린다**. 휘장은 그 시험을 통과해야 받는다.
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
    v_summit JSONB;
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

    v_summit := public.vocab_tower_v2_summit_status_v1(
        v_student.id, v_student.class_id, v_class.vocab_tower_grade::SMALLINT);

    SELECT COALESCE(jsonb_agg(jsonb_build_object('word', word, 'definition', definition)
                              ORDER BY sequence_number), '[]'::JSONB)
      INTO v_wrong
    FROM public.vocab_master_questions
    WHERE attempt_id = p_attempt_id AND student_id = v_student.id AND is_correct IS NOT TRUE;

    RETURN v_result || jsonb_build_object(
        'challenge_kind', 'collection',
        'correct_count', v_correct,
        'question_count', v_class.vocab_master_question_count,
        'input_correct_count', v_input_correct,
        'input_question_count', v_class.vocab_master_input_count,
        -- 이번 합격으로 정상 관문이 막 열렸는지 결과 화면이 알아야 축하 문구를 띄운다.
        'summit_unlocked', (v_result->>'passed')::BOOLEAN AND (v_summit->>'eligible')::BOOLEAN
                           AND NOT (v_summit->>'awarded')::BOOLEAN,
        'summit', v_summit,
        'wrong_items', v_wrong
    );
END;
$$;

REVOKE ALL ON FUNCTION public.finish_my_vocab_tower_master_v1(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_my_vocab_tower_master_v1(UUID, BOOLEAN) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. 정상 관문 종료 — 통과하면 어휘 마스터 휘장
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finish_my_vocab_master_summit_v1(
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
    v_awarded BOOLEAN := FALSE;
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
        (v_class.vocab_summit_pass_correct::NUMERIC / NULLIF(v_class.vocab_summit_question_count, 0)),
        (v_class.vocab_summit_pass_input::NUMERIC / NULLIF(v_class.vocab_summit_input_count, 0))
    );

    -- 엔진 쪽 검사(10개 묶음 통과)를 한 번 더 통과해야 휘장이 나간다. 시험만 잘 봐서 되는 것이 아니다.
    IF (v_result->>'passed')::BOOLEAN THEN
        v_awarded := public.learning_engine_grant_summit_v1(v_student.id, v_student.class_id, 'vocab');
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('word', word, 'definition', definition)
                              ORDER BY sequence_number), '[]'::JSONB)
      INTO v_wrong
    FROM public.vocab_master_questions
    WHERE attempt_id = p_attempt_id AND student_id = v_student.id AND is_correct IS NOT TRUE;

    RETURN v_result || jsonb_build_object(
        'challenge_kind', 'summit',
        'correct_count', v_correct,
        'question_count', v_class.vocab_summit_question_count,
        'input_correct_count', v_input_correct,
        'input_question_count', v_class.vocab_summit_input_count,
        'summit_reached', v_awarded,
        'wrong_items', v_wrong
    );
END;
$$;

REVOKE ALL ON FUNCTION public.finish_my_vocab_master_summit_v1(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_my_vocab_master_summit_v1(UUID, BOOLEAN) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. 지도 개요 — 층별 덱마스터 상태와 정상 관문 상태를 함께 내려보낸다
-- ---------------------------------------------------------------------------
-- 지금까지 화면이 `mastered_count >= item_count * 0.8` 을 **직접 계산**해 버튼을 그렸다.
-- 교사가 자격 비율을 바꿔도 화면은 0.80 으로 그리고, `모든 낱말을 한 번은 만나야` 조건은
-- 화면에 아예 없었다. 자격 판단은 서버 한 곳에서만 하고 화면은 받아 쓴다.
-- (운영 함수 원문을 뜬 뒤 필요한 부분만 덧붙였다.)

CREATE OR REPLACE FUNCTION public.get_my_vocab_tower_v2_overview_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID := public.auth_user_class_id();
    v_grade SMALLINT;
    v_enabled BOOLEAN;
    v_deck_reward_points INTEGER;
    v_master_ratio NUMERIC;
    v_class_row public.classes%ROWTYPE;
    v_summit JSONB;
    v_passed_keys JSONB;
    v_decks JSONB;
    v_earned_keys JSONB;
    v_active public.vocab_tower_runs%ROWTYPE;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL OR v_class_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT
        LEAST(6, GREATEST(3, COALESCE(class.vocab_tower_grade, 3)))::SMALLINT,
        CASE
            WHEN class.enabled_modules IS NULL THEN COALESCE(class.vocab_tower_enabled, FALSE)
            ELSE 'vocab-tower' = ANY(class.enabled_modules)
        END,
        LEAST(500, GREATEST(0, COALESCE(class.vocab_tower_v2_perfect_reward_points, 100)))
      INTO v_grade, v_enabled, v_deck_reward_points
    FROM public.classes class
    WHERE class.id = v_class_id
      AND class.vocab_tower_content_version = 'v2'
      AND class.deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION '이 학급은 V2 개인 연습을 사용하지 않습니다.' USING ERRCODE = '55000';
    END IF;
    IF NOT COALESCE(v_enabled, FALSE) THEN
        RETURN jsonb_build_object('success', FALSE, 'error', '선생님이 지금은 어휘의 탑을 열어두지 않았어요.');
    END IF;

    SELECT class.* INTO v_class_row FROM public.classes class WHERE class.id = v_class_id;
    v_master_ratio := v_class_row.vocab_master_required_mastered_ratio;

    -- 지도가 층마다 "덱마스터 통과함"을 표시해야 한다. 층마다 따로 세지 않고 한 번에 모은다.
    SELECT COALESCE(jsonb_object_agg(attempt.collection_key, TRUE), '{}'::JSONB)
      INTO v_passed_keys
    FROM (
        SELECT DISTINCT attempt.collection_key
        FROM public.learning_challenge_attempts attempt
        WHERE attempt.student_id = v_student_id
          AND attempt.class_id = v_class_id
          AND attempt.content_type = 'vocab'
          AND attempt.challenge_kind = 'collection'
          AND attempt.status = 'completed'
          AND attempt.passed IS TRUE
    ) attempt;

    v_summit := public.vocab_tower_v2_summit_status_v1(v_student_id, v_class_id, v_grade);

    -- 층마다 네 구간을 따로 조회하지 않도록 이 학생의 지급 이력 키를 한 번에 모아 둔다.
    SELECT COALESCE(jsonb_object_agg(point_log.event_key, TRUE), '{}'::JSONB)
      INTO v_earned_keys
    FROM (
        SELECT DISTINCT point_log.event_key
        FROM public.point_logs point_log
        WHERE point_log.student_id = v_student_id
          AND (point_log.event_key LIKE 'vocab-v2-progress:%' OR point_log.event_key LIKE 'vocab-v2-perfect:%')
    ) point_log;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'deck_number', deck.deck_number,
        'deck_id', deck.deck_id,
        'item_count', COALESCE(item_stats.item_count, 0),
        'seen_count', COALESCE(learning_stats.seen_count, 0),
        'learning_count', COALESCE(learning_stats.learning_count, 0),
        'familiar_count', COALESCE(learning_stats.familiar_count, 0),
        'needs_review_count', COALESCE(learning_stats.needs_review_count, 0),
        'mastered_count', COALESCE(learning_stats.mastered_count, 0),
        'unseen_count', GREATEST(
            COALESCE(item_stats.item_count, 0) - COALESCE(learning_stats.seen_count, 0), 0
        ),
        'practice_runs', COALESCE(progress.practice_runs, 0),
        'completed_runs', COALESCE(progress.completed_runs, 0),
        'best_accuracy', COALESCE(progress.best_accuracy, 0),
        'last_accuracy', COALESCE(progress.last_accuracy, 0),
        'last_answer_count', COALESCE(progress.last_answer_count, 0),
        'last_practiced_at', progress.last_practiced_at,
        'deck_reward_points', v_deck_reward_points,
        'earned_reward_points', COALESCE(reward_stats.earned_points, 0),
        'next_milestone_percent', reward_stats.next_percent,
        'next_milestone_threshold', reward_stats.next_threshold,
        'next_milestone_points', reward_stats.next_points,
        'next_milestone_remaining', GREATEST(
            COALESCE(reward_stats.next_threshold, 0) - COALESCE(learning_stats.mastered_count, 0), 0
        ),
        'reward_completed', reward_stats.next_percent IS NULL,
        -- 덱마스터 도전 자격. 화면은 버튼을 늘 보여 주고, 잠긴 이유를 이 값들로 설명한다.
        'master_passed', COALESCE(v_passed_keys ? public.vocab_tower_v2_collection_key(v_grade, deck.deck_number), FALSE),
        'master_required_mastered', CEIL(COALESCE(item_stats.item_count, 0) * v_master_ratio)::INTEGER,
        'master_missing_mastered', GREATEST(
            CEIL(COALESCE(item_stats.item_count, 0) * v_master_ratio)::INTEGER
                - COALESCE(learning_stats.mastered_count, 0), 0),
        'master_eligible', COALESCE(item_stats.item_count, 0) > 0
            AND COALESCE(learning_stats.seen_count, 0) >= COALESCE(item_stats.item_count, 0)
            AND COALESCE(learning_stats.mastered_count, 0)
                >= CEIL(COALESCE(item_stats.item_count, 0) * v_master_ratio)::INTEGER
    ) ORDER BY deck.deck_number), '[]'::JSONB)
      INTO v_decks
    FROM public.vocab_tower_v2_review_decks deck
    LEFT JOIN public.learning_collection_progress progress
      ON progress.student_id = v_student_id
     AND progress.class_id = v_class_id
     AND progress.content_type = 'vocab'
     AND progress.collection_key = public.vocab_tower_v2_collection_key(v_grade, deck.deck_number)
    LEFT JOIN LATERAL (
        SELECT count(*)::INTEGER AS item_count
        FROM public.vocab_tower_v2_review_items item
        WHERE item.deck_id = deck.deck_id
    ) item_stats ON TRUE
    LEFT JOIN LATERAL (
        SELECT
            count(*)::INTEGER AS seen_count,
            count(*) FILTER (WHERE item_progress.learning_state = 'learning')::INTEGER AS learning_count,
            count(*) FILTER (WHERE item_progress.learning_state = 'familiar')::INTEGER AS familiar_count,
            count(*) FILTER (WHERE item_progress.learning_state = 'needs_review')::INTEGER AS needs_review_count,
            count(*) FILTER (WHERE item_progress.learning_state = 'mastered')::INTEGER AS mastered_count
        FROM public.learning_item_progress item_progress
        WHERE item_progress.student_id = v_student_id
          AND item_progress.class_id = v_class_id
          AND item_progress.content_type = 'vocab'
          AND item_progress.collection_key = public.vocab_tower_v2_collection_key(v_grade, deck.deck_number)
    ) learning_stats ON TRUE
    LEFT JOIN LATERAL (
        SELECT
            COALESCE(SUM(milestone.reward_points) FILTER (WHERE milestone.earned_flag), 0)::INTEGER AS earned_points,
            (ARRAY_AGG(milestone.milestone_percent ORDER BY milestone.milestone_percent)
                FILTER (WHERE NOT milestone.earned_flag AND milestone.mastered_threshold > 0))[1] AS next_percent,
            (ARRAY_AGG(milestone.mastered_threshold ORDER BY milestone.milestone_percent)
                FILTER (WHERE NOT milestone.earned_flag AND milestone.mastered_threshold > 0))[1] AS next_threshold,
            (ARRAY_AGG(milestone.reward_points ORDER BY milestone.milestone_percent)
                FILTER (WHERE NOT milestone.earned_flag AND milestone.mastered_threshold > 0))[1] AS next_points
        FROM (
            SELECT
                source.milestone_percent,
                source.mastered_threshold,
                source.reward_points,
                (
                    v_earned_keys ? format(
                        'vocab-v2-progress:%s:%s:%s:%s',
                        v_class_id, v_grade, deck.deck_number, source.milestone_percent
                    )
                    OR v_earned_keys ? format(
                        'vocab-v2-perfect:%s:%s:%s', v_class_id, v_grade, deck.deck_number
                    )
                ) AS earned_flag
            FROM public.vocab_tower_v2_progress_milestones_v1(
                COALESCE(item_stats.item_count, 0), v_deck_reward_points
            ) source
        ) milestone
    ) reward_stats ON TRUE
    WHERE deck.grade = v_grade
      AND deck.review_status = 'locked';

    IF jsonb_array_length(v_decks) <> 10 THEN
        RAISE EXCEPTION '잠긴 V2 덱 10개가 필요합니다.' USING ERRCODE = '55000';
    END IF;

    SELECT run.* INTO v_active
    FROM public.vocab_tower_runs run
    WHERE run.student_id = v_student_id
      AND run.class_id = v_class_id
      AND run.status = 'active'
      AND run.content_version = 'v2'
      AND run.v2_deck_number IS NOT NULL
    ORDER BY run.created_at DESC
    LIMIT 1;

    RETURN jsonb_build_object(
        'success', TRUE,
        'grade', v_grade,
        'practice_question_count', 12,
        'deck_reward_points', v_deck_reward_points,
        'master_settings', jsonb_build_object(
            'required_mastered_ratio', v_master_ratio,
            'question_count', v_class_row.vocab_master_question_count,
            'input_count', v_class_row.vocab_master_input_count,
            'pass_correct', v_class_row.vocab_master_pass_correct,
            'pass_input', v_class_row.vocab_master_pass_input,
            'seconds_per_question', v_class_row.vocab_master_seconds_per_question
        ),
        'summit_settings', jsonb_build_object(
            'question_count', v_class_row.vocab_summit_question_count,
            'input_count', v_class_row.vocab_summit_input_count,
            'pass_correct', v_class_row.vocab_summit_pass_correct,
            'pass_input', v_class_row.vocab_summit_pass_input,
            'seconds_per_question', v_class_row.vocab_master_seconds_per_question
        ),
        'summit', v_summit,
        'decks', v_decks,
        'active_run', CASE WHEN v_active.id IS NULL THEN NULL ELSE jsonb_build_object(
            'run_id', v_active.id,
            'deck_number', v_active.v2_deck_number,
            'target_question_count', v_active.target_question_count,
            'answer_count', v_active.answer_count,
            'correct_count', v_active.correct_count,
            'wrong_count', v_active.wrong_count,
            'current_combo', v_active.current_combo,
            'max_combo', v_active.max_combo
        ) END
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_vocab_tower_v2_overview_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_vocab_tower_v2_overview_v1() TO authenticated, service_role;

COMMIT;
