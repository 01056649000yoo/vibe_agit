-- 어휘의 탑 V2 개인 연습에 직접 입력형 문항을 연결한다.
--
-- 배경: 검수 완료·잠금된 1,573개 문항에는 definitionInput(뜻을 보고 낱말 쓰기)과
-- clozeInput(문장 빈칸 직접 쓰기)이 이미 준비돼 있으나 출제되지 않았다. 선택형 3종만 돌아가면
-- 4지선다를 찍어도 `서로 다른 두 유형 연속 성공 = 익힘` 조건을 통과할 수 있어 익힘 판정이 실력을 뜻하지 못했다.
--
-- 이 마이그레이션은 낱말별 학습 상태에 따라 문제 형태를 올리는 단계형 난이도를 적용한다.
--   처음 만난 낱말·연습 중·복습 필요 → 선택형으로 시작한다.
--   한 유형을 이미 힌트 없이 맞힌 낱말(familiar)과 익힘(mastered) → 직접 입력형으로 올린다.
-- 직접 입력형을 틀리면 기존 규칙대로 `복습 필요`로 내려가 다음에 다시 선택형부터 만난다. 감점은 없다.

ALTER TABLE public.vocab_tower_v2_run_questions
    ADD COLUMN IF NOT EXISTS accepted_answers JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.vocab_tower_v2_run_questions.accepted_answers IS
    '직접 입력형 문항의 허용 정답 목록. 선택형에서는 빈 배열이며 학생 응답에는 절대 내려보내지 않는다.';

ALTER TABLE public.vocab_tower_v2_run_questions
    DROP CONSTRAINT IF EXISTS vocab_tower_v2_run_questions_question_type_check;
ALTER TABLE public.vocab_tower_v2_run_questions
    ADD CONSTRAINT vocab_tower_v2_run_questions_question_type_check
    CHECK (question_type = ANY (ARRAY[
        'meaningChoice', 'clozeChoice', 'usageDistinction', 'definitionInput', 'clozeInput'
    ]));

-- 선택형은 기존대로 보기 2~6개를 요구하고, 직접 입력형은 보기가 없어야 한다.
ALTER TABLE public.vocab_tower_v2_run_questions
    DROP CONSTRAINT IF EXISTS vocab_tower_v2_run_questions_options_check;
ALTER TABLE public.vocab_tower_v2_run_questions
    ADD CONSTRAINT vocab_tower_v2_run_questions_options_check
    CHECK (
        jsonb_typeof(options) = 'array'
        AND CASE
            WHEN question_type IN ('definitionInput', 'clozeInput') THEN jsonb_array_length(options) = 0
            ELSE jsonb_array_length(options) BETWEEN 2 AND 6
        END
    );

ALTER TABLE public.vocab_tower_v2_run_questions
    DROP CONSTRAINT IF EXISTS vocab_tower_v2_run_questions_accepted_answers_check;
ALTER TABLE public.vocab_tower_v2_run_questions
    ADD CONSTRAINT vocab_tower_v2_run_questions_accepted_answers_check
    CHECK (
        jsonb_typeof(accepted_answers) = 'array'
        AND CASE
            WHEN question_type IN ('definitionInput', 'clozeInput')
                THEN jsonb_array_length(accepted_answers) BETWEEN 1 AND 10
            ELSE jsonb_array_length(accepted_answers) = 0
        END
    );

-- 낱말별 학습 상태도 새 문제 유형을 익힘 근거로 기록할 수 있어야 한다.
ALTER TABLE public.vocab_tower_v2_item_progress
    DROP CONSTRAINT IF EXISTS vocab_tower_v2_item_progress_last_question_type_check;
ALTER TABLE public.vocab_tower_v2_item_progress
    ADD CONSTRAINT vocab_tower_v2_item_progress_last_question_type_check
    CHECK (
        last_question_type IS NULL
        OR last_question_type = ANY (ARRAY[
            'meaningChoice', 'clozeChoice', 'usageDistinction', 'definitionInput', 'clozeInput'
        ])
    );

