-- migrate:check가 만든 바깥 트랜잭션에서 실행되며 마지막에 전부 롤백된다.
-- 직접 입력형 출제·정답 비노출·정규화 채점·익힘 전환을 실제 운영 스키마에서 확인한다.

SELECT set_config('test.vocab_input_class_id', class.id::TEXT, true),
       set_config('test.vocab_input_teacher_id', class.teacher_id::TEXT, true),
       set_config('test.vocab_input_student_id', student.id::TEXT, true),
       set_config('test.vocab_input_student_auth_id', student.auth_id::TEXT, true)
FROM public.classes class
JOIN public.profiles profile
  ON profile.id = class.teacher_id
 AND profile.role = 'TEACHER'
 AND profile.is_approved IS TRUE
 AND profile.approval_revoked_at IS NULL
JOIN public.students student
  ON student.class_id = class.id
 AND student.auth_id IS NOT NULL
 AND student.is_active IS DISTINCT FROM FALSE
 AND student.deleted_at IS NULL
WHERE class.deleted_at IS NULL
ORDER BY class.created_at
LIMIT 1;

DO $$
DECLARE
    v_student_id UUID := current_setting('test.vocab_input_student_id', true)::UUID;
    v_class_id UUID;
BEGIN
    IF current_setting('test.vocab_input_class_id', true) IS NULL
       OR v_student_id IS NULL
       OR current_setting('test.vocab_input_student_auth_id', true) IS NULL THEN
        RAISE EXCEPTION '직접 입력형 스모크용 fixture가 없습니다.';
    END IF;
    v_class_id := current_setting('test.vocab_input_class_id')::UUID;

    UPDATE public.classes class
       SET vocab_tower_grade = 3,
           vocab_tower_enabled = TRUE,
           enabled_modules = CASE
               WHEN class.enabled_modules IS NULL THEN ARRAY['vocab-tower']::TEXT[]
               WHEN 'vocab-tower' = ANY(class.enabled_modules) THEN class.enabled_modules
               ELSE array_append(class.enabled_modules, 'vocab-tower')
           END
     WHERE class.id = v_class_id;

    UPDATE public.vocab_tower_runs run
       SET status = 'abandoned', finish_reason = 'exited', finished_at = NOW()
     WHERE run.student_id = v_student_id
       AND run.status = 'active';

    DELETE FROM public.vocab_tower_v2_item_progress progress
     WHERE progress.student_id = v_student_id
       AND progress.class_id = v_class_id
       AND progress.grade = 3
       AND progress.deck_number = 8;
END;
$$;

-- 정규화는 공백·문장부호·대소문자만 지우고 글자는 남긴다.
DO $$
BEGIN
    IF public.normalize_vocab_tower_v2_answer('  과 제. ') <> '과제' THEN
        RAISE EXCEPTION '공백·마침표를 지운 정규화 결과가 다릅니다: %',
            public.normalize_vocab_tower_v2_answer('  과 제. ');
    END IF;
    IF public.normalize_vocab_tower_v2_answer('과제') = public.normalize_vocab_tower_v2_answer('숙제') THEN
        RAISE EXCEPTION '다른 낱말이 같은 정규화 결과로 합쳐졌습니다.';
    END IF;
    IF public.normalize_vocab_tower_v2_answer(NULL) <> '' THEN
        RAISE EXCEPTION 'NULL 입력이 빈 문자열로 정규화되지 않았습니다.';
    END IF;
END;
$$;

SELECT set_config('request.jwt.claim.sub', current_setting('test.vocab_input_teacher_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.vocab_input_teacher_id'), 'role', 'authenticated'
)::TEXT, true);
SELECT public.set_teacher_vocab_tower_content_version_v2(
    current_setting('test.vocab_input_class_id')::UUID, 'v2'
);

SELECT set_config('request.jwt.claim.sub', current_setting('test.vocab_input_student_auth_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.vocab_input_student_auth_id'), 'role', 'authenticated'
)::TEXT, true);

-- 1) 처음 만난 낱말만 있는 상태에서는 선택형으로 시작한다.
DO $$
DECLARE
    v_run JSONB;
    v_question JSONB;
BEGIN
    v_run := public.start_my_vocab_tower_v2_practice_v1(8::SMALLINT);
    v_question := public.get_next_my_vocab_tower_v2_practice_question_v1((v_run->>'run_id')::UUID);

    IF v_question->>'question_type' NOT IN ('meaningChoice', 'clozeChoice', 'usageDistinction') THEN
        RAISE EXCEPTION '처음 만난 낱말이 선택형으로 출제되지 않았습니다: %', v_question->>'question_type';
    END IF;
    IF jsonb_array_length(v_question->'options') < 2 THEN
        RAISE EXCEPTION '선택형인데 보기가 없습니다: %', v_question;
    END IF;

    PERFORM public.finish_my_vocab_tower_v2_practice_v1((v_run->>'run_id')::UUID, 'exited');
