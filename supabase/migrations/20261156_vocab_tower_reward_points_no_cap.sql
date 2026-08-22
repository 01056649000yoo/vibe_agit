-- 어휘의 탑 층당 진도 보상 총액의 위쪽 상한(500P)을 없앤다.
-- 상한값이 교사 화면·CHECK 제약·RPC 세 군데에 흩어져 있어 한 곳만 고치면 다른 곳이 되돌렸다.
-- 이제 값 보정의 원본은 public.vocab_tower_v2_floor_reward_points_v1 하나이고,
-- 남는 한계는 정책이 아니라 integer 컬럼의 기술적 한계(약 21억)뿐이다.
-- 0 미만과 NULL만 보정하며, 0P로 저장하면 보상을 끄는 동작은 그대로다.

BEGIN;

ALTER TABLE public.classes
    DROP CONSTRAINT IF EXISTS classes_vocab_tower_v2_perfect_reward_points_check;
ALTER TABLE public.classes
    ADD CONSTRAINT classes_vocab_tower_v2_perfect_reward_points_check
    CHECK (vocab_tower_v2_perfect_reward_points >= 0);

ALTER TABLE public.vocab_tower_runs
    DROP CONSTRAINT IF EXISTS vocab_tower_runs_reward_points_check;
ALTER TABLE public.vocab_tower_runs
    ADD CONSTRAINT vocab_tower_runs_reward_points_check
    CHECK (reward_points >= 0);

-- 층당 총액 보정의 유일한 원본. 위쪽 상한 없이 NULL과 음수만 막는다.
CREATE OR REPLACE FUNCTION public.vocab_tower_v2_floor_reward_points_v1(p_configured INTEGER)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog', 'public'
AS $function$
    SELECT GREATEST(0, COALESCE(p_configured, 100));
$function$;

COMMENT ON FUNCTION public.vocab_tower_v2_floor_reward_points_v1(INTEGER) IS
    '어휘의 탑 V2 층당 진도 보상 총액 보정의 원본. 2026-08-22에 위쪽 상한을 없앴고 NULL은 기본 100P, 음수는 0P로만 보정한다.';

-- 구간 분배도 같은 이유로 위쪽 상한을 뺀다. 20·20·30·30% 분배와 반올림 보정은 그대로다.
CREATE OR REPLACE FUNCTION public.vocab_tower_v2_progress_milestones_v1(p_item_count integer, p_total_points integer)
RETURNS TABLE(milestone_percent smallint, mastered_threshold integer, reward_points integer)
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog', 'public'
AS $function$
    WITH base AS (
        SELECT
            GREATEST(COALESCE(p_item_count, 0), 0) AS items,
            GREATEST(0, COALESCE(p_total_points, 0)) AS total
    ), split AS (
        SELECT
            items,
            total,
            ROUND(total * 0.20)::INTEGER AS first_points,
            ROUND(total * 0.20)::INTEGER AS second_points,
            ROUND(total * 0.30)::INTEGER AS third_points
        FROM base
    )
    SELECT 25::SMALLINT, CEIL(items * 0.25)::INTEGER, first_points FROM split
    UNION ALL
    SELECT 50::SMALLINT, CEIL(items * 0.50)::INTEGER, second_points FROM split
    UNION ALL
    SELECT 75::SMALLINT, CEIL(items * 0.75)::INTEGER, third_points FROM split
    UNION ALL
    SELECT 100::SMALLINT, items, (total - first_points - second_points - third_points) FROM split
    ORDER BY 1;
$function$;

