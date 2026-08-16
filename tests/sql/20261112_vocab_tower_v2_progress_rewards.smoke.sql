-- migrate:check가 만든 바깥 트랜잭션에서 실행되며 마지막에 전부 롤백된다.
-- 층별 진도 보상이 구간마다 한 번씩만 지급되고, 총액이 층 예산을 넘지 않는지 확인한다.

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

-- 구간 계산: 낱말 수와 층 예산이 달라도 합계는 예산과 정확히 같아야 한다.
DO $$
DECLARE
    v_sum INTEGER;
    v_first INTEGER;
BEGIN
    SELECT SUM(reward_points) INTO v_sum
    FROM public.vocab_tower_v2_progress_milestones_v1(40, 100);
    IF v_sum <> 100 THEN
        RAISE EXCEPTION '40개·100P 구간 합계가 예산과 다릅니다: %', v_sum;
    END IF;

    SELECT SUM(reward_points) INTO v_sum
    FROM public.vocab_tower_v2_progress_milestones_v1(38, 250);
    IF v_sum <> 250 THEN
        RAISE EXCEPTION '38개·250P 구간 합계가 예산과 다릅니다: %', v_sum;
    END IF;

    SELECT SUM(reward_points) INTO v_sum
    FROM public.vocab_tower_v2_progress_milestones_v1(40, 0);
    IF v_sum <> 0 THEN
        RAISE EXCEPTION '보상 0P 학급에서 지급액이 생겼습니다: %', v_sum;
    END IF;

    SELECT mastered_threshold INTO v_first
    FROM public.vocab_tower_v2_progress_milestones_v1(40, 100)
    WHERE milestone_percent = 25;
    IF v_first <> 10 THEN
        RAISE EXCEPTION '40개 층의 첫 구간 기준이 10개가 아닙니다: %', v_first;
    END IF;
END;
$$;

DO $$
DECLARE
    v_student_id UUID := current_setting('test.vocab_reward_student_id', true)::UUID;
    v_class_id UUID;
BEGIN
    IF current_setting('test.vocab_reward_class_id', true) IS NULL OR v_student_id IS NULL THEN
        RAISE EXCEPTION '진도 보상 스모크용 fixture가 없습니다.';
    END IF;
    v_class_id := current_setting('test.vocab_reward_class_id')::UUID;

    UPDATE public.classes class
       SET vocab_tower_grade = 3,
           vocab_tower_enabled = TRUE,
           vocab_tower_v2_perfect_reward_points = 100,
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
    DELETE FROM public.point_logs point_log
     WHERE point_log.student_id = v_student_id
       AND (point_log.event_key LIKE 'vocab-v2-progress:%' OR point_log.event_key LIKE 'vocab-v2-perfect:%');
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
    v_student_id UUID := current_setting('test.vocab_reward_student_id')::UUID;
    v_class_id UUID := current_setting('test.vocab_reward_class_id')::UUID;
    v_run JSONB;
    v_result JSONB;
    v_overview JSONB;
    v_deck JSONB;
    v_item_count INTEGER;
    v_total_awarded INTEGER;
