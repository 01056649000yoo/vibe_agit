BEGIN;

ALTER TABLE public.classes
    ADD COLUMN IF NOT EXISTS vocab_tower_content_version TEXT NOT NULL DEFAULT 'v1';

ALTER TABLE public.classes
    DROP CONSTRAINT IF EXISTS classes_vocab_tower_content_version_check;
ALTER TABLE public.classes
    ADD CONSTRAINT classes_vocab_tower_content_version_check
    CHECK (vocab_tower_content_version IN ('v1', 'v2'));

ALTER TABLE public.vocab_tower_runs
    ADD COLUMN IF NOT EXISTS content_version TEXT NOT NULL DEFAULT 'v1';

ALTER TABLE public.vocab_tower_runs
    DROP CONSTRAINT IF EXISTS vocab_tower_runs_content_version_check;
ALTER TABLE public.vocab_tower_runs
    ADD CONSTRAINT vocab_tower_runs_content_version_check
    CHECK (content_version IN ('v1', 'v2'));

CREATE TABLE IF NOT EXISTS public.vocab_tower_v2_run_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES public.vocab_tower_runs(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    item_key TEXT NOT NULL REFERENCES public.vocab_tower_v2_review_items(item_key) ON DELETE RESTRICT,
    deck_id TEXT NOT NULL REFERENCES public.vocab_tower_v2_review_decks(deck_id) ON DELETE RESTRICT,
    sequence_number SMALLINT NOT NULL CHECK (sequence_number BETWEEN 1 AND 30),
    room_type TEXT NOT NULL CHECK (room_type IN ('meaning', 'sentence', 'distinction', 'boss')),
    question_type TEXT NOT NULL CHECK (question_type IN ('meaningChoice', 'clozeChoice', 'usageDistinction')),
    prompt TEXT NOT NULL CHECK (char_length(BTRIM(prompt)) BETWEEN 1 AND 1000),
    options JSONB NOT NULL CHECK (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) BETWEEN 2 AND 6),
    correct_answer TEXT NOT NULL CHECK (char_length(BTRIM(correct_answer)) BETWEEN 1 AND 500),
    explanation TEXT NOT NULL CHECK (char_length(BTRIM(explanation)) BETWEEN 1 AND 1000),
    word TEXT NOT NULL CHECK (char_length(BTRIM(word)) BETWEEN 1 AND 50),
    definition TEXT NOT NULL CHECK (char_length(BTRIM(definition)) BETWEEN 1 AND 300),
    example TEXT NOT NULL CHECK (char_length(BTRIM(example)) BETWEEN 1 AND 500),
    difficulty SMALLINT NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
    category TEXT NOT NULL CHECK (char_length(BTRIM(category)) BETWEEN 1 AND 50),
    is_review BOOLEAN NOT NULL DEFAULT FALSE,
    answered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (run_id, sequence_number)
);

