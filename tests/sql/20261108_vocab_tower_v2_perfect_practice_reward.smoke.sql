-- 이 파일은 migrate:check의 바깥 트랜잭션 안에서 실행되고 마지막에 전부 롤백된다.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'classes'
          AND column_name = 'vocab_tower_v2_perfect_reward_points'
          AND column_default = '100'
    ) THEN
        RAISE EXCEPTION 'V2 완벽 연습 보상 기본값이 100P가 아닙니다.';
    END IF;
END;
$$;

SELECT set_config('test.vocab_reward_class_id', class.id::TEXT, true),
       set_config('test.vocab_reward_teacher_id', class.teacher_id::TEXT, true),
       set_config('test.vocab_reward_student_id', student.id::TEXT, true),
       set_config('test.vocab_reward_student_auth_id', student.auth_id::TEXT, true)
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
    v_event_key TEXT;
    v_student_id UUID := current_setting('test.vocab_reward_student_id', true)::UUID;
BEGIN
    IF current_setting('test.vocab_reward_class_id', true) IS NULL
       OR current_setting('test.vocab_reward_teacher_id', true) IS NULL
       OR v_student_id IS NULL
       OR current_setting('test.vocab_reward_student_auth_id', true) IS NULL THEN
        RAISE EXCEPTION 'V2 완벽 연습 보상 스모크용 fixture가 없습니다.';
    END IF;

    UPDATE public.classes class
       SET vocab_tower_grade = 3,
           vocab_tower_v2_perfect_reward_points = 100,
           vocab_tower_enabled = TRUE,
           enabled_modules = CASE
               WHEN class.enabled_modules IS NULL THEN ARRAY['vocab-tower']::TEXT[]
               WHEN 'vocab-tower' = ANY(class.enabled_modules) THEN class.enabled_modules
               ELSE array_append(class.enabled_modules, 'vocab-tower')
           END
     WHERE class.id = current_setting('test.vocab_reward_class_id')::UUID;

    v_event_key := format(
        'vocab-v2-perfect:%s:3:10', current_setting('test.vocab_reward_class_id')
    );
    DELETE FROM public.point_logs point_log
     WHERE point_log.student_id = v_student_id
       AND point_log.event_key = v_event_key;
    UPDATE public.vocab_tower_runs run
       SET status = 'abandoned', finish_reason = 'exited', finished_at = NOW()
     WHERE run.student_id = v_student_id
       AND run.status = 'active';

    PERFORM set_config(
        'test.vocab_reward_points_before',
        (SELECT student.total_points::TEXT FROM public.students student WHERE student.id = v_student_id),
        true
    );
END;
$$;

SELECT set_config('request.jwt.claim.sub', current_setting('test.vocab_reward_teacher_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.vocab_reward_teacher_id'), 'role', 'authenticated'
)::TEXT, true);
SELECT public.set_teacher_vocab_tower_content_version_v2(
    current_setting('test.vocab_reward_class_id')::UUID, 'v2'
);

SELECT set_config('request.jwt.claim.sub', current_setting('test.vocab_reward_student_auth_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.vocab_reward_student_auth_id'), 'role', 'authenticated'
)::TEXT, true);

DO $$
DECLARE
    v_run JSONB;
    v_question JSONB;
    v_result JSONB;
    v_overview JSONB;
    v_deck JSONB;
    v_correct_answer TEXT;
    v_index INTEGER;
    v_attempt INTEGER;
    v_student_id UUID := current_setting('test.vocab_reward_student_id')::UUID;
    v_class_id UUID := current_setting('test.vocab_reward_class_id')::UUID;
    v_event_key TEXT := format(
        'vocab-v2-perfect:%s:3:10', current_setting('test.vocab_reward_class_id')
    );
BEGIN
    FOR v_attempt IN 1..2 LOOP
        v_run := public.start_my_vocab_tower_v2_practice_v1(10::SMALLINT);
        IF v_run->>'success' <> 'true' THEN
            RAISE EXCEPTION 'V2 완벽 연습을 시작하지 못했습니다: %', v_run;
        END IF;

        FOR v_index IN 1..12 LOOP
            v_question := public.get_next_my_vocab_tower_v2_practice_question_v1(
                (v_run->>'run_id')::UUID
            );
            SELECT question.correct_answer INTO v_correct_answer
            FROM public.vocab_tower_v2_run_questions question
            WHERE question.id = (v_question->>'question_key')::UUID;

            v_result := public.submit_my_vocab_tower_v2_practice_answer_v1(
                (v_run->>'run_id')::UUID,
                (v_question->>'question_key')::UUID,
                v_correct_answer,
                FALSE
            );
            IF v_result->>'is_correct' <> 'true'
               OR (v_result->>'answer_count')::INTEGER <> v_index THEN
                RAISE EXCEPTION 'V2 완벽 연습 정답 처리가 잘못됐습니다: %', v_result;
            END IF;
            IF v_index < 12 THEN
                PERFORM pg_sleep(0.16);
            END IF;
        END LOOP;

        v_result := public.finish_my_vocab_tower_v2_practice_v1(
            (v_run->>'run_id')::UUID, 'completed'
        );
        IF v_result->>'perfect_practice' <> 'true' THEN
            RAISE EXCEPTION '12/12 연습이 완벽 달성으로 처리되지 않았습니다: %', v_result;
        END IF;
        IF v_attempt = 1 AND (
            (v_result->>'reward_points')::INTEGER <> 100
            OR v_result->>'perfect_reward_earned' <> 'true'
            OR v_result->>'perfect_reward_already_earned' <> 'false'
        ) THEN
            RAISE EXCEPTION '최초 완벽 연습 100P 지급이 잘못됐습니다: %', v_result;
        END IF;
        IF v_attempt = 2 AND (
            (v_result->>'reward_points')::INTEGER <> 0
            OR v_result->>'perfect_reward_earned' <> 'false'
            OR v_result->>'perfect_reward_already_earned' <> 'true'
        ) THEN
            RAISE EXCEPTION '반복 완벽 연습 중복 지급이 차단되지 않았습니다: %', v_result;
        END IF;
    END LOOP;

    IF (SELECT student.total_points FROM public.students student WHERE student.id = v_student_id)
       <> current_setting('test.vocab_reward_points_before')::INTEGER + 100 THEN
        RAISE EXCEPTION '학생 포인트가 최초 1회 100P만 증가하지 않았습니다.';
    END IF;
    IF (SELECT count(*) FROM public.point_logs point_log
        WHERE point_log.student_id = v_student_id AND point_log.event_key = v_event_key) <> 1 THEN
        RAISE EXCEPTION '완벽 연습 포인트 event_key 원장이 한 건이 아닙니다.';
    END IF;

    v_overview := public.get_my_vocab_tower_v2_overview_v1();
    SELECT deck INTO v_deck
    FROM jsonb_array_elements(v_overview->'decks') deck
    WHERE (deck->>'deck_number')::INTEGER = 10;
    IF (v_overview->>'perfect_reward_points')::INTEGER <> 100
       OR v_deck->>'perfect_reward_earned' <> 'true' THEN
        RAISE EXCEPTION 'V2 지도에 보상 설정·획득 상태가 반영되지 않았습니다: %, %', v_overview, v_deck;
    END IF;
END;
$$;
