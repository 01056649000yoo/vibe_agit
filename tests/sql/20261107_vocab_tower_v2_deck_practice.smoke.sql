-- 이 파일은 migrate:check의 바깥 트랜잭션 안에서 실행되고 마지막에 전부 롤백된다.

DO $$
BEGIN
    IF has_table_privilege('authenticated', 'public.vocab_tower_v2_deck_progress', 'SELECT')
       OR has_table_privilege('authenticated', 'public.vocab_tower_v2_deck_progress', 'INSERT')
       OR has_table_privilege('authenticated', 'public.vocab_tower_v2_deck_progress', 'UPDATE') THEN
        RAISE EXCEPTION 'V2 덱별 개인 연습 기록이 브라우저 역할에 공개됐습니다.';
    END IF;
END;
$$;

SELECT set_config('test.vocab_practice_class_id', class.id::TEXT, true),
       set_config('test.vocab_practice_teacher_id', class.teacher_id::TEXT, true),
       set_config('test.vocab_practice_student_auth_id', student.auth_id::TEXT, true)
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
BEGIN
    IF current_setting('test.vocab_practice_class_id', true) IS NULL
       OR current_setting('test.vocab_practice_teacher_id', true) IS NULL
       OR current_setting('test.vocab_practice_student_auth_id', true) IS NULL THEN
        RAISE EXCEPTION 'V2 덱 연습 스모크용 fixture가 없습니다.';
    END IF;

    UPDATE public.classes class
       SET vocab_tower_grade = 3,
           vocab_tower_daily_limit = 5,
           vocab_tower_content_version = 'v1',
           vocab_tower_reset_date = NOW(),
           vocab_tower_enabled = TRUE,
           enabled_modules = CASE
               WHEN class.enabled_modules IS NULL THEN ARRAY['vocab-tower']::TEXT[]
               WHEN 'vocab-tower' = ANY(class.enabled_modules) THEN class.enabled_modules
               ELSE array_append(class.enabled_modules, 'vocab-tower')
           END
     WHERE class.id = current_setting('test.vocab_practice_class_id')::UUID;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.vocab_practice_teacher_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.vocab_practice_teacher_id'), 'role', 'authenticated'
)::TEXT, true);
SELECT public.set_teacher_vocab_tower_content_version_v2(
    current_setting('test.vocab_practice_class_id')::UUID, 'v2'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.vocab_practice_student_auth_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.vocab_practice_student_auth_id'), 'role', 'authenticated'
)::TEXT, true);

DO $$
DECLARE
    v_overview JSONB;
    v_run JSONB;
    v_question JSONB;
    v_result JSONB;
    v_index INTEGER;
    v_deck JSONB;
BEGIN
    v_overview := public.get_my_vocab_tower_v2_overview_v1();
    IF v_overview->>'success' <> 'true'
       OR jsonb_array_length(v_overview->'decks') <> 10
       OR (v_overview->>'practice_question_count')::INTEGER <> 12 THEN
        RAISE EXCEPTION 'V2 10개 덱 지도 응답이 올바르지 않습니다: %', v_overview;
    END IF;

    v_run := public.start_my_vocab_tower_v2_practice_v1(1::SMALLINT);
    IF v_run->>'success' <> 'true'
       OR (v_run->>'deck_number')::INTEGER <> 1
       OR (v_run->>'target_question_count')::INTEGER <> 12
       OR (v_run->>'reward_cap')::INTEGER <> 0 THEN
        RAISE EXCEPTION 'V2 덱 개인 연습을 시작하지 못했습니다: %', v_run;
    END IF;

    FOR v_index IN 1..12 LOOP
        v_question := public.get_next_my_vocab_tower_v2_practice_question_v1((v_run->>'run_id')::UUID);
        IF v_question ? 'correct_answer'
           OR (v_question->>'sequence_number')::INTEGER <> v_index
           OR (v_question->>'deck_number')::INTEGER <> 1 THEN
            RAISE EXCEPTION 'V2 덱 연습 문항이 정답을 노출하거나 순서가 잘못됐습니다: %', v_question;
        END IF;

        v_result := public.submit_my_vocab_tower_v2_practice_answer_v1(
            (v_run->>'run_id')::UUID,
            (v_question->>'question_key')::UUID,
            '스모크 오답',
            FALSE
        );
        IF (v_result->>'answer_count')::INTEGER <> v_index
           OR (v_result->>'completed')::BOOLEAN IS DISTINCT FROM (v_index = 12) THEN
            RAISE EXCEPTION 'V2 덱 연습 채점 진행이 잘못됐습니다: %', v_result;
        END IF;
        IF v_index < 12 THEN
            PERFORM pg_sleep(0.16);
        END IF;
    END LOOP;

    v_result := public.finish_my_vocab_tower_v2_practice_v1(
        (v_run->>'run_id')::UUID, 'completed'
    );
    IF v_result->>'practice_completed' <> 'true'
       OR (v_result->>'answer_count')::INTEGER <> 12
       OR (v_result->>'reward_points')::INTEGER <> 0 THEN
        RAISE EXCEPTION 'V2 덱 연습 완료 기록이 잘못됐습니다: %', v_result;
    END IF;

    v_overview := public.get_my_vocab_tower_v2_overview_v1();
    SELECT deck INTO v_deck
    FROM jsonb_array_elements(v_overview->'decks') deck
    WHERE (deck->>'deck_number')::INTEGER = 1;
    IF (v_deck->>'practice_runs')::INTEGER <> 1
       OR (v_deck->>'completed_runs')::INTEGER <> 1
       OR (v_deck->>'last_answer_count')::INTEGER <> 12 THEN
        RAISE EXCEPTION 'V2 덱별 연습 요약이 저장되지 않았습니다: %', v_deck;
    END IF;
END;
$$;

RESET ROLE;