BEGIN
    SELECT count(*)::INTEGER INTO v_item_count
    FROM public.vocab_tower_v2_review_items item
    JOIN public.vocab_tower_v2_review_decks deck ON deck.deck_id = item.deck_id
    WHERE deck.grade = 3 AND deck.deck_number = 8 AND deck.review_status = 'locked';
    IF v_item_count < 4 THEN
        RAISE EXCEPTION '8층 낱말이 너무 적어 구간 검증을 할 수 없습니다: %', v_item_count;
    END IF;

    -- 1) 아직 익힘이 없으면 어떤 구간도 지급하지 않는다.
    v_run := public.start_my_vocab_tower_v2_practice_v1(8::SMALLINT);
    v_result := public.finish_my_vocab_tower_v2_practice_v1((v_run->>'run_id')::UUID, 'exited');
    IF COALESCE((v_result->>'reward_points')::INTEGER, 0) <> 0 THEN
        RAISE EXCEPTION '익힘 0개인데 포인트가 지급됐습니다: %', v_result;
    END IF;
    IF (v_result->>'next_milestone_percent')::INTEGER <> 25 THEN
        RAISE EXCEPTION '다음 목표가 25%% 구간으로 안내되지 않았습니다: %', v_result;
    END IF;

    -- 2) 첫 구간(25%)을 넘기면 그 구간만 지급한다.
    INSERT INTO public.vocab_tower_v2_item_progress (
        student_id, class_id, grade, deck_number, item_key,
        learning_state, attempt_count, correct_count, consecutive_correct,
        correct_question_types, last_correct
    )
    SELECT v_student_id, v_class_id, 3, 8, item.item_key,
           'mastered', 2, 2, 2, ARRAY['meaningChoice', 'definitionInput']::TEXT[], TRUE
    FROM public.vocab_tower_v2_review_items item
    JOIN public.vocab_tower_v2_review_decks deck ON deck.deck_id = item.deck_id
    WHERE deck.grade = 3 AND deck.deck_number = 8 AND deck.review_status = 'locked'
    ORDER BY item.item_key
    LIMIT CEIL(v_item_count * 0.25)::INTEGER;

    v_run := public.start_my_vocab_tower_v2_practice_v1(8::SMALLINT);
    v_result := public.finish_my_vocab_tower_v2_practice_v1((v_run->>'run_id')::UUID, 'exited');
    IF COALESCE((v_result->>'reward_points')::INTEGER, 0) <> 20 THEN
        RAISE EXCEPTION '25%% 구간에서 20P가 지급되지 않았습니다: %', v_result;
    END IF;
    IF jsonb_array_length(v_result->'awarded_milestones') <> 1 THEN
        RAISE EXCEPTION '25%% 구간 하나만 지급되지 않았습니다: %', v_result->'awarded_milestones';
    END IF;

    -- 3) 같은 진도로 다시 끝내도 중복 지급하지 않는다.
    v_run := public.start_my_vocab_tower_v2_practice_v1(8::SMALLINT);
    v_result := public.finish_my_vocab_tower_v2_practice_v1((v_run->>'run_id')::UUID, 'exited');
    IF COALESCE((v_result->>'reward_points')::INTEGER, 0) <> 0 THEN
        RAISE EXCEPTION '같은 진도에서 구간 보상이 중복 지급됐습니다: %', v_result;
    END IF;

    -- 4) 한 번에 여러 구간을 넘기면 넘은 구간을 모두 지급한다.
    UPDATE public.vocab_tower_v2_item_progress progress
       SET learning_state = 'mastered',
           correct_question_types = ARRAY['meaningChoice', 'definitionInput']::TEXT[],
           consecutive_correct = 2
     WHERE progress.student_id = v_student_id
       AND progress.class_id = v_class_id
       AND progress.grade = 3
       AND progress.deck_number = 8;
    INSERT INTO public.vocab_tower_v2_item_progress (
        student_id, class_id, grade, deck_number, item_key,
        learning_state, attempt_count, correct_count, consecutive_correct,
        correct_question_types, last_correct
    )
    SELECT v_student_id, v_class_id, 3, 8, item.item_key,
           'mastered', 2, 2, 2, ARRAY['meaningChoice', 'definitionInput']::TEXT[], TRUE
    FROM public.vocab_tower_v2_review_items item
    JOIN public.vocab_tower_v2_review_decks deck ON deck.deck_id = item.deck_id
    WHERE deck.grade = 3 AND deck.deck_number = 8 AND deck.review_status = 'locked'
    ON CONFLICT (student_id, class_id, grade, deck_number, item_key) DO UPDATE
        SET learning_state = 'mastered';

    v_run := public.start_my_vocab_tower_v2_practice_v1(8::SMALLINT);
    v_result := public.finish_my_vocab_tower_v2_practice_v1((v_run->>'run_id')::UUID, 'exited');
    IF COALESCE((v_result->>'reward_points')::INTEGER, 0) <> 80 THEN
        RAISE EXCEPTION '남은 세 구간 80P가 한 번에 지급되지 않았습니다: %', v_result;
    END IF;
    IF v_result->>'next_milestone_percent' IS NOT NULL THEN
        RAISE EXCEPTION '전 구간 완료 뒤에도 다음 목표가 남아 있습니다: %', v_result;
    END IF;

    -- 5) 층 예산을 넘겨 지급하지 않는다.
    SELECT COALESCE(SUM(point_log.amount), 0)::INTEGER INTO v_total_awarded
    FROM public.point_logs point_log
    WHERE point_log.student_id = v_student_id
      AND point_log.event_key LIKE format('vocab-v2-progress:%s:3:8:%%', v_class_id);
    IF v_total_awarded <> 100 THEN
        RAISE EXCEPTION '8층 총 지급액이 층 예산 100P와 다릅니다: %', v_total_awarded;
    END IF;

    -- 6) 완벽 연습 보상 키는 더 이상 만들지 않는다.
    IF EXISTS (
        SELECT 1 FROM public.point_logs point_log
        WHERE point_log.student_id = v_student_id
          AND point_log.event_key LIKE 'vocab-v2-perfect:%'
    ) THEN
        RAISE EXCEPTION '완벽 연습 보상이 아직 지급되고 있습니다.';
    END IF;

    -- 7) 지도 개요가 층별 진도 보상 상태를 돌려준다.
    v_overview := public.get_my_vocab_tower_v2_overview_v1();
    SELECT deck INTO v_deck
    FROM jsonb_array_elements(v_overview->'decks') deck
    WHERE (deck->>'deck_number')::INTEGER = 8;
    IF (v_deck->>'earned_reward_points')::INTEGER <> 100 THEN
        RAISE EXCEPTION '지도에 8층 획득 포인트가 100P로 보이지 않습니다: %', v_deck;
    END IF;
    IF (v_deck->>'reward_completed')::BOOLEAN IS NOT TRUE THEN
        RAISE EXCEPTION '전 구간을 받은 층이 완료로 표시되지 않았습니다: %', v_deck;
    END IF;

    SELECT deck INTO v_deck
    FROM jsonb_array_elements(v_overview->'decks') deck
    WHERE (deck->>'deck_number')::INTEGER = 1;
    IF (v_deck->>'next_milestone_percent')::INTEGER <> 25
       OR (v_deck->>'earned_reward_points')::INTEGER <> 0 THEN
        RAISE EXCEPTION '아직 연습하지 않은 층의 다음 목표 안내가 잘못됐습니다: %', v_deck;
    END IF;
END;
$$;
