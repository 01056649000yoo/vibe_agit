-- 수호룡의 인형뽑기 — 만점이면 코인 2개 (2026-10-02 선생님 결정: "맞춤법 문제가 쉽지 않아")
--
-- 목표를 넘으면 코인 1개, 10문제를 **모두** 맞히면 코인 2개. `하루 기회`(교사 설정)는 이제 **코인을 받을 수 있는 퀴즈 수**다 —
-- 기회 3번이면 하루 최대 6판. 최소 포인트는 기회를 다 쓰고 받은 코인도 모두 쓴 뒤 하나도 못 뽑았을 때만.
-- 한 퀴즈에 코인 행이 둘 생길 수 있어 attempt_id 하나뿐 제약을 (attempt_id, coin_index) 로 바꾼다.

ALTER TABLE public.spelling_claw_plays ADD COLUMN IF NOT EXISTS coin_index SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE public.spelling_claw_plays DROP CONSTRAINT IF EXISTS spelling_claw_plays_attempt_id_key;
ALTER TABLE public.spelling_claw_plays DROP CONSTRAINT IF EXISTS spelling_claw_play_coin_index;
ALTER TABLE public.spelling_claw_plays ADD CONSTRAINT spelling_claw_play_coin_index CHECK (coin_index BETWEEN 0 AND 1);
CREATE UNIQUE INDEX IF NOT EXISTS uq_spelling_claw_plays_attempt_coin ON public.spelling_claw_plays (attempt_id, coin_index);

CREATE OR REPLACE FUNCTION public.spelling_claw_answer_v1(
    p_attempt_id UUID,
    p_student_id UUID,
    p_index INTEGER,
    p_given TEXT,
    p_correct BOOLEAN,
    p_daily_plays SMALLINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_attempt public.spelling_claw_quiz_attempts%ROWTYPE;
    v_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::DATE;
    v_total INTEGER;
    v_answered INTEGER;
    v_finished BOOLEAN := false;
    v_passed BOOLEAN := false;
    v_coin BOOLEAN := false;
    v_coins_earned INTEGER;
    v_rewarded INTEGER;
    v_coins INTEGER := 0;
BEGIN
    -- 코인 수를 세는 일과 겹치지 않게 학생 단위로 줄 세운다.
    PERFORM 1 FROM public.students WHERE id = p_student_id FOR UPDATE;
    SELECT * INTO v_attempt FROM public.spelling_claw_quiz_attempts
    WHERE id = p_attempt_id AND student_id = p_student_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION '문제를 찾을 수 없어요. 새 문제를 받아 주세요.' USING ERRCODE = 'P0002';
    END IF;
    v_total := jsonb_array_length(v_attempt.questions);
    v_answered := jsonb_array_length(v_attempt.answers);

    IF p_index < v_answered THEN
        -- 이미 낸 답(다시 보내기) — 처음 결과를 그대로.
        RETURN jsonb_build_object(
            'repeat', true, 'correct', (v_attempt.answers -> p_index ->> 'correct')::BOOLEAN,
            'answered', v_answered, 'correct_count', v_attempt.correct_count,
            'finished', v_attempt.status <> 'active', 'passed', v_attempt.status = 'passed'
        );
    END IF;
    IF v_attempt.status <> 'active' OR v_attempt.played_on <> v_today THEN
        RAISE EXCEPTION '끝난 문제예요. 새 문제를 받아 주세요.' USING ERRCODE = 'P0001';
    END IF;
    IF p_index <> v_answered OR p_index >= v_total THEN
        RAISE EXCEPTION '문제 순서가 맞지 않아요.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.spelling_claw_quiz_attempts
    SET answers = answers || jsonb_build_array(jsonb_build_object(
            'given', left(COALESCE(p_given, ''), 200), 'correct', COALESCE(p_correct, false)
        )),
        correct_count = correct_count + CASE WHEN p_correct THEN 1 ELSE 0 END
    WHERE id = p_attempt_id
    RETURNING * INTO v_attempt;
    v_answered := v_answered + 1;

    IF v_answered >= v_total THEN
        v_finished := true;
        v_passed := v_attempt.correct_count >= v_attempt.pass_count;
        UPDATE public.spelling_claw_quiz_attempts
        SET status = CASE WHEN v_passed THEN 'passed' ELSE 'failed' END, finished_at = NOW()
        WHERE id = p_attempt_id;
        IF v_passed THEN
            -- 하루 기회 = 코인을 받을 수 있는 퀴즈 수. 만점이면 그 퀴즈에서 코인 2개(2026-10-02 선생님 결정 — 하루 최대 기회 × 2판).
            SELECT COUNT(DISTINCT attempt_id) INTO v_rewarded FROM public.spelling_claw_plays
            WHERE student_id = p_student_id AND played_on = v_today;
            IF v_rewarded < GREATEST(COALESCE(p_daily_plays, 0), 0) THEN
                v_coins := CASE WHEN v_attempt.correct_count >= v_total THEN 2 ELSE 1 END;
                INSERT INTO public.spelling_claw_plays (student_id, class_id, played_on, attempt_id, coin_index)
                SELECT p_student_id, v_attempt.class_id, v_today, p_attempt_id, coin_index
                FROM generate_series(0, v_coins - 1) coin_index;
                v_coin := true;
            END IF;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'repeat', false, 'correct', COALESCE(p_correct, false),
        'answered', v_answered, 'correct_count', v_attempt.correct_count,
        'finished', v_finished, 'passed', v_passed, 'coin_granted', v_coin, 'coins_granted', v_coins,
        'perfect', v_finished AND v_attempt.correct_count >= v_total,
        'rewarded_quizzes', (SELECT COUNT(DISTINCT attempt_id) FROM public.spelling_claw_plays
                             WHERE student_id = p_student_id AND played_on = v_today),
        'coins_left', (SELECT COUNT(*) FROM public.spelling_claw_plays
                       WHERE student_id = p_student_id AND played_on = v_today AND status = 'coin'),
        'coins_earned', (SELECT COUNT(*) FROM public.spelling_claw_plays
                         WHERE student_id = p_student_id AND played_on = v_today)
    );
