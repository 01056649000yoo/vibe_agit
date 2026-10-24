-- 어휘의 탑 코인(2026-10-24 선생님 결정).
--
-- 어휘의 탑에서 한 판을 **끝까지 마치고 정답률 70% 이상(8문제 이상)** 이면 `어휘의 탑 코인` 1개를 받는다. 하루 3개까지.
-- 이 코인은 수호룡의 인형뽑기 코인(그날만)과 달리 **날이 지나도 남아 모아서 쓸 수 있다.** 인형뽑기에서는 맞춤법 코인이 없을 때
-- 어휘의 탑 코인을 한 개씩 쓴다(맞춤법 코인은 그날만이라 먼저 쓴다). 코인은 공부로만 얻는다 — 포인트로 사지 않는다.
--
--  1) `vocab_tower_coins` 장부: 판(run)마다 한 번만 지급(`run_id` 유일), 보유(`held`)→사용(`spent`).
--  2) `spelling_claw_plays` 에 `tower_coin_id` 를 더하고 `attempt_id` 를 비울 수 있게 한다(맞춤법 퀴즈 없이 어휘의 탑 코인으로 한 판).
--  3) 트리거: 어휘의 탑 판이 끝나면(`finished`·`completed`) 조건을 보고 지급한다. 지급 실패가 어휘의 탑 종료를 막지 않게 오류는 삼킨다.
--     인형뽑기가 꺼진 학급에는 지급하지 않는다. 지급하면 학생 활동 알림을 남긴다.
--  4) 인형뽑기 함수 둘(`start_my_spelling_claw_play_v1`·`get_my_spelling_claw_context_v1`)이 어휘의 탑 코인을 쓰고 알린다.
BEGIN;

CREATE TABLE public.vocab_tower_coins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    run_id UUID NOT NULL UNIQUE REFERENCES public.vocab_tower_runs(id) ON DELETE CASCADE,
    earned_on DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'spent')),
    spent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((status = 'spent') = (spent_at IS NOT NULL))
);
CREATE INDEX idx_vocab_tower_coins_held ON public.vocab_tower_coins (student_id, created_at, id) WHERE status = 'held';
CREATE INDEX idx_vocab_tower_coins_day ON public.vocab_tower_coins (student_id, earned_on);
ALTER TABLE public.vocab_tower_coins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vocab_tower_coins FROM PUBLIC, anon, authenticated;

