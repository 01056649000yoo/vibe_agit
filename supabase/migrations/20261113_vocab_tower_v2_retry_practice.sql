-- 어휘의 탑 V2 개인 연습에 보충 수련(같은 연습 안 재출제)을 붙인다.
--
-- 배경: 지금은 틀린 낱말을 `다음 연습`의 첫 약점 슬롯에서야 다시 만난다. 같은 연습 안에서는 다시 나오지 않아
-- 방금 틀린 낱말을 바로 붙잡지 못했다. 계획대로 틀린 낱말을 3문항 뒤부터 `다른 형태`로 한 번 더 낸다.
--
-- 규칙:
--   - 틀린 문항은 3문항 이상 지난 뒤 가장 오래된 것부터 한 번만 다시 낸다. 바로 다음 문제로 내지 않는 이유는
--     정답을 외워 누르는 것을 막기 위해서다.
--   - 재출제는 방금 틀린 것과 다른 유형으로 낸다. 직접 입력형을 틀렸으면 선택형으로 낮춰 다시 묻는다.
--   - 재출제도 12문항 예산 안에서 이뤄진다. 많이 틀린 학생은 새 낱말을 덜 만나고 틀린 낱말을 더 붙잡는다.
--   - 재출제를 맞혀도 익힘 조건(서로 다른 두 유형 연속 성공)은 그대로다. 오답으로 연속 성공이 끊겼기 때문에
--     한 번 맞힌 것만으로 익힘이 되지 않는다.

ALTER TABLE public.vocab_tower_v2_run_questions
    ADD COLUMN IF NOT EXISTS is_retry BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.vocab_tower_v2_run_questions.is_retry IS
    '같은 연습에서 틀린 낱말을 다른 형태로 다시 낸 보충 수련 문항인지.';

ALTER TABLE public.vocab_tower_v2_run_questions
    DROP CONSTRAINT IF EXISTS vocab_tower_v2_run_questions_selection_focus_check;
ALTER TABLE public.vocab_tower_v2_run_questions
    ADD CONSTRAINT vocab_tower_v2_run_questions_selection_focus_check
    CHECK (selection_focus = ANY (ARRAY['weak', 'review', 'new', 'mastered', 'retry']));

