BEGIN;

ALTER TABLE public.vocab_tower_runs
    ADD COLUMN IF NOT EXISTS v2_deck_number SMALLINT;
ALTER TABLE public.vocab_tower_runs
    ADD COLUMN IF NOT EXISTS target_question_count SMALLINT NOT NULL DEFAULT 30;

ALTER TABLE public.vocab_tower_runs
    DROP CONSTRAINT IF EXISTS vocab_tower_runs_v2_deck_number_check;
ALTER TABLE public.vocab_tower_runs
    ADD CONSTRAINT vocab_tower_runs_v2_deck_number_check
    CHECK (v2_deck_number IS NULL OR v2_deck_number BETWEEN 1 AND 10);
ALTER TABLE public.vocab_tower_runs
    DROP CONSTRAINT IF EXISTS vocab_tower_runs_target_question_count_check;
ALTER TABLE public.vocab_tower_runs
    ADD CONSTRAINT vocab_tower_runs_target_question_count_check
    CHECK (target_question_count BETWEEN 1 AND 30);

CREATE TABLE IF NOT EXISTS public.vocab_tower_v2_deck_progress (
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    grade SMALLINT NOT NULL CHECK (grade BETWEEN 3 AND 6),
    deck_number SMALLINT NOT NULL CHECK (deck_number BETWEEN 1 AND 10),
    practice_runs INTEGER NOT NULL DEFAULT 0 CHECK (practice_runs >= 0),
    completed_runs INTEGER NOT NULL DEFAULT 0 CHECK (completed_runs >= 0),
    best_accuracy SMALLINT NOT NULL DEFAULT 0 CHECK (best_accuracy BETWEEN 0 AND 100),
    last_accuracy SMALLINT NOT NULL DEFAULT 0 CHECK (last_accuracy BETWEEN 0 AND 100),
    last_answer_count SMALLINT NOT NULL DEFAULT 0 CHECK (last_answer_count BETWEEN 0 AND 30),
    last_practiced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (student_id, class_id, grade, deck_number)
);

CREATE INDEX IF NOT EXISTS vocab_tower_v2_deck_progress_class_updated_idx
    ON public.vocab_tower_v2_deck_progress(class_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS vocab_tower_v2_deck_progress_student_updated_idx
    ON public.vocab_tower_v2_deck_progress(student_id, updated_at DESC);

ALTER TABLE public.vocab_tower_v2_deck_progress ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.vocab_tower_v2_deck_progress FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.vocab_tower_v2_deck_progress TO service_role;

COMMENT ON COLUMN public.vocab_tower_runs.v2_deck_number IS
    'V2 개인 연습이 선택한 1~10번 덱. NULL은 기존 30문항 파일럿 호환.';
COMMENT ON TABLE public.vocab_tower_v2_deck_progress IS
    'V2 덱별 개인 연습 요약. 숙련·마스터 판정은 후속 계약으로 분리한다.';

CREATE OR REPLACE FUNCTION public.get_my_vocab_tower_v2_overview_v1()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID := public.auth_user_class_id();
    v_grade SMALLINT;
    v_enabled BOOLEAN;
    v_decks JSONB;
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
        END
      INTO v_grade, v_enabled
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

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'deck_number', deck.deck_number,
        'deck_id', deck.deck_id,
        'item_count', (
            SELECT count(*) FROM public.vocab_tower_v2_review_items item
            WHERE item.deck_id = deck.deck_id
        ),
        'practice_runs', COALESCE(progress.practice_runs, 0),
        'completed_runs', COALESCE(progress.completed_runs, 0),
        'best_accuracy', COALESCE(progress.best_accuracy, 0),
        'last_accuracy', COALESCE(progress.last_accuracy, 0),
        'last_answer_count', COALESCE(progress.last_answer_count, 0),
        'last_practiced_at', progress.last_practiced_at
    ) ORDER BY deck.deck_number), '[]'::JSONB)
      INTO v_decks
    FROM public.vocab_tower_v2_review_decks deck
    LEFT JOIN public.vocab_tower_v2_deck_progress progress
      ON progress.student_id = v_student_id
     AND progress.class_id = v_class_id
     AND progress.grade = v_grade
     AND progress.deck_number = deck.deck_number
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
$$;

