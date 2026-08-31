-- 운영 `테스트` 학급의 로그인 가능 학생 한 명을 빌려 어휘의 탑 정책 2를 가상 완주한다.
-- scripts/run-rollback-smoke.mjs가 바깥을 BEGIN/ROLLBACK으로 감싸므로 실제 기록·포인트는 남지 않는다.

CREATE TEMP TABLE vocab_tower_virtual_results (
    scenario TEXT NOT NULL,
    floor SMALLINT NOT NULL,
    questions SMALLINT NOT NULL,
    meaning_choice SMALLINT NOT NULL,
    cloze_choice SMALLINT NOT NULL,
    usage_distinction SMALLINT NOT NULL,
    direct_input SMALLINT NOT NULL,
    preferred_difficulty_questions SMALLINT NOT NULL,
    correct_answers SMALLINT NOT NULL,
    wrong_answers SMALLINT NOT NULL,
    completed BOOLEAN NOT NULL
) ON COMMIT DROP;

DO $$
DECLARE
    v_class_id UUID;
    v_student_id UUID;
    v_student_auth_id UUID;
BEGIN
    SELECT class.id, student.id, student.auth_id
      INTO v_class_id, v_student_id, v_student_auth_id
    FROM public.classes class
    JOIN public.profiles profile
      ON profile.id = class.teacher_id
     AND profile.role = 'ADMIN'
     AND profile.is_approved IS TRUE
     AND profile.approval_revoked_at IS NULL
    JOIN public.students student
      ON student.class_id = class.id
     AND student.auth_id IS NOT NULL
     AND student.is_active IS DISTINCT FROM FALSE
     AND student.deleted_at IS NULL
    WHERE class.name = '테스트'
      AND class.deleted_at IS NULL
    ORDER BY class.created_at, student.created_at
    LIMIT 1;

    IF v_class_id IS NULL OR v_student_id IS NULL OR v_student_auth_id IS NULL THEN
        RAISE EXCEPTION '관리자 테스트 학급의 로그인 가능 학생을 찾지 못했습니다.';
    END IF;

    PERFORM set_config('test.vocab_virtual_class_id', v_class_id::TEXT, true);
    PERFORM set_config('test.vocab_virtual_student_id', v_student_id::TEXT, true);
    PERFORM set_config('test.vocab_virtual_student_auth_id', v_student_auth_id::TEXT, true);
END;
$$;

DO $$
DECLARE
    v_class_id UUID := current_setting('test.vocab_virtual_class_id')::UUID;
    v_student_id UUID := current_setting('test.vocab_virtual_student_id')::UUID;
BEGIN
    UPDATE public.classes class
       SET vocab_tower_grade = 3,
           vocab_tower_enabled = TRUE,
           vocab_tower_content_version = 'v2',
           enabled_modules = CASE
               WHEN class.enabled_modules IS NULL THEN ARRAY['vocab-tower']::TEXT[]
               WHEN 'vocab-tower' = ANY(class.enabled_modules) THEN class.enabled_modules
               ELSE array_append(class.enabled_modules, 'vocab-tower')
           END
     WHERE class.id = v_class_id;

    UPDATE public.vocab_tower_runs
       SET status = 'abandoned', finish_reason = 'exited', finished_at = NOW()
     WHERE student_id = v_student_id
       AND status = 'active';

    INSERT INTO public.vocab_tower_practice_policy_classes (class_id, policy_version)
    VALUES (v_class_id, 2)
    ON CONFLICT (class_id) DO UPDATE SET policy_version = EXCLUDED.policy_version;

    -- 모든 낱말을 familiar로 준비해 각 층의 직접 입력 최대치가 실제로 나오는지 본다.
    INSERT INTO public.learning_item_progress (
        student_id, class_id, content_type, collection_key, item_key,
        learning_state, attempt_count, correct_count, wrong_count, consecutive_correct,
        correct_question_types, last_question_type, last_correct, next_review_at
    )
    SELECT v_student_id, v_class_id, 'vocab',
           public.vocab_tower_v2_collection_key(3::SMALLINT, deck.deck_number), item.item_key,
           'familiar', 1, 1, 0, 1, ARRAY['meaningChoice']::TEXT[],
           'meaningChoice', TRUE, NOW() - INTERVAL '1 day'
    FROM public.vocab_tower_v2_review_decks deck
    JOIN public.vocab_tower_v2_review_items item ON item.deck_id = deck.deck_id
    WHERE deck.grade = 3
      AND deck.deck_number BETWEEN 1 AND 10
      AND deck.review_status = 'locked'
    ON CONFLICT (student_id, class_id, content_type, collection_key, item_key) DO UPDATE
       SET learning_state = 'familiar',
           attempt_count = 1,
           correct_count = 1,
           wrong_count = 0,
           consecutive_correct = 1,
           correct_question_types = ARRAY['meaningChoice']::TEXT[],
           last_question_type = 'meaningChoice',
           last_correct = TRUE,
           next_review_at = NOW() - INTERVAL '1 day';

    PERFORM set_config('request.jwt.claim.sub', current_setting('test.vocab_virtual_student_auth_id'), true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', current_setting('test.vocab_virtual_student_auth_id'),
        'role', 'authenticated'
    )::TEXT, true);