-- 학생 입력의 앞뒤 공백·중간 공백·문장부호 차이는 오답으로 보지 않는다.
-- 낱말 자체를 바꾸지는 않으므로 다른 낱말이 정답으로 통과하지는 않는다.
CREATE OR REPLACE FUNCTION public.normalize_vocab_tower_v2_answer(p_answer TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
    SELECT regexp_replace(lower(btrim(COALESCE(p_answer, ''))), '[[:space:][:punct:]]', '', 'g');
$$;

COMMENT ON FUNCTION public.normalize_vocab_tower_v2_answer(TEXT) IS
    '직접 입력형 채점용 정규화. 대소문자·공백·문장부호만 제거하고 글자는 보존한다.';

-- 직접 입력형은 보기가 없으므로 낱말·예문을 그대로 내려보내면 학생 화면 데이터만 봐도 정답을 알 수 있다.
-- 문항 payload에는 "출제문이 이미 드러낸 것"만 담고 정답 문자열과 허용 정답은 채점 전까지 서버에만 둔다.
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
    v_is_input := v_learning_state IN ('familiar', 'mastered');
    IF v_is_input THEN
        v_question_type := CASE MOD(v_sequence::INTEGER, 2) WHEN 0 THEN 'definitionInput' ELSE 'clozeInput' END;
        v_question := v_item.questions->v_question_type;
        SELECT jsonb_agg(DISTINCT answer) INTO v_accepted
        FROM jsonb_array_elements_text(COALESCE(v_question->'acceptedAnswers', '[]'::jsonb)) answer
        WHERE char_length(btrim(answer)) BETWEEN 1 AND 100;
        -- 허용 정답이 비었거나 검수 전이면 선택형으로 안전하게 되돌린다.
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

    IF v_question->>'status' <> 'reviewed' THEN
        RAISE EXCEPTION '검수 완료 문항만 출제할 수 있습니다.' USING ERRCODE = '55000';
    END IF;

    INSERT INTO public.vocab_tower_v2_run_questions (
        run_id, student_id, class_id, item_key, deck_id, sequence_number,
        room_type, question_type, prompt, options, accepted_answers, correct_answer, explanation,
        word, definition, example, difficulty, category, is_review, selection_focus
    ) VALUES (
        v_run.id, v_student_id, v_class_id, v_item.item_key, v_deck.deck_id, v_sequence,
        v_room_type, v_question_type, v_question->>'prompt', v_options, v_accepted, v_correct_answer,
        COALESCE(NULLIF(BTRIM(v_question->>'explanation'), ''), v_item.definition),
        v_item.word, v_item.definition, v_item.example, v_item.difficulty, v_item.category,
        v_selection_focus IN ('weak', 'review'), v_selection_focus
    ) RETURNING * INTO v_existing;

    RETURN public.build_vocab_tower_v2_question_payload_v1(
            v_existing, v_run.target_question_count, v_run.v2_deck_number);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_my_vocab_tower_v2_practice_question_v1(UUID) TO authenticated;

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
            'word', v_question.word, 'example', v_question.example,
            'definition', v_question.definition,
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

    IF v_question.question_type IN ('definitionInput', 'clozeInput') THEN
        SELECT EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(v_question.accepted_answers) accepted
            WHERE public.normalize_vocab_tower_v2_answer(accepted)
                  = public.normalize_vocab_tower_v2_answer(p_selected_answer)
              AND public.normalize_vocab_tower_v2_answer(accepted) <> ''
        ) INTO v_is_correct;
    ELSE
        v_is_correct := p_selected_answer = v_question.correct_answer;
    END IF;

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
        'explanation', v_question.explanation,
        'word', v_question.word, 'example', v_question.example,
            'definition', v_question.definition,
        'answer_count', v_answer_count,
        'correct_count', v_correct_count, 'wrong_count', v_wrong_count,
        'review_correct_count', 0, 'current_floor', v_run.current_floor,
        'current_combo', v_combo, 'max_combo', v_max_combo,
        'floor_cleared', FALSE, 'completed', v_answer_count >= v_run.target_question_count,
        'deck_number', v_run.v2_deck_number,
        'target_question_count', v_run.target_question_count
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_my_vocab_tower_v2_practice_answer_v1(UUID, UUID, TEXT, BOOLEAN) TO authenticated;
