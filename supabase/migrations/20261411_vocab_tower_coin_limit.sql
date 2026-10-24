-- 어휘의 탑 코인 하루 한도를 학급 설정으로(2026-10-24 선생님 요청, 기본 3개) + 연습 결과 창에 코인 안내.
--
--  1) `classes.vocab_tower_coin_daily_limit` (0~10, 기본 3). 0 이면 이 학급은 어휘의 탑 코인을 주지 않는다.
--     교사 화면의 어휘의 탑 설정에서 고친다(다른 어휘의 탑 설정과 같은 방식으로 학급 행을 저장).
--  2) 지급 트리거가 학급 한도를 읽는다(20261410 은 고정 3개였다).
--  3) 인형뽑기 컨텍스트가 학급 한도를 알려 준다.
--  4) 어휘의 탑 연습 마무리 함수가 결과 창에 쓸 값을 더해 돌려준다: 이번 판 코인을 받았는지(`tower_coin_earned`),
--     오늘 받은 수(`tower_coins_today`)·한도(`tower_coin_cap`)·못 받은 까닭(`tower_coin_reason`: earned·not_completed·too_few·accuracy·off·daily_limit·claw_off·none).
BEGIN;

ALTER TABLE public.classes
    ADD COLUMN vocab_tower_coin_daily_limit SMALLINT NOT NULL DEFAULT 3
    CHECK (vocab_tower_coin_daily_limit BETWEEN 0 AND 10);

CREATE OR REPLACE FUNCTION public.vocab_tower_award_coin_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
    v_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::DATE;
    v_count INTEGER;
    v_limit INTEGER;
    v_coin UUID;
BEGIN
    IF NEW.status IS DISTINCT FROM 'finished' OR OLD.status = 'finished' OR NEW.finish_reason IS DISTINCT FROM 'completed' THEN
        RETURN NEW;
    END IF;
    -- 정답률 70% 이상, 8문제 이상 푼 판만(대충 눌러 끝낸 판 방지)
    IF COALESCE(NEW.answer_count, 0) < 8 OR NEW.correct_count * 10 < NEW.answer_count * 7 THEN
        RETURN NEW;
    END IF;
    BEGIN
        -- 인형뽑기가 꺼진 학급에는 주지 않는다. 하루 한도는 학급 설정(처음 3, 0이면 코인 없음).
        SELECT COALESCE(class.vocab_tower_coin_daily_limit, 3) INTO v_limit
        FROM public.classes class
        WHERE class.id = NEW.class_id AND class.deleted_at IS NULL
          AND COALESCE('spelling-claw' = ANY(class.enabled_modules), TRUE);
        IF v_limit IS NULL OR v_limit <= 0 THEN
            RETURN NEW;
        END IF;
        PERFORM pg_advisory_xact_lock(hashtextextended('vocab-tower-coin:' || NEW.student_id::TEXT || ':' || v_today::TEXT, 0));
        SELECT COUNT(*) INTO v_count FROM public.vocab_tower_coins coin WHERE coin.student_id = NEW.student_id AND coin.earned_on = v_today;
        IF v_count >= v_limit THEN
            RETURN NEW;
        END IF;
        INSERT INTO public.vocab_tower_coins (student_id, class_id, run_id, earned_on)
        VALUES (NEW.student_id, NEW.class_id, NEW.id, v_today)
        ON CONFLICT (run_id) DO NOTHING
        RETURNING id INTO v_coin;
        IF v_coin IS NOT NULL THEN
            PERFORM public.notification_emit_v1(
                NEW.student_id, 'vocab-tower', 'vocab-tower.coin_awarded', 'vocab_tower_run', NEW.id,
                jsonb_build_object('coins_today', v_count + 1, 'daily_cap', v_limit),
                format('vocab-tower:coin:%s', NEW.id)
            );
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- 코인 지급이 실패해도 어휘의 탑 종료는 그대로 끝난다.
        RAISE WARNING 'vocab_tower_award_coin_v1 건너뜀: %', SQLERRM;
    END;
    RETURN NEW;
