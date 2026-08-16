-- migrate:check가 만든 바깥 트랜잭션에서 실행되며 마지막에 전부 롤백된다.

DO $$
BEGIN
    IF has_table_privilege('authenticated', 'public.vocab_tower_v2_item_progress', 'SELECT')
       OR has_table_privilege('authenticated', 'public.vocab_tower_v2_item_progress', 'INSERT')
       OR has_table_privilege('authenticated', 'public.vocab_tower_v2_item_progress', 'UPDATE') THEN
        RAISE EXCEPTION 'authenticated가 V2 낱말 학습 상태 표에 직접 접근할 수 있습니다.';
    END IF;
END;
$$;

SELECT set_config('test.vocab_learning_class_id', class.id::TEXT, true),
       set_config('test.vocab_learning_teacher_id', class.teacher_id::TEXT, true),
       set_config('test.vocab_learning_student_id', student.id::TEXT, true),
       set_config('test.vocab_learning_student_auth_id', student.auth_id::TEXT, true)
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
    v_student_id UUID := current_setting('test.vocab_learning_student_id', true)::UUID;
BEGIN
    IF current_setting('test.vocab_learning_class_id', true) IS NULL
       OR current_setting('test.vocab_learning_teacher_id', true) IS NULL
       OR v_student_id IS NULL
       OR current_setting('test.vocab_learning_student_auth_id', true) IS NULL THEN
        RAISE EXCEPTION 'V2 낱말 학습 상태 스모크용 fixture가 없습니다.';
    END IF;

    UPDATE public.classes class
       SET vocab_tower_grade = 3,
           vocab_tower_enabled = TRUE,
           enabled_modules = CASE
               WHEN class.enabled_modules IS NULL THEN ARRAY['vocab-tower']::TEXT[]
               WHEN 'vocab-tower' = ANY(class.enabled_modules) THEN class.enabled_modules
               ELSE array_append(class.enabled_modules, 'vocab-tower')
           END
     WHERE class.id = current_setting('test.vocab_learning_class_id')::UUID;

    UPDATE public.vocab_tower_runs run
       SET status = 'abandoned', finish_reason = 'exited', finished_at = NOW()
     WHERE run.student_id = v_student_id
       AND run.status = 'active';

    DELETE FROM public.vocab_tower_v2_item_progress progress
     WHERE progress.student_id = v_student_id
       AND progress.class_id = current_setting('test.vocab_learning_class_id')::UUID
       AND progress.grade = 3
       AND progress.deck_number = 8;
END;
$$;

SELECT set_config('request.jwt.claim.sub', current_setting('test.vocab_learning_teacher_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.vocab_learning_teacher_id'), 'role', 'authenticated'
)::TEXT, true);
SELECT public.set_teacher_vocab_tower_content_version_v2(
    current_setting('test.vocab_learning_class_id')::UUID, 'v2'
);

SELECT set_config('request.jwt.claim.sub', current_setting('test.vocab_learning_student_auth_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.vocab_learning_student_auth_id'), 'role', 'authenticated'
)::TEXT, true);

DO $$
DECLARE
    v_run JSONB;
    v_question JSONB;
    v_result JSONB;
    v_overview JSONB;
    v_deck JSONB;
    v_item_key TEXT;
    v_correct_answer TEXT;
    v_wrong_answer TEXT;
    v_progress public.vocab_tower_v2_item_progress%ROWTYPE;
