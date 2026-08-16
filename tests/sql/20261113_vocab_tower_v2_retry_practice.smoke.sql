-- migrate:check가 만든 바깥 트랜잭션에서 실행되며 마지막에 전부 롤백된다.
-- 같은 연습에서 틀린 낱말이 3문항 뒤 다른 형태로 한 번만 다시 나오는지 확인한다.

SELECT set_config('test.vocab_retry_class_id', class.id::TEXT, true),
       set_config('test.vocab_retry_teacher_id', class.teacher_id::TEXT, true),
       set_config('test.vocab_retry_student_id', student.id::TEXT, true),
       set_config('test.vocab_retry_student_auth_id', student.auth_id::TEXT, true)
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
    v_student_id UUID := current_setting('test.vocab_retry_student_id', true)::UUID;
    v_class_id UUID;
BEGIN
    IF current_setting('test.vocab_retry_class_id', true) IS NULL OR v_student_id IS NULL THEN
        RAISE EXCEPTION '보충 수련 스모크용 fixture가 없습니다.';
    END IF;
    v_class_id := current_setting('test.vocab_retry_class_id')::UUID;

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
       AND progress.class_id = v_class_id;
END;
$$;

SELECT set_config('request.jwt.claim.sub', current_setting('test.vocab_retry_teacher_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.vocab_retry_teacher_id'), 'role', 'authenticated'
)::TEXT, true);
SELECT public.set_teacher_vocab_tower_content_version_v2(
    current_setting('test.vocab_retry_class_id')::UUID, 'v2'
);

SELECT set_config('request.jwt.claim.sub', current_setting('test.vocab_retry_student_auth_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.vocab_retry_student_auth_id'), 'role', 'authenticated'
)::TEXT, true);

DO $$
DECLARE
    v_run_id UUID;
    v_run JSONB;
    v_question JSONB;
    v_result JSONB;
    v_missed_item TEXT;
    v_missed_type TEXT;
    v_missed_sequence SMALLINT;
    v_retry_sequence SMALLINT := NULL;
    v_retry_type TEXT;
    v_retry_count INTEGER;
    v_correct TEXT;
    v_wrong TEXT;
    v_index INTEGER;