CREATE OR REPLACE FUNCTION public.start_my_vocab_tower_v2_practice_v1(p_deck_number SMALLINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID := public.auth_user_class_id();
    v_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::DATE;
    v_grade SMALLINT;
    v_daily_limit SMALLINT;
    v_time_limit SMALLINT;
    v_enabled BOOLEAN;
    v_run public.vocab_tower_runs%ROWTYPE;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL OR v_class_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    IF p_deck_number NOT BETWEEN 1 AND 10 THEN
        RAISE EXCEPTION '연습할 덱은 1~10번이어야 합니다.' USING ERRCODE = '22023';
    END IF;

    PERFORM 1 FROM public.students student
    WHERE student.id = v_student_id AND student.class_id = v_class_id
    FOR UPDATE;

    SELECT
        LEAST(6, GREATEST(3, COALESCE(class.vocab_tower_grade, 3)))::SMALLINT,
        LEAST(5, GREATEST(1, COALESCE(class.vocab_tower_daily_limit, 3)))::SMALLINT,
        LEAST(120, GREATEST(30, COALESCE(class.vocab_tower_time_limit, 40)))::SMALLINT,
        CASE
            WHEN class.enabled_modules IS NULL THEN COALESCE(class.vocab_tower_enabled, FALSE)
            ELSE 'vocab-tower' = ANY(class.enabled_modules)
        END
      INTO v_grade, v_daily_limit, v_time_limit, v_enabled
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
    IF NOT EXISTS (
        SELECT 1 FROM public.vocab_tower_v2_review_decks deck
        WHERE deck.grade = v_grade
          AND deck.deck_number = p_deck_number
          AND deck.review_status = 'locked'
    ) THEN
        RAISE EXCEPTION '선택한 덱이 잠금 완료 상태가 아닙니다.' USING ERRCODE = '55000';
    END IF;

    SELECT run.* INTO v_run
    FROM public.vocab_tower_runs run
    WHERE run.student_id = v_student_id
      AND run.class_id = v_class_id
      AND run.status = 'active'
    ORDER BY run.created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_run.id IS NOT NULL THEN
        IF v_run.content_version = 'v2'
           AND v_run.v2_deck_number = p_deck_number
           AND v_run.target_question_count = 12 THEN
            RETURN jsonb_build_object(
                'success', TRUE, 'resumed', TRUE, 'content_version', 'v2',
                'run_id', v_run.id, 'grade', v_run.grade, 'deck_number', v_run.v2_deck_number,
                'target_question_count', v_run.target_question_count,
                'answer_count', v_run.answer_count, 'correct_count', v_run.correct_count,
                'wrong_count', v_run.wrong_count, 'review_correct_count', v_run.review_correct_count,
                'current_floor', v_run.current_floor, 'current_combo', v_run.current_combo,
                'max_combo', v_run.max_combo, 'review_words', '[]'::JSONB,
                'floor_time_limit', v_run.floor_time_limit, 'reward_cap', 0
            );
        END IF;
        IF v_run.content_version = 'v2' AND v_run.v2_deck_number IS NULL THEN
            UPDATE public.vocab_tower_runs run
             SET status = 'abandoned', finish_reason = 'exited', finished_at = NOW()
             WHERE run.id = v_run.id;
        ELSE
            RETURN jsonb_build_object(
                'success', FALSE,
                'error', '진행 중인 다른 어휘 연습을 먼저 이어서 끝내주세요.'
            );
        END IF;
    END IF;

    INSERT INTO public.vocab_tower_runs (
        student_id, class_id, run_date, grade, daily_limit, floor_time_limit,
        reward_cap, content_version, v2_deck_number, target_question_count, current_floor
    ) VALUES (
        v_student_id, v_class_id, v_today, v_grade, v_daily_limit, v_time_limit,
        0, 'v2', p_deck_number, 12, p_deck_number
    ) RETURNING * INTO v_run;

    RETURN jsonb_build_object(
        'success', TRUE, 'resumed', FALSE, 'content_version', 'v2',
        'run_id', v_run.id, 'grade', v_run.grade, 'deck_number', v_run.v2_deck_number,
        'target_question_count', v_run.target_question_count,
        'answer_count', 0, 'correct_count', 0, 'wrong_count', 0,
        'review_correct_count', 0, 'current_floor', v_run.current_floor,
        'current_combo', 0, 'max_combo', 0, 'review_words', '[]'::JSONB,
        'floor_time_limit', v_run.floor_time_limit, 'reward_cap', 0
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_next_my_vocab_tower_v2_practice_question_v1(p_run_id UUID)
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
    v_sequence SMALLINT;
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

    IF NOT FOUND OR v_run.status <> 'active' OR v_run.content_version <> 'v2'
       OR v_run.v2_deck_number IS NULL OR v_run.target_question_count <> 12 THEN
        RAISE EXCEPTION '진행 중인 V2 개인 연습을 찾을 수 없습니다.' USING ERRCODE = '22023';
    END IF;
    IF v_run.answer_count >= v_run.target_question_count THEN
        RAISE EXCEPTION '이 덱의 개인 연습 문항을 모두 풀었어요.' USING ERRCODE = '22023';
    END IF;

    SELECT question.* INTO v_existing
    FROM public.vocab_tower_v2_run_questions question
    WHERE question.run_id = v_run.id
      AND question.sequence_number = v_run.answer_count + 1
      AND question.answered_at IS NULL
    LIMIT 1;

    IF v_existing.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'question_key', v_existing.id, 'deck_number', v_run.v2_deck_number,
            'sequence_number', v_existing.sequence_number,
            'target_question_count', v_run.target_question_count,
            'room_type', v_existing.room_type, 'question_type', v_existing.question_type,
            'prompt', v_existing.prompt, 'options', v_existing.options,
            'word', jsonb_build_object(
                'word', v_existing.word, 'definition', v_existing.definition,
                'example', v_existing.example, 'level', v_existing.difficulty,
                'category', v_existing.category
            ),
            'is_review', FALSE
        );
    END IF;

    v_sequence := (v_run.answer_count + 1)::SMALLINT;
    v_room_type := CASE MOD(v_run.answer_count, 3)
        WHEN 0 THEN 'meaning'
        WHEN 1 THEN 'sentence'
        ELSE 'distinction'
    END;
    v_question_type := CASE v_room_type
        WHEN 'sentence' THEN 'clozeChoice'
        WHEN 'distinction' THEN 'usageDistinction'
        ELSE 'meaningChoice'
    END;

    SELECT item.* INTO v_item
    FROM public.vocab_tower_v2_review_items item
    JOIN public.vocab_tower_v2_review_decks deck ON deck.deck_id = item.deck_id
    WHERE deck.grade = v_run.grade
      AND deck.deck_number = v_run.v2_deck_number
      AND deck.review_status = 'locked'
      AND NOT EXISTS (
          SELECT 1 FROM public.vocab_tower_v2_run_questions used
          WHERE used.run_id = v_run.id AND used.item_key = item.item_key
      )
    ORDER BY random()
    LIMIT 1;

    IF v_item.item_key IS NOT NULL THEN
        SELECT deck.* INTO v_deck
        FROM public.vocab_tower_v2_review_decks deck
        WHERE deck.deck_id = v_item.deck_id
          AND deck.grade = v_run.grade
          AND deck.deck_number = v_run.v2_deck_number
          AND deck.review_status = 'locked';
    END IF;
    IF v_item.item_key IS NULL OR v_deck.deck_id IS NULL THEN
        RAISE EXCEPTION '잠긴 V2 덱에서 연습 문항을 찾지 못했습니다.' USING ERRCODE = '55000';
    END IF;

    v_question := v_item.questions->v_question_type;
    IF v_question->>'status' <> 'reviewed' THEN
        RAISE EXCEPTION '검수 완료 문항만 출제할 수 있습니다.' USING ERRCODE = '55000';
    END IF;

    SELECT option->>'value' INTO v_correct_answer
    FROM jsonb_array_elements(v_question->'options') option
    WHERE option->>'isCorrect' = 'true'
    LIMIT 1;
    SELECT jsonb_agg(option->'value' ORDER BY random()) INTO v_options
    FROM jsonb_array_elements(v_question->'options') option;

    IF v_correct_answer IS NULL OR jsonb_array_length(v_options) NOT BETWEEN 2 AND 6 THEN
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
        v_item.word, v_item.definition, v_item.example, v_item.difficulty, v_item.category, FALSE
    ) RETURNING * INTO v_existing;

    RETURN jsonb_build_object(
        'question_key', v_existing.id, 'deck_number', v_run.v2_deck_number,
        'sequence_number', v_existing.sequence_number,
        'target_question_count', v_run.target_question_count,
        'room_type', v_existing.room_type, 'question_type', v_existing.question_type,
        'prompt', v_existing.prompt, 'options', v_existing.options,
        'word', jsonb_build_object(
            'word', v_existing.word, 'definition', v_existing.definition,
            'example', v_existing.example, 'level', v_existing.difficulty,
            'category', v_existing.category
        ),
        'is_review', FALSE
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_my_vocab_tower_v2_practice_answer_v1(
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
    v_existing_correct BOOLEAN;
    v_answer_count INTEGER;
    v_correct_count INTEGER;
    v_wrong_count INTEGER;
    v_combo INTEGER;
    v_max_combo INTEGER;
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
    IF NOT FOUND OR v_run.status <> 'active' OR v_run.content_version <> 'v2'
       OR v_run.v2_deck_number IS NULL OR v_run.target_question_count <> 12 THEN
        RAISE EXCEPTION '진행 중인 V2 개인 연습을 찾을 수 없습니다.' USING ERRCODE = '22023';
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
            'wrong_count', v_run.wrong_count, 'current_combo', v_run.current_combo,
            'max_combo', v_run.max_combo, 'floor_cleared', FALSE,
            'completed', v_run.answer_count >= v_run.target_question_count,
            'deck_number', v_run.v2_deck_number,
            'target_question_count', v_run.target_question_count
        );
    END IF;
    IF NOT FOUND OR v_question.sequence_number <> v_run.answer_count + 1 THEN
        RAISE EXCEPTION '현재 V2 연습 문항이 아닙니다.' USING ERRCODE = '22023';
    END IF;
    IF v_run.answer_count >= v_run.target_question_count THEN
        RAISE EXCEPTION '이 덱의 개인 연습 문항을 모두 풀었어요.' USING ERRCODE = '22023';
    END IF;
    IF v_run.last_answered_at IS NOT NULL AND clock_timestamp() - v_run.last_answered_at < INTERVAL '150 milliseconds' THEN
        RAISE EXCEPTION '문제를 너무 빠르게 제출했어요. 잠시 후 다시 시도해주세요.' USING ERRCODE = '22023';
    END IF;

    v_is_correct := p_selected_answer = v_question.correct_answer;
    INSERT INTO public.vocab_tower_answers (
        run_id, student_id, class_id, question_key, room_type, word,
        selected_answer, used_hint, is_correct
    ) VALUES (
        v_run.id, v_student_id, v_class_id, v_question.id::TEXT, v_question.room_type,
        v_question.word, LEFT(p_selected_answer, 500), COALESCE(p_used_hint, FALSE), v_is_correct
    );
    UPDATE public.vocab_tower_v2_run_questions question
       SET answered_at = NOW()
     WHERE question.id = v_question.id;

    v_answer_count := v_run.answer_count + 1;
    v_correct_count := v_run.correct_count + CASE WHEN v_is_correct THEN 1 ELSE 0 END;
    v_wrong_count := v_run.wrong_count + CASE WHEN v_is_correct THEN 0 ELSE 1 END;
    v_combo := CASE WHEN v_is_correct THEN v_run.current_combo + 1 ELSE 0 END;
    v_max_combo := GREATEST(v_run.max_combo, v_combo);

    UPDATE public.vocab_tower_runs run
       SET answer_count = v_answer_count,
           correct_count = v_correct_count,
           wrong_count = v_wrong_count,
           current_combo = v_combo,
           max_combo = v_max_combo,
           last_answered_at = clock_timestamp()
     WHERE run.id = v_run.id;

    RETURN jsonb_build_object(
        'success', TRUE, 'duplicate', FALSE, 'is_correct', v_is_correct,
        'is_review_correct', FALSE, 'correct_answer', v_question.correct_answer,
        'explanation', v_question.explanation, 'answer_count', v_answer_count,
        'correct_count', v_correct_count, 'wrong_count', v_wrong_count,
        'review_correct_count', 0, 'current_floor', v_run.current_floor,
        'current_combo', v_combo, 'max_combo', v_max_combo,
        'floor_cleared', FALSE, 'completed', v_answer_count >= v_run.target_question_count,
        'deck_number', v_run.v2_deck_number,
        'target_question_count', v_run.target_question_count
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_my_vocab_tower_v2_practice_v1(
    p_run_id UUID,
    p_reason TEXT DEFAULT 'exited'
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
    v_accuracy SMALLINT := 0;
    v_completed BOOLEAN := FALSE;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL OR v_class_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    IF p_reason NOT IN ('completed', 'exited') THEN
        RAISE EXCEPTION '알 수 없는 개인 연습 종료 방식입니다.' USING ERRCODE = '22023';
    END IF;

    SELECT run.* INTO v_run
    FROM public.vocab_tower_runs run
    WHERE run.id = p_run_id
      AND run.student_id = v_student_id
      AND run.class_id = v_class_id
      AND run.content_version = 'v2'
      AND run.v2_deck_number IS NOT NULL
      AND run.target_question_count = 12
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'V2 개인 연습 기록을 찾을 수 없습니다.' USING ERRCODE = '22023';
    END IF;

    IF v_run.answer_count > 0 THEN
        v_accuracy := ROUND(v_run.correct_count::NUMERIC * 100 / v_run.answer_count)::SMALLINT;
    END IF;
    v_completed := CASE
        WHEN v_run.status = 'active' THEN p_reason = 'completed' AND v_run.answer_count >= v_run.target_question_count
        ELSE v_run.finish_reason = 'completed'
    END;

    IF v_run.status = 'active' THEN
        UPDATE public.vocab_tower_runs run
           SET status = 'finished',
               finish_reason = CASE WHEN v_completed THEN 'completed' ELSE 'exited' END,
               reward_points = 0,
               finished_at = NOW()
         WHERE run.id = v_run.id;

        IF v_run.answer_count > 0 THEN
            INSERT INTO public.vocab_tower_v2_deck_progress (
                student_id, class_id, grade, deck_number,
                practice_runs, completed_runs, best_accuracy,
                last_accuracy, last_answer_count, last_practiced_at, updated_at
            ) VALUES (
                v_student_id, v_class_id, v_run.grade, v_run.v2_deck_number,
                1, CASE WHEN v_completed THEN 1 ELSE 0 END,
                CASE WHEN v_completed THEN v_accuracy ELSE 0 END,
                v_accuracy, v_run.answer_count, NOW(), NOW()
            )
            ON CONFLICT (student_id, class_id, grade, deck_number) DO UPDATE SET
                practice_runs = public.vocab_tower_v2_deck_progress.practice_runs + 1,
                completed_runs = public.vocab_tower_v2_deck_progress.completed_runs
                    + CASE WHEN v_completed THEN 1 ELSE 0 END,
                best_accuracy = GREATEST(public.vocab_tower_v2_deck_progress.best_accuracy, EXCLUDED.best_accuracy),
                last_accuracy = EXCLUDED.last_accuracy,
                last_answer_count = EXCLUDED.last_answer_count,
                last_practiced_at = EXCLUDED.last_practiced_at,
                updated_at = NOW();
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE, 'already_finished', v_run.status <> 'active',
        'deck_number', v_run.v2_deck_number,
        'target_question_count', v_run.target_question_count,
        'reward_points', 0, 'answer_count', v_run.answer_count,
        'correct_count', v_run.correct_count, 'wrong_count', v_run.wrong_count,
        'review_correct_count', 0, 'max_floor', v_run.v2_deck_number,
        'max_combo', v_run.max_combo, 'accuracy', v_accuracy,
        'practice_completed', v_completed
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_vocab_tower_v2_overview_v1() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.start_my_vocab_tower_v2_practice_v1(SMALLINT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_next_my_vocab_tower_v2_practice_question_v1(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_my_vocab_tower_v2_practice_answer_v1(UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finish_my_vocab_tower_v2_practice_v1(UUID, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_my_vocab_tower_v2_overview_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_my_vocab_tower_v2_practice_v1(SMALLINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_my_vocab_tower_v2_practice_question_v1(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_my_vocab_tower_v2_practice_answer_v1(UUID, UUID, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_my_vocab_tower_v2_practice_v1(UUID, TEXT) TO authenticated;

COMMIT;