BEGIN
    v_run := public.start_my_vocab_tower_v2_practice_v1(8::SMALLINT);
    v_question := public.get_next_my_vocab_tower_v2_practice_question_v1(
        (v_run->>'run_id')::UUID
    );
    IF v_question->>'practice_focus' <> 'new' OR v_question ? 'correct_answer' THEN
        RAISE EXCEPTION '첫 출제가 새 낱말 분류이거나 정답 비노출 상태가 아닙니다: %', v_question;
    END IF;

    SELECT question.item_key, question.correct_answer
      INTO v_item_key, v_correct_answer
    FROM public.vocab_tower_v2_run_questions question
    WHERE question.id = (v_question->>'question_key')::UUID;
    SELECT option
      INTO v_wrong_answer
    FROM jsonb_array_elements_text(v_question->'options') option
    WHERE option <> v_correct_answer
    LIMIT 1;

    v_result := public.submit_my_vocab_tower_v2_practice_answer_v1(
        (v_run->>'run_id')::UUID,
        (v_question->>'question_key')::UUID,
        v_wrong_answer,
        FALSE
    );
    IF v_result->>'is_correct' <> 'false' THEN
        RAISE EXCEPTION '의도한 오답이 정답 처리됐습니다: %', v_result;
    END IF;

    SELECT progress.* INTO v_progress
    FROM public.vocab_tower_v2_item_progress progress
    WHERE progress.student_id = current_setting('test.vocab_learning_student_id')::UUID
      AND progress.class_id = current_setting('test.vocab_learning_class_id')::UUID
      AND progress.grade = 3
      AND progress.deck_number = 8
      AND progress.item_key = v_item_key;
    IF v_progress.learning_state <> 'needs_review'
       OR v_progress.attempt_count <> 1
       OR v_progress.wrong_count <> 1 THEN
        RAISE EXCEPTION '오답 낱말이 복습 필요 상태로 저장되지 않았습니다: %', row_to_json(v_progress);
    END IF;

    PERFORM public.finish_my_vocab_tower_v2_practice_v1(
        (v_run->>'run_id')::UUID, 'exited'
    );

    v_run := public.start_my_vocab_tower_v2_practice_v1(8::SMALLINT);
    v_question := public.get_next_my_vocab_tower_v2_practice_question_v1(
        (v_run->>'run_id')::UUID
    );
    IF v_question->>'practice_focus' <> 'weak' THEN
        RAISE EXCEPTION '다음 연습 첫 문항이 약점 우선 출제가 아닙니다: %', v_question;
    END IF;
    IF (SELECT question.item_key FROM public.vocab_tower_v2_run_questions question
        WHERE question.id = (v_question->>'question_key')::UUID) <> v_item_key THEN
        RAISE EXCEPTION '직전 오답 낱말이 다음 연습에서 우선 출제되지 않았습니다.';
    END IF;

    UPDATE public.vocab_tower_v2_item_progress progress
       SET learning_state = 'familiar',
           consecutive_correct = 1,
           correct_question_types = ARRAY['meaningChoice']::TEXT[]
     WHERE progress.student_id = current_setting('test.vocab_learning_student_id')::UUID
       AND progress.class_id = current_setting('test.vocab_learning_class_id')::UUID
       AND progress.grade = 3
       AND progress.deck_number = 8
       AND progress.item_key = v_item_key;
    UPDATE public.vocab_tower_v2_run_questions question
       SET question_type = 'clozeChoice'
     WHERE question.id = (v_question->>'question_key')::UUID;

    SELECT question.correct_answer INTO v_correct_answer
    FROM public.vocab_tower_v2_run_questions question
    WHERE question.id = (v_question->>'question_key')::UUID;
    v_result := public.submit_my_vocab_tower_v2_practice_answer_v1(
        (v_run->>'run_id')::UUID,
        (v_question->>'question_key')::UUID,
        v_correct_answer,
        FALSE
    );
    SELECT progress.* INTO v_progress
    FROM public.vocab_tower_v2_item_progress progress
    WHERE progress.student_id = current_setting('test.vocab_learning_student_id')::UUID
      AND progress.class_id = current_setting('test.vocab_learning_class_id')::UUID
      AND progress.grade = 3
      AND progress.deck_number = 8
      AND progress.item_key = v_item_key;
    IF v_progress.learning_state <> 'mastered'
       OR cardinality(v_progress.correct_question_types) <> 2
       OR v_progress.last_mastered_run_id <> (v_run->>'run_id')::UUID THEN
        RAISE EXCEPTION '서로 다른 두 유형 성공이 익힘 상태로 전환되지 않았습니다: %', row_to_json(v_progress);
    END IF;

    v_result := public.finish_my_vocab_tower_v2_practice_v1(
        (v_run->>'run_id')::UUID, 'exited'
    );
    IF (v_result->>'mastered_count')::INTEGER < 1
       OR (v_result->>'mastered_this_run')::INTEGER < 1 THEN
        RAISE EXCEPTION '연습 결과에 낱말 익힘 요약이 없습니다: %', v_result;
    END IF;

    v_overview := public.get_my_vocab_tower_v2_overview_v1();
    SELECT deck INTO v_deck
    FROM jsonb_array_elements(v_overview->'decks') deck
    WHERE (deck->>'deck_number')::INTEGER = 8;
    IF (v_deck->>'mastered_count')::INTEGER < 1
       OR (v_deck->>'seen_count')::INTEGER < 1
       OR (v_deck->>'unseen_count')::INTEGER >= (v_deck->>'item_count')::INTEGER THEN
        RAISE EXCEPTION '덱 지도에 낱말별 학습 상태가 반영되지 않았습니다: %', v_deck;
    END IF;
END;
$$;