END;
$$;

-- 2) 한 유형을 이미 성공한 낱말(familiar)만 남기면 직접 입력형으로 올라간다.
DO $$
DECLARE
    v_student_id UUID := current_setting('test.vocab_input_student_id')::UUID;
    v_class_id UUID := current_setting('test.vocab_input_class_id')::UUID;
    v_run JSONB;
    v_question JSONB;
    v_result JSONB;
    v_question_id UUID;
    v_item_key TEXT;
    v_accepted JSONB;
    v_typed TEXT;
    v_progress public.vocab_tower_v2_item_progress%ROWTYPE;
BEGIN
    DELETE FROM public.vocab_tower_v2_item_progress progress
     WHERE progress.student_id = v_student_id
       AND progress.class_id = v_class_id
       AND progress.grade = 3
       AND progress.deck_number = 8;

    -- 8번 덱 전체를 `한 유형 성공`으로 두어 어떤 낱말이 뽑혀도 입력형이 되게 한다.
    INSERT INTO public.vocab_tower_v2_item_progress (
        student_id, class_id, grade, deck_number, item_key,
        learning_state, attempt_count, correct_count, wrong_count,
        consecutive_correct, correct_question_types, last_question_type,
        last_correct, next_review_at
    )
    SELECT v_student_id, v_class_id, 3, 8, item.item_key,
           'familiar', 1, 1, 0, 1, ARRAY['meaningChoice']::TEXT[], 'meaningChoice',
           TRUE, NOW() - INTERVAL '1 day'
    FROM public.vocab_tower_v2_review_items item
    JOIN public.vocab_tower_v2_review_decks deck ON deck.deck_id = item.deck_id
    WHERE deck.grade = 3 AND deck.deck_number = 8 AND deck.review_status = 'locked';

    v_run := public.start_my_vocab_tower_v2_practice_v1(8::SMALLINT);
    v_question := public.get_next_my_vocab_tower_v2_practice_question_v1((v_run->>'run_id')::UUID);

    IF v_question->>'question_type' NOT IN ('definitionInput', 'clozeInput') THEN
        RAISE EXCEPTION '한 유형 성공 낱말이 직접 입력형으로 올라가지 않았습니다: %', v_question->>'question_type';
    END IF;
    IF jsonb_array_length(v_question->'options') <> 0 THEN
        RAISE EXCEPTION '직접 입력형에 보기가 내려갔습니다: %', v_question->'options';
    END IF;

    -- 정답 문자열이 학생 payload로 새지 않아야 한다.
    IF v_question ? 'correct_answer' OR v_question ? 'accepted_answers' THEN
        RAISE EXCEPTION '직접 입력형 payload에 정답이 포함됐습니다: %', v_question;
    END IF;
    IF COALESCE(v_question->'word'->>'word', '') <> '' THEN
        RAISE EXCEPTION '직접 입력형 payload에 정답 낱말이 그대로 있습니다: %', v_question->'word';
    END IF;
    IF COALESCE(v_question->'word'->>'example', '') <> '' THEN
        RAISE EXCEPTION '직접 입력형 payload에 정답이 든 예문이 그대로 있습니다: %', v_question->'word';
    END IF;
    IF v_question->>'question_type' = 'clozeInput'
       AND COALESCE(v_question->'word'->>'definition', '') <> '' THEN
        RAISE EXCEPTION '빈칸 입력형 payload에 뜻이 노출됐습니다: %', v_question->'word';
    END IF;

    v_question_id := (v_question->>'question_key')::UUID;
    SELECT question.item_key, question.accepted_answers
      INTO v_item_key, v_accepted
    FROM public.vocab_tower_v2_run_questions question
    WHERE question.id = v_question_id;

    IF v_accepted IS NULL OR jsonb_array_length(v_accepted) < 1 THEN
        RAISE EXCEPTION '직접 입력형 문항에 허용 정답이 저장되지 않았습니다.';
    END IF;

    -- 학생이 공백과 마침표를 섞어 써도 정답으로 인정한다.
    v_typed := ' ' || (v_accepted->>0) || '. ';
    v_result := public.submit_my_vocab_tower_v2_practice_answer_v1(
        (v_run->>'run_id')::UUID, v_question_id, v_typed, FALSE
    );
    IF v_result->>'is_correct' <> 'true' THEN
        RAISE EXCEPTION '공백·마침표가 섞인 정답이 오답 처리됐습니다: % → %', v_typed, v_result;
    END IF;
    IF COALESCE(v_result->>'word', '') = '' OR COALESCE(v_result->>'example', '') = '' THEN
        RAISE EXCEPTION '채점 응답이 낱말과 예문을 돌려주지 않아 해설을 만들 수 없습니다: %', v_result;
    END IF;

    -- 선택형 1회 + 입력형 1회 = 서로 다른 두 유형 연속 성공이므로 익힘으로 올라간다.
    SELECT progress.* INTO v_progress
    FROM public.vocab_tower_v2_item_progress progress
    WHERE progress.student_id = v_student_id
      AND progress.class_id = v_class_id
      AND progress.grade = 3
      AND progress.deck_number = 8
      AND progress.item_key = v_item_key;
    IF v_progress.learning_state <> 'mastered' THEN
        RAISE EXCEPTION '직접 입력형 성공 뒤 익힘으로 전환되지 않았습니다: %', row_to_json(v_progress);
    END IF;
    IF cardinality(v_progress.correct_question_types) < 2 THEN
        RAISE EXCEPTION '익힘 근거에 서로 다른 두 유형이 쌓이지 않았습니다: %', v_progress.correct_question_types;
    END IF;

    PERFORM public.finish_my_vocab_tower_v2_practice_v1((v_run->>'run_id')::UUID, 'exited');
