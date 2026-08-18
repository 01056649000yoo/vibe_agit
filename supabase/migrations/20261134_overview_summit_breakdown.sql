-- 개요 RPC 의 정상 관문 보충 안내에 층별 남은 개수를 담는다.

BEGIN;

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
        LEAST(500, GREATEST(0, COALESCE(class.vocab_tower_v2_perfect_reward_points, 100)))
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
$function$;

REVOKE ALL ON FUNCTION public.get_my_vocab_tower_v2_overview_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_vocab_tower_v2_overview_v1() TO authenticated, service_role;

COMMIT;
