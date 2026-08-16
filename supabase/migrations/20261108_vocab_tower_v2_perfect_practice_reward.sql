BEGIN;

ALTER TABLE public.classes
    ADD COLUMN IF NOT EXISTS vocab_tower_v2_perfect_reward_points INTEGER NOT NULL DEFAULT 100;

ALTER TABLE public.classes
    DROP CONSTRAINT IF EXISTS classes_vocab_tower_v2_perfect_reward_points_check;
ALTER TABLE public.classes
    ADD CONSTRAINT classes_vocab_tower_v2_perfect_reward_points_check
    CHECK (vocab_tower_v2_perfect_reward_points BETWEEN 0 AND 500);

ALTER TABLE public.vocab_tower_runs
    DROP CONSTRAINT IF EXISTS vocab_tower_runs_reward_points_check;
ALTER TABLE public.vocab_tower_runs
    ADD CONSTRAINT vocab_tower_runs_reward_points_check
    CHECK (reward_points BETWEEN 0 AND 500);

COMMENT ON COLUMN public.classes.vocab_tower_v2_perfect_reward_points IS
    'V2 개인 연습에서 덱별 최초 12/12 달성 시 한 번 지급하는 학급 설정 포인트. 0은 보상 끄기.';

CREATE OR REPLACE FUNCTION public.get_my_vocab_tower_v2_overview_v1()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID := public.auth_user_class_id();
    v_grade SMALLINT;
    v_enabled BOOLEAN;
    v_perfect_reward_points INTEGER;
    v_decks JSONB;
    v_active public.vocab_tower_runs%ROWTYPE;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL OR v_class_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT
        LEAST(6, GREATEST(3, COALESCE(class.vocab_tower_grade, 3)))::SMALLINT,
        CASE
            WHEN class.enabled_modules IS NULL THEN COALESCE(class.vocab_tower_enabled, FALSE)
            ELSE 'vocab-tower' = ANY(class.enabled_modules)
        END,
        LEAST(500, GREATEST(0, COALESCE(class.vocab_tower_v2_perfect_reward_points, 100)))
      INTO v_grade, v_enabled, v_perfect_reward_points
    FROM public.classes class
    WHERE class.id = v_class_id
      AND class.vocab_tower_content_version = 'v2'
      AND class.deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION '이 학급은 V2 개인 연습을 사용하지 않습니다.' USING ERRCODE = '55000';
    END IF;
    IF NOT COALESCE(v_enabled, FALSE) THEN
        RETURN jsonb_build_object('success', FALSE, 'error', '선생님이 지금은 어휘의 탑을 열어두지 않았어요.');
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'deck_number', deck.deck_number,
        'deck_id', deck.deck_id,
        'item_count', (
            SELECT count(*) FROM public.vocab_tower_v2_review_items item
            WHERE item.deck_id = deck.deck_id
        ),
        'practice_runs', COALESCE(progress.practice_runs, 0),
        'completed_runs', COALESCE(progress.completed_runs, 0),
        'best_accuracy', COALESCE(progress.best_accuracy, 0),
        'last_accuracy', COALESCE(progress.last_accuracy, 0),
        'last_answer_count', COALESCE(progress.last_answer_count, 0),
        'last_practiced_at', progress.last_practiced_at,
        'perfect_reward_earned', EXISTS (
            SELECT 1
            FROM public.point_logs point_log
            WHERE point_log.student_id = v_student_id
              AND point_log.event_key = format(
                  'vocab-v2-perfect:%s:%s:%s', v_class_id, v_grade, deck.deck_number
              )
        )
    ) ORDER BY deck.deck_number), '[]'::JSONB)
      INTO v_decks
    FROM public.vocab_tower_v2_review_decks deck
    LEFT JOIN public.vocab_tower_v2_deck_progress progress
      ON progress.student_id = v_student_id
     AND progress.class_id = v_class_id
     AND progress.grade = v_grade
     AND progress.deck_number = deck.deck_number
    WHERE deck.grade = v_grade
      AND deck.review_status = 'locked';

    IF jsonb_array_length(v_decks) <> 10 THEN
        RAISE EXCEPTION '잠긴 V2 덱 10개가 필요합니다.' USING ERRCODE = '55000';
    END IF;

    SELECT run.* INTO v_active
    FROM public.vocab_tower_runs run
    WHERE run.student_id = v_student_id
      AND run.class_id = v_class_id
      AND run.status = 'active'
      AND run.content_version = 'v2'
      AND run.v2_deck_number IS NOT NULL
    ORDER BY run.created_at DESC
    LIMIT 1;

    RETURN jsonb_build_object(
        'success', TRUE,
        'grade', v_grade,
        'practice_question_count', 12,
        'perfect_reward_points', v_perfect_reward_points,
        'decks', v_decks,
        'active_run', CASE WHEN v_active.id IS NULL THEN NULL ELSE jsonb_build_object(
            'run_id', v_active.id,
            'deck_number', v_active.v2_deck_number,
            'target_question_count', v_active.target_question_count,
            'answer_count', v_active.answer_count,
            'correct_count', v_active.correct_count,
            'wrong_count', v_active.wrong_count,
            'current_combo', v_active.current_combo,
            'max_combo', v_active.max_combo
        ) END
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_my_vocab_tower_v2_practice_v1(
    p_run_id UUID,
    p_reason TEXT DEFAULT 'exited'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID := public.auth_user_class_id();
    v_run public.vocab_tower_runs%ROWTYPE;
    v_accuracy SMALLINT := 0;
    v_completed BOOLEAN := FALSE;
    v_perfect BOOLEAN := FALSE;
    v_perfect_reward_points INTEGER := 0;
    v_event_key TEXT;
    v_point_result JSONB;
    v_awarded_points INTEGER := 0;
    v_reward_earned BOOLEAN := FALSE;
    v_reward_already_earned BOOLEAN := FALSE;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL OR v_class_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    IF p_reason NOT IN ('completed', 'exited') THEN
        RAISE EXCEPTION '알 수 없는 개인 연습 종료 방식입니다.' USING ERRCODE = '22023';
    END IF;

    SELECT run.* INTO v_run
    FROM public.vocab_tower_runs run
    WHERE run.id = p_run_id
      AND run.student_id = v_student_id
      AND run.class_id = v_class_id
      AND run.content_version = 'v2'
      AND run.v2_deck_number IS NOT NULL
      AND run.target_question_count = 12
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'V2 개인 연습 기록을 찾을 수 없습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT LEAST(500, GREATEST(0, COALESCE(class.vocab_tower_v2_perfect_reward_points, 100)))
      INTO v_perfect_reward_points
    FROM public.classes class
    WHERE class.id = v_class_id
      AND class.deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION '학급 보상 설정을 찾을 수 없습니다.' USING ERRCODE = '55000';
    END IF;

    IF v_run.answer_count > 0 THEN
        v_accuracy := ROUND(v_run.correct_count::NUMERIC * 100 / v_run.answer_count)::SMALLINT;
    END IF;
    v_completed := CASE
        WHEN v_run.status = 'active' THEN p_reason = 'completed' AND v_run.answer_count >= v_run.target_question_count
        ELSE v_run.finish_reason = 'completed'
    END;
    v_perfect := v_completed
        AND v_run.answer_count = v_run.target_question_count
        AND v_run.correct_count = v_run.target_question_count;
    v_event_key := format(
        'vocab-v2-perfect:%s:%s:%s', v_class_id, v_run.grade, v_run.v2_deck_number
    );

    IF v_run.status = 'active' THEN
        IF v_perfect AND v_perfect_reward_points > 0 THEN
            v_point_result := public.point_engine_apply(
                v_student_id,
                v_perfect_reward_points,
                format('어휘의 탑 %s층 완벽 연습', v_run.v2_deck_number),
                'vocab_tower',
                v_event_key,
                NULL,
                NULL,
                jsonb_build_object(
                    'source', 'vocab_tower_v2_perfect_practice',
                    'class_id', v_class_id,
                    'grade', v_run.grade,
                    'deck_number', v_run.v2_deck_number,
                    'run_id', v_run.id
                )
            );
            v_awarded_points := COALESCE((v_point_result->>'applied_amount')::INTEGER, 0);
            v_reward_earned := v_awarded_points > 0;
            v_reward_already_earned := COALESCE((v_point_result->>'duplicate')::BOOLEAN, FALSE);
        END IF;

        UPDATE public.vocab_tower_runs run
           SET status = 'finished',
               finish_reason = CASE WHEN v_completed THEN 'completed' ELSE 'exited' END,
               reward_points = v_awarded_points,
               finished_at = NOW()
         WHERE run.id = v_run.id;

        IF v_run.answer_count > 0 THEN
            INSERT INTO public.vocab_tower_v2_deck_progress (
                student_id, class_id, grade, deck_number,
                practice_runs, completed_runs, best_accuracy,
                last_accuracy, last_answer_count, last_practiced_at, updated_at
            ) VALUES (
                v_student_id, v_class_id, v_run.grade, v_run.v2_deck_number,
                1, CASE WHEN v_completed THEN 1 ELSE 0 END,
                CASE WHEN v_completed THEN v_accuracy ELSE 0 END,
                v_accuracy, v_run.answer_count, NOW(), NOW()
            )
            ON CONFLICT (student_id, class_id, grade, deck_number) DO UPDATE SET
                practice_runs = public.vocab_tower_v2_deck_progress.practice_runs + 1,
                completed_runs = public.vocab_tower_v2_deck_progress.completed_runs
                    + CASE WHEN v_completed THEN 1 ELSE 0 END,
                best_accuracy = GREATEST(public.vocab_tower_v2_deck_progress.best_accuracy, EXCLUDED.best_accuracy),
                last_accuracy = EXCLUDED.last_accuracy,
                last_answer_count = EXCLUDED.last_answer_count,
                last_practiced_at = EXCLUDED.last_practiced_at,
                updated_at = NOW();
        END IF;
    ELSE
        v_awarded_points := COALESCE(v_run.reward_points, 0);
        v_reward_earned := v_awarded_points > 0;
    END IF;

    IF v_perfect AND NOT v_reward_earned THEN
        SELECT EXISTS (
            SELECT 1 FROM public.point_logs point_log
            WHERE point_log.student_id = v_student_id
              AND point_log.event_key = v_event_key
        ) INTO v_reward_already_earned;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE, 'already_finished', v_run.status <> 'active',
        'deck_number', v_run.v2_deck_number,
        'target_question_count', v_run.target_question_count,
        'reward_points', v_awarded_points,
        'perfect_reward_points', v_perfect_reward_points,
        'perfect_practice', v_perfect,
        'perfect_reward_earned', v_reward_earned,
        'perfect_reward_already_earned', v_reward_already_earned,
        'answer_count', v_run.answer_count,
        'correct_count', v_run.correct_count, 'wrong_count', v_run.wrong_count,
        'review_correct_count', 0, 'max_floor', v_run.v2_deck_number,
        'max_combo', v_run.max_combo, 'accuracy', v_accuracy,
        'practice_completed', v_completed
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_vocab_tower_v2_overview_v1() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finish_my_vocab_tower_v2_practice_v1(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_vocab_tower_v2_overview_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_my_vocab_tower_v2_practice_v1(UUID, TEXT) TO authenticated;

COMMIT;
