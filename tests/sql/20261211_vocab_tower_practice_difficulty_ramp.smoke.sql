-- 층별 문항 구성·보기 수·우선 난이도와 제한 공개 경계를 실제 운영 스키마에서 확인한다.
-- migrate:check의 바깥 트랜잭션 안에서 실행되며 마지막에 전부 롤백된다.

DO $$
DECLARE
    v_floor SMALLINT;
    v_policy JSONB;
    v_types JSONB;
    v_expected_counts SMALLINT[];
    v_actual_counts SMALLINT[];
BEGIN
    IF has_function_privilege('anon', 'public.vocab_tower_v2_practice_floor_policy_v1(smallint)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.vocab_tower_v2_practice_floor_policy_v1(smallint)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.vocab_tower_v2_practice_floor_policy_v1(smallint)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.apply_vocab_tower_v2_practice_floor_policy_v1()', 'EXECUTE') THEN
        RAISE EXCEPTION 'practice difficulty helpers must stay private';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger trigger
        WHERE trigger.tgrelid = 'public.vocab_tower_v2_run_questions'::regclass
          AND trigger.tgname = 'apply_vocab_tower_v2_practice_floor_policy_v1'
          AND NOT trigger.tgisinternal
    ) THEN
        RAISE EXCEPTION 'practice difficulty trigger is missing';
    END IF;

    FOR v_floor, v_expected_counts IN
        SELECT expected.floor, expected.counts
        FROM (VALUES
            (1::SMALLINT, ARRAY[6,6,0,0]::SMALLINT[]),
            (2::SMALLINT, ARRAY[5,5,2,0]::SMALLINT[]),
            (3::SMALLINT, ARRAY[4,5,2,1]::SMALLINT[]),
            (4::SMALLINT, ARRAY[4,4,3,1]::SMALLINT[]),
            (5::SMALLINT, ARRAY[4,3,3,2]::SMALLINT[]),
            (6::SMALLINT, ARRAY[3,4,3,2]::SMALLINT[]),
            (7::SMALLINT, ARRAY[3,3,3,3]::SMALLINT[]),
            (8::SMALLINT, ARRAY[2,3,4,3]::SMALLINT[]),
            (9::SMALLINT, ARRAY[2,2,4,4]::SMALLINT[]),
            (10::SMALLINT, ARRAY[2,2,3,5]::SMALLINT[])
        ) AS expected(floor, counts)
    LOOP
        v_policy := public.vocab_tower_v2_practice_floor_policy_v1(v_floor);
        v_types := v_policy->'question_types';
        SELECT ARRAY[
            count(*) FILTER (WHERE value = 'meaningChoice'),
            count(*) FILTER (WHERE value = 'clozeChoice'),
            count(*) FILTER (WHERE value = 'usageDistinction'),
            count(*) FILTER (WHERE value IN ('definitionInput', 'clozeInput'))
        ]::SMALLINT[] INTO v_actual_counts
        FROM jsonb_array_elements_text(v_types);

        IF jsonb_array_length(v_types) <> 12 OR v_actual_counts IS DISTINCT FROM v_expected_counts THEN
            RAISE EXCEPTION 'floor % question mix differs: %', v_floor, v_actual_counts;
        END IF;
        IF EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(v_types) WITH ORDINALITY entry(value, ordinality)
            WHERE entry.ordinality <= 3
              AND entry.value IN ('definitionInput', 'clozeInput')
        ) THEN
            RAISE EXCEPTION 'floor % first three questions must stay choice-only', v_floor;
        END IF;
        IF EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(v_policy->'preferred_difficulties') value
            WHERE value::SMALLINT NOT BETWEEN 1 AND 3
        ) THEN
            RAISE EXCEPTION 'floor % prefers a difficulty absent from operating content', v_floor;
        END IF;
    END LOOP;
END;
$$;

SELECT set_config('test.vocab_difficulty_class_id', class.id::TEXT, true),
       set_config('test.vocab_difficulty_student_id', student.id::TEXT, true),
       set_config('test.vocab_difficulty_student_auth_id', student.auth_id::TEXT, true)
FROM public.classes class
JOIN public.profiles profile
  ON profile.id = class.teacher_id
 AND profile.is_approved IS TRUE
 AND profile.approval_revoked_at IS NULL
JOIN public.students student
  ON student.class_id = class.id
 AND student.auth_id IS NOT NULL
 AND student.is_active IS DISTINCT FROM FALSE
 AND student.deleted_at IS NULL
WHERE class.deleted_at IS NULL
ORDER BY (profile.role = 'ADMIN') DESC, class.created_at
LIMIT 1;

DO $$
DECLARE
    v_class_id UUID := current_setting('test.vocab_difficulty_class_id', true)::UUID;
    v_student_id UUID := current_setting('test.vocab_difficulty_student_id', true)::UUID;
    v_run_id UUID;
    v_question JSONB;
    v_correct TEXT;
    v_sequence SMALLINT;
    v_expected_type TEXT;
    v_expected_options SMALLINT;