END;
$fn$;

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
        'mastered_this_run', v_mastered_this_run,
        -- 어휘의 탑 코인(20261411): 이번 판에서 받았는지, 오늘 받은 수·학급 한도, 못 받았다면 까닭
        'tower_coin_earned', EXISTS (SELECT 1 FROM public.vocab_tower_coins coin WHERE coin.run_id = v_run.id),
        'tower_coins_today', (SELECT COUNT(*) FROM public.vocab_tower_coins coin
                              WHERE coin.student_id = v_run.student_id AND coin.earned_on = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::DATE),
        'tower_coin_cap', COALESCE((SELECT class.vocab_tower_coin_daily_limit FROM public.classes class WHERE class.id = v_run.class_id), 3),
        'tower_coin_reason', CASE
            WHEN EXISTS (SELECT 1 FROM public.vocab_tower_coins coin WHERE coin.run_id = v_run.id) THEN 'earned'
            WHEN NOT v_completed THEN 'not_completed'
            WHEN v_run.answer_count < 8 THEN 'too_few'
            WHEN v_run.correct_count * 10 < v_run.answer_count * 7 THEN 'accuracy'
            WHEN COALESCE((SELECT class.vocab_tower_coin_daily_limit FROM public.classes class WHERE class.id = v_run.class_id), 3) <= 0 THEN 'off'
            WHEN (SELECT COUNT(*) FROM public.vocab_tower_coins coin
                  WHERE coin.student_id = v_run.student_id AND coin.earned_on = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::DATE)
                 >= COALESCE((SELECT class.vocab_tower_coin_daily_limit FROM public.classes class WHERE class.id = v_run.class_id), 3) THEN 'daily_limit'
            WHEN NOT EXISTS (SELECT 1 FROM public.classes class WHERE class.id = v_run.class_id AND COALESCE('spelling-claw' = ANY(class.enabled_modules), TRUE)) THEN 'claw_off'
            ELSE 'none'
        END
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_spelling_claw_context_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_student public.students%ROWTYPE;
    v_enabled BOOLEAN := false;
    v_title JSONB;
    v_writer INTEGER := 1;
    v_reader INTEGER := 1;
    v_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::DATE;
    v_settings public.spelling_claw_class_settings%ROWTYPE;
    v_today_state JSONB;
    v_recent JSONB;
    v_collection JSONB;
    v_catalog JSONB;
    v_owned JSONB;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_student FROM public.students WHERE id = v_student_id;
    SELECT COALESCE('spelling-claw' = ANY(class.enabled_modules), true) INTO v_enabled
    FROM public.classes class WHERE class.id = v_student.class_id AND class.deleted_at IS NULL;

    v_title := public.get_my_title_status();
    v_writer := public.dragon_writer_level(
        COALESCE((v_title ->> 'writer_total_chars')::BIGINT, 0),
        COALESCE((v_title ->> 'writer_completed_posts')::BIGINT, 0),
        NULLIF(v_title ->> 'writer_level_override', '')::INTEGER
    );
    v_reader := public.dragon_reader_level(
        COALESCE((v_title ->> 'reader_score')::BIGINT, 0),
        NULLIF(v_title ->> 'reader_level_override', '')::INTEGER
    );

    SELECT * INTO v_settings FROM public.spelling_claw_class_settings WHERE class_id = v_student.class_id;

    SELECT jsonb_build_object(
        'coins_earned', COUNT(*),
        'rewarded_quizzes', COUNT(DISTINCT play.attempt_id),
        'coins_left', COUNT(*) FILTER (WHERE play.status = 'coin'),
        'plays_done', COUNT(*) FILTER (WHERE play.status = 'done'),
        'prizes', COALESCE(SUM(jsonb_array_length(play.prizes)), 0),
        'consolation_points', COALESCE(SUM(play.consolation_points), 0),
        'playing_id', (ARRAY_AGG(play.id ORDER BY play.created_at) FILTER (WHERE play.status = 'playing'))[1]
    ) INTO v_today_state
    FROM public.spelling_claw_plays play
    WHERE play.student_id = v_student_id AND play.played_on = v_today;

    -- 어휘의 탑 코인: 날이 지나도 남는 코인 수와 오늘 받은 수(하루 3개까지).
    v_today_state := COALESCE(v_today_state, '{}'::JSONB) || jsonb_build_object(
        'tower_coins_left', (SELECT COUNT(*) FROM public.vocab_tower_coins coin WHERE coin.student_id = v_student_id AND coin.status = 'held'),
        'tower_coins_earned_today', (SELECT COUNT(*) FROM public.vocab_tower_coins coin WHERE coin.student_id = v_student_id AND coin.earned_on = v_today),
        'tower_coin_daily_cap', COALESCE((SELECT class.vocab_tower_coin_daily_limit FROM public.classes class WHERE class.id = v_student.class_id), 3)
    );

    SELECT COALESCE(jsonb_agg(row_data ORDER BY finished_at DESC), '[]'::JSONB) INTO v_recent
    FROM (
        SELECT play.finished_at, jsonb_build_object(
            'play_id', play.id, 'finished_at', play.finished_at, 'caught', play.caught,
            'prizes', play.prizes, 'consolation_points', play.consolation_points
        ) AS row_data
        FROM public.spelling_claw_plays play
        WHERE play.student_id = v_student_id AND play.status = 'done'
          AND (jsonb_array_length(play.caught) > 0 OR play.consolation_points > 0)
        ORDER BY play.finished_at DESC
        LIMIT 30
    ) latest;

    SELECT COALESCE(jsonb_object_agg(plush_id, plush_count), '{}'::JSONB) INTO v_collection
    FROM (
        SELECT caught.value AS plush_id, COUNT(*) AS plush_count
        FROM public.spelling_claw_plays play, jsonb_array_elements_text(play.caught) caught
        WHERE play.student_id = v_student_id AND play.status = 'done'
        GROUP BY caught.value
    ) counts;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', item.id, 'slot', item.slot, 'name', item.name, 'price', item.price, 'rarity', item.rarity,
        'required_writer_level', item.required_writer_level, 'required_reader_level', item.required_reader_level,
        'acquisition_type', item.acquisition_type, 'is_default', item.is_default, 'is_active', item.is_active
    ) ORDER BY item.sort_order, item.id), '[]'::JSONB) INTO v_catalog
    FROM public.dragon_decor_catalog item WHERE item.is_active;

    v_owned := (CASE WHEN jsonb_typeof(v_student.pet_data -> 'ownedDecorItems') = 'array' THEN v_student.pet_data -> 'ownedDecorItems' ELSE '[]'::JSONB END)
        || (CASE WHEN jsonb_typeof(v_student.pet_data -> 'ownedItems') = 'array' THEN v_student.pet_data -> 'ownedItems' ELSE '[]'::JSONB END);

    RETURN jsonb_build_object(
        'student_id', v_student_id,
        'class_id', v_student.class_id,
        'name', v_student.name,
        'enabled', v_enabled,
        'species', v_student.pet_data ->> 'species',
        'writer_level', v_writer,
        'reader_level', v_reader,
        'owned', v_owned,
        'catalog', v_catalog,
        'settings', COALESCE(v_settings.settings, '{}'::JSONB),
        'prize_settings', v_settings.prize_settings,
        'today', v_today_state,
        'recent', v_recent,
        'collection', v_collection,
        'total_points', COALESCE(v_student.total_points, 0)
    );
END;
$function$;

COMMIT;
