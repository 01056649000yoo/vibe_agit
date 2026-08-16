-- 어휘의 탑 V2 포인트를 `한 판 완벽`에서 `층별 진도`로 옮긴다.
--
-- 배경: 보상이 덱별 최초 12/12 한 번뿐이라 두 가지 문제가 있었다.
--   1) 오타 하나로 그 판 보상이 사라지고 12문항을 처음부터 다시 풀어야 한다.
--   2) 직접 입력형은 `이미 한 번 맞힌 낱말`에서만 나오므로, 아무것도 모르는 첫 연습이 전부 선택형이라
--      가장 쉽고 성실하게 다시 온 학생이 가장 불리했다. 보상이 실력이 아니라 방문 시점에 걸려 있었다.
--
-- 바꾸는 것: 층마다 `익힘까지 간 낱말 수`가 25%·50%·75%·100%를 넘을 때 나눠 지급한다.
-- 층당 총액은 교사 설정값(기본 100P) 그대로이고 총발행량은 늘지 않는다. 한 번 받은 진도 보상은
-- 이후 연습을 망쳐도 사라지지 않는다. 100% 정답률 `정복`은 포인트 없이 지도 위 명예 표시로만 남긴다.
--
-- 기존 `vocab-v2-perfect:*` 지급 이력은 운영에 0건이지만, 혹시 있으면 그 층 예산을 이미 쓴 것으로 보고
-- 진도 보상을 건너뛴다.

-- 층 낱말 수와 층당 총 포인트로 네 구간의 기준 낱말 수와 지급액을 계산한다.
-- 뒤 구간을 크게 둬(20·20·30·30%) 끝까지 미는 힘을 준다. 합계는 반올림 오차 없이 총액과 정확히 같다.
CREATE OR REPLACE FUNCTION public.vocab_tower_v2_progress_milestones_v1(
    p_item_count INTEGER,
    p_total_points INTEGER
)
RETURNS TABLE (milestone_percent SMALLINT, mastered_threshold INTEGER, reward_points INTEGER)
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
    WITH base AS (
        SELECT
            GREATEST(COALESCE(p_item_count, 0), 0) AS items,
            LEAST(500, GREATEST(0, COALESCE(p_total_points, 0))) AS total
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
$$;

COMMENT ON FUNCTION public.vocab_tower_v2_progress_milestones_v1(INTEGER, INTEGER) IS
    '층별 진도 보상 구간. 익힘 낱말 기준 25/50/75/100%에 층 총액을 20·20·30·30%로 나눠 배정한다.';

COMMENT ON COLUMN public.classes.vocab_tower_v2_perfect_reward_points IS
    '어휘의 탑 V2 층당 총 보상 포인트(기본 100P). 익힘 진도 25/50/75/100% 네 구간으로 나눠 지급한다.';

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

    SELECT LEAST(500, GREATEST(0, COALESCE(class.vocab_tower_v2_perfect_reward_points, 100)))
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
    FROM public.vocab_tower_v2_item_progress progress
    WHERE progress.student_id = v_student_id
      AND progress.class_id = v_class_id
      AND progress.grade = v_run.grade
      AND progress.deck_number = v_run.v2_deck_number;

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
               reward_points = LEAST(500, v_awarded_points),
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
$$;

GRANT EXECUTE ON FUNCTION public.finish_my_vocab_tower_v2_practice_v1(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vocab_tower_v2_progress_milestones_v1(INTEGER, INTEGER) TO authenticated;

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
    v_deck_reward_points INTEGER;
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
        'reward_completed', reward_stats.next_percent IS NULL
    ) ORDER BY deck.deck_number), '[]'::JSONB)
      INTO v_decks
    FROM public.vocab_tower_v2_review_decks deck
    LEFT JOIN public.vocab_tower_v2_deck_progress progress
      ON progress.student_id = v_student_id
     AND progress.class_id = v_class_id
     AND progress.grade = v_grade
     AND progress.deck_number = deck.deck_number
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
        FROM public.vocab_tower_v2_item_progress item_progress
        WHERE item_progress.student_id = v_student_id
          AND item_progress.class_id = v_class_id
          AND item_progress.grade = v_grade
          AND item_progress.deck_number = deck.deck_number
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

REVOKE ALL ON FUNCTION public.get_my_vocab_tower_v2_overview_v1() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finish_my_vocab_tower_v2_practice_v1(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.vocab_tower_v2_progress_milestones_v1(INTEGER, INTEGER) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_my_vocab_tower_v2_overview_v1() TO authenticated;