END;
$$;

-- 3) 직접 입력형 오답은 복습 필요로 내려가고 다음에는 다시 선택형으로 만난다.
DO $$
DECLARE
    v_student_id UUID := current_setting('test.vocab_input_student_id')::UUID;
    v_class_id UUID := current_setting('test.vocab_input_class_id')::UUID;
    v_run JSONB;
    v_question JSONB;
    v_result JSONB;
    v_item_key TEXT;
    v_progress public.vocab_tower_v2_item_progress%ROWTYPE;
BEGIN
    UPDATE public.vocab_tower_v2_item_progress progress
       SET learning_state = 'familiar',
           consecutive_correct = 1,
           correct_question_types = ARRAY['meaningChoice']::TEXT[],
           next_review_at = NOW() - INTERVAL '1 day'
     WHERE progress.student_id = v_student_id
       AND progress.class_id = v_class_id
       AND progress.grade = 3
       AND progress.deck_number = 8;

    v_run := public.start_my_vocab_tower_v2_practice_v1(8::SMALLINT);
    v_question := public.get_next_my_vocab_tower_v2_practice_question_v1((v_run->>'run_id')::UUID);
    IF v_question->>'question_type' NOT IN ('definitionInput', 'clozeInput') THEN
        RAISE EXCEPTION '두 번째 확인에서 직접 입력형이 나오지 않았습니다: %', v_question->>'question_type';
    END IF;

    SELECT question.item_key INTO v_item_key
    FROM public.vocab_tower_v2_run_questions question
    WHERE question.id = (v_question->>'question_key')::UUID;

    v_result := public.submit_my_vocab_tower_v2_practice_answer_v1(
        (v_run->>'run_id')::UUID,
        (v_question->>'question_key')::UUID,
        '확실히아닌답',
        FALSE
    );
    IF v_result->>'is_correct' <> 'false' THEN
        RAISE EXCEPTION '틀린 입력이 정답 처리됐습니다: %', v_result;
    END IF;

    SELECT progress.* INTO v_progress
    FROM public.vocab_tower_v2_item_progress progress
    WHERE progress.student_id = v_student_id
      AND progress.class_id = v_class_id
      AND progress.grade = 3
      AND progress.deck_number = 8
      AND progress.item_key = v_item_key;
    IF v_progress.learning_state <> 'needs_review' THEN
        RAISE EXCEPTION '직접 입력형 오답이 복습 필요로 내려가지 않았습니다: %', row_to_json(v_progress);
    END IF;

    -- 복습 필요로 내려간 낱말은 다시 선택형으로 만나야 한다.
    UPDATE public.vocab_tower_v2_item_progress progress
       SET learning_state = 'needs_review'
     WHERE progress.student_id = v_student_id
       AND progress.class_id = v_class_id
       AND progress.grade = 3
       AND progress.deck_number = 8;

    v_question := public.get_next_my_vocab_tower_v2_practice_question_v1((v_run->>'run_id')::UUID);
    IF v_question->>'question_type' NOT IN ('meaningChoice', 'clozeChoice', 'usageDistinction') THEN
        RAISE EXCEPTION '복습 필요 낱말이 선택형으로 돌아가지 않았습니다: %', v_question->>'question_type';
    END IF;

    PERFORM public.finish_my_vocab_tower_v2_practice_v1((v_run->>'run_id')::UUID, 'exited');
END;
$$;
