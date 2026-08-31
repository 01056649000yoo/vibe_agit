-- 층별 직접 입력 상한·새 판 스냅샷·제한 공개를 실제 운영 스키마에서 확인한다.
-- migrate:check의 바깥 트랜잭션에서 실행되며 마지막에 전부 롤백된다.

DO $$
DECLARE
    v_floor SMALLINT;
    v_expected SMALLINT[];
    v_slots SMALLINT[];
BEGIN
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.vocab_tower_practice_policy_classes'::regclass)
       OR has_table_privilege('anon', 'public.vocab_tower_practice_policy_classes', 'SELECT')
       OR has_table_privilege('authenticated', 'public.vocab_tower_practice_policy_classes', 'SELECT')
       OR has_table_privilege('service_role', 'public.vocab_tower_practice_policy_classes', 'SELECT') THEN
        RAISE EXCEPTION 'practice policy rollout table must stay private';
    END IF;

    FOR v_floor, v_expected IN
        SELECT expected.floor, expected.slots
        FROM (VALUES
            (1::SMALLINT, ARRAY[]::SMALLINT[]),
            (2::SMALLINT, ARRAY[]::SMALLINT[]),
            (3::SMALLINT, ARRAY[10]::SMALLINT[]),
            (4::SMALLINT, ARRAY[9]::SMALLINT[]),
            (5::SMALLINT, ARRAY[7,11]::SMALLINT[]),
            (6::SMALLINT, ARRAY[6,10]::SMALLINT[]),
            (7::SMALLINT, ARRAY[5,8,11]::SMALLINT[]),
            (8::SMALLINT, ARRAY[4,8,12]::SMALLINT[]),
            (9::SMALLINT, ARRAY[4,6,9,12]::SMALLINT[]),
            (10::SMALLINT, ARRAY[4,6,8,10,12]::SMALLINT[])
        ) AS expected(floor, slots)
    LOOP
        v_slots := public.vocab_tower_v2_practice_input_slots_v1(v_floor);
        IF v_slots IS DISTINCT FROM v_expected THEN
            RAISE EXCEPTION 'floor % slots differ: %', v_floor, v_slots;
        END IF;
        IF EXISTS (SELECT 1 FROM unnest(v_slots) slot WHERE slot <= 3) THEN
            RAISE EXCEPTION 'first three questions must be choice-only on floor %: %', v_floor, v_slots;
        END IF;
    END LOOP;
END;
$$;

SELECT set_config('test.vocab_ramp_class_id', class.id::TEXT, true),
       set_config('test.vocab_ramp_student_id', student.id::TEXT, true),
       set_config('test.vocab_ramp_student_auth_id', student.auth_id::TEXT, true)
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
    v_class_id UUID := current_setting('test.vocab_ramp_class_id', true)::UUID;
    v_student_id UUID := current_setting('test.vocab_ramp_student_id', true)::UUID;
    v_old_run_id UUID;
    v_new_run_id UUID;