CREATE OR REPLACE FUNCTION public.finish_my_vocab_tower_v2_practice_v1(p_run_id uuid, p_reason text DEFAULT 'exited'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID := public.auth_user_class_id();
    v_run public.vocab_tower_runs%ROWTYPE;
    v_accuracy SMALLINT := 0;
    v_completed BOOLEAN := FALSE;
    v_perfect BOOLEAN := FALSE;
    v_deck_reward_points INTEGER := 0;
    v_point_result JSONB;
    v_awarded_points INTEGER := 0;
    v_legacy_perfect_earned BOOLEAN := FALSE;
    v_item_count INTEGER := 0;
    v_seen_count INTEGER := 0;
    v_mastered_count INTEGER := 0;
    v_needs_review_count INTEGER := 0;
    v_new_words_seen INTEGER := 0;
    v_mastered_this_run INTEGER := 0;
    v_milestone RECORD;
    v_event_key TEXT;
    v_awarded_milestones JSONB := '[]'::JSONB;
    v_milestones JSONB := '[]'::JSONB;
    v_earned_points INTEGER := 0;
    v_next_percent SMALLINT;
    v_next_threshold INTEGER;
    v_next_points INTEGER;
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

    SELECT public.vocab_tower_v2_floor_reward_points_v1(class.vocab_tower_v2_perfect_reward_points)
      INTO v_deck_reward_points
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
    -- 정복은 지도 위 명예 표시로만 쓰고 포인트와 연결하지 않는다.
    v_perfect := v_completed
        AND v_run.answer_count = v_run.target_question_count
        AND v_run.correct_count = v_run.target_question_count;

    -- 낱말 상태는 답안 저장 트리거가 이미 갱신했으므로 지급 판정 전에 집계한다.
    SELECT count(*)::INTEGER INTO v_item_count
    FROM public.vocab_tower_v2_review_items item
    JOIN public.vocab_tower_v2_review_decks deck ON deck.deck_id = item.deck_id
    WHERE deck.grade = v_run.grade
      AND deck.deck_number = v_run.v2_deck_number
      AND deck.review_status = 'locked';

    SELECT
        count(*)::INTEGER,
        count(*) FILTER (WHERE progress.learning_state = 'mastered')::INTEGER,
        count(*) FILTER (WHERE progress.learning_state = 'needs_review')::INTEGER,
        count(*) FILTER (WHERE progress.first_seen_run_id = v_run.id)::INTEGER,
        count(*) FILTER (WHERE progress.last_mastered_run_id = v_run.id)::INTEGER
      INTO v_seen_count, v_mastered_count, v_needs_review_count,
           v_new_words_seen, v_mastered_this_run
    FROM public.learning_item_progress progress
    WHERE progress.student_id = v_student_id
      AND progress.class_id = v_class_id
      AND progress.content_type = 'vocab'
      AND progress.collection_key = public.vocab_tower_v2_collection_key(v_run.grade, v_run.v2_deck_number);

    SELECT EXISTS (
        SELECT 1 FROM public.point_logs point_log
        WHERE point_log.student_id = v_student_id
          AND point_log.event_key = format(
              'vocab-v2-perfect:%s:%s:%s', v_class_id, v_run.grade, v_run.v2_deck_number
          )
    ) INTO v_legacy_perfect_earned;

    IF v_run.status = 'active' THEN
        -- 넘어선 구간을 모두 지급한다. 한 번에 여러 구간을 넘었으면 각각 따로 준다.
        FOR v_milestone IN
            SELECT * FROM public.vocab_tower_v2_progress_milestones_v1(v_item_count, v_deck_reward_points)
        LOOP
            CONTINUE WHEN v_legacy_perfect_earned;
            CONTINUE WHEN v_milestone.reward_points <= 0 OR v_milestone.mastered_threshold <= 0;
            CONTINUE WHEN v_mastered_count < v_milestone.mastered_threshold;

            v_event_key := format(
                'vocab-v2-progress:%s:%s:%s:%s',
                v_class_id, v_run.grade, v_run.v2_deck_number, v_milestone.milestone_percent
            );
            v_point_result := public.point_engine_apply(
                v_student_id,
                v_milestone.reward_points,
                format('어휘의 탑 %s층 낱말 %s%% 익힘', v_run.v2_deck_number, v_milestone.milestone_percent),
                'vocab_tower',
                v_event_key,
                NULL,
                NULL,
                jsonb_build_object(
                    'source', 'vocab_tower_v2_progress_reward',
                    'class_id', v_class_id,
                    'grade', v_run.grade,
                    'deck_number', v_run.v2_deck_number,
                    'milestone_percent', v_milestone.milestone_percent,
                    'mastered_count', v_mastered_count,
                    'item_count', v_item_count,
                    'run_id', v_run.id
                )
            );
            IF COALESCE((v_point_result->>'applied_amount')::INTEGER, 0) > 0 THEN
                v_awarded_points := v_awarded_points + (v_point_result->>'applied_amount')::INTEGER;
                v_awarded_milestones := v_awarded_milestones || jsonb_build_object(
                    'percent', v_milestone.milestone_percent,
                    'points', (v_point_result->>'applied_amount')::INTEGER,
                    'threshold', v_milestone.mastered_threshold
                );
            END IF;
        END LOOP;

        UPDATE public.vocab_tower_runs run
           SET status = 'finished',
               finish_reason = CASE WHEN v_completed THEN 'completed' ELSE 'exited' END,
               reward_points = GREATEST(0, v_awarded_points),
               finished_at = NOW()
         WHERE run.id = v_run.id;

        IF v_run.answer_count > 0 THEN
            INSERT INTO public.learning_collection_progress (
                student_id, class_id, content_type, collection_key,
                practice_runs, completed_runs, best_accuracy,
                last_accuracy, last_answer_count, last_practiced_at, updated_at
            ) VALUES (
                v_student_id, v_class_id, 'vocab',
                public.vocab_tower_v2_collection_key(v_run.grade, v_run.v2_deck_number),
                1, CASE WHEN v_completed THEN 1 ELSE 0 END,
                CASE WHEN v_completed THEN v_accuracy ELSE 0 END,
                v_accuracy, v_run.answer_count, NOW(), NOW()
            )
            ON CONFLICT (student_id, class_id, content_type, collection_key) DO UPDATE SET
                practice_runs = public.learning_collection_progress.practice_runs + 1,
                completed_runs = public.learning_collection_progress.completed_runs
                    + CASE WHEN v_completed THEN 1 ELSE 0 END,
                best_accuracy = GREATEST(public.learning_collection_progress.best_accuracy, EXCLUDED.best_accuracy),
                last_accuracy = EXCLUDED.last_accuracy,
                last_answer_count = EXCLUDED.last_answer_count,
                last_practiced_at = EXCLUDED.last_practiced_at,
                updated_at = NOW();
        END IF;
    ELSE
        v_awarded_points := COALESCE(v_run.reward_points, 0);
    END IF;

    -- 층 전체 진도 상태를 만들어 결과 화면이 `다음 보상까지 몇 개`를 안내할 수 있게 한다.
    FOR v_milestone IN
        SELECT * FROM public.vocab_tower_v2_progress_milestones_v1(v_item_count, v_deck_reward_points)
    LOOP
        v_event_key := format(
            'vocab-v2-progress:%s:%s:%s:%s',
            v_class_id, v_run.grade, v_run.v2_deck_number, v_milestone.milestone_percent
        );
        v_milestones := v_milestones || jsonb_build_object(
            'percent', v_milestone.milestone_percent,
            'threshold', v_milestone.mastered_threshold,
            'points', v_milestone.reward_points,
            'earned', v_legacy_perfect_earned OR EXISTS (
                SELECT 1 FROM public.point_logs point_log
                WHERE point_log.student_id = v_student_id
                  AND point_log.event_key = v_event_key
            )
        );
        IF v_legacy_perfect_earned OR EXISTS (
            SELECT 1 FROM public.point_logs point_log
            WHERE point_log.student_id = v_student_id
              AND point_log.event_key = v_event_key
        ) THEN
            v_earned_points := v_earned_points + v_milestone.reward_points;
        ELSIF v_next_percent IS NULL AND v_milestone.mastered_threshold > 0 THEN
            v_next_percent := v_milestone.milestone_percent;
            v_next_threshold := v_milestone.mastered_threshold;
            v_next_points := v_milestone.reward_points;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE, 'already_finished', v_run.status <> 'active',
        'deck_number', v_run.v2_deck_number,
        'target_question_count', v_run.target_question_count,
        'reward_points', v_awarded_points,
        'deck_reward_points', v_deck_reward_points,
        'progress_milestones', v_milestones,
        'awarded_milestones', v_awarded_milestones,
        'earned_reward_points', v_earned_points,
        'next_milestone_percent', v_next_percent,
        'next_milestone_threshold', v_next_threshold,
        'next_milestone_points', v_next_points,
        'next_milestone_remaining', GREATEST(COALESCE(v_next_threshold, 0) - v_mastered_count, 0),
        'perfect_practice', v_perfect,
        'answer_count', v_run.answer_count,
        'correct_count', v_run.correct_count, 'wrong_count', v_run.wrong_count,
        'review_correct_count', 0, 'max_floor', v_run.v2_deck_number,
        'max_combo', v_run.max_combo, 'accuracy', v_accuracy,
        'practice_completed', v_completed,
        'item_count', v_item_count,
        'seen_count', v_seen_count,
        'unseen_count', GREATEST(v_item_count - v_seen_count, 0),
        'mastered_count', v_mastered_count,
        'needs_review_count', v_needs_review_count,
        'new_words_seen', v_new_words_seen,
        'mastered_this_run', v_mastered_this_run
    );