CREATE OR REPLACE FUNCTION public.build_vocab_tower_v2_question_payload_v1(
    p_question public.vocab_tower_v2_run_questions,
    p_target_question_count SMALLINT,
    p_deck_number SMALLINT
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
    SELECT jsonb_build_object(
        'question_key', p_question.id,
        'deck_number', p_deck_number,
        'sequence_number', p_question.sequence_number,
        'target_question_count', p_target_question_count,
        'room_type', p_question.room_type,
        'question_type', p_question.question_type,
        'prompt', p_question.prompt,
        'options', p_question.options,
        'word', jsonb_build_object(
            -- 직접 입력형에서는 정답 낱말과 정답이 들어 있는 예문을 감춘다.
            'word', CASE WHEN p_question.question_type IN ('definitionInput', 'clozeInput')
                THEN '' ELSE p_question.word END,
            'definition', CASE WHEN p_question.question_type = 'clozeInput'
                THEN '' ELSE p_question.definition END,
            'example', CASE WHEN p_question.question_type IN ('definitionInput', 'clozeInput')
                THEN '' ELSE p_question.example END,
            'level', p_question.difficulty,
            'category', p_question.category
        ),
        'is_review', p_question.is_review,
        'is_retry', p_question.is_retry,
        'practice_focus', p_question.selection_focus
    );
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
    v_accepted JSONB;
    v_correct_answer TEXT;
    v_sequence SMALLINT;
    v_target_focus TEXT;
    v_selection_focus TEXT;
    v_learning_state TEXT;
    v_is_input BOOLEAN;
    v_is_retry BOOLEAN := FALSE;
    v_retry_source_type TEXT;
    v_candidate TEXT;
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
        RETURN public.build_vocab_tower_v2_question_payload_v1(
            v_existing, v_run.target_question_count, v_run.v2_deck_number);
    END IF;

    v_sequence := (v_run.answer_count + 1)::SMALLINT;

    -- 보충 수련 우선: 3문항 이상 지난 오답 중 아직 다시 내지 않은 가장 오래된 낱말을 고른다.
    SELECT asked.item_key, asked.question_type
      INTO v_item_key, v_retry_source_type
    FROM public.vocab_tower_v2_run_questions asked
    JOIN public.vocab_tower_answers answer
      ON answer.run_id = asked.run_id
     AND answer.question_key = asked.id::TEXT
    WHERE asked.run_id = v_run.id
      AND answer.is_correct IS FALSE
      AND asked.sequence_number <= v_sequence - 3
      AND NOT EXISTS (
          SELECT 1
          FROM public.vocab_tower_v2_run_questions repeated
          WHERE repeated.run_id = v_run.id
            AND repeated.item_key = asked.item_key
            AND repeated.sequence_number > asked.sequence_number
      )
    ORDER BY asked.sequence_number
    LIMIT 1;

    IF v_item_key IS NOT NULL THEN
        v_is_retry := TRUE;
        v_selection_focus := 'retry';
    ELSE
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
                progress.learning_state,
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
        SELECT candidate.item_key, candidate.selection_focus, candidate.learning_state
          INTO v_item_key, v_selection_focus, v_learning_state
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
    END IF;

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

    -- 단계형 난이도: 이미 한 유형을 힌트 없이 성공한 낱말만 직접 입력형으로 올린다.
    -- 보충 수련은 방금 틀린 낱말이므로 입력형으로 올리지 않고 선택형으로 다시 묻는다.
    v_is_input := NOT v_is_retry AND v_learning_state IN ('familiar', 'mastered');
    IF v_is_input THEN
        v_question_type := CASE MOD(v_sequence::INTEGER, 2) WHEN 0 THEN 'definitionInput' ELSE 'clozeInput' END;
        v_question := v_item.questions->v_question_type;
        SELECT jsonb_agg(DISTINCT answer) INTO v_accepted
        FROM jsonb_array_elements_text(COALESCE(v_question->'acceptedAnswers', '[]'::jsonb)) answer
        WHERE char_length(btrim(answer)) BETWEEN 1 AND 100;
        IF v_question->>'status' <> 'reviewed'
           OR v_accepted IS NULL
           OR jsonb_array_length(v_accepted) NOT BETWEEN 1 AND 10 THEN
            v_is_input := FALSE;
        END IF;
    END IF;

    IF v_is_input THEN
        v_room_type := CASE v_question_type WHEN 'definitionInput' THEN 'meaning' ELSE 'sentence' END;
        v_options := '[]'::jsonb;
        v_correct_answer := v_accepted->>0;
    ELSE
        v_accepted := '[]'::jsonb;
        v_question_type := NULL;

        IF v_is_retry THEN
            -- 방금 틀린 형태를 피해 다른 선택형부터 시도한다.
            FOREACH v_candidate IN ARRAY ARRAY['meaningChoice', 'clozeChoice', 'usageDistinction'] LOOP
                CONTINUE WHEN v_candidate = v_retry_source_type;
                IF (v_item.questions->v_candidate)->>'status' = 'reviewed' THEN
                    v_question_type := v_candidate;
                    EXIT;
                END IF;
            END LOOP;
        END IF;

        IF v_question_type IS NULL THEN
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
        END IF;

        v_room_type := CASE v_question_type
            WHEN 'clozeChoice' THEN 'sentence'
            WHEN 'usageDistinction' THEN 'distinction'
            ELSE 'meaning'
        END;
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
    END IF;

    INSERT INTO public.vocab_tower_v2_run_questions (
        run_id, student_id, class_id, item_key, deck_id, sequence_number,
        room_type, question_type, prompt, options, accepted_answers, correct_answer, explanation,
        word, definition, example, difficulty, category, is_review, is_retry, selection_focus
    ) VALUES (
        v_run.id, v_student_id, v_class_id, v_item.item_key, v_deck.deck_id, v_sequence,
        v_room_type, v_question_type, v_question->>'prompt', v_options, v_accepted, v_correct_answer,
        COALESCE(NULLIF(BTRIM(v_question->>'explanation'), ''), v_item.definition),
        v_item.word, v_item.definition, v_item.example, v_item.difficulty, v_item.category,
        v_is_retry OR v_selection_focus IN ('weak', 'review'), v_is_retry, v_selection_focus
    ) RETURNING * INTO v_existing;

    RETURN public.build_vocab_tower_v2_question_payload_v1(
        v_existing, v_run.target_question_count, v_run.v2_deck_number);
END;
$$;

REVOKE ALL ON FUNCTION public.get_next_my_vocab_tower_v2_practice_question_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_next_my_vocab_tower_v2_practice_question_v1(UUID) TO authenticated;
