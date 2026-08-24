-- migrate:check가 만든 바깥 트랜잭션에서 실행되며 마지막에 전부 롤백된다.
-- 층 건너뛰기 차단, 지도 잠금 응답, 정상 단계 복구·재도전을 한 학생 흐름으로 확인한다.

DO $$
DECLARE
    v_student public.students%ROWTYPE;
    v_class public.classes%ROWTYPE;
    v_grade SMALLINT;
    v_highest SMALLINT;
    v_result JSONB;
    v_status JSONB;
    v_stage JSONB;
BEGIN
    SELECT student.* INTO v_student
    FROM public.students student
    JOIN public.classes class ON class.id = student.class_id
    WHERE student.auth_id IS NOT NULL
      AND student.deleted_at IS NULL
      AND student.is_active IS DISTINCT FROM FALSE
      AND class.deleted_at IS NULL
      AND class.vocab_tower_enabled IS TRUE
      AND class.vocab_tower_content_version = 'v2'
    ORDER BY student.created_at
    LIMIT 1;
    IF v_student.id IS NULL THEN
        RAISE NOTICE '어휘 V2 학급 학생이 없어 순차 잠금 스모크를 건너뜀';
        RETURN;
    END IF;

    SELECT class.* INTO v_class FROM public.classes class WHERE class.id = v_student.class_id;
    v_grade := v_class.vocab_tower_grade::SMALLINT;

    PERFORM set_config('request.jwt.claim.sub', v_student.auth_id::TEXT, TRUE);
    PERFORM set_config('request.jwt.claims',
        jsonb_build_object('sub', v_student.auth_id, 'role', 'authenticated')::TEXT, TRUE);

    -- 실제 학생 기록은 바깥 ROLLBACK으로 모두 돌아온다. 이 학생의 현재 학년 시험만 격리한다.
    UPDATE public.vocab_tower_runs
       SET status = 'abandoned', finish_reason = 'exited', finished_at = NOW()
     WHERE student_id = v_student.id
       AND class_id = v_student.class_id
       AND status = 'active';

    DELETE FROM public.learning_challenge_attempts attempt
    WHERE attempt.student_id = v_student.id
      AND attempt.class_id = v_student.class_id
      AND attempt.content_type = 'vocab'
      AND (
          attempt.collection_key IN (
              SELECT public.vocab_tower_v2_collection_key(v_grade, deck_number::SMALLINT)
              FROM generate_series(1, 10) deck_number
          )
          OR attempt.collection_key IN (
              SELECT public.vocab_tower_v2_summit_key(v_grade, stage_number::SMALLINT)
              FROM generate_series(1, 3) stage_number
          )
      );

    -- ① 아무 층도 통과하지 않았으면 1층만 열린다.
    v_highest := public.vocab_tower_v2_highest_unlocked_deck_v1(
        v_student.id, v_student.class_id, v_grade);
    IF v_highest <> 1 THEN
        RAISE EXCEPTION '① 첫 진입에서 1층까지만 열리지 않았습니다: %', v_highest;
    END IF;

    -- 2층 기록만 먼저 있어도 1층 빈칸을 건너뛸 수 없다.
    INSERT INTO public.learning_challenge_attempts (
        student_id, class_id, content_type, collection_key, challenge_kind,
        status, question_count, answered_count, correct_count, passed, finished_at
    ) VALUES (
        v_student.id, v_student.class_id, 'vocab',
        public.vocab_tower_v2_collection_key(v_grade, 2::SMALLINT), 'collection',
        'completed', 1, 1, 1, TRUE, NOW()
    );
    v_highest := public.vocab_tower_v2_highest_unlocked_deck_v1(
        v_student.id, v_student.class_id, v_grade);
    IF v_highest <> 1 THEN
        RAISE EXCEPTION '① 상위 층 기록이 빈 1층을 건너뛰게 했습니다: %', v_highest;
    END IF;

    -- 1·2층을 모두 통과하면 3층까지 열린다.
    INSERT INTO public.learning_challenge_attempts (
        student_id, class_id, content_type, collection_key, challenge_kind,
        status, question_count, answered_count, correct_count, passed, finished_at
    ) VALUES (
        v_student.id, v_student.class_id, 'vocab',
        public.vocab_tower_v2_collection_key(v_grade, 1::SMALLINT), 'collection',
        'completed', 1, 1, 1, TRUE, NOW()
    );
    v_highest := public.vocab_tower_v2_highest_unlocked_deck_v1(
        v_student.id, v_student.class_id, v_grade);
    IF v_highest <> 3 THEN
        RAISE EXCEPTION '① 1·2층 통과 뒤 3층이 열리지 않았습니다: %', v_highest;
    END IF;

    -- ② 지도와 두 시작 RPC가 같은 잠금 값을 사용한다.
    v_result := public.get_my_vocab_tower_v2_overview_v1();
    SELECT deck INTO v_stage
    FROM jsonb_array_elements(v_result->'decks') deck
    WHERE (deck->>'deck_number')::SMALLINT = 4;
    IF COALESCE((v_stage->>'unlocked')::BOOLEAN, TRUE)
       OR (v_stage->>'unlock_required_deck')::SMALLINT <> 3 THEN
        RAISE EXCEPTION '② 지도 4층 잠금 응답이 잘못되었습니다: %', v_stage;
    END IF;

    v_result := public.start_my_vocab_tower_v2_practice_v1(4);
    IF COALESCE((v_result->>'success')::BOOLEAN, TRUE)
       OR NOT COALESCE((v_result->>'locked')::BOOLEAN, FALSE) THEN
        RAISE EXCEPTION '② 잠긴 4층 개인 연습이 시작되었습니다: %', v_result;
    END IF;

    v_result := public.start_my_vocab_tower_master_v1(4);
    IF COALESCE((v_result->>'success')::BOOLEAN, TRUE)
       OR NOT COALESCE((v_result->>'locked')::BOOLEAN, FALSE) THEN
        RAISE EXCEPTION '② 잠긴 4층 덱마스터가 시작되었습니다: %', v_result;
    END IF;

    -- 정상 시험을 열기 위해 나머지 층 합격을 채운다.
    INSERT INTO public.learning_challenge_attempts (
        student_id, class_id, content_type, collection_key, challenge_kind,
        status, question_count, answered_count, correct_count, passed, finished_at
    )
    SELECT v_student.id, v_student.class_id, 'vocab',
           public.vocab_tower_v2_collection_key(v_grade, deck_number::SMALLINT),
           'collection', 'completed', 1, 1, 1, TRUE, NOW()
    FROM generate_series(3, 10) deck_number;

    -- ③ 아무 단계도 통과하지 않은 상태에서는 2단계 건너뛰기를 막는다.
    DELETE FROM public.learning_summit_awards
     WHERE student_id = v_student.id AND content_type = 'vocab';
    v_result := public.start_my_vocab_master_summit_v1(2);
    IF COALESCE((v_result->>'success')::BOOLEAN, TRUE)
       OR v_result->>'error' <> '앞 단계를 먼저 통과해야 해요.' THEN
        RAISE EXCEPTION '③ 정상 2단계 건너뛰기가 차단되지 않았습니다: %', v_result;
    END IF;

    -- ④ 영구 휘장은 2단계인데 1단계 시험 이력이 없는 과거 불일치를 재현한다.
    INSERT INTO public.learning_summit_awards (
        student_id, class_id, content_type, collection_count, summit_level
    ) VALUES (
        v_student.id, v_student.class_id, 'vocab', 10, 2
    );
    INSERT INTO public.learning_challenge_attempts (
        student_id, class_id, content_type, collection_key, challenge_kind,
        status, question_count, answered_count, correct_count, passed, finished_at
    ) VALUES (
        v_student.id, v_student.class_id, 'vocab',
        public.vocab_tower_v2_summit_key(v_grade, 2::SMALLINT), 'summit',
        'completed', 1, 1, 1, TRUE, NOW()
    );

    v_status := public.vocab_tower_v2_summit_status_v1(
        v_student.id, v_student.class_id, v_grade);
    IF (v_status->>'level')::SMALLINT <> 2 OR (v_status->>'next_stage')::SMALLINT <> 3 THEN
        RAISE EXCEPTION '④ 영구 2단계가 지도 상태로 복구되지 않았습니다: %', v_status;
    END IF;
    SELECT stage INTO v_stage
    FROM jsonb_array_elements(v_status->'stages') stage
    WHERE (stage->>'stage')::SMALLINT = 1;
    IF NOT COALESCE((v_stage->>'passed')::BOOLEAN, FALSE)
       OR NOT COALESCE((v_stage->>'recovered')::BOOLEAN, FALSE)
       OR NOT COALESCE((v_stage->>'unlocked')::BOOLEAN, FALSE) THEN
        RAISE EXCEPTION '④ 빠진 1단계가 완료·재도전 가능 상태로 복구되지 않았습니다: %', v_stage;
    END IF;

    -- ⑤ 통과한 1단계를 다시 열 수 있고, 별은 2단계로 유지된다.
    v_result := public.start_my_vocab_master_summit_v1(1);
    IF NOT COALESCE((v_result->>'success')::BOOLEAN, FALSE)
       OR NOT COALESCE((v_result->>'replay')::BOOLEAN, FALSE)
       OR (v_result->>'stage')::SMALLINT <> 1 THEN
        RAISE EXCEPTION '⑤ 통과한 1단계 재도전이 열리지 않았습니다: %', v_result;
    END IF;
    v_status := public.vocab_tower_v2_summit_status_v1(
        v_student.id, v_student.class_id, v_grade);
    IF (v_status->>'level')::SMALLINT <> 2 THEN
        RAISE EXCEPTION '⑤ 이전 단계 재도전으로 영구 단계가 내려갔습니다: %', v_status;
    END IF;
END;
$$;

-- ⑥ 내부 원본과 잠금 계산은 브라우저가 직접 실행하지 못하고 공개 RPC만 인증 학생에게 열린다.
DO $$
BEGIN
    IF has_function_privilege(
        'authenticated',
        'public.vocab_tower_v2_highest_unlocked_deck_v1(uuid,uuid,smallint)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION '⑥ 내부 층 잠금 계산 함수가 브라우저 역할에 공개되었습니다';
    END IF;
    IF has_function_privilege('anon', 'public.start_my_vocab_tower_v2_practice_v1(smallint)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.start_my_vocab_tower_master_v1(smallint)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.start_my_vocab_master_summit_v1(smallint)', 'EXECUTE') THEN
        RAISE EXCEPTION '⑥ 어휘 진행 RPC가 비로그인 역할에 공개되었습니다';
    END IF;
END;
$$;