END;
$$;

DO $$
DECLARE
    v_class_id UUID := current_setting('test.vocab_virtual_class_id')::UUID;
    v_student_id UUID := current_setting('test.vocab_virtual_student_id')::UUID;
    v_floor SMALLINT;
    v_sequence SMALLINT;
    v_run_id UUID;
    v_question JSONB;
    v_result JSONB;
    v_summary JSONB;
    v_policy JSONB;
    v_expected_type TEXT;
    v_expected_option_count SMALLINT;
    v_correct_answer TEXT;
    v_preferred_difficulties SMALLINT[];
    v_expected_preferred_count SMALLINT;
    v_actual_preferred_count SMALLINT;
    v_question_count SMALLINT;
    v_distinct_item_count SMALLINT;
BEGIN
    FOR v_floor IN 1..10 LOOP
        v_policy := public.vocab_tower_v2_practice_floor_policy_v1(v_floor::SMALLINT);
        SELECT COALESCE(array_agg(value::SMALLINT), ARRAY[]::SMALLINT[])
          INTO v_preferred_difficulties
        FROM jsonb_array_elements_text(v_policy->'preferred_difficulties');

        SELECT LEAST(12, count(*))::SMALLINT
          INTO v_expected_preferred_count
        FROM public.vocab_tower_v2_review_items item
        JOIN public.vocab_tower_v2_review_decks deck ON deck.deck_id = item.deck_id
        WHERE deck.grade = 3
          AND deck.deck_number = v_floor
          AND deck.review_status = 'locked'
          AND item.difficulty = ANY(v_preferred_difficulties);

        INSERT INTO public.vocab_tower_runs (
            student_id, class_id, run_date, grade, daily_limit, floor_time_limit,
            reward_cap, content_version, v2_deck_number, target_question_count, current_floor
        ) VALUES (
            v_student_id, v_class_id, CURRENT_DATE, 3, 3, 40,
            0, 'v2', v_floor, 12, v_floor
        ) RETURNING id INTO v_run_id;

        IF (SELECT practice_policy_version FROM public.vocab_tower_runs WHERE id = v_run_id) <> 2 THEN
            RAISE EXCEPTION '%층 가상 실행이 정책 2로 시작되지 않았습니다.', v_floor;
        END IF;

        FOR v_sequence IN 1..12 LOOP
            v_question := public.get_next_my_vocab_tower_v2_practice_question_v1(v_run_id);
            v_expected_type := v_policy->'question_types'->>(v_sequence - 1);

            IF v_question->>'question_type' IS DISTINCT FROM v_expected_type THEN
                RAISE EXCEPTION '%층 %번 유형 불일치: expected %, got %',
                    v_floor, v_sequence, v_expected_type, v_question->>'question_type';
            END IF;

            v_expected_option_count := CASE
                WHEN v_expected_type IN ('definitionInput', 'clozeInput') THEN 0
                WHEN v_expected_type = 'usageDistinction' THEN 2
                ELSE (v_policy->>'choice_option_count')::SMALLINT
            END;
            IF jsonb_array_length(v_question->'options') <> v_expected_option_count THEN
                RAISE EXCEPTION '%층 %번 보기 수 불일치: expected %, got %',
                    v_floor, v_sequence, v_expected_option_count,
                    jsonb_array_length(v_question->'options');
            END IF;

            SELECT count(*)::SMALLINT, count(DISTINCT question.item_key)::SMALLINT
              INTO v_question_count, v_distinct_item_count
            FROM public.vocab_tower_v2_run_questions question
            WHERE question.run_id = v_run_id;
            IF v_question_count <> v_sequence OR v_distinct_item_count <> v_sequence THEN
                RAISE EXCEPTION '%층 %번에서 낱말 중복 또는 문항 수 오류가 생겼습니다.', v_floor, v_sequence;
            END IF;

            SELECT question.correct_answer
              INTO v_correct_answer
            FROM public.vocab_tower_v2_run_questions question
            WHERE question.id = (v_question->>'question_key')::UUID;

            UPDATE public.vocab_tower_runs
               SET last_answered_at = clock_timestamp() - INTERVAL '1 second'
             WHERE id = v_run_id;
            v_result := public.submit_my_vocab_tower_v2_practice_answer_v1(
                v_run_id, (v_question->>'question_key')::UUID, v_correct_answer, FALSE);

            IF NOT COALESCE((v_result->>'success')::BOOLEAN, FALSE)
               OR NOT COALESCE((v_result->>'is_correct')::BOOLEAN, FALSE)
               OR (v_result->>'answer_count')::SMALLINT <> v_sequence THEN
                RAISE EXCEPTION '%층 %번 정답 제출 또는 진행 수가 올바르지 않습니다: %',
                    v_floor, v_sequence, v_result;
            END IF;
        END LOOP;

        v_summary := public.finish_my_vocab_tower_v2_practice_v1(v_run_id, 'completed');
        IF NOT COALESCE((v_summary->>'practice_completed')::BOOLEAN, FALSE)
           OR (v_summary->>'answer_count')::SMALLINT <> 12
           OR (v_summary->>'correct_count')::SMALLINT <> 12
           OR (v_summary->>'accuracy')::NUMERIC <> 100 THEN
            RAISE EXCEPTION '%층 완주 결과가 올바르지 않습니다: %', v_floor, v_summary;
        END IF;

        SELECT count(*) FILTER (WHERE question.difficulty = ANY(v_preferred_difficulties))::SMALLINT
          INTO v_actual_preferred_count
        FROM public.vocab_tower_v2_run_questions question
        WHERE question.run_id = v_run_id;
        IF v_actual_preferred_count <> v_expected_preferred_count THEN
            RAISE EXCEPTION '%층 우선 난이도 문항 수 불일치: expected %, got %',
                v_floor, v_expected_preferred_count, v_actual_preferred_count;
        END IF;

        INSERT INTO vocab_tower_virtual_results (
            scenario, floor, questions, meaning_choice, cloze_choice, usage_distinction,
            direct_input, preferred_difficulty_questions, correct_answers, wrong_answers, completed
        )
        SELECT 'perfect', v_floor, count(*)::SMALLINT,
               count(*) FILTER (WHERE question_type = 'meaningChoice')::SMALLINT,
               count(*) FILTER (WHERE question_type = 'clozeChoice')::SMALLINT,
               count(*) FILTER (WHERE question_type = 'usageDistinction')::SMALLINT,
               count(*) FILTER (WHERE question_type IN ('definitionInput', 'clozeInput'))::SMALLINT,
               v_actual_preferred_count, 12, 0, TRUE
        FROM public.vocab_tower_v2_run_questions
        WHERE run_id = v_run_id;
    END LOOP;
