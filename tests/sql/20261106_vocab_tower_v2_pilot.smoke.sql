-- 이 파일은 migrate:check의 바깥 트랜잭션 안에서 실행되고 마지막에 전부 롤백된다.

DO $$
BEGIN
    IF has_table_privilege('authenticated', 'public.vocab_tower_v2_run_questions', 'SELECT')
       OR has_table_privilege('authenticated', 'public.vocab_tower_v2_run_questions', 'INSERT')
       OR has_table_privilege('authenticated', 'public.vocab_tower_v2_run_questions', 'UPDATE') THEN
        RAISE EXCEPTION 'V2 정답 스냅샷이 브라우저 역할에 공개됐습니다.';
    END IF;
END;
$$;

SELECT set_config('test.vocab_pilot_class_id', class.id::TEXT, true),
       set_config('test.vocab_pilot_teacher_id', class.teacher_id::TEXT, true),
       set_config('test.vocab_pilot_student_auth_id', student.auth_id::TEXT, true)
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
    IF current_setting('test.vocab_pilot_class_id', true) IS NULL
       OR current_setting('test.vocab_pilot_teacher_id', true) IS NULL
       OR current_setting('test.vocab_pilot_student_auth_id', true) IS NULL THEN
        RAISE EXCEPTION 'V2 시험 스모크용 학급·교사·학생 fixture가 없습니다.';
    END IF;

    UPDATE public.classes class
       SET vocab_tower_grade = 3,
           vocab_tower_daily_limit = 5,
           vocab_tower_time_limit = 40,
           vocab_tower_reward_points = 0,
           vocab_tower_content_version = 'v1',
           vocab_tower_reset_date = NOW(),
           vocab_tower_enabled = TRUE,
           enabled_modules = CASE
               WHEN class.enabled_modules IS NULL THEN ARRAY['vocab-tower']::TEXT[]
               WHEN 'vocab-tower' = ANY(class.enabled_modules) THEN class.enabled_modules
               ELSE array_append(class.enabled_modules, 'vocab-tower')
           END
     WHERE class.id = current_setting('test.vocab_pilot_class_id')::UUID;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.vocab_pilot_teacher_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.vocab_pilot_teacher_id'), 'role', 'authenticated'
)::TEXT, true);

DO $$
DECLARE
    v_result JSONB;
BEGIN
    v_result := public.set_teacher_vocab_tower_content_version_v2(
        current_setting('test.vocab_pilot_class_id')::UUID, 'v2'
    );
    IF v_result->>'content_version' <> 'v2' OR (v_result->>'locked_decks')::INTEGER <> 10 THEN
        RAISE EXCEPTION '교사 V2 전환 결과가 올바르지 않습니다: %', v_result;
    END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.vocab_pilot_student_auth_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.vocab_pilot_student_auth_id'), 'role', 'authenticated'
)::TEXT, true);

DO $$
DECLARE
    v_run JSONB;
    v_question JSONB;
BEGIN
    v_run := public.start_my_vocab_tower_v2_run();
    IF v_run->>'success' <> 'true' OR v_run->>'content_version' <> 'v2' THEN
        RAISE EXCEPTION 'V2 탐험을 시작하지 못했습니다: %', v_run;
    END IF;
    PERFORM set_config('test.vocab_pilot_run_id', v_run->>'run_id', true);

    v_question := public.get_next_my_vocab_tower_question_v2((v_run->>'run_id')::UUID, FALSE);
    IF v_question ? 'correct_answer'
       OR jsonb_array_length(v_question->'options') NOT BETWEEN 2 AND 6
       OR v_question->>'question_key' IS NULL THEN
        RAISE EXCEPTION 'V2 발급 문항이 정답을 노출하거나 형식이 잘못됐습니다: %', v_question;
    END IF;
    PERFORM set_config('test.vocab_pilot_question_id', v_question->>'question_key', true);
END;
$$;
RESET ROLE;

SELECT set_config('test.vocab_pilot_correct_answer', question.correct_answer, true)
FROM public.vocab_tower_v2_run_questions question
WHERE question.id = current_setting('test.vocab_pilot_question_id')::UUID;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.vocab_pilot_student_auth_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.vocab_pilot_student_auth_id'), 'role', 'authenticated'
)::TEXT, true);

DO $$
DECLARE
    v_result JSONB;
BEGIN
    v_result := public.submit_my_vocab_tower_v2_answer(
        current_setting('test.vocab_pilot_run_id')::UUID,
        current_setting('test.vocab_pilot_question_id')::UUID,
        current_setting('test.vocab_pilot_correct_answer'),
        FALSE
    );
    IF v_result->>'is_correct' <> 'true' OR v_result->>'duplicate' <> 'false' THEN
        RAISE EXCEPTION 'V2 서버 채점이 올바르지 않습니다: %', v_result;
    END IF;

    v_result := public.submit_my_vocab_tower_v2_answer(
        current_setting('test.vocab_pilot_run_id')::UUID,
        current_setting('test.vocab_pilot_question_id')::UUID,
        current_setting('test.vocab_pilot_correct_answer'),
        FALSE
    );
    IF v_result->>'duplicate' <> 'true' OR (v_result->>'answer_count')::INTEGER <> 1 THEN
        RAISE EXCEPTION 'V2 재제출 멱등성이 유지되지 않습니다: %', v_result;
    END IF;
END;
$$;
RESET ROLE;