END;
$$;


CREATE OR REPLACE FUNCTION public.spelling_claw_finish_play_v1(
    p_play_id UUID,
    p_student_id UUID,
    p_caught JSONB,
    p_prizes JSONB,
    p_writer_level INTEGER,
    p_reader_level INTEGER,
    p_daily_plays SMALLINT,
    p_min_points SMALLINT,
    p_announce_gifts BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_play public.spelling_claw_plays%ROWTYPE;
    v_student public.students%ROWTYPE;
    v_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::DATE;
    v_prize JSONB;
    v_final JSONB := '[]'::JSONB;
    v_index INTEGER := 0;
    v_kind TEXT;
    v_points INTEGER;
    v_item public.dragon_decor_catalog%ROWTYPE;
    v_owned_decor JSONB;
    v_owned_wallpapers JSONB;
    v_pet JSONB;
    v_result JSONB;
    v_plush_name TEXT;
    v_classmate UUID;
    v_consolation INTEGER := 0;
    v_done_today INTEGER;
    v_prizes_today INTEGER;
    v_announced BOOLEAN;
    v_rewarded INTEGER;
    v_left INTEGER;
BEGIN
    SELECT * INTO v_student FROM public.students WHERE id = p_student_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION '학생 정보를 찾지 못했습니다.' USING ERRCODE = 'P0002';
    END IF;
    SELECT * INTO v_play FROM public.spelling_claw_plays WHERE id = p_play_id AND student_id = p_student_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION '이 판을 찾을 수 없어요.' USING ERRCODE = 'P0002';
    END IF;
    IF v_play.status = 'done' THEN
        RETURN jsonb_build_object('repeat', true, 'prizes', v_play.prizes, 'consolation_points', v_play.consolation_points,
                                  'total_points', COALESCE(v_student.total_points, 0));
    END IF;
    IF v_play.status <> 'playing' THEN
        RAISE EXCEPTION '코인을 넣지 않은 판이에요.' USING ERRCODE = 'P0001';
    END IF;
    IF p_caught IS NULL OR jsonb_typeof(p_caught) <> 'array' OR jsonb_array_length(p_caught) > 8
       OR p_prizes IS NULL OR jsonb_typeof(p_prizes) <> 'array' OR jsonb_array_length(p_prizes) > 2
       OR jsonb_array_length(p_prizes) > jsonb_array_length(p_caught) THEN
        RAISE EXCEPTION '한 판 결과 모양이 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;

    v_pet := COALESCE(v_student.pet_data, '{}'::JSONB);
    FOR v_prize IN SELECT value FROM jsonb_array_elements(p_prizes)
    LOOP
        v_index := v_index + 1;
        v_kind := v_prize ->> 'kind';
        v_plush_name := left(COALESCE(v_prize ->> 'plush_name', '인형'), 20);

        IF v_kind = 'decor' THEN
            SELECT * INTO v_item FROM public.dragon_decor_catalog WHERE id = v_prize ->> 'item_id';
            v_owned_decor := CASE WHEN jsonb_typeof(v_pet -> 'ownedDecorItems') = 'array' THEN v_pet -> 'ownedDecorItems' ELSE '[]'::JSONB END;
            v_owned_wallpapers := CASE WHEN jsonb_typeof(v_pet -> 'ownedItems') = 'array' THEN v_pet -> 'ownedItems' ELSE '[]'::JSONB END;
            IF NOT FOUND OR NOT v_item.is_active OR v_item.acquisition_type <> 'shop' OR v_item.is_default
               OR v_item.price <= 0 OR v_item.rarity IS NOT DISTINCT FROM 'legendary'
               OR v_item.required_writer_level > COALESCE(p_writer_level, 1)
               OR v_item.required_reader_level > COALESCE(p_reader_level, 1)
               OR v_owned_decor ? v_item.id OR v_owned_wallpapers ? v_item.id THEN
                -- 줄 수 없는 아이템(그사이 가졌거나 조건이 바뀜) — 꽝 없이 가장 작은 포인트로.
                v_prize := jsonb_build_object('kind', 'points', 'points', 10, 'plush_id', v_prize ->> 'plush_id',
                                              'plush_name', v_plush_name, 'fallback', true);
                v_kind := 'points';
            ELSE
                v_owned_decor := v_owned_decor || to_jsonb(v_item.id);
                v_pet := jsonb_set(v_pet, '{ownedDecorItems}', v_owned_decor, true);
                IF v_item.slot = 'wallpaper' THEN
                    v_pet := jsonb_set(v_pet, '{ownedItems}', v_owned_wallpapers || to_jsonb(v_item.id), true);
                END IF;
                PERFORM set_config('app.bypass_student_trigger', 'true', true);
                UPDATE public.students SET pet_data = v_pet WHERE id = p_student_id;
                PERFORM set_config('app.bypass_student_trigger', 'false', true);
                v_prize := jsonb_build_object('kind', 'decor', 'item_id', v_item.id, 'item_name', v_item.name,
                                              'rarity', v_item.rarity, 'plush_id', v_prize ->> 'plush_id', 'plush_name', v_plush_name);
            END IF;
        END IF;

        IF v_kind = 'points' THEN
            v_points := LEAST(GREATEST(COALESCE((v_prize ->> 'points')::INTEGER, 0), 1), 100);
            v_result := public.point_engine_apply(
                p_student_id, v_points, format('수호룡의 인형뽑기: %s 인형', v_plush_name), 'spelling_claw',
                format('spelling-claw:%s:%s', p_play_id, v_index), NULL, NULL,
                jsonb_build_object('source', 'spelling_claw', 'play_id', p_play_id, 'plush_id', v_prize ->> 'plush_id')
            );
            v_prize := jsonb_build_object('kind', 'points', 'points', v_points, 'plush_id', v_prize ->> 'plush_id',
                                          'plush_name', v_plush_name)
                       || CASE WHEN (v_prize ->> 'fallback') = 'true' THEN '{"fallback": true}'::JSONB ELSE '{}'::JSONB END;
        ELSIF v_kind = 'gift' THEN
            v_prize := jsonb_build_object('kind', 'gift', 'gift_id', left(COALESCE(v_prize ->> 'gift_id', ''), 40),
                                          'gift_name', left(COALESCE(NULLIF(v_prize ->> 'gift_name', ''), '선생님 선물'), 30),
                                          'plush_id', v_prize ->> 'plush_id', 'plush_name', v_plush_name);
        ELSIF v_kind <> 'decor' THEN
            RAISE EXCEPTION '알 수 없는 상품 종류입니다.' USING ERRCODE = '22023';
        END IF;

        v_final := v_final || jsonb_build_array(v_prize);
        PERFORM public.notification_emit_v1(
            p_student_id, 'spelling-claw', 'spelling-claw.prize_awarded', 'spelling_claw_play', p_play_id,
            jsonb_build_object('kind', v_prize ->> 'kind', 'points', (v_prize ->> 'points')::INTEGER,
                               'gift_name', v_prize ->> 'gift_name', 'item_name', v_prize ->> 'item_name',
                               'plush_name', v_plush_name),
            format('spelling-claw:prize:%s:%s', p_play_id, v_index)
        );
        IF v_prize ->> 'kind' = 'gift' AND COALESCE(p_announce_gifts, true) THEN
            FOR v_classmate IN
                SELECT classmate.id FROM public.students classmate
                WHERE classmate.class_id = v_student.class_id AND classmate.id <> p_student_id
                  AND classmate.is_active IS DISTINCT FROM false
                  AND (classmate.deleted_at IS NULL OR classmate.deleted_at > NOW())
                ORDER BY classmate.id
                LIMIT 100
            LOOP
                PERFORM public.notification_emit_v1(
                    v_classmate, 'spelling-claw', 'spelling-claw.class_gift_won', 'spelling_claw_play', p_play_id,
                    jsonb_build_object('winner_name', v_student.name, 'gift_name', v_prize ->> 'gift_name'),
                    format('spelling-claw:class-gift:%s:%s', p_play_id, v_index), 1::SMALLINT, p_student_id
                );
            END LOOP;
        END IF;
    END LOOP;

    UPDATE public.spelling_claw_plays
    SET status = 'done', caught = p_caught, prizes = v_final, finished_at = NOW()
    WHERE id = p_play_id;

    -- 하루 기회를 다 쓰고 오늘 하나도 못 뽑았으면 최소 포인트(하루 한 번).
    IF jsonb_array_length(v_final) = 0 AND COALESCE(p_min_points, 0) > 0 THEN
        -- 하루 기회(코인 받는 퀴즈)를 다 쓰고, 받은 코인도 모두 쓴 뒤에만(만점이면 한 퀴즈에 코인 2개).
        SELECT COUNT(*) FILTER (WHERE status = 'done'), COALESCE(SUM(jsonb_array_length(prizes)), 0),
               COUNT(DISTINCT attempt_id), COUNT(*) FILTER (WHERE status <> 'done')
        INTO v_done_today, v_prizes_today, v_rewarded, v_left
        FROM public.spelling_claw_plays
        WHERE student_id = p_student_id AND played_on = v_play.played_on;
        IF v_rewarded >= GREATEST(COALESCE(p_daily_plays, 1), 1) AND v_left = 0 AND v_prizes_today = 0 THEN
            v_result := public.point_engine_apply(
                p_student_id, LEAST(p_min_points, 50)::INTEGER, '수호룡의 인형뽑기: 오늘 맞춤법 문제를 푼 상', 'spelling_claw',
                format('spelling-claw:consolation:%s:%s', p_student_id, v_play.played_on), NULL, NULL,
                jsonb_build_object('source', 'spelling_claw_consolation', 'play_id', p_play_id)
            );
            IF COALESCE((v_result ->> 'applied_amount')::INTEGER, 0) > 0 THEN
                v_consolation := (v_result ->> 'applied_amount')::INTEGER;
                UPDATE public.spelling_claw_plays SET consolation_points = v_consolation WHERE id = p_play_id;
                PERFORM public.notification_emit_v1(
                    p_student_id, 'spelling-claw', 'spelling-claw.consolation_awarded', 'spelling_claw_play', p_play_id,
                    jsonb_build_object('points', v_consolation, 'plays', v_done_today),
                    format('spelling-claw:consolation:%s:%s', p_student_id, v_play.played_on)
                );
            END IF;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'repeat', false, 'prizes', v_final, 'consolation_points', v_consolation,
        'total_points', (SELECT COALESCE(total_points, 0) FROM public.students WHERE id = p_student_id)
    );
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.bypass_student_trigger', 'false', true);
    RAISE;
END;
$$;


CREATE OR REPLACE FUNCTION public.get_my_spelling_claw_context_v1()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    SELECT COALESCE('spelling-claw' = ANY(class.enabled_modules), false) INTO v_enabled
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
$$;