BEGIN
    IF v_class_id IS NULL OR v_student_id IS NULL
       OR current_setting('test.vocab_difficulty_student_auth_id', true) IS NULL THEN
        RAISE EXCEPTION 'vocab difficulty smoke fixture is missing';
    END IF;

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
     WHERE student_id = v_student_id AND status = 'active';

    INSERT INTO public.vocab_tower_practice_policy_classes (class_id, policy_version)
    VALUES (v_class_id, 2)
    ON CONFLICT (class_id) DO UPDATE SET policy_version = EXCLUDED.policy_version;

    -- 입력 슬롯도 실제로 나오도록 두 시험 층의 낱말을 familiar 상태로 맞춘다.
    INSERT INTO public.learning_item_progress (
        student_id, class_id, content_type, collection_key, item_key,
        learning_state, attempt_count, correct_count, consecutive_correct,
        correct_question_types, last_question_type, last_correct, next_review_at
    )
    SELECT v_student_id, v_class_id, 'vocab',
           public.vocab_tower_v2_collection_key(3::SMALLINT, deck.deck_number), item.item_key,
           'familiar', 1, 1, 1, ARRAY['meaningChoice']::TEXT[],
           'meaningChoice', TRUE, NOW() - INTERVAL '1 day'
    FROM public.vocab_tower_v2_review_decks deck
    JOIN public.vocab_tower_v2_review_items item ON item.deck_id = deck.deck_id
    WHERE deck.grade = 3 AND deck.deck_number IN (2, 10) AND deck.review_status = 'locked'
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

    PERFORM set_config('request.jwt.claim.sub', current_setting('test.vocab_difficulty_student_auth_id'), true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', current_setting('test.vocab_difficulty_student_auth_id'), 'role', 'authenticated'
    )::TEXT, true);

    -- 2층: 뜻·문맥은 3보기, 쓰임 구별은 원자료의 2보기를 유지하며 계획 순서대로 나온다.
    INSERT INTO public.vocab_tower_runs (
        student_id, class_id, run_date, grade, daily_limit, floor_time_limit,
        reward_cap, content_version, v2_deck_number, target_question_count, current_floor
    ) VALUES (
        v_student_id, v_class_id, CURRENT_DATE, 3, 3, 40,
        0, 'v2', 2, 12, 2
    ) RETURNING id INTO v_run_id;

    FOR v_sequence IN 1..12 LOOP
        v_question := public.get_next_my_vocab_tower_v2_practice_question_v1(v_run_id);
        v_expected_type := public.vocab_tower_v2_practice_floor_policy_v1(2::SMALLINT)
            ->'question_types'->>(v_sequence - 1);
        IF v_question->>'question_type' IS DISTINCT FROM v_expected_type THEN
            RAISE EXCEPTION 'floor 2 sequence % type differs: %', v_sequence, v_question->>'question_type';
        END IF;
        v_expected_options := CASE v_expected_type WHEN 'usageDistinction' THEN 2 ELSE 3 END;
        IF jsonb_array_length(v_question->'options') <> v_expected_options THEN
            RAISE EXCEPTION 'floor 2 sequence % option count differs: %',
                v_sequence, jsonb_array_length(v_question->'options');
        END IF;
        IF (v_question->'word'->>'level')::SMALLINT NOT IN (1, 2) THEN
            RAISE EXCEPTION 'floor 2 did not prefer difficulty 1 or 2 at sequence %', v_sequence;
        END IF;
        SELECT correct_answer INTO v_correct
        FROM public.vocab_tower_v2_run_questions
        WHERE id = (v_question->>'question_key')::UUID;
        UPDATE public.vocab_tower_runs
           SET last_answered_at = clock_timestamp() - INTERVAL '1 second'
         WHERE id = v_run_id;
        PERFORM public.submit_my_vocab_tower_v2_practice_answer_v1(
            v_run_id, (v_question->>'question_key')::UUID, v_correct, FALSE);
    END LOOP;
    PERFORM public.finish_my_vocab_tower_v2_practice_v1(v_run_id, 'completed');

    -- 10층: 5개의 직접 입력이 정의·문맥 입력으로 번갈아 나오고 첫 후보는 난이도 3을 우선한다.
    INSERT INTO public.vocab_tower_runs (
        student_id, class_id, run_date, grade, daily_limit, floor_time_limit,
        reward_cap, content_version, v2_deck_number, target_question_count, current_floor
    ) VALUES (
        v_student_id, v_class_id, CURRENT_DATE, 3, 3, 40,
        0, 'v2', 10, 12, 10
    ) RETURNING id INTO v_run_id;

    FOR v_sequence IN 1..12 LOOP
        v_question := public.get_next_my_vocab_tower_v2_practice_question_v1(v_run_id);
        v_expected_type := public.vocab_tower_v2_practice_floor_policy_v1(10::SMALLINT)
            ->'question_types'->>(v_sequence - 1);
        IF v_question->>'question_type' IS DISTINCT FROM v_expected_type THEN
            RAISE EXCEPTION 'floor 10 sequence % type differs: expected %, got %',
                v_sequence, v_expected_type, v_question->>'question_type';
        END IF;
        IF v_sequence = 1 AND (v_question->'word'->>'level')::SMALLINT <> 3 THEN
            RAISE EXCEPTION 'floor 10 first question must prefer difficulty 3';
        END IF;
        SELECT correct_answer INTO v_correct
        FROM public.vocab_tower_v2_run_questions
        WHERE id = (v_question->>'question_key')::UUID;
        UPDATE public.vocab_tower_runs
           SET last_answered_at = clock_timestamp() - INTERVAL '1 second'
         WHERE id = v_run_id;
        PERFORM public.submit_my_vocab_tower_v2_practice_answer_v1(
            v_run_id, (v_question->>'question_key')::UUID, v_correct, FALSE);
    END LOOP;
END;
$$;
