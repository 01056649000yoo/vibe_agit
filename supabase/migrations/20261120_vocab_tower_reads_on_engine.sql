-- 공통 학습 엔진 1b — 어휘 V2 읽기를 엔진 표로 돌리고 양쪽 쓰기를 끝낸다.
--
-- 1단계(20261119)에서 엔진 표를 만들고 답안을 양쪽에 기록했다. 이제 화면이 읽는 곳을 엔진으로 옮겨
-- 엔진이 유일한 진실이 되게 한다. 옛 vocab_tower_v2_item_progress·deck_progress 표는 이번에도
-- 지우지 않고 남긴다(롤백 경로). 다만 더 이상 읽지도 쓰지도 않는다.
--
-- 바꾼 것은 **저장소 참조뿐**이다. 출제 우선순위·카드함 분류·포인트 계산식·정렬은 한 글자도 손대지 않았다.
-- 치환은 스크립트로 7곳을 명시해 수행했고 각 대상이 정확히 한 번 맞는지 확인했다.
-- 학년·덱은 엔진에서 `vocab_tower_v2_collection_key(학년, 덱번호)` 한 문자열로 표현한다.
--
-- 합격 기준: 기존 어휘 스모크 9종이 그대로 통과하고, 전환 전후 화면 응답이 완전히 같아야 한다.

BEGIN;