END;
$function$

;

CREATE OR REPLACE FUNCTION public.get_my_vocab_tower_v2_overview_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID := public.auth_user_class_id();
    v_grade SMALLINT;
    v_enabled BOOLEAN;
    v_deck_reward_points INTEGER;
    v_master_ratio NUMERIC;
    v_class_row public.classes%ROWTYPE;
    v_summit JSONB;
    v_passed_keys JSONB;
    v_decks JSONB;
    v_earned_keys JSONB;
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
        public.vocab_tower_v2_floor_reward_points_v1(class.vocab_tower_v2_perfect_reward_points)
      INTO v_grade, v_enabled, v_deck_reward_points
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

    SELECT class.* INTO v_class_row FROM public.classes class WHERE class.id = v_class_id;
    v_master_ratio := v_class_row.vocab_master_required_mastered_ratio;

    -- 지도가 층마다 "덱마스터 통과함"을 표시해야 한다. 층마다 따로 세지 않고 한 번에 모은다.
    SELECT COALESCE(jsonb_object_agg(attempt.collection_key, TRUE), '{}'::JSONB)
      INTO v_passed_keys
    FROM (
        SELECT DISTINCT attempt.collection_key
        FROM public.learning_challenge_attempts attempt
        WHERE attempt.student_id = v_student_id
          AND attempt.class_id = v_class_id
          AND attempt.content_type = 'vocab'
          AND attempt.challenge_kind = 'collection'
          AND attempt.status = 'completed'
          AND attempt.passed IS TRUE
    ) attempt;

    v_summit := public.vocab_tower_v2_summit_status_v1(v_student_id, v_class_id, v_grade);

    -- 층마다 네 구간을 따로 조회하지 않도록 이 학생의 지급 이력 키를 한 번에 모아 둔다.
    SELECT COALESCE(jsonb_object_agg(point_log.event_key, TRUE), '{}'::JSONB)
      INTO v_earned_keys
    FROM (
        SELECT DISTINCT point_log.event_key
        FROM public.point_logs point_log
        WHERE point_log.student_id = v_student_id
          AND (point_log.event_key LIKE 'vocab-v2-progress:%' OR point_log.event_key LIKE 'vocab-v2-perfect:%')
    ) point_log;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'deck_number', deck.deck_number,
        'deck_id', deck.deck_id,
        'item_count', COALESCE(item_stats.item_count, 0),
        'seen_count', COALESCE(learning_stats.seen_count, 0),
        'learning_count', COALESCE(learning_stats.learning_count, 0),
        'familiar_count', COALESCE(learning_stats.familiar_count, 0),
        'needs_review_count', COALESCE(learning_stats.needs_review_count, 0),
        'mastered_count', COALESCE(learning_stats.mastered_count, 0),
        'unseen_count', GREATEST(
            COALESCE(item_stats.item_count, 0) - COALESCE(learning_stats.seen_count, 0), 0
        ),
        'practice_runs', COALESCE(progress.practice_runs, 0),
        'completed_runs', COALESCE(progress.completed_runs, 0),
        'best_accuracy', COALESCE(progress.best_accuracy, 0),
        'last_accuracy', COALESCE(progress.last_accuracy, 0),
        'last_answer_count', COALESCE(progress.last_answer_count, 0),
        'last_practiced_at', progress.last_practiced_at,
        'deck_reward_points', v_deck_reward_points,
        'earned_reward_points', COALESCE(reward_stats.earned_points, 0),
        'next_milestone_percent', reward_stats.next_percent,
        'next_milestone_threshold', reward_stats.next_threshold,
        'next_milestone_points', reward_stats.next_points,
        'next_milestone_remaining', GREATEST(
            COALESCE(reward_stats.next_threshold, 0) - COALESCE(learning_stats.mastered_count, 0), 0
        ),
        'reward_completed', reward_stats.next_percent IS NULL,
        -- 덱마스터 도전 자격. 화면은 버튼을 늘 보여 주고, 잠긴 이유를 이 값들로 설명한다.
        'master_passed', COALESCE(v_passed_keys ? public.vocab_tower_v2_collection_key(v_grade, deck.deck_number), FALSE),
        'master_required_mastered', CEIL(COALESCE(item_stats.item_count, 0) * v_master_ratio)::INTEGER,
        'master_missing_mastered', GREATEST(
            CEIL(COALESCE(item_stats.item_count, 0) * v_master_ratio)::INTEGER
                - COALESCE(learning_stats.mastered_count, 0), 0),
        -- 지난 시험에서 틀린 낱말을 다시 익혀야 또 칠 수 있다(보충 수련).
        'master_retry', public.learning_engine_retry_gate_v1(
            v_student_id, v_class_id, 'vocab',
            public.vocab_tower_v2_collection_key(v_grade, deck.deck_number), 'collection'),
        'master_eligible', COALESCE(item_stats.item_count, 0) > 0
            AND COALESCE(learning_stats.seen_count, 0) >= COALESCE(item_stats.item_count, 0)
            AND COALESCE(learning_stats.mastered_count, 0)
                >= CEIL(COALESCE(item_stats.item_count, 0) * v_master_ratio)::INTEGER
    ) ORDER BY deck.deck_number), '[]'::JSONB)
      INTO v_decks
    FROM public.vocab_tower_v2_review_decks deck
    LEFT JOIN public.learning_collection_progress progress
      ON progress.student_id = v_student_id
     AND progress.class_id = v_class_id
     AND progress.content_type = 'vocab'
     AND progress.collection_key = public.vocab_tower_v2_collection_key(v_grade, deck.deck_number)
    LEFT JOIN LATERAL (
        SELECT count(*)::INTEGER AS item_count
        FROM public.vocab_tower_v2_review_items item
        WHERE item.deck_id = deck.deck_id
    ) item_stats ON TRUE
    LEFT JOIN LATERAL (
        SELECT
            count(*)::INTEGER AS seen_count,
            count(*) FILTER (WHERE item_progress.learning_state = 'learning')::INTEGER AS learning_count,
            count(*) FILTER (WHERE item_progress.learning_state = 'familiar')::INTEGER AS familiar_count,
            count(*) FILTER (WHERE item_progress.learning_state = 'needs_review')::INTEGER AS needs_review_count,
            count(*) FILTER (WHERE item_progress.learning_state = 'mastered')::INTEGER AS mastered_count
        FROM public.learning_item_progress item_progress
        WHERE item_progress.student_id = v_student_id
          AND item_progress.class_id = v_class_id
          AND item_progress.content_type = 'vocab'
          AND item_progress.collection_key = public.vocab_tower_v2_collection_key(v_grade, deck.deck_number)
    ) learning_stats ON TRUE
    LEFT JOIN LATERAL (
        SELECT
            COALESCE(SUM(milestone.reward_points) FILTER (WHERE milestone.earned_flag), 0)::INTEGER AS earned_points,
            (ARRAY_AGG(milestone.milestone_percent ORDER BY milestone.milestone_percent)
                FILTER (WHERE NOT milestone.earned_flag AND milestone.mastered_threshold > 0))[1] AS next_percent,
            (ARRAY_AGG(milestone.mastered_threshold ORDER BY milestone.milestone_percent)
                FILTER (WHERE NOT milestone.earned_flag AND milestone.mastered_threshold > 0))[1] AS next_threshold,
            (ARRAY_AGG(milestone.reward_points ORDER BY milestone.milestone_percent)
                FILTER (WHERE NOT milestone.earned_flag AND milestone.mastered_threshold > 0))[1] AS next_points
        FROM (
            SELECT
                source.milestone_percent,
                source.mastered_threshold,
                source.reward_points,
                (
                    v_earned_keys ? format(
                        'vocab-v2-progress:%s:%s:%s:%s',
                        v_class_id, v_grade, deck.deck_number, source.milestone_percent
                    )
                    OR v_earned_keys ? format(
                        'vocab-v2-perfect:%s:%s:%s', v_class_id, v_grade, deck.deck_number
                    )
                ) AS earned_flag
            FROM public.vocab_tower_v2_progress_milestones_v1(
                COALESCE(item_stats.item_count, 0), v_deck_reward_points
            ) source
        ) milestone
    ) reward_stats ON TRUE
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
        'deck_reward_points', v_deck_reward_points,
        'master_settings', jsonb_build_object(
            'required_mastered_ratio', v_master_ratio,
            'question_count', v_class_row.vocab_master_question_count,
            'input_count', v_class_row.vocab_master_input_count,
            'pass_correct', v_class_row.vocab_master_pass_correct,
            'pass_input', v_class_row.vocab_master_pass_input,
            'seconds_per_question', v_class_row.vocab_master_seconds_per_question
        ),
        'summit_settings', jsonb_build_object(
            'question_count', v_class_row.vocab_summit_question_count,
            'input_count', v_class_row.vocab_summit_input_count,
            'pass_correct', v_class_row.vocab_summit_pass_correct,
            'pass_input', v_class_row.vocab_summit_pass_input,
            'seconds_per_question', v_class_row.vocab_master_seconds_per_question
        ),
        'summit', v_summit || jsonb_build_object(
            'retry', CASE
                WHEN (v_summit->>'next_stage') IS NULL THEN NULL
                ELSE (
                    SELECT gate || jsonb_build_object(
                        -- 남은 낱말이 **어느 층**에 있는지 세어 준다. 지도에서 헤매지 않게.
                        'by_deck', public.vocab_tower_v2_retry_breakdown_v1(
                            ARRAY(SELECT jsonb_array_elements_text(gate->'remaining_items')), v_grade))
                    FROM public.learning_engine_retry_gate_v1(
                        v_student_id, v_class_id, 'vocab',
                        public.vocab_tower_v2_summit_key(v_grade, (v_summit->>'next_stage')::SMALLINT),
                        'summit') gate
                )
            END),
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
$function$

;

REVOKE ALL ON FUNCTION public.vocab_tower_v2_floor_reward_points_v1(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vocab_tower_v2_floor_reward_points_v1(INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vocab_tower_v2_progress_milestones_v1(INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_my_vocab_tower_v2_practice_v1(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_vocab_tower_v2_overview_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_vocab_tower_v2_overview_v1() TO authenticated, service_role;

COMMENT ON COLUMN public.classes.vocab_tower_v2_perfect_reward_points IS
    '어휘의 탑 V2 층당 총 보상 포인트(기본 100P). 익힘 진도 25/50/75/100% 네 구간으로 나눠 지급하며 위쪽 상한은 없다.';

COMMIT;