CREATE INDEX IF NOT EXISTS vocab_tower_v2_run_questions_run_created_idx
    ON public.vocab_tower_v2_run_questions(run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vocab_tower_v2_run_questions_student_created_idx
    ON public.vocab_tower_v2_run_questions(student_id, created_at DESC);

ALTER TABLE public.vocab_tower_v2_run_questions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.vocab_tower_v2_run_questions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.vocab_tower_v2_run_questions TO service_role;

COMMENT ON COLUMN public.classes.vocab_tower_content_version IS
    'v1은 기존 정적 어휘 탐험, v2는 잠긴 검수 덱을 서버가 출제·채점하는 시험 경로.';
COMMENT ON TABLE public.vocab_tower_v2_run_questions IS
    'V2 실행별 서버 발급 문항 스냅샷. 정답은 브라우저에 제출 전 노출하지 않는다.';

CREATE OR REPLACE FUNCTION public.enforce_vocab_tower_class_content_version_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_locked_decks INTEGER;
BEGIN
    IF NEW.vocab_tower_content_version IS NOT DISTINCT FROM OLD.vocab_tower_content_version THEN
        RETURN NEW;
    END IF;
    IF v_user_id IS NULL
       OR (OLD.teacher_id <> v_user_id AND public.auth_user_role() <> 'ADMIN') THEN
        RAISE EXCEPTION '어휘의 탑 출제 버전을 바꿀 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    IF NEW.vocab_tower_content_version = 'v2' THEN
        SELECT count(*)::INTEGER INTO v_locked_decks
        FROM public.vocab_tower_v2_review_decks deck
        WHERE deck.grade = NEW.vocab_tower_grade
          AND deck.review_status = 'locked';
        IF v_locked_decks <> 10 THEN
            RAISE EXCEPTION '선택 학년의 잠긴 V2 덱 10개가 필요합니다.' USING ERRCODE = '55000';
        END IF;
    END IF;

    UPDATE public.vocab_tower_runs run
       SET status = 'abandoned', finish_reason = 'exited', finished_at = NOW()
     WHERE run.class_id = OLD.id
       AND run.status = 'active';
    NEW.vocab_tower_reset_date := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_vocab_tower_class_content_version_v2 ON public.classes;
CREATE TRIGGER enforce_vocab_tower_class_content_version_v2
    BEFORE UPDATE OF vocab_tower_content_version ON public.classes
    FOR EACH ROW EXECUTE FUNCTION public.enforce_vocab_tower_class_content_version_v2();

CREATE OR REPLACE FUNCTION public.enforce_vocab_tower_run_content_version_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_expected_version TEXT;
BEGIN
    SELECT class.vocab_tower_content_version
      INTO v_expected_version
    FROM public.classes class
    WHERE class.id = NEW.class_id;

    IF v_expected_version IS NULL OR NEW.content_version IS DISTINCT FROM v_expected_version THEN
        RAISE EXCEPTION '어휘의 탑 출제 버전이 바뀌었습니다. 화면을 새로고침해주세요.'
            USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_vocab_tower_run_content_version_v2
    ON public.vocab_tower_runs;
CREATE TRIGGER enforce_vocab_tower_run_content_version_v2
    BEFORE INSERT ON public.vocab_tower_runs
    FOR EACH ROW EXECUTE FUNCTION public.enforce_vocab_tower_run_content_version_v2();

CREATE OR REPLACE FUNCTION public.set_teacher_vocab_tower_content_version_v2(
    p_class_id UUID,
    p_content_version TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_grade SMALLINT;
    v_current_version TEXT;
    v_locked_decks INTEGER;
BEGIN
    IF v_user_id IS NULL OR p_content_version NOT IN ('v1', 'v2') THEN
        RAISE EXCEPTION '어휘의 탑 출제 버전이 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT class.vocab_tower_grade, class.vocab_tower_content_version
      INTO v_grade, v_current_version
    FROM public.classes class
    WHERE class.id = p_class_id
      AND class.deleted_at IS NULL
      AND (class.teacher_id = v_user_id OR public.auth_user_role() = 'ADMIN')
    FOR UPDATE;

    IF v_grade IS NULL THEN
        RAISE EXCEPTION '어휘의 탑 설정 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    IF p_content_version = 'v2' THEN
        SELECT count(*)::INTEGER
          INTO v_locked_decks
        FROM public.vocab_tower_v2_review_decks deck
        WHERE deck.grade = v_grade
          AND deck.review_status = 'locked';
        IF v_locked_decks <> 10 THEN
            RAISE EXCEPTION '선택 학년의 잠긴 V2 덱 10개가 필요합니다.' USING ERRCODE = '55000';
        END IF;
    END IF;

    IF v_current_version IS DISTINCT FROM p_content_version THEN
        UPDATE public.classes class
           SET vocab_tower_content_version = p_content_version
         WHERE class.id = p_class_id;
    END IF;

    RETURN jsonb_build_object(
        'class_id', p_class_id,
        'content_version', p_content_version,
        'grade', v_grade,
        'locked_decks', CASE WHEN p_content_version = 'v2' THEN v_locked_decks ELSE NULL END,
        'changed', v_current_version IS DISTINCT FROM p_content_version
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.start_my_vocab_tower_v2_run()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID := public.auth_user_class_id();
    v_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::DATE;
    v_grade INTEGER;
    v_daily_limit INTEGER;
    v_time_limit INTEGER;
    v_reward_cap INTEGER;
    v_enabled BOOLEAN;
    v_reset_at TIMESTAMPTZ;
    v_attempts INTEGER;
    v_locked_decks INTEGER;
    v_run public.vocab_tower_runs%ROWTYPE;
    v_review_words TEXT[] := ARRAY[]::TEXT[];
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL OR v_class_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    PERFORM 1 FROM public.students student
    WHERE student.id = v_student_id AND student.class_id = v_class_id
    FOR UPDATE;

    SELECT
        LEAST(6, GREATEST(3, COALESCE(class.vocab_tower_grade, 3))),
        LEAST(5, GREATEST(1, COALESCE(class.vocab_tower_daily_limit, 3))),
        LEAST(120, GREATEST(30, COALESCE(class.vocab_tower_time_limit, 40))),
        LEAST(50, GREATEST(0, COALESCE(class.vocab_tower_reward_points, 50))),
        CASE
            WHEN class.enabled_modules IS NULL THEN COALESCE(class.vocab_tower_enabled, FALSE)
            ELSE 'vocab-tower' = ANY(class.enabled_modules)
        END,
        class.vocab_tower_reset_date
    INTO v_grade, v_daily_limit, v_time_limit, v_reward_cap, v_enabled, v_reset_at
    FROM public.classes class
    WHERE class.id = v_class_id
      AND class.vocab_tower_content_version = 'v2';

    IF NOT FOUND THEN
        RAISE EXCEPTION '이 학급은 V2 시험 경로를 사용하지 않습니다.' USING ERRCODE = '55000';
    END IF;
    IF NOT COALESCE(v_enabled, FALSE) THEN
        RETURN jsonb_build_object('success', FALSE, 'error', '선생님이 지금은 어휘의 탑을 열어두지 않았어요.');
    END IF;

    SELECT count(*)::INTEGER INTO v_locked_decks
    FROM public.vocab_tower_v2_review_decks deck
    WHERE deck.grade = v_grade AND deck.review_status = 'locked';
    IF v_locked_decks <> 10 THEN
        RAISE EXCEPTION '잠긴 V2 덱이 준비되지 않았습니다.' USING ERRCODE = '55000';
    END IF;

    SELECT run.* INTO v_run
    FROM public.vocab_tower_runs run
    WHERE run.student_id = v_student_id
      AND run.class_id = v_class_id
      AND run.status = 'active'
      AND run.content_version = 'v2'
      AND run.run_date = v_today
      AND (v_reset_at IS NULL OR run.created_at >= v_reset_at)
    ORDER BY run.created_at DESC
    LIMIT 1;

    IF v_run.id IS NOT NULL THEN
        SELECT COALESCE(array_agg(DISTINCT wrong_answer.word), ARRAY[]::TEXT[])
          INTO v_review_words
        FROM public.vocab_tower_answers wrong_answer
        WHERE wrong_answer.run_id = v_run.id
          AND wrong_answer.is_correct = FALSE
          AND NOT EXISTS (
              SELECT 1 FROM public.vocab_tower_answers learned_answer
              WHERE learned_answer.run_id = v_run.id
                AND learned_answer.word = wrong_answer.word
                AND learned_answer.room_type = 'boss'
                AND learned_answer.is_correct = TRUE
          );

        RETURN jsonb_build_object(
            'success', TRUE, 'resumed', TRUE, 'content_version', 'v2',
            'run_id', v_run.id, 'grade', v_run.grade,
            'answer_count', v_run.answer_count, 'correct_count', v_run.correct_count,
            'wrong_count', v_run.wrong_count, 'review_correct_count', v_run.review_correct_count,
            'current_floor', v_run.current_floor, 'current_combo', v_run.current_combo,
            'max_combo', v_run.max_combo, 'review_words', to_jsonb(v_review_words),
            'floor_time_limit', v_run.floor_time_limit, 'reward_cap', v_run.reward_cap
        );
    END IF;

    UPDATE public.vocab_tower_runs run
       SET status = 'abandoned', finish_reason = 'exited', finished_at = NOW()
     WHERE run.student_id = v_student_id AND run.status = 'active';

    SELECT count(*)::INTEGER INTO v_attempts
    FROM public.vocab_tower_runs run
    WHERE run.student_id = v_student_id
      AND run.class_id = v_class_id
      AND run.run_date = v_today
      AND (v_reset_at IS NULL OR run.created_at >= v_reset_at);

    IF v_attempts >= v_daily_limit THEN
        RETURN jsonb_build_object('success', FALSE, 'error', '오늘의 도전 기회를 모두 사용했어요.', 'remaining_attempts', 0);
    END IF;

    INSERT INTO public.vocab_tower_runs (
        student_id, class_id, run_date, grade, daily_limit, floor_time_limit,
        reward_cap, config_reset_at, content_version
    ) VALUES (
        v_student_id, v_class_id, v_today, v_grade, v_daily_limit, v_time_limit,
        v_reward_cap, v_reset_at, 'v2'
    ) RETURNING * INTO v_run;

    RETURN jsonb_build_object(
        'success', TRUE, 'resumed', FALSE, 'content_version', 'v2',
        'run_id', v_run.id, 'grade', v_run.grade,
        'answer_count', 0, 'correct_count', 0, 'wrong_count', 0,
        'review_correct_count', 0, 'current_floor', 1, 'current_combo', 0,
        'max_combo', 0, 'review_words', '[]'::JSONB,
        'floor_time_limit', v_run.floor_time_limit, 'reward_cap', v_run.reward_cap,
        'remaining_attempts', GREATEST(0, v_daily_limit - v_attempts - 1)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_next_my_vocab_tower_question_v2(
    p_run_id UUID,
    p_reduce_options BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID := public.auth_user_class_id();
    v_run public.vocab_tower_runs%ROWTYPE;
    v_existing public.vocab_tower_v2_run_questions%ROWTYPE;
    v_item public.vocab_tower_v2_review_items%ROWTYPE;
    v_deck public.vocab_tower_v2_review_decks%ROWTYPE;
    v_question JSONB;
    v_question_type TEXT;
    v_room_type TEXT;
    v_options JSONB;
    v_correct_answer TEXT;
    v_is_review BOOLEAN := FALSE;
    v_sequence SMALLINT;
    v_incorrect_limit INTEGER;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL OR v_class_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT run.* INTO v_run
    FROM public.vocab_tower_runs run
    WHERE run.id = p_run_id
      AND run.student_id = v_student_id
      AND run.class_id = v_class_id
    FOR UPDATE;

    IF NOT FOUND OR v_run.status <> 'active' OR v_run.content_version <> 'v2' THEN
        RAISE EXCEPTION '진행 중인 V2 도전을 찾을 수 없습니다.' USING ERRCODE = '22023';
    END IF;
    IF v_run.answer_count >= 30 THEN
        RAISE EXCEPTION '이미 정상까지 모든 문제를 풀었어요.' USING ERRCODE = '22023';
    END IF;

    SELECT question.* INTO v_existing
    FROM public.vocab_tower_v2_run_questions question
    WHERE question.run_id = v_run.id
      AND question.sequence_number = v_run.answer_count + 1
      AND question.answered_at IS NULL
    LIMIT 1;

    IF v_existing.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'question_key', v_existing.id,
            'room_type', v_existing.room_type,
            'question_type', v_existing.question_type,
            'prompt', v_existing.prompt,
            'options', v_existing.options,
            'word', jsonb_build_object(
                'word', v_existing.word, 'definition', v_existing.definition,
                'example', v_existing.example, 'level', v_existing.difficulty,
                'category', v_existing.category
            ),
            'is_review', v_existing.is_review
        );
    END IF;

    v_sequence := (v_run.answer_count + 1)::SMALLINT;
    v_room_type := CASE
        WHEN v_run.current_floor IN (5, 10) AND MOD(v_run.answer_count, 3) = 2 THEN 'boss'
        WHEN MOD(v_run.answer_count, 3) = 0 THEN 'meaning'
        WHEN MOD(v_run.answer_count, 3) = 1 THEN 'sentence'
        ELSE 'distinction'
    END;

    IF v_room_type = 'boss' THEN
        SELECT item.* INTO v_item
        FROM public.vocab_tower_answers answer
        JOIN public.vocab_tower_v2_review_items item ON item.word = answer.word
        JOIN public.vocab_tower_v2_review_decks deck ON deck.deck_id = item.deck_id
        WHERE answer.run_id = v_run.id
          AND answer.is_correct = FALSE
          AND deck.grade = v_run.grade
          AND deck.review_status = 'locked'
          AND NOT EXISTS (
              SELECT 1 FROM public.vocab_tower_answers learned
              WHERE learned.run_id = v_run.id
                AND learned.word = answer.word
                AND learned.room_type = 'boss'
                AND learned.is_correct = TRUE
          )
        ORDER BY answer.answered_at DESC
        LIMIT 1;
        v_is_review := v_item.item_key IS NOT NULL;
    END IF;

    IF v_item.item_key IS NULL THEN
        SELECT item.* INTO v_item
        FROM public.vocab_tower_v2_review_items item
        JOIN public.vocab_tower_v2_review_decks deck ON deck.deck_id = item.deck_id
        WHERE deck.grade = v_run.grade
          AND deck.deck_number = v_run.current_floor
          AND deck.review_status = 'locked'
          AND NOT EXISTS (
              SELECT 1 FROM public.vocab_tower_v2_run_questions used
              WHERE used.run_id = v_run.id AND used.item_key = item.item_key
          )
        ORDER BY random()
        LIMIT 1;
    END IF;

    IF v_item.item_key IS NOT NULL THEN
        SELECT deck.* INTO v_deck
        FROM public.vocab_tower_v2_review_decks deck
        WHERE deck.deck_id = v_item.deck_id
          AND deck.grade = v_run.grade
          AND deck.review_status = 'locked';
    END IF;

    IF v_item.item_key IS NULL OR v_deck.deck_id IS NULL THEN
        RAISE EXCEPTION '잠긴 V2 출제 문항을 찾지 못했습니다.' USING ERRCODE = '55000';
    END IF;

    v_question_type := CASE v_room_type
        WHEN 'sentence' THEN 'clozeChoice'
        WHEN 'distinction' THEN 'usageDistinction'
        ELSE 'meaningChoice'
    END;
    v_question := v_item.questions->v_question_type;

    IF v_question->>'status' <> 'reviewed' THEN
        RAISE EXCEPTION '검수 완료 문항만 출제할 수 있습니다.' USING ERRCODE = '55000';
    END IF;

    SELECT option->>'value' INTO v_correct_answer
    FROM jsonb_array_elements(v_question->'options') option
    WHERE option->>'isCorrect' = 'true'
    LIMIT 1;
    v_incorrect_limit := CASE WHEN COALESCE(p_reduce_options, FALSE) THEN 2 ELSE 5 END;

    SELECT jsonb_agg(selected.value ORDER BY random()) INTO v_options
    FROM (
        SELECT option->'value' AS value
        FROM jsonb_array_elements(v_question->'options') option
        WHERE option->>'isCorrect' = 'true'
        UNION ALL
        SELECT incorrect.value
        FROM (
            SELECT option->'value' AS value
            FROM jsonb_array_elements(v_question->'options') option
            WHERE option->>'isCorrect' = 'false'
            ORDER BY random()
            LIMIT v_incorrect_limit
        ) incorrect
    ) selected;

    IF v_correct_answer IS NULL OR jsonb_array_length(v_options) < 2 THEN
        RAISE EXCEPTION 'V2 선택 문항의 정답과 보기가 올바르지 않습니다.' USING ERRCODE = '55000';
    END IF;

    INSERT INTO public.vocab_tower_v2_run_questions (
        run_id, student_id, class_id, item_key, deck_id, sequence_number,
        room_type, question_type, prompt, options, correct_answer, explanation,
        word, definition, example, difficulty, category, is_review
    ) VALUES (
        v_run.id, v_student_id, v_class_id, v_item.item_key, v_deck.deck_id, v_sequence,
        v_room_type, v_question_type, v_question->>'prompt', v_options, v_correct_answer,
        COALESCE(NULLIF(BTRIM(v_question->>'explanation'), ''), v_item.definition),
        v_item.word, v_item.definition, v_item.example, v_item.difficulty, v_item.category, v_is_review
    ) RETURNING * INTO v_existing;

    RETURN jsonb_build_object(
        'question_key', v_existing.id,
        'room_type', v_existing.room_type,
        'question_type', v_existing.question_type,
        'prompt', v_existing.prompt,
        'options', v_existing.options,
        'word', jsonb_build_object(
            'word', v_existing.word, 'definition', v_existing.definition,
            'example', v_existing.example, 'level', v_existing.difficulty,
            'category', v_existing.category
        ),
        'is_review', v_existing.is_review
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_my_vocab_tower_v2_answer(
    p_run_id UUID,
    p_question_key UUID,
    p_selected_answer TEXT,
    p_used_hint BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID := public.auth_user_class_id();
    v_run public.vocab_tower_runs%ROWTYPE;
    v_question public.vocab_tower_v2_run_questions%ROWTYPE;
    v_is_correct BOOLEAN;
    v_is_review_correct BOOLEAN := FALSE;
    v_inserted_id UUID;
    v_existing_correct BOOLEAN;
    v_answer_count INTEGER;
    v_correct_count INTEGER;
    v_wrong_count INTEGER;
    v_review_correct_count INTEGER;
    v_combo INTEGER;
    v_max_combo INTEGER;
    v_floor INTEGER;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL OR v_class_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    IF p_question_key IS NULL OR char_length(COALESCE(p_selected_answer, '')) NOT BETWEEN 1 AND 500 THEN
        RAISE EXCEPTION '제출한 V2 답안이 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT run.* INTO v_run
    FROM public.vocab_tower_runs run
    WHERE run.id = p_run_id
      AND run.student_id = v_student_id
      AND run.class_id = v_class_id
    FOR UPDATE;

    IF NOT FOUND OR v_run.status <> 'active' OR v_run.content_version <> 'v2' THEN
        RAISE EXCEPTION '진행 중인 V2 도전을 찾을 수 없습니다.' USING ERRCODE = '22023';
    END IF;
    IF v_run.answer_count >= 30 THEN
        RAISE EXCEPTION '이미 정상까지 모든 문제를 풀었어요.' USING ERRCODE = '22023';
    END IF;
    SELECT question.* INTO v_question
    FROM public.vocab_tower_v2_run_questions question
    WHERE question.id = p_question_key
      AND question.run_id = v_run.id
      AND question.student_id = v_student_id
      AND question.class_id = v_class_id
    FOR UPDATE;

    IF v_question.answered_at IS NOT NULL THEN
        SELECT answer.is_correct INTO v_existing_correct
        FROM public.vocab_tower_answers answer
        WHERE answer.run_id = v_run.id AND answer.question_key = v_question.id::TEXT;
        RETURN jsonb_build_object(
            'success', TRUE, 'duplicate', TRUE, 'is_correct', v_existing_correct,
            'correct_answer', v_question.correct_answer, 'explanation', v_question.explanation,
            'answer_count', v_run.answer_count, 'correct_count', v_run.correct_count,
            'wrong_count', v_run.wrong_count, 'review_correct_count', v_run.review_correct_count,
            'current_floor', v_run.current_floor, 'current_combo', v_run.current_combo,
            'max_combo', v_run.max_combo, 'floor_cleared', MOD(v_run.answer_count, 3) = 0,
            'completed', v_run.answer_count >= 30
        );
    END IF;

    IF NOT FOUND OR v_question.sequence_number <> v_run.answer_count + 1 THEN
        RAISE EXCEPTION '현재 V2 문항이 아닙니다.' USING ERRCODE = '22023';
    END IF;
    IF v_run.last_answered_at IS NOT NULL AND NOW() - v_run.last_answered_at < INTERVAL '250 milliseconds' THEN
        RAISE EXCEPTION '문제를 너무 빠르게 제출했어요. 잠시 후 다시 시도해주세요.' USING ERRCODE = '22023';
    END IF;

    v_is_correct := p_selected_answer = v_question.correct_answer;
    IF v_is_correct AND v_question.room_type = 'boss' AND v_question.is_review THEN
        v_is_review_correct := TRUE;
    END IF;

    INSERT INTO public.vocab_tower_answers (
        run_id, student_id, class_id, question_key, room_type, word,
        selected_answer, used_hint, is_correct
    ) VALUES (
        v_run.id, v_student_id, v_class_id, v_question.id::TEXT, v_question.room_type,
        v_question.word, LEFT(p_selected_answer, 500), COALESCE(p_used_hint, FALSE), v_is_correct
    ) RETURNING id INTO v_inserted_id;

    UPDATE public.vocab_tower_v2_run_questions question
       SET answered_at = NOW()
     WHERE question.id = v_question.id;

    v_answer_count := v_run.answer_count + 1;
    v_correct_count := v_run.correct_count + CASE WHEN v_is_correct THEN 1 ELSE 0 END;
    v_wrong_count := v_run.wrong_count + CASE WHEN v_is_correct THEN 0 ELSE 1 END;
    v_review_correct_count := v_run.review_correct_count + CASE WHEN v_is_review_correct THEN 1 ELSE 0 END;
    v_combo := CASE WHEN v_is_correct THEN v_run.current_combo + 1 ELSE 0 END;
    v_max_combo := GREATEST(v_run.max_combo, v_combo);
    v_floor := LEAST(10, (v_answer_count / 3) + 1);

    UPDATE public.vocab_tower_runs run
       SET answer_count = v_answer_count,
           correct_count = v_correct_count,
           wrong_count = v_wrong_count,
           review_correct_count = v_review_correct_count,
           current_floor = v_floor,
           current_combo = v_combo,
           max_combo = v_max_combo,
           last_answered_at = NOW()
     WHERE run.id = v_run.id;

    RETURN jsonb_build_object(
        'success', TRUE, 'duplicate', FALSE, 'is_correct', v_is_correct,
        'is_review_correct', v_is_review_correct, 'correct_answer', v_question.correct_answer,
        'explanation', v_question.explanation, 'answer_count', v_answer_count,
        'correct_count', v_correct_count, 'wrong_count', v_wrong_count,
        'review_correct_count', v_review_correct_count, 'current_floor', v_floor,
        'current_combo', v_combo, 'max_combo', v_max_combo,
        'floor_cleared', MOD(v_answer_count, 3) = 0, 'completed', v_answer_count >= 30
    );
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_vocab_tower_run_content_version_v2() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_vocab_tower_class_content_version_v2() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_teacher_vocab_tower_content_version_v2(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.start_my_vocab_tower_v2_run() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_next_my_vocab_tower_question_v2(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_my_vocab_tower_v2_answer(UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.set_teacher_vocab_tower_content_version_v2(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_my_vocab_tower_v2_run() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_my_vocab_tower_question_v2(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_my_vocab_tower_v2_answer(UUID, UUID, TEXT, BOOLEAN) TO authenticated;

COMMIT;
