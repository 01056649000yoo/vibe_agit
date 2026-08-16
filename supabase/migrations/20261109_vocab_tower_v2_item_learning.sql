BEGIN;

CREATE TABLE IF NOT EXISTS public.vocab_tower_v2_item_progress (
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    grade SMALLINT NOT NULL CHECK (grade BETWEEN 3 AND 6),
    deck_number SMALLINT NOT NULL CHECK (deck_number BETWEEN 1 AND 10),
    item_key TEXT NOT NULL REFERENCES public.vocab_tower_v2_review_items(item_key) ON DELETE RESTRICT,
    learning_state TEXT NOT NULL DEFAULT 'learning'
        CHECK (learning_state IN ('learning', 'familiar', 'needs_review', 'mastered')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    correct_count INTEGER NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
    wrong_count INTEGER NOT NULL DEFAULT 0 CHECK (wrong_count >= 0),
    consecutive_correct SMALLINT NOT NULL DEFAULT 0 CHECK (consecutive_correct >= 0),
    correct_question_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    last_question_type TEXT CHECK (
        last_question_type IS NULL
        OR last_question_type IN ('meaningChoice', 'clozeChoice', 'usageDistinction')
    ),
    last_correct BOOLEAN,
    first_seen_run_id UUID,
    last_seen_run_id UUID,
    last_mastered_run_id UUID,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    mastered_at TIMESTAMPTZ,
    next_review_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (student_id, class_id, grade, deck_number, item_key)
);

CREATE INDEX IF NOT EXISTS vocab_tower_v2_item_progress_student_deck_state_idx
    ON public.vocab_tower_v2_item_progress(
        student_id, class_id, grade, deck_number, learning_state, last_seen_at DESC
    );
CREATE INDEX IF NOT EXISTS vocab_tower_v2_item_progress_class_updated_idx
    ON public.vocab_tower_v2_item_progress(class_id, updated_at DESC);

ALTER TABLE public.vocab_tower_v2_item_progress ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.vocab_tower_v2_item_progress FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.vocab_tower_v2_item_progress TO service_role;

ALTER TABLE public.vocab_tower_v2_run_questions
    ADD COLUMN IF NOT EXISTS selection_focus TEXT NOT NULL DEFAULT 'new';
ALTER TABLE public.vocab_tower_v2_run_questions
    DROP CONSTRAINT IF EXISTS vocab_tower_v2_run_questions_selection_focus_check;
ALTER TABLE public.vocab_tower_v2_run_questions
    ADD CONSTRAINT vocab_tower_v2_run_questions_selection_focus_check
    CHECK (selection_focus IN ('weak', 'review', 'new', 'mastered'));

COMMENT ON TABLE public.vocab_tower_v2_item_progress IS
    '학생별 V2 낱말 학습 상태. 브라우저 직접 접근 없이 답안 저장 트랜잭션에서만 갱신한다.';
COMMENT ON COLUMN public.vocab_tower_v2_item_progress.learning_state IS
    'learning=힌트/첫 확인, familiar=한 유형 성공, needs_review=최근 오답, mastered=서로 다른 두 유형 연속 성공.';
COMMENT ON COLUMN public.vocab_tower_v2_run_questions.selection_focus IS
    '문항 발급 당시 적응 출제 분류. weak/review/new/mastered 중 하나이며 정답 정보는 포함하지 않는다.';

CREATE OR REPLACE FUNCTION public.record_vocab_tower_v2_item_progress_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_question public.vocab_tower_v2_run_questions%ROWTYPE;
    v_run public.vocab_tower_runs%ROWTYPE;
    v_progress public.vocab_tower_v2_item_progress%ROWTYPE;
    v_correct_types TEXT[] := ARRAY[]::TEXT[];
    v_streak SMALLINT := 0;
    v_state TEXT := 'learning';
    v_now TIMESTAMPTZ := NOW();
BEGIN
    SELECT question.* INTO v_question
    FROM public.vocab_tower_v2_run_questions question
    WHERE question.id::TEXT = NEW.question_key
      AND question.run_id = NEW.run_id
      AND question.student_id = NEW.student_id
      AND question.class_id = NEW.class_id;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    SELECT run.* INTO v_run
    FROM public.vocab_tower_runs run
    WHERE run.id = NEW.run_id
      AND run.student_id = NEW.student_id
      AND run.class_id = NEW.class_id
      AND run.content_version = 'v2'
      AND run.v2_deck_number IS NOT NULL
      AND run.target_question_count = 12;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    SELECT progress.* INTO v_progress
    FROM public.vocab_tower_v2_item_progress progress
    WHERE progress.student_id = NEW.student_id
      AND progress.class_id = NEW.class_id
      AND progress.grade = v_run.grade
      AND progress.deck_number = v_run.v2_deck_number
      AND progress.item_key = v_question.item_key
    FOR UPDATE;

    IF v_progress.item_key IS NULL THEN
        IF NEW.is_correct AND NOT NEW.used_hint THEN
            v_correct_types := ARRAY[v_question.question_type];
            v_streak := 1;
            v_state := 'familiar';
        ELSIF NOT NEW.is_correct THEN
            v_state := 'needs_review';
        END IF;

        INSERT INTO public.vocab_tower_v2_item_progress (
            student_id, class_id, grade, deck_number, item_key,
            learning_state, attempt_count, correct_count, wrong_count,
            consecutive_correct, correct_question_types, last_question_type,
            last_correct, first_seen_run_id, last_seen_run_id,
            first_seen_at, last_seen_at, next_review_at, updated_at
        ) VALUES (
            NEW.student_id, NEW.class_id, v_run.grade, v_run.v2_deck_number, v_question.item_key,
            v_state, 1, CASE WHEN NEW.is_correct THEN 1 ELSE 0 END,
            CASE WHEN NEW.is_correct THEN 0 ELSE 1 END,
            v_streak, v_correct_types, v_question.question_type,
            NEW.is_correct, NEW.run_id, NEW.run_id,
            v_now, v_now,
            CASE v_state
                WHEN 'needs_review' THEN v_now
                WHEN 'familiar' THEN v_now + INTERVAL '3 days'
                ELSE v_now + INTERVAL '1 day'
            END,
            v_now
        );
        RETURN NEW;
    END IF;

    v_correct_types := v_progress.correct_question_types;
    IF NEW.is_correct
       AND NOT NEW.used_hint
       AND NOT (v_question.question_type = ANY(v_correct_types)) THEN
        v_correct_types := array_append(v_correct_types, v_question.question_type);
    END IF;
    v_streak := CASE
        WHEN NEW.is_correct AND NOT NEW.used_hint THEN v_progress.consecutive_correct + 1
        ELSE 0
    END;
    v_state := CASE
        WHEN NOT NEW.is_correct THEN 'needs_review'
        WHEN NEW.used_hint THEN 'learning'
        WHEN cardinality(v_correct_types) >= 2 AND v_streak >= 2 THEN 'mastered'
        ELSE 'familiar'
    END;

    UPDATE public.vocab_tower_v2_item_progress progress
       SET learning_state = v_state,
           attempt_count = progress.attempt_count + 1,
           correct_count = progress.correct_count + CASE WHEN NEW.is_correct THEN 1 ELSE 0 END,
           wrong_count = progress.wrong_count + CASE WHEN NEW.is_correct THEN 0 ELSE 1 END,
           consecutive_correct = v_streak,
           correct_question_types = v_correct_types,
           last_question_type = v_question.question_type,
           last_correct = NEW.is_correct,
           last_seen_run_id = NEW.run_id,
           last_seen_at = v_now,
           last_mastered_run_id = CASE
               WHEN v_state = 'mastered' AND progress.learning_state <> 'mastered' THEN NEW.run_id
               ELSE progress.last_mastered_run_id
           END,
           mastered_at = CASE
               WHEN v_state = 'mastered' AND progress.learning_state <> 'mastered' THEN v_now
               ELSE progress.mastered_at
           END,
           next_review_at = CASE v_state
               WHEN 'needs_review' THEN v_now
               WHEN 'mastered' THEN v_now + INTERVAL '14 days'
               WHEN 'familiar' THEN v_now + INTERVAL '3 days'
               ELSE v_now + INTERVAL '1 day'
           END,
           updated_at = v_now
     WHERE progress.student_id = NEW.student_id
       AND progress.class_id = NEW.class_id
       AND progress.grade = v_run.grade
       AND progress.deck_number = v_run.v2_deck_number
       AND progress.item_key = v_question.item_key;

    RETURN NEW;
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
    v_item_key TEXT;
    v_question JSONB;
    v_question_type TEXT;
    v_room_type TEXT;
    v_options JSONB;
    v_correct_answer TEXT;
    v_sequence SMALLINT;
    v_target_focus TEXT;
    v_selection_focus TEXT;
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
            'is_review', v_existing.is_review,
            'practice_focus', v_existing.selection_focus
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
    v_target_focus := CASE MOD(v_sequence - 1, 12)
        WHEN 0 THEN 'weak'
        WHEN 1 THEN 'new'
        WHEN 2 THEN 'review'
        WHEN 3 THEN 'weak'
        WHEN 4 THEN 'review'
        WHEN 5 THEN 'new'
        WHEN 6 THEN 'weak'
        WHEN 7 THEN 'review'
        WHEN 8 THEN 'weak'
        WHEN 9 THEN 'weak'
        WHEN 10 THEN 'review'
        ELSE 'new'
    END;

    WITH candidates AS (
        SELECT
            item.item_key,
            CASE
                WHEN progress.item_key IS NULL THEN 'new'
                WHEN progress.learning_state = 'needs_review' THEN 'weak'
                WHEN progress.learning_state = 'learning' THEN 'review'
                WHEN progress.next_review_at IS NULL OR progress.next_review_at <= NOW() THEN 'review'
                ELSE 'mastered'
            END AS selection_focus
        FROM public.vocab_tower_v2_review_items item
        JOIN public.vocab_tower_v2_review_decks deck ON deck.deck_id = item.deck_id
        LEFT JOIN public.vocab_tower_v2_item_progress progress
          ON progress.student_id = v_student_id
         AND progress.class_id = v_class_id
         AND progress.grade = v_run.grade
         AND progress.deck_number = v_run.v2_deck_number
         AND progress.item_key = item.item_key
        WHERE deck.grade = v_run.grade
          AND deck.deck_number = v_run.v2_deck_number
          AND deck.review_status = 'locked'
          AND NOT EXISTS (
              SELECT 1 FROM public.vocab_tower_v2_run_questions used
              WHERE used.run_id = v_run.id AND used.item_key = item.item_key
          )
    )
    SELECT candidate.item_key, candidate.selection_focus
      INTO v_item_key, v_selection_focus
    FROM candidates candidate
    ORDER BY
        CASE v_target_focus
            WHEN 'weak' THEN CASE candidate.selection_focus
                WHEN 'weak' THEN 0 WHEN 'new' THEN 1 WHEN 'review' THEN 2 ELSE 3 END
            WHEN 'review' THEN CASE candidate.selection_focus
                WHEN 'review' THEN 0 WHEN 'new' THEN 1 WHEN 'weak' THEN 2 ELSE 3 END
            ELSE CASE candidate.selection_focus
                WHEN 'new' THEN 0 WHEN 'review' THEN 1 WHEN 'weak' THEN 2 ELSE 3 END
        END,
        random()
    LIMIT 1;

    IF v_item_key IS NOT NULL THEN
        SELECT item.* INTO v_item
        FROM public.vocab_tower_v2_review_items item
        WHERE item.item_key = v_item_key;
    END IF;
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
        word, definition, example, difficulty, category, is_review, selection_focus
    ) VALUES (
        v_run.id, v_student_id, v_class_id, v_item.item_key, v_deck.deck_id, v_sequence,
        v_room_type, v_question_type, v_question->>'prompt', v_options, v_correct_answer,
        COALESCE(NULLIF(BTRIM(v_question->>'explanation'), ''), v_item.definition),
        v_item.word, v_item.definition, v_item.example, v_item.difficulty, v_item.category,
        v_selection_focus IN ('weak', 'review'), v_selection_focus
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
        'is_review', v_existing.is_review,
        'practice_focus', v_existing.selection_focus
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
    v_perfect BOOLEAN := FALSE;
    v_perfect_reward_points INTEGER := 0;
    v_event_key TEXT;
    v_point_result JSONB;
    v_awarded_points INTEGER := 0;
    v_reward_earned BOOLEAN := FALSE;
    v_reward_already_earned BOOLEAN := FALSE;
    v_item_count INTEGER := 0;
    v_seen_count INTEGER := 0;
    v_mastered_count INTEGER := 0;
    v_needs_review_count INTEGER := 0;
    v_new_words_seen INTEGER := 0;
    v_mastered_this_run INTEGER := 0;
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

    SELECT LEAST(500, GREATEST(0, COALESCE(class.vocab_tower_v2_perfect_reward_points, 100)))
      INTO v_perfect_reward_points
    FROM public.classes class
    WHERE class.id = v_class_id
      AND class.deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION '학급 보상 설정을 찾을 수 없습니다.' USING ERRCODE = '55000';
    END IF;

    IF v_run.answer_count > 0 THEN
        v_accuracy := ROUND(v_run.correct_count::NUMERIC * 100 / v_run.answer_count)::SMALLINT;
    END IF;
    v_completed := CASE
        WHEN v_run.status = 'active' THEN p_reason = 'completed' AND v_run.answer_count >= v_run.target_question_count
        ELSE v_run.finish_reason = 'completed'
    END;
    v_perfect := v_completed
        AND v_run.answer_count = v_run.target_question_count
        AND v_run.correct_count = v_run.target_question_count;
    v_event_key := format(
        'vocab-v2-perfect:%s:%s:%s', v_class_id, v_run.grade, v_run.v2_deck_number
    );

    IF v_run.status = 'active' THEN
        IF v_perfect AND v_perfect_reward_points > 0 THEN
            v_point_result := public.point_engine_apply(
                v_student_id,
                v_perfect_reward_points,
                format('어휘의 탑 %s층 완벽 연습', v_run.v2_deck_number),
                'vocab_tower',
                v_event_key,
                NULL,
                NULL,
                jsonb_build_object(
                    'source', 'vocab_tower_v2_perfect_practice',
                    'class_id', v_class_id,
                    'grade', v_run.grade,
                    'deck_number', v_run.v2_deck_number,
                    'run_id', v_run.id
                )
            );
            v_awarded_points := COALESCE((v_point_result->>'applied_amount')::INTEGER, 0);
            v_reward_earned := v_awarded_points > 0;
            v_reward_already_earned := COALESCE((v_point_result->>'duplicate')::BOOLEAN, FALSE);
        END IF;

        UPDATE public.vocab_tower_runs run
           SET status = 'finished',
               finish_reason = CASE WHEN v_completed THEN 'completed' ELSE 'exited' END,
               reward_points = v_awarded_points,
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
    ELSE
        v_awarded_points := COALESCE(v_run.reward_points, 0);
        v_reward_earned := v_awarded_points > 0;
    END IF;

    IF v_perfect AND NOT v_reward_earned THEN
        SELECT EXISTS (
            SELECT 1 FROM public.point_logs point_log
            WHERE point_log.student_id = v_student_id
              AND point_log.event_key = v_event_key
        ) INTO v_reward_already_earned;
    END IF;

    SELECT count(*)::INTEGER INTO v_item_count
    FROM public.vocab_tower_v2_review_items item
    JOIN public.vocab_tower_v2_review_decks deck ON deck.deck_id = item.deck_id
    WHERE deck.grade = v_run.grade
      AND deck.deck_number = v_run.v2_deck_number
      AND deck.review_status = 'locked';

    SELECT
        count(*)::INTEGER,
        count(*) FILTER (WHERE progress.learning_state = 'mastered')::INTEGER,
        count(*) FILTER (WHERE progress.learning_state = 'needs_review')::INTEGER,
        count(*) FILTER (WHERE progress.first_seen_run_id = v_run.id)::INTEGER,
        count(*) FILTER (WHERE progress.last_mastered_run_id = v_run.id)::INTEGER
      INTO v_seen_count, v_mastered_count, v_needs_review_count,
           v_new_words_seen, v_mastered_this_run
    FROM public.vocab_tower_v2_item_progress progress
    WHERE progress.student_id = v_student_id
      AND progress.class_id = v_class_id
      AND progress.grade = v_run.grade
      AND progress.deck_number = v_run.v2_deck_number;

    RETURN jsonb_build_object(
        'success', TRUE, 'already_finished', v_run.status <> 'active',
        'deck_number', v_run.v2_deck_number,
        'target_question_count', v_run.target_question_count,
        'reward_points', v_awarded_points,
        'perfect_reward_points', v_perfect_reward_points,
        'perfect_practice', v_perfect,
        'perfect_reward_earned', v_reward_earned,
        'perfect_reward_already_earned', v_reward_already_earned,
        'answer_count', v_run.answer_count,
        'correct_count', v_run.correct_count, 'wrong_count', v_run.wrong_count,
        'review_correct_count', 0, 'max_floor', v_run.v2_deck_number,
        'max_combo', v_run.max_combo, 'accuracy', v_accuracy,
        'practice_completed', v_completed,
        'item_count', v_item_count,
        'seen_count', v_seen_count,
        'unseen_count', GREATEST(v_item_count - v_seen_count, 0),
        'mastered_count', v_mastered_count,
        'needs_review_count', v_needs_review_count,
        'new_words_seen', v_new_words_seen,
        'mastered_this_run', v_mastered_this_run
    );
END;
$$;

DROP TRIGGER IF EXISTS record_vocab_tower_v2_item_progress_v1
    ON public.vocab_tower_answers;
CREATE TRIGGER record_vocab_tower_v2_item_progress_v1
    AFTER INSERT ON public.vocab_tower_answers
    FOR EACH ROW EXECUTE FUNCTION public.record_vocab_tower_v2_item_progress_v1();

REVOKE ALL ON FUNCTION public.record_vocab_tower_v2_item_progress_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_vocab_tower_v2_item_progress_v1() TO service_role;

WITH answer_history AS (
    SELECT
        answer.student_id,
        answer.class_id,
        run.grade,
        run.v2_deck_number AS deck_number,
        question.item_key,
        question.question_type,
        answer.run_id,
        answer.used_hint,
        answer.is_correct,
        answer.answered_at,
        row_number() OVER (
            PARTITION BY answer.student_id, answer.class_id, run.grade,
                         run.v2_deck_number, question.item_key
            ORDER BY answer.answered_at DESC, answer.id DESC
        ) AS recent_order
    FROM public.vocab_tower_answers answer
    JOIN public.vocab_tower_v2_run_questions question
      ON question.id::TEXT = answer.question_key
     AND question.run_id = answer.run_id
     AND question.student_id = answer.student_id
     AND question.class_id = answer.class_id
    JOIN public.vocab_tower_runs run
      ON run.id = answer.run_id
     AND run.student_id = answer.student_id
     AND run.class_id = answer.class_id
     AND run.content_version = 'v2'
     AND run.v2_deck_number IS NOT NULL
     AND run.target_question_count = 12
), item_facts AS (
    SELECT
        history.student_id,
        history.class_id,
        history.grade,
        history.deck_number,
        history.item_key,
        count(*)::INTEGER AS attempt_count,
        count(*) FILTER (WHERE history.is_correct)::INTEGER AS correct_count,
        count(*) FILTER (WHERE NOT history.is_correct)::INTEGER AS wrong_count,
        count(*) FILTER (
            WHERE history.recent_order <= 2
              AND history.is_correct
              AND NOT history.used_hint
        )::SMALLINT AS recent_clean_correct,
        COALESCE(
            array_agg(DISTINCT history.question_type)
                FILTER (WHERE history.is_correct AND NOT history.used_hint),
            ARRAY[]::TEXT[]
        ) AS correct_question_types,
        (array_agg(history.question_type ORDER BY history.answered_at DESC))[1] AS last_question_type,
        (array_agg(history.is_correct ORDER BY history.answered_at DESC))[1] AS last_correct,
        (array_agg(history.used_hint ORDER BY history.answered_at DESC))[1] AS last_used_hint,
        (array_agg(history.run_id ORDER BY history.answered_at ASC))[1] AS first_seen_run_id,
        (array_agg(history.run_id ORDER BY history.answered_at DESC))[1] AS last_seen_run_id,
        min(history.answered_at) AS first_seen_at,
        max(history.answered_at) AS last_seen_at
    FROM answer_history history
    GROUP BY history.student_id, history.class_id, history.grade,
             history.deck_number, history.item_key
), item_states AS (
    SELECT
        facts.*,
        CASE
            WHEN NOT facts.last_correct THEN 'needs_review'
            WHEN facts.last_used_hint THEN 'learning'
            WHEN cardinality(facts.correct_question_types) >= 2
                 AND facts.recent_clean_correct >= 2 THEN 'mastered'
            ELSE 'familiar'
        END AS learning_state
    FROM item_facts facts
)
INSERT INTO public.vocab_tower_v2_item_progress (
    student_id, class_id, grade, deck_number, item_key,
    learning_state, attempt_count, correct_count, wrong_count,
    consecutive_correct, correct_question_types, last_question_type,
    last_correct, first_seen_run_id, last_seen_run_id, last_mastered_run_id,
    first_seen_at, last_seen_at, mastered_at, next_review_at,
    created_at, updated_at
)
SELECT
    state.student_id, state.class_id, state.grade, state.deck_number, state.item_key,
    state.learning_state, state.attempt_count, state.correct_count, state.wrong_count,
    state.recent_clean_correct, state.correct_question_types, state.last_question_type,
    state.last_correct, state.first_seen_run_id, state.last_seen_run_id,
    CASE WHEN state.learning_state = 'mastered' THEN state.last_seen_run_id END,
    state.first_seen_at, state.last_seen_at,
    CASE WHEN state.learning_state = 'mastered' THEN state.last_seen_at END,
    CASE state.learning_state
        WHEN 'needs_review' THEN state.last_seen_at
        WHEN 'mastered' THEN state.last_seen_at + INTERVAL '14 days'
        WHEN 'familiar' THEN state.last_seen_at + INTERVAL '3 days'
        ELSE state.last_seen_at + INTERVAL '1 day'
    END,
    state.first_seen_at, state.last_seen_at
FROM item_states state
ON CONFLICT (student_id, class_id, grade, deck_number, item_key) DO NOTHING;

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
    v_perfect_reward_points INTEGER;
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
        END,
        LEAST(500, GREATEST(0, COALESCE(class.vocab_tower_v2_perfect_reward_points, 100)))
      INTO v_grade, v_enabled, v_perfect_reward_points
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
        'perfect_reward_earned', EXISTS (
            SELECT 1
            FROM public.point_logs point_log
            WHERE point_log.student_id = v_student_id
              AND point_log.event_key = format(
                  'vocab-v2-perfect:%s:%s:%s', v_class_id, v_grade, deck.deck_number
              )
        )
    ) ORDER BY deck.deck_number), '[]'::JSONB)
      INTO v_decks
    FROM public.vocab_tower_v2_review_decks deck
    LEFT JOIN public.vocab_tower_v2_deck_progress progress
      ON progress.student_id = v_student_id
     AND progress.class_id = v_class_id
     AND progress.grade = v_grade
     AND progress.deck_number = deck.deck_number
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
        FROM public.vocab_tower_v2_item_progress item_progress
        WHERE item_progress.student_id = v_student_id
          AND item_progress.class_id = v_class_id
          AND item_progress.grade = v_grade
          AND item_progress.deck_number = deck.deck_number
    ) learning_stats ON TRUE
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
        'perfect_reward_points', v_perfect_reward_points,
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

REVOKE ALL ON FUNCTION public.get_my_vocab_tower_v2_overview_v1() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_next_my_vocab_tower_v2_practice_question_v1(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finish_my_vocab_tower_v2_practice_v1(UUID, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_my_vocab_tower_v2_overview_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_my_vocab_tower_v2_practice_question_v1(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_my_vocab_tower_v2_practice_v1(UUID, TEXT) TO authenticated;

COMMIT;