BEGIN
    IF v_class_id IS NULL OR v_student_id IS NULL
       OR current_setting('test.vocab_ramp_student_auth_id', true) IS NULL THEN
        RAISE EXCEPTION 'vocab ramp smoke fixture is missing';
    END IF;

    UPDATE public.vocab_tower_runs
       SET status = 'abandoned', finish_reason = 'exited', finished_at = NOW()
     WHERE student_id = v_student_id AND status = 'active';

    DELETE FROM public.vocab_tower_practice_policy_classes WHERE class_id = v_class_id;
    INSERT INTO public.vocab_tower_runs (
        student_id, class_id, run_date, grade, daily_limit, floor_time_limit,
        reward_cap, content_version, v2_deck_number, target_question_count, current_floor,
        status, finish_reason, finished_at
    ) VALUES (
        v_student_id, v_class_id, CURRENT_DATE, 3, 3, 40,
        0, 'v2', 1, 12, 1, 'abandoned', 'exited', NOW()
    ) RETURNING id INTO v_old_run_id;

    IF (SELECT practice_policy_version FROM public.vocab_tower_runs WHERE id = v_old_run_id) <> 1 THEN
        RAISE EXCEPTION 'non-rollout run must snapshot policy 1';
    END IF;

    INSERT INTO public.vocab_tower_practice_policy_classes (class_id, policy_version)
    VALUES (v_class_id, 2);
    INSERT INTO public.vocab_tower_runs (
        student_id, class_id, run_date, grade, daily_limit, floor_time_limit,
        reward_cap, content_version, v2_deck_number, target_question_count, current_floor,
        status, finish_reason, finished_at
    ) VALUES (
        v_student_id, v_class_id, CURRENT_DATE, 3, 3, 40,
        0, 'v2', 1, 12, 1, 'abandoned', 'exited', NOW()
    ) RETURNING id INTO v_new_run_id;

    IF (SELECT practice_policy_version FROM public.vocab_tower_runs WHERE id = v_new_run_id) <> 2 THEN
        RAISE EXCEPTION 'rollout run must snapshot policy 2';
    END IF;
END;
$$;

DO $$
DECLARE
    v_class_id UUID := current_setting('test.vocab_ramp_class_id')::UUID;
    v_student_id UUID := current_setting('test.vocab_ramp_student_id')::UUID;
    v_run_id UUID;
    v_question JSONB;
    v_correct TEXT;
    v_sequence SMALLINT;
    v_input_sequences SMALLINT[] := ARRAY[]::SMALLINT[];
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
     WHERE student_id = v_student_id AND status = 'active';

    -- 모든 낱말을 familiar로 두어 입력 슬롯이면 반드시 직접 입력이 나올 수 있게 한다.
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
    WHERE deck.grade = 3 AND deck.deck_number IN (1, 10) AND deck.review_status = 'locked'
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

    PERFORM set_config('request.jwt.claim.sub', current_setting('test.vocab_ramp_student_auth_id'), true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', current_setting('test.vocab_ramp_student_auth_id'), 'role', 'authenticated'
    )::TEXT, true);

    -- 1층은 익숙한 낱말만 있어도 12문항 모두 선택형이어야 한다.
    INSERT INTO public.vocab_tower_runs (
        student_id, class_id, run_date, grade, daily_limit, floor_time_limit,
        reward_cap, content_version, v2_deck_number, target_question_count, current_floor
    ) VALUES (
        v_student_id, v_class_id, CURRENT_DATE, 3, 3, 40,
        0, 'v2', 1, 12, 1
    ) RETURNING id INTO v_run_id;

    FOR v_sequence IN 1..12 LOOP
        v_question := public.get_next_my_vocab_tower_v2_practice_question_v1(v_run_id);
        IF v_question->>'question_type' IN ('definitionInput', 'clozeInput') THEN
            RAISE EXCEPTION 'floor 1 must stay choice-only, got input at %', v_sequence;
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

    -- 10층은 4·6·8·10·12번에서만 직접 입력이 가능하며 최대 5문항이다.
    INSERT INTO public.vocab_tower_runs (
        student_id, class_id, run_date, grade, daily_limit, floor_time_limit,
        reward_cap, content_version, v2_deck_number, target_question_count, current_floor
    ) VALUES (
        v_student_id, v_class_id, CURRENT_DATE, 3, 3, 40,
        0, 'v2', 10, 12, 10
    ) RETURNING id INTO v_run_id;

    FOR v_sequence IN 1..12 LOOP
        v_question := public.get_next_my_vocab_tower_v2_practice_question_v1(v_run_id);
        IF v_question->>'question_type' IN ('definitionInput', 'clozeInput') THEN
            v_input_sequences := array_append(v_input_sequences, v_sequence);
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

    IF v_input_sequences IS DISTINCT FROM ARRAY[4,6,8,10,12]::SMALLINT[] THEN
        RAISE EXCEPTION 'floor 10 input slots must be 4,6,8,10,12, got %', v_input_sequences;
    END IF;
END;
$$;
