-- 20261112 파일에서 바뀜: 한 판 12/12 보상(100P)을 층별 진도 4구간(합계 100P)으로 옮겼다. 20261162 에서 층 순차 해금이 붙었다.
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

-- 20261162 파일에서 바뀜: N층은 1~N-1층 덱마스터를 통과해야 열린다. 이 스모크는 층 연습 자체를 보므로
-- 학생의 3학년 1~9층 덱마스터 통과 기록을 이 트랜잭션 안에서 만든다(마지막에 롤백된다).
INSERT INTO public.learning_challenge_attempts (
    student_id, class_id, content_type, collection_key, challenge_kind,
    status, question_count, answered_count, correct_count, passed, finished_at
)
SELECT student.id, student.class_id, 'vocab',
       public.vocab_tower_v2_collection_key(3::SMALLINT, deck_number::SMALLINT),
       'collection', 'completed', 1, 1, 1, TRUE, NOW()
FROM public.students student
CROSS JOIN generate_series(1, 9) deck_number
WHERE student.id = current_setting('test.vocab_reward_student_id')::UUID
  AND NOT EXISTS (
      SELECT 1 FROM public.learning_challenge_attempts attempt
      WHERE attempt.student_id = student.id
        AND attempt.class_id = student.class_id
        AND attempt.content_type = 'vocab'
        AND attempt.challenge_kind = 'collection'
        AND attempt.status = 'completed'
        AND attempt.passed IS TRUE
        AND attempt.collection_key = public.vocab_tower_v2_collection_key(3::SMALLINT, deck_number::SMALLINT)
  );
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
        -- 12/12 완벽은 명예 표시로만 남고 포인트는 층 진도 구간(익힘 낱말 수)으로만 나간다.
        -- 이 두 판은 익힘까지 간 낱말이 없으므로 한 번도 포인트가 나가면 안 된다.
        IF (v_result->>'reward_points')::INTEGER <> 0
           OR (v_result->>'deck_reward_points')::INTEGER <> 100
           OR jsonb_array_length(v_result->'awarded_milestones') <> 0
           OR (SELECT SUM((milestone->>'points')::INTEGER)
               FROM jsonb_array_elements(v_result->'progress_milestones') milestone) <> 100 THEN
            RAISE EXCEPTION '완벽 연습이 진도 구간 밖에서 포인트를 주거나 층 예산 100P가 어긋났습니다: %', v_result;
        END IF;
    END LOOP;
    IF (SELECT student.total_points FROM public.students student WHERE student.id = v_student_id)
       <> current_setting('test.vocab_reward_points_before')::INTEGER THEN
        RAISE EXCEPTION '완벽 연습만으로 학생 포인트가 늘었습니다.';
    END IF;
    IF (SELECT count(*) FROM public.point_logs point_log
        WHERE point_log.student_id = v_student_id AND point_log.event_key = v_event_key) <> 0 THEN
        RAISE EXCEPTION '폐지된 완벽 연습 event_key 로 포인트가 기록됐습니다.';
    END IF;

    v_overview := public.get_my_vocab_tower_v2_overview_v1();
    SELECT deck INTO v_deck
    FROM jsonb_array_elements(v_overview->'decks') deck
    WHERE (deck->>'deck_number')::INTEGER = 10;
    IF (v_overview->>'perfect_reward_points')::INTEGER <> 100
       OR v_deck IS NULL THEN
        RAISE EXCEPTION 'V2 지도에 보상 설정·획득 상태가 반영되지 않았습니다: %, %', v_overview, v_deck;
    END IF;
END;
$$;