BEGIN
    v_run := public.start_my_vocab_tower_v2_practice_v1(5::SMALLINT);
    v_run_id := (v_run->>'run_id')::UUID;

    -- 1번 문항을 일부러 틀린다.
    v_question := public.get_next_my_vocab_tower_v2_practice_question_v1(v_run_id);
    IF (v_question->>'is_retry')::BOOLEAN IS TRUE THEN
        RAISE EXCEPTION '첫 문항이 보충 수련으로 나왔습니다: %', v_question;
    END IF;

    SELECT asked.item_key, asked.question_type, asked.sequence_number, asked.correct_answer
      INTO v_missed_item, v_missed_type, v_missed_sequence, v_correct
    FROM public.vocab_tower_v2_run_questions asked
    WHERE asked.id = (v_question->>'question_key')::UUID;

    SELECT option INTO v_wrong
    FROM jsonb_array_elements_text(v_question->'options') option
    WHERE option <> v_correct
    LIMIT 1;

    PERFORM pg_sleep(0.2);
    v_result := public.submit_my_vocab_tower_v2_practice_answer_v1(
        v_run_id, (v_question->>'question_key')::UUID, v_wrong, FALSE
    );
    IF v_result->>'is_correct' <> 'false' THEN
        RAISE EXCEPTION '의도한 오답이 정답 처리됐습니다: %', v_result;
    END IF;

    -- 이후 문항을 이어 풀며 보충 수련이 언제 어떤 형태로 나오는지 본다.
    FOR v_index IN 2..8 LOOP
        v_question := public.get_next_my_vocab_tower_v2_practice_question_v1(v_run_id);

        IF (v_question->>'is_retry')::BOOLEAN IS TRUE AND v_retry_sequence IS NULL THEN
            v_retry_sequence := (v_question->>'sequence_number')::SMALLINT;
            SELECT asked.item_key, asked.question_type INTO v_missed_item, v_retry_type
            FROM public.vocab_tower_v2_run_questions asked
            WHERE asked.id = (v_question->>'question_key')::UUID;

            IF v_question->>'practice_focus' <> 'retry' THEN
                RAISE EXCEPTION '보충 수련 문항의 분류가 retry가 아닙니다: %', v_question;
            END IF;
        END IF;

        SELECT asked.correct_answer INTO v_correct
        FROM public.vocab_tower_v2_run_questions asked
        WHERE asked.id = (v_question->>'question_key')::UUID;

        PERFORM pg_sleep(0.2);
        PERFORM public.submit_my_vocab_tower_v2_practice_answer_v1(
            v_run_id, (v_question->>'question_key')::UUID, v_correct, FALSE
        );
    END LOOP;

    IF v_retry_sequence IS NULL THEN
        RAISE EXCEPTION '틀린 낱말이 같은 연습에서 다시 나오지 않았습니다.';
    END IF;
    -- 바로 다음 문제로 내지 않고 3문항 이상 지난 뒤에 낸다.
    IF v_retry_sequence < v_missed_sequence + 3 THEN
        RAISE EXCEPTION '보충 수련이 너무 빨리 나왔습니다: 오답 %번 → 재출제 %번',
            v_missed_sequence, v_retry_sequence;
    END IF;
    IF v_retry_type = v_missed_type THEN
        RAISE EXCEPTION '보충 수련이 같은 형태로 다시 나왔습니다: %', v_retry_type;
    END IF;
    IF v_retry_type IN ('definitionInput', 'clozeInput') THEN
        RAISE EXCEPTION '방금 틀린 낱말을 직접 입력형으로 올렸습니다: %', v_retry_type;
    END IF;

    -- 같은 낱말을 세 번 이상 내지 않는다.
    SELECT count(*)::INTEGER INTO v_retry_count
    FROM public.vocab_tower_v2_run_questions asked
    WHERE asked.run_id = v_run_id
      AND asked.item_key = v_missed_item;
    IF v_retry_count <> 2 THEN
        RAISE EXCEPTION '틀린 낱말이 한 연습에서 %번 출제됐습니다.', v_retry_count;
    END IF;

    PERFORM public.finish_my_vocab_tower_v2_practice_v1(v_run_id, 'exited');
END;
$$;

-- 모두 맞히면 보충 수련이 끼어들지 않는다.
DO $$
DECLARE
    v_student_id UUID := current_setting('test.vocab_retry_student_id')::UUID;
    v_class_id UUID := current_setting('test.vocab_retry_class_id')::UUID;
    v_run_id UUID;
    v_run JSONB;
    v_question JSONB;
    v_correct TEXT;
    v_index INTEGER;
BEGIN
    DELETE FROM public.vocab_tower_v2_item_progress progress
     WHERE progress.student_id = v_student_id
       AND progress.class_id = v_class_id;

    v_run := public.start_my_vocab_tower_v2_practice_v1(6::SMALLINT);
    v_run_id := (v_run->>'run_id')::UUID;

    FOR v_index IN 1..6 LOOP
        v_question := public.get_next_my_vocab_tower_v2_practice_question_v1(v_run_id);
        IF (v_question->>'is_retry')::BOOLEAN IS TRUE THEN
            RAISE EXCEPTION '오답이 없는데 보충 수련이 나왔습니다: %번 문항', v_index;
        END IF;

        SELECT asked.correct_answer INTO v_correct
        FROM public.vocab_tower_v2_run_questions asked
        WHERE asked.id = (v_question->>'question_key')::UUID;

        PERFORM pg_sleep(0.2);
        PERFORM public.submit_my_vocab_tower_v2_practice_answer_v1(
            v_run_id, (v_question->>'question_key')::UUID, v_correct, FALSE
        );
    END LOOP;

    PERFORM public.finish_my_vocab_tower_v2_practice_v1(v_run_id, 'exited');
END;
$$;