END;
$$;

-- 오답 한 번을 넣어 3문항 뒤 같은 낱말이 다른 선택형으로 돌아오는 보충 수련도 가상 실행한다.
DO $$
DECLARE
    v_class_id UUID := current_setting('test.vocab_virtual_class_id')::UUID;
    v_student_id UUID := current_setting('test.vocab_virtual_student_id')::UUID;
    v_run_id UUID;
    v_sequence SMALLINT;
    v_question JSONB;
    v_result JSONB;
    v_summary JSONB;
    v_correct_answer TEXT;
    v_first_item_key TEXT;
    v_first_question_type TEXT;
BEGIN
    UPDATE public.vocab_tower_runs
       SET status = 'abandoned', finish_reason = 'exited', finished_at = NOW()
     WHERE student_id = v_student_id
       AND status = 'active';

    UPDATE public.learning_item_progress progress
       SET learning_state = 'familiar',
           attempt_count = 1,
           correct_count = 1,
           wrong_count = 0,
           consecutive_correct = 1,
           correct_question_types = ARRAY['meaningChoice']::TEXT[],
           last_question_type = 'meaningChoice',
           last_correct = TRUE,
           next_review_at = NOW() - INTERVAL '1 day'
     WHERE progress.student_id = v_student_id
       AND progress.class_id = v_class_id
       AND progress.content_type = 'vocab'
       AND progress.collection_key = public.vocab_tower_v2_collection_key(3::SMALLINT, 7::SMALLINT);

    INSERT INTO public.vocab_tower_runs (
        student_id, class_id, run_date, grade, daily_limit, floor_time_limit,
        reward_cap, content_version, v2_deck_number, target_question_count, current_floor
    ) VALUES (
        v_student_id, v_class_id, CURRENT_DATE, 3, 3, 40,
        0, 'v2', 7, 12, 7
    ) RETURNING id INTO v_run_id;

    FOR v_sequence IN 1..12 LOOP
        v_question := public.get_next_my_vocab_tower_v2_practice_question_v1(v_run_id);

        IF v_sequence = 1 THEN
            SELECT question.correct_answer, question.item_key
              INTO v_correct_answer, v_first_item_key
            FROM public.vocab_tower_v2_run_questions question
            WHERE question.id = (v_question->>'question_key')::UUID;
            v_first_question_type := v_question->>'question_type';
        ELSE
            SELECT question.correct_answer
              INTO v_correct_answer
            FROM public.vocab_tower_v2_run_questions question
            WHERE question.id = (v_question->>'question_key')::UUID;

            IF v_sequence = 4
               AND (
                   NOT COALESCE((v_question->>'is_retry')::BOOLEAN, FALSE)
                   OR (SELECT item_key FROM public.vocab_tower_v2_run_questions
                       WHERE id = (v_question->>'question_key')::UUID) <> v_first_item_key
                   OR v_question->>'question_type' = v_first_question_type
                   OR v_question->>'question_type' IN ('definitionInput', 'clozeInput')
               ) THEN
                RAISE EXCEPTION '7층 보충 수련이 3문항 뒤 다른 선택형으로 나오지 않았습니다: %', v_question;
            END IF;
        END IF;

        UPDATE public.vocab_tower_runs
           SET last_answered_at = clock_timestamp() - INTERVAL '1 second'
         WHERE id = v_run_id;
        v_result := public.submit_my_vocab_tower_v2_practice_answer_v1(
            v_run_id,
            (v_question->>'question_key')::UUID,
            CASE WHEN v_sequence = 1 THEN '__가상오답__' ELSE v_correct_answer END,
            FALSE
        );

        IF v_sequence = 1 AND COALESCE((v_result->>'is_correct')::BOOLEAN, TRUE) THEN
            RAISE EXCEPTION '고의 오답이 정답으로 처리됐습니다.';
        ELSIF v_sequence > 1 AND NOT COALESCE((v_result->>'is_correct')::BOOLEAN, FALSE) THEN
            RAISE EXCEPTION '7층 %번 정답이 오답으로 처리됐습니다: %', v_sequence, v_result;
        END IF;
    END LOOP;

    v_summary := public.finish_my_vocab_tower_v2_practice_v1(v_run_id, 'completed');
    IF NOT COALESCE((v_summary->>'practice_completed')::BOOLEAN, FALSE)
       OR (v_summary->>'correct_count')::SMALLINT <> 11
       OR (v_summary->>'wrong_count')::SMALLINT <> 1 THEN
        RAISE EXCEPTION '보충 수련 가상 완주 결과가 올바르지 않습니다: %', v_summary;
    END IF;

    INSERT INTO vocab_tower_virtual_results (
        scenario, floor, questions, meaning_choice, cloze_choice, usage_distinction,
        direct_input, preferred_difficulty_questions, correct_answers, wrong_answers, completed
    )
    SELECT 'one-wrong-with-retry', 7, count(*)::SMALLINT,
           count(*) FILTER (WHERE question_type = 'meaningChoice')::SMALLINT,
           count(*) FILTER (WHERE question_type = 'clozeChoice')::SMALLINT,
           count(*) FILTER (WHERE question_type = 'usageDistinction')::SMALLINT,
           count(*) FILTER (WHERE question_type IN ('definitionInput', 'clozeInput'))::SMALLINT,
           count(*) FILTER (WHERE difficulty = 3)::SMALLINT,
           11, 1, TRUE
    FROM public.vocab_tower_v2_run_questions
    WHERE run_id = v_run_id;
END;
$$;

SELECT scenario, floor, questions, meaning_choice, cloze_choice, usage_distinction,
       direct_input, preferred_difficulty_questions, correct_answers, wrong_answers, completed
FROM vocab_tower_virtual_results
ORDER BY CASE scenario WHEN 'perfect' THEN 1 ELSE 2 END, floor;