CREATE OR REPLACE FUNCTION public.finish_my_vocab_tower_v2_practice_v1(p_run_id uuid, p_reason text DEFAULT 'exited'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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
               reward_points = LEAST(500, v_awarded_points),
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
$fn$;

CREATE OR REPLACE FUNCTION public.get_my_vocab_tower_v2_card_box_v1(p_deck_number smallint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID := public.auth_user_class_id();
    v_grade SMALLINT;
    v_enabled BOOLEAN;
    v_item_count INTEGER := 0;
    v_seen_count INTEGER := 0;
    v_cards JSONB;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL OR v_class_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    IF p_deck_number IS NULL OR p_deck_number NOT BETWEEN 1 AND 10 THEN
        RAISE EXCEPTION '층 번호가 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT
        LEAST(6, GREATEST(3, COALESCE(class.vocab_tower_grade, 3)))::SMALLINT,
        CASE
            WHEN class.enabled_modules IS NULL THEN COALESCE(class.vocab_tower_enabled, FALSE)
            ELSE 'vocab-tower' = ANY(class.enabled_modules)
        END
      INTO v_grade, v_enabled
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

    SELECT count(*)::INTEGER INTO v_item_count
    FROM public.vocab_tower_v2_review_items item
    JOIN public.vocab_tower_v2_review_decks deck ON deck.deck_id = item.deck_id
    WHERE deck.grade = v_grade
      AND deck.deck_number = p_deck_number
      AND deck.review_status = 'locked';

    -- 만난 낱말만 돌려준다. 한 층은 38~40개라 상한 안에서 끝난다.
    SELECT COALESCE(jsonb_agg(card ORDER BY card->>'sort_key'), '[]'::JSONB), count(*)::INTEGER
      INTO v_cards, v_seen_count
    FROM (
        SELECT jsonb_build_object(
            'item_key', item.item_key,
            'word', item.word,
            'definition', item.definition,
            'example', item.example,
            'learning_state', progress.learning_state,
            -- 화면 표시용 분류. 상태만으로는 `왜 아직 익힘이 아닌지`가 드러나지 않아 근거를 함께 나눈다.
            'card_state', CASE
                WHEN progress.learning_state = 'needs_review' AND progress.wrong_count >= 2 THEN 'confusing'
                WHEN progress.learning_state = 'needs_review' THEN 'review_now'
                WHEN progress.learning_state = 'mastered'
                     AND progress.next_review_at IS NOT NULL AND progress.next_review_at <= NOW() THEN 'review_due'
                WHEN progress.learning_state = 'mastered' THEN 'mastered'
                WHEN progress.learning_state = 'familiar'
                     AND progress.next_review_at IS NOT NULL AND progress.next_review_at <= NOW() THEN 'review_due'
                WHEN progress.learning_state = 'familiar' THEN 'almost'
                ELSE 'learning'
            END,
            'attempt_count', progress.attempt_count,
            'correct_count', progress.correct_count,
            'wrong_count', progress.wrong_count,
            'consecutive_correct', progress.consecutive_correct,
            'correct_question_types', to_jsonb(progress.correct_question_types),
            'correct_type_count', cardinality(progress.correct_question_types),
            'last_correct', progress.last_correct,
            'last_seen_at', progress.last_seen_at,
            'next_review_at', progress.next_review_at,
            'sort_key', CASE
                WHEN progress.learning_state = 'needs_review' THEN '1'
                WHEN progress.learning_state = 'learning' THEN '2'
                WHEN progress.learning_state = 'familiar' THEN '3'
                ELSE '4'
            END || item.word
        ) AS card
        FROM public.learning_item_progress progress
        JOIN public.vocab_tower_v2_review_items item ON item.item_key = progress.item_key
        JOIN public.vocab_tower_v2_review_decks deck ON deck.deck_id = item.deck_id
        WHERE progress.student_id = v_student_id
          AND progress.class_id = v_class_id
          AND progress.content_type = 'vocab'
          AND progress.collection_key = public.vocab_tower_v2_collection_key(v_grade, p_deck_number)
          AND deck.grade = v_grade
          AND deck.deck_number = p_deck_number
          AND deck.review_status = 'locked'
        LIMIT 100
    ) cards;

    RETURN jsonb_build_object(
        'success', TRUE,
        'grade', v_grade,
        'deck_number', p_deck_number,
        'item_count', v_item_count,
        'seen_count', v_seen_count,
        'unseen_count', GREATEST(v_item_count - v_seen_count, 0),
        'cards', v_cards
    );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_my_vocab_tower_v2_overview_v1()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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
$fn$;

CREATE OR REPLACE FUNCTION public.get_next_my_vocab_tower_v2_practice_question_v1(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID := public.auth_user_class_id();
    v_run public.vocab_tower_runs%ROWTYPE;
    v_existing public.vocab_tower_v2_run_questions%ROWTYPE;
    v_item public.vocab_tower_v2_review_items%ROWTYPE;
    v_deck public.vocab_tower_v2_review_decks%ROWTYPE;
    v_item_key TEXT;
    v_question JSONB;
    v_question_type TEXT;
    v_room_type TEXT;
    v_options JSONB;
    v_accepted JSONB;
    v_correct_answer TEXT;
    v_sequence SMALLINT;
    v_target_focus TEXT;
    v_selection_focus TEXT;
    v_learning_state TEXT;
    v_is_input BOOLEAN;
    v_is_retry BOOLEAN := FALSE;
    v_retry_source_type TEXT;
    v_candidate TEXT;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL OR v_class_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT run.* INTO v_run
    FROM public.vocab_tower_runs run
    WHERE run.id = p_run_id
      AND run.student_id = v_student_id
      AND run.class_id = v_class_id
    FOR UPDATE;

    IF NOT FOUND OR v_run.status <> 'active' OR v_run.content_version <> 'v2'
       OR v_run.v2_deck_number IS NULL OR v_run.target_question_count <> 12 THEN
        RAISE EXCEPTION '진행 중인 V2 개인 연습을 찾을 수 없습니다.' USING ERRCODE = '22023';
    END IF;
    IF v_run.answer_count >= v_run.target_question_count THEN
        RAISE EXCEPTION '이 덱의 개인 연습 문항을 모두 풀었어요.' USING ERRCODE = '22023';
    END IF;

    SELECT question.* INTO v_existing
    FROM public.vocab_tower_v2_run_questions question
    WHERE question.run_id = v_run.id
      AND question.sequence_number = v_run.answer_count + 1
      AND question.answered_at IS NULL
    LIMIT 1;

    IF v_existing.id IS NOT NULL THEN
        RETURN public.build_vocab_tower_v2_question_payload_v1(
            v_existing, v_run.target_question_count, v_run.v2_deck_number);
    END IF;

    v_sequence := (v_run.answer_count + 1)::SMALLINT;

    -- 보충 수련 우선: 3문항 이상 지난 오답 중 아직 다시 내지 않은 가장 오래된 낱말을 고른다.
    SELECT asked.item_key, asked.question_type
      INTO v_item_key, v_retry_source_type
    FROM public.vocab_tower_v2_run_questions asked
    JOIN public.vocab_tower_answers answer
      ON answer.run_id = asked.run_id
     AND answer.question_key = asked.id::TEXT
    WHERE asked.run_id = v_run.id
      AND answer.is_correct IS FALSE
      AND asked.sequence_number <= v_sequence - 3
      AND NOT EXISTS (
          SELECT 1
          FROM public.vocab_tower_v2_run_questions repeated
          WHERE repeated.run_id = v_run.id
            AND repeated.item_key = asked.item_key
            AND repeated.sequence_number > asked.sequence_number
      )
    ORDER BY asked.sequence_number
    LIMIT 1;

    IF v_item_key IS NOT NULL THEN
        v_is_retry := TRUE;
        v_selection_focus := 'retry';
    ELSE
        v_target_focus := CASE MOD(v_sequence - 1, 12)
            WHEN 0 THEN 'weak'
            WHEN 1 THEN 'new'
            WHEN 2 THEN 'review'
            WHEN 3 THEN 'weak'
            WHEN 4 THEN 'review'
            WHEN 5 THEN 'new'
            WHEN 6 THEN 'weak'
            WHEN 7 THEN 'review'
            WHEN 8 THEN 'weak'
            WHEN 9 THEN 'weak'
            WHEN 10 THEN 'review'
            ELSE 'new'
        END;

        WITH candidates AS (
            SELECT
                item.item_key,
                progress.learning_state,
                CASE
                    WHEN progress.item_key IS NULL THEN 'new'
                    WHEN progress.learning_state = 'needs_review' THEN 'weak'
                    WHEN progress.learning_state = 'learning' THEN 'review'
                    WHEN progress.next_review_at IS NULL OR progress.next_review_at <= NOW() THEN 'review'
                    ELSE 'mastered'
                END AS selection_focus
            FROM public.vocab_tower_v2_review_items item
            JOIN public.vocab_tower_v2_review_decks deck ON deck.deck_id = item.deck_id
            LEFT JOIN public.learning_item_progress progress
              ON progress.student_id = v_student_id
             AND progress.class_id = v_class_id
             AND progress.content_type = 'vocab'
             AND progress.collection_key = public.vocab_tower_v2_collection_key(v_run.grade, v_run.v2_deck_number)
             AND progress.item_key = item.item_key
            WHERE deck.grade = v_run.grade
              AND deck.deck_number = v_run.v2_deck_number
              AND deck.review_status = 'locked'
              AND NOT EXISTS (
                  SELECT 1 FROM public.vocab_tower_v2_run_questions used
                  WHERE used.run_id = v_run.id AND used.item_key = item.item_key
              )
        )
        SELECT candidate.item_key, candidate.selection_focus, candidate.learning_state
          INTO v_item_key, v_selection_focus, v_learning_state
        FROM candidates candidate
        ORDER BY
            CASE v_target_focus
                WHEN 'weak' THEN CASE candidate.selection_focus
                    WHEN 'weak' THEN 0 WHEN 'new' THEN 1 WHEN 'review' THEN 2 ELSE 3 END
                WHEN 'review' THEN CASE candidate.selection_focus
                    WHEN 'review' THEN 0 WHEN 'new' THEN 1 WHEN 'weak' THEN 2 ELSE 3 END
                ELSE CASE candidate.selection_focus
                    WHEN 'new' THEN 0 WHEN 'review' THEN 1 WHEN 'weak' THEN 2 ELSE 3 END
            END,
            random()
        LIMIT 1;
    END IF;

    IF v_item_key IS NOT NULL THEN
        SELECT item.* INTO v_item
        FROM public.vocab_tower_v2_review_items item
        WHERE item.item_key = v_item_key;
    END IF;
    IF v_item.item_key IS NOT NULL THEN
        SELECT deck.* INTO v_deck
        FROM public.vocab_tower_v2_review_decks deck
        WHERE deck.deck_id = v_item.deck_id
          AND deck.grade = v_run.grade
          AND deck.deck_number = v_run.v2_deck_number
          AND deck.review_status = 'locked';
    END IF;
    IF v_item.item_key IS NULL OR v_deck.deck_id IS NULL THEN
        RAISE EXCEPTION '잠긴 V2 덱에서 연습 문항을 찾지 못했습니다.' USING ERRCODE = '55000';
    END IF;

    -- 단계형 난이도: 이미 한 유형을 힌트 없이 성공한 낱말만 직접 입력형으로 올린다.
    -- 보충 수련은 방금 틀린 낱말이므로 입력형으로 올리지 않고 선택형으로 다시 묻는다.
    v_is_input := NOT v_is_retry AND v_learning_state IN ('familiar', 'mastered');
    IF v_is_input THEN
        v_question_type := CASE MOD(v_sequence::INTEGER, 2) WHEN 0 THEN 'definitionInput' ELSE 'clozeInput' END;
        v_question := v_item.questions->v_question_type;
        SELECT jsonb_agg(DISTINCT answer) INTO v_accepted
        FROM jsonb_array_elements_text(COALESCE(v_question->'acceptedAnswers', '[]'::jsonb)) answer
        WHERE char_length(btrim(answer)) BETWEEN 1 AND 100;
        IF v_question->>'status' <> 'reviewed'
           OR v_accepted IS NULL
           OR jsonb_array_length(v_accepted) NOT BETWEEN 1 AND 10 THEN
            v_is_input := FALSE;
        END IF;
    END IF;

    IF v_is_input THEN
        v_room_type := CASE v_question_type WHEN 'definitionInput' THEN 'meaning' ELSE 'sentence' END;
        v_options := '[]'::jsonb;
        v_correct_answer := v_accepted->>0;
    ELSE
        v_accepted := '[]'::jsonb;
        v_question_type := NULL;

        IF v_is_retry THEN
            -- 방금 틀린 형태를 피해 다른 선택형부터 시도한다.
            FOREACH v_candidate IN ARRAY ARRAY['meaningChoice', 'clozeChoice', 'usageDistinction'] LOOP
                CONTINUE WHEN v_candidate = v_retry_source_type;
                IF (v_item.questions->v_candidate)->>'status' = 'reviewed' THEN
                    v_question_type := v_candidate;
                    EXIT;
                END IF;
            END LOOP;
        END IF;

        IF v_question_type IS NULL THEN
            v_room_type := CASE MOD(v_run.answer_count, 3)
                WHEN 0 THEN 'meaning'
                WHEN 1 THEN 'sentence'
                ELSE 'distinction'
            END;
            v_question_type := CASE v_room_type
                WHEN 'sentence' THEN 'clozeChoice'
                WHEN 'distinction' THEN 'usageDistinction'
                ELSE 'meaningChoice'
            END;
        END IF;

        v_room_type := CASE v_question_type
            WHEN 'clozeChoice' THEN 'sentence'
            WHEN 'usageDistinction' THEN 'distinction'
            ELSE 'meaning'
        END;
        v_question := v_item.questions->v_question_type;
        IF v_question->>'status' <> 'reviewed' THEN
            RAISE EXCEPTION '검수 완료 문항만 출제할 수 있습니다.' USING ERRCODE = '55000';
        END IF;

        SELECT option->>'value' INTO v_correct_answer
        FROM jsonb_array_elements(v_question->'options') option
        WHERE option->>'isCorrect' = 'true'
        LIMIT 1;
        SELECT jsonb_agg(option->'value' ORDER BY random()) INTO v_options
        FROM jsonb_array_elements(v_question->'options') option;

        IF v_correct_answer IS NULL OR jsonb_array_length(v_options) NOT BETWEEN 2 AND 6 THEN
            RAISE EXCEPTION 'V2 선택 문항의 정답과 보기가 올바르지 않습니다.' USING ERRCODE = '55000';
        END IF;
    END IF;

    INSERT INTO public.vocab_tower_v2_run_questions (
        run_id, student_id, class_id, item_key, deck_id, sequence_number,
        room_type, question_type, prompt, options, accepted_answers, correct_answer, explanation,
        word, definition, example, difficulty, category, is_review, is_retry, selection_focus
    ) VALUES (
        v_run.id, v_student_id, v_class_id, v_item.item_key, v_deck.deck_id, v_sequence,
        v_room_type, v_question_type, v_question->>'prompt', v_options, v_accepted, v_correct_answer,
        COALESCE(NULLIF(BTRIM(v_question->>'explanation'), ''), v_item.definition),
        v_item.word, v_item.definition, v_item.example, v_item.difficulty, v_item.category,
        v_is_retry OR v_selection_focus IN ('weak', 'review'), v_is_retry, v_selection_focus
    ) RETURNING * INTO v_existing;

    RETURN public.build_vocab_tower_v2_question_payload_v1(
        v_existing, v_run.target_question_count, v_run.v2_deck_number);
END;
$fn$;


-- 읽기가 엔진으로 넘어갔으므로 답안 트리거는 엔진에만 기록한다(양쪽 쓰기 종료).
-- 옛 표는 이 시점의 값으로 얼어붙어 롤백 대조용으로만 남는다.
CREATE OR REPLACE FUNCTION public.record_vocab_tower_v2_item_progress_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_question public.vocab_tower_v2_run_questions%ROWTYPE;
    v_run public.vocab_tower_runs%ROWTYPE;
BEGIN
    SELECT question.* INTO v_question
    FROM public.vocab_tower_v2_run_questions question
    WHERE question.id::TEXT = NEW.question_key
      AND question.run_id = NEW.run_id
      AND question.student_id = NEW.student_id
      AND question.class_id = NEW.class_id;
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    SELECT run.* INTO v_run
    FROM public.vocab_tower_runs run
    WHERE run.id = NEW.run_id
      AND run.student_id = NEW.student_id
      AND run.class_id = NEW.class_id
      AND run.content_version = 'v2'
      AND run.v2_deck_number IS NOT NULL
      AND run.target_question_count = 12;
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    -- 상태 전이·복습 간격은 엔진이 소유한다. 어휘는 "누가·어느 묶음·어느 항목"만 넘긴다.
    PERFORM public.learning_engine_record_answer_v1(
        NEW.student_id, NEW.class_id, 'vocab',
        public.vocab_tower_v2_collection_key(v_run.grade, v_run.v2_deck_number),
        v_question.item_key, v_question.question_type,
        NEW.is_correct, NEW.used_hint, NEW.run_id
    );

    RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.record_vocab_tower_v2_item_progress_v1()
    FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