ALTER TABLE public.spelling_claw_plays ALTER COLUMN attempt_id DROP NOT NULL;
ALTER TABLE public.spelling_claw_plays
    ADD COLUMN tower_coin_id UUID REFERENCES public.vocab_tower_coins(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX uq_spelling_claw_plays_tower_coin ON public.spelling_claw_plays (tower_coin_id) WHERE tower_coin_id IS NOT NULL;
ALTER TABLE public.spelling_claw_plays
    ADD CONSTRAINT spelling_claw_play_source CHECK (attempt_id IS NOT NULL OR tower_coin_id IS NOT NULL);

CREATE OR REPLACE FUNCTION public.vocab_tower_award_coin_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
    v_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::DATE;
    v_count INTEGER;
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
        IF NOT EXISTS (
            SELECT 1 FROM public.classes class
            WHERE class.id = NEW.class_id AND class.deleted_at IS NULL
              AND COALESCE('spelling-claw' = ANY(class.enabled_modules), TRUE)
        ) THEN
            RETURN NEW;
        END IF;
        PERFORM pg_advisory_xact_lock(hashtextextended('vocab-tower-coin:' || NEW.student_id::TEXT || ':' || v_today::TEXT, 0));
        SELECT COUNT(*) INTO v_count FROM public.vocab_tower_coins coin WHERE coin.student_id = NEW.student_id AND coin.earned_on = v_today;
        IF v_count >= 3 THEN
            RETURN NEW;
        END IF;
        INSERT INTO public.vocab_tower_coins (student_id, class_id, run_id, earned_on)
        VALUES (NEW.student_id, NEW.class_id, NEW.id, v_today)
        ON CONFLICT (run_id) DO NOTHING
        RETURNING id INTO v_coin;
        IF v_coin IS NOT NULL THEN
            PERFORM public.notification_emit_v1(
                NEW.student_id, 'vocab-tower', 'vocab-tower.coin_awarded', 'vocab_tower_run', NEW.id,
                jsonb_build_object('coins_today', v_count + 1, 'daily_cap', 3),
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
REVOKE ALL ON FUNCTION public.vocab_tower_award_coin_v1() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_vocab_tower_award_coin
AFTER UPDATE OF status ON public.vocab_tower_runs
FOR EACH ROW
WHEN (NEW.status = 'finished' AND OLD.status IS DISTINCT FROM 'finished')
EXECUTE FUNCTION public.vocab_tower_award_coin_v1();

CREATE OR REPLACE FUNCTION public.start_my_spelling_claw_play_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID;
    v_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::DATE;
    v_play_id UUID;
    v_resumed BOOLEAN := false;
    v_tower_coin UUID;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    SELECT student.class_id INTO v_class_id FROM public.students student WHERE student.id = v_student_id FOR UPDATE;
    IF NOT EXISTS (
        SELECT 1 FROM public.classes class
        WHERE class.id = v_class_id AND class.deleted_at IS NULL AND COALESCE('spelling-claw' = ANY(class.enabled_modules), TRUE)
    ) THEN
        RAISE EXCEPTION '선생님이 인형뽑기를 아직 열지 않았어요.' USING ERRCODE = '42501';
    END IF;

    SELECT play.id INTO v_play_id FROM public.spelling_claw_plays play
    WHERE play.student_id = v_student_id AND play.played_on = v_today AND play.status = 'playing'
    ORDER BY play.created_at LIMIT 1;
    IF FOUND THEN
        v_resumed := true;
    ELSE
        UPDATE public.spelling_claw_plays play SET status = 'playing', started_at = NOW()
        WHERE play.id = (
            SELECT candidate.id FROM public.spelling_claw_plays candidate
            WHERE candidate.student_id = v_student_id AND candidate.played_on = v_today AND candidate.status = 'coin'
            ORDER BY candidate.created_at LIMIT 1
        )
        RETURNING play.id INTO v_play_id;
        -- 맞춤법 코인이 없으면 어휘의 탑 코인(날이 지나도 남는 코인)을 쓴다 — 가장 오래 가진 것부터 한 개.
        IF v_play_id IS NULL THEN
            SELECT coin.id INTO v_tower_coin FROM public.vocab_tower_coins coin
            WHERE coin.student_id = v_student_id AND coin.status = 'held'
            ORDER BY coin.created_at, coin.id LIMIT 1 FOR UPDATE SKIP LOCKED;
            IF v_tower_coin IS NOT NULL THEN
                UPDATE public.vocab_tower_coins SET status = 'spent', spent_at = NOW() WHERE id = v_tower_coin;
                INSERT INTO public.spelling_claw_plays (student_id, class_id, played_on, attempt_id, status, started_at, coin_index, tower_coin_id)
                VALUES (v_student_id, v_class_id, v_today, NULL, 'playing', NOW(), 0, v_tower_coin)
                RETURNING id INTO v_play_id;
            END IF;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'play_id', v_play_id,
        'resumed', v_resumed,
        'coins_left', (SELECT COUNT(*) FROM public.spelling_claw_plays play
                       WHERE play.student_id = v_student_id AND play.played_on = v_today AND play.status = 'coin'),
        'tower_coins_left', (SELECT COUNT(*) FROM public.vocab_tower_coins coin
                             WHERE coin.student_id = v_student_id AND coin.status = 'held')
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
        'tower_coin_daily_cap', 3
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
