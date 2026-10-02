-- 수호룡의 인형뽑기 2단계 — 학생에게 열기 위한 서버 (2026-10-02 선생님 결정: 서버 먼저 만들고 학급별 켜기/끄기로 공개)
--
-- 흐름: 퀴즈(Edge 함수 `spelling-claw` 가 문제를 만들고 한 문제씩 채점) → 목표 달성이면 코인 1개(오늘 하루 기회 수까지)
--       → 학생이 코인을 넣으면 `start_my_spelling_claw_play_v1` → 한 판이 끝나 잡은 인형을 알리면 Edge 함수가
--       `prizeTable.js` 로 상품을 뽑고 `spelling_claw_finish_play_v1` 이 **같은 트랜잭션에서** 포인트·아이템·알림을 남긴다.
--
-- 믿는 것과 안 믿는 것:
--   - 문제·정답은 서버만 안다(학생은 정답 없는 문제만 받는다). 답은 순서대로 한 번씩만 받는다.
--   - 코인은 서버가 센다. 하루 기회 수를 넘겨 주지 않고, 코인은 그날만 쓴다.
--   - 상품은 서버가 뽑는다. 인형을 잡았는지만은 3D 화면(학생 기기)이 알려 준다 — 그래서 한 판에 상품은
--     최대 2개, 하루 판 수는 교사가 정한 기회 수까지로 묶는다(화면을 조작해도 그 이상은 못 받는다).
--   - 수호룡 아이템은 지급 직전에 상점 구매(`buy_my_dragon_decor`)와 같은 조건을 다시 확인한다. 어긋나면 최소 포인트로 바꾼다.
--   - 교사 설정 값은 DB 가 모양만 보고 저장하며, 서버·화면이 쓸 때마다 `prizeTable.js` 로 검증한다(원본 하나).

-- ──────────────────────────────────────────────────────────────────────────
-- 1) 포인트 활동 종류에 spelling_claw 추가
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.point_logs DROP CONSTRAINT IF EXISTS point_logs_activity_type_check;
ALTER TABLE public.point_logs ADD CONSTRAINT point_logs_activity_type_check CHECK (activity_type IN (
    'writing_reward', 'meeting_activity', 'vocab_tower', 'dragon_care',
    'hideout_purchase', 'starting_bonus', 'private_adjustment', 'comment_reward', 'title_reward',
    'spelling_claw'
));

-- 최신 포인트 엔진(20261206)의 허용 활동에 spelling_claw 만 추가한다.
CREATE OR REPLACE FUNCTION public.point_engine_apply(
    p_student_id UUID,
    p_amount INTEGER,
    p_reason TEXT,
    p_activity_type TEXT,
    p_event_key TEXT DEFAULT NULL,
    p_post_id UUID DEFAULT NULL,
    p_mission_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_points INTEGER;
    v_class_id UUID;
    v_log_id UUID;
    v_existing_amount INTEGER;
    v_post_student_id UUID;
    v_post_mission_id UUID;
    v_post_class_id UUID;
BEGIN
    IF p_student_id IS NULL OR p_amount = 0 THEN
        RAISE EXCEPTION '학생과 0이 아닌 포인트가 필요합니다.' USING ERRCODE = '22023';
    END IF;
    IF char_length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 1 AND 200 THEN
        RAISE EXCEPTION '포인트 사유는 1~200자로 입력해주세요.' USING ERRCODE = '22023';
    END IF;
    IF p_activity_type NOT IN (
        'writing_reward', 'meeting_activity', 'vocab_tower', 'dragon_care',
        'hideout_purchase', 'starting_bonus', 'private_adjustment', 'title_reward', 'spelling_claw'
    ) THEN
        RAISE EXCEPTION '지원하지 않는 포인트 활동 유형입니다: %', p_activity_type USING ERRCODE = '22023';
    END IF;
    IF p_event_key IS NOT NULL AND char_length(p_event_key) NOT BETWEEN 1 AND 200 THEN
        RAISE EXCEPTION '중복 방지 키는 1~200자여야 합니다.' USING ERRCODE = '22023';
    END IF;
    IF p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object' THEN
        RAISE EXCEPTION '포인트 부가 정보는 JSON 객체여야 합니다.' USING ERRCODE = '22023';
    END IF;

    SELECT student.class_id, COALESCE(student.total_points, 0)
    INTO v_class_id, v_current_points
    FROM public.students student
    WHERE student.id = p_student_id AND student.deleted_at IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION '활성 학생 정보를 찾을 수 없습니다.' USING ERRCODE = 'P0002';
    END IF;

    IF p_post_id IS NOT NULL THEN
        SELECT post.student_id, post.mission_id, post.class_id
        INTO v_post_student_id, v_post_mission_id, v_post_class_id
        FROM public.student_posts post WHERE post.id = p_post_id;
        IF NOT FOUND
          OR v_post_student_id IS DISTINCT FROM p_student_id
          OR v_post_class_id IS DISTINCT FROM v_class_id
          OR (p_mission_id IS NOT NULL AND v_post_mission_id IS DISTINCT FROM p_mission_id) THEN
            RAISE EXCEPTION '글·학생·과제 정보가 서로 일치하지 않습니다.' USING ERRCODE = '22023';
        END IF;
    END IF;

    IF p_event_key IS NOT NULL THEN
        SELECT point_log.id, point_log.amount INTO v_log_id, v_existing_amount
        FROM public.point_logs point_log
        WHERE point_log.student_id = p_student_id AND point_log.event_key = p_event_key;
        IF FOUND THEN
            RETURN jsonb_build_object(
                'status', 'duplicate', 'duplicate', true, 'log_id', v_log_id,
                'applied_amount', 0, 'original_amount', v_existing_amount,
                'total_points', v_current_points, 'event_key', p_event_key
            );
        END IF;
    END IF;

    IF p_amount < 0 AND v_current_points + p_amount < 0 THEN
        RAISE EXCEPTION '보유 포인트가 부족합니다. 필요: %P, 현재: %P', abs(p_amount), v_current_points
            USING ERRCODE = 'P0001';
    END IF;

    PERFORM set_config('app.bypass_student_trigger', 'true', true);
    UPDATE public.students SET total_points = v_current_points + p_amount WHERE id = p_student_id;
    INSERT INTO public.point_logs (
        student_id, amount, reason, activity_type, event_key, post_id, mission_id, metadata
    ) VALUES (
        p_student_id, p_amount, btrim(p_reason), p_activity_type, p_event_key,
        p_post_id, p_mission_id, p_metadata
    ) RETURNING id INTO v_log_id;
    PERFORM set_config('app.bypass_student_trigger', 'false', true);

    RETURN jsonb_build_object(
        'status', 'applied', 'duplicate', false, 'log_id', v_log_id,
        'applied_amount', p_amount, 'total_points', v_current_points + p_amount,
        'event_key', p_event_key
    );
EXCEPTION WHEN unique_violation THEN
    PERFORM set_config('app.bypass_student_trigger', 'false', true);
    SELECT point_log.id, point_log.amount INTO v_log_id, v_existing_amount
    FROM public.point_logs point_log
    WHERE point_log.student_id = p_student_id AND point_log.event_key = p_event_key;
    RETURN jsonb_build_object(
        'status', 'duplicate', 'duplicate', true, 'log_id', v_log_id,
        'applied_amount', 0, 'original_amount', v_existing_amount,
        'total_points', v_current_points, 'event_key', p_event_key
    );
WHEN OTHERS THEN
    PERFORM set_config('app.bypass_student_trigger', 'false', true);
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.point_engine_apply(UUID, INTEGER, TEXT, TEXT, TEXT, UUID, UUID, JSONB)
    FROM PUBLIC, anon, authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 2) 표 — 브라우저는 직접 못 읽고 못 쓴다(전용 RPC·Edge 함수만)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.spelling_claw_class_settings (
    class_id UUID PRIMARY KEY REFERENCES public.classes(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}'::JSONB,
    prize_settings JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID,
    CONSTRAINT spelling_claw_settings_shape CHECK (
        jsonb_typeof(settings) = 'object' AND pg_column_size(settings) <= 4096
        AND (prize_settings IS NULL OR (jsonb_typeof(prize_settings) = 'object' AND pg_column_size(prize_settings) <= 16384))
    )
);
COMMENT ON TABLE public.spelling_claw_class_settings IS
    '수호룡의 인형뽑기 학급 설정(교사가 저장 단추로 저장). 값 검증은 prizeTable.js(normalizeClawClassSettings·normalizeClawPrizeSettings)가 쓸 때마다 한다. prize_settings NULL = 기본값.';

CREATE TABLE IF NOT EXISTS public.spelling_claw_quiz_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    played_on DATE NOT NULL,
    questions JSONB NOT NULL,
    answers JSONB NOT NULL DEFAULT '[]'::JSONB,
    correct_count SMALLINT NOT NULL DEFAULT 0,
    pass_count SMALLINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    CONSTRAINT spelling_claw_attempt_status CHECK (status IN ('active', 'passed', 'failed', 'abandoned')),
    CONSTRAINT spelling_claw_attempt_questions CHECK (
        jsonb_typeof(questions) = 'array' AND jsonb_array_length(questions) BETWEEN 1 AND 20
        AND pg_column_size(questions) <= 65536
    ),
    CONSTRAINT spelling_claw_attempt_pass CHECK (pass_count BETWEEN 1 AND 20)
);
CREATE INDEX IF NOT EXISTS idx_spelling_claw_attempts_student_day
    ON public.spelling_claw_quiz_attempts (student_id, played_on, created_at DESC);
COMMENT ON TABLE public.spelling_claw_quiz_attempts IS
    '인형뽑기 맞춤법 퀴즈 한 번(10문제). questions 에 정답이 있어 서버(service_role)만 읽는다.';

CREATE TABLE IF NOT EXISTS public.spelling_claw_plays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    played_on DATE NOT NULL,
    attempt_id UUID NOT NULL UNIQUE REFERENCES public.spelling_claw_quiz_attempts(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'coin',
    caught JSONB NOT NULL DEFAULT '[]'::JSONB,
    prizes JSONB NOT NULL DEFAULT '[]'::JSONB,
    consolation_points SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    CONSTRAINT spelling_claw_play_status CHECK (status IN ('coin', 'playing', 'done')),
    CONSTRAINT spelling_claw_play_arrays CHECK (
        jsonb_typeof(caught) = 'array' AND jsonb_typeof(prizes) = 'array' AND jsonb_array_length(prizes) <= 2
    )
);
CREATE INDEX IF NOT EXISTS idx_spelling_claw_plays_student_day
    ON public.spelling_claw_plays (student_id, played_on, created_at);
CREATE INDEX IF NOT EXISTS idx_spelling_claw_plays_class_finished
    ON public.spelling_claw_plays (class_id, finished_at DESC) WHERE status = 'done';
COMMENT ON TABLE public.spelling_claw_plays IS
    '인형뽑기 코인 한 개 = 한 판. coin(받음) → playing(넣음) → done(상품 지급). 교사 뽑기 내역·학생 기록의 원장.';

ALTER TABLE public.spelling_claw_class_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spelling_claw_quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spelling_claw_plays ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.spelling_claw_class_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.spelling_claw_quiz_attempts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.spelling_claw_plays FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.spelling_claw_quiz_attempts TO service_role;
GRANT SELECT ON TABLE public.spelling_claw_plays TO service_role;
GRANT SELECT ON TABLE public.spelling_claw_class_settings TO service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 3) 교사 — 설정 읽기·저장(저장 단추), 뽑기 내역
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.spelling_claw_assert_teacher_v1(p_class_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.classes class
        WHERE class.id = p_class_id
          AND class.deleted_at IS NULL
          AND (
              (class.teacher_id = auth.uid() AND public.auth_user_role() = 'TEACHER')
              OR public.auth_user_role() = 'ADMIN'
          )
    ) THEN
        RAISE EXCEPTION '이 학급의 인형뽑기 설정 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.spelling_claw_assert_teacher_v1(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_teacher_spelling_claw_settings_v1(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row public.spelling_claw_class_settings%ROWTYPE;
BEGIN
    PERFORM public.spelling_claw_assert_teacher_v1(p_class_id);
    SELECT * INTO v_row FROM public.spelling_claw_class_settings WHERE class_id = p_class_id;
    RETURN jsonb_build_object(
        'saved', FOUND,
        'settings', COALESCE(v_row.settings, '{}'::JSONB),
        'prize_settings', v_row.prize_settings,
        'updated_at', v_row.updated_at
    );
END;
$$;

/*
 * 저장 단추(2026-10-02 선생님 결정). 학급 전체에 바로 적용되므로 고치는 중인 값은 저장 전까지 학생에게 가지 않는다.
 * p_expected_updated_at 은 화면이 마지막으로 읽은 저장 시각 — 다른 화면에서 먼저 저장했으면 덮어쓰지 않고 알린다.
 * 상품 확률 합은 100% 여야 저장한다(0.05% 오차까지).
 */
CREATE OR REPLACE FUNCTION public.save_teacher_spelling_claw_settings_v1(
    p_class_id UUID,
    p_settings JSONB,
    p_prize_settings JSONB,
    p_expected_updated_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current TIMESTAMPTZ;
    v_total NUMERIC;
    v_saved_at TIMESTAMPTZ;
BEGIN
    PERFORM public.spelling_claw_assert_teacher_v1(p_class_id);
    IF p_settings IS NULL OR jsonb_typeof(p_settings) <> 'object' OR pg_column_size(p_settings) > 4096 THEN
        RAISE EXCEPTION '학급 설정 모양이 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;
    IF p_prize_settings IS NULL OR jsonb_typeof(p_prize_settings) <> 'object' OR pg_column_size(p_prize_settings) > 16384
       OR jsonb_typeof(p_prize_settings -> 'points') <> 'array'
       OR jsonb_typeof(p_prize_settings -> 'gifts') <> 'array'
       OR jsonb_typeof(p_prize_settings -> 'decor') <> 'object' THEN
        RAISE EXCEPTION '상품 설정 모양이 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT
        COALESCE((SELECT SUM(COALESCE((row ->> 'percent')::NUMERIC, 0)) FROM jsonb_array_elements(p_prize_settings -> 'points') row), 0)
      + COALESCE((SELECT SUM(COALESCE((row ->> 'percent')::NUMERIC, 0)) FROM jsonb_array_elements(p_prize_settings -> 'gifts') row), 0)
      + COALESCE((SELECT SUM(COALESCE(value::NUMERIC, 0)) FROM jsonb_each_text(p_prize_settings -> 'decor')), 0)
    INTO v_total;
    IF abs(v_total - 100) > 0.05 THEN
        RAISE EXCEPTION '상품 확률을 모두 더하면 100%%가 되어야 저장할 수 있어요(지금 %%%).', round(v_total, 1) USING ERRCODE = '22023';
    END IF;

    SELECT updated_at INTO v_current FROM public.spelling_claw_class_settings WHERE class_id = p_class_id FOR UPDATE;
    IF FOUND AND p_expected_updated_at IS DISTINCT FROM v_current THEN
        RAISE EXCEPTION '다른 화면에서 먼저 저장했어요. 새로 불러온 뒤 다시 저장해 주세요.' USING ERRCODE = '40001';
    END IF;

    INSERT INTO public.spelling_claw_class_settings (class_id, settings, prize_settings, updated_at, updated_by)
    VALUES (p_class_id, p_settings, p_prize_settings, clock_timestamp(), auth.uid())
    ON CONFLICT (class_id) DO UPDATE SET
        settings = EXCLUDED.settings, prize_settings = EXCLUDED.prize_settings,
            updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by
    RETURNING updated_at INTO v_saved_at;
    RETURN jsonb_build_object('saved', true, 'updated_at', v_saved_at);
END;
$$;

/* 교사 `뽑기 내역` 탭 — 상품이 나온 판과 최소 포인트를 받은 판, 최신 100건. 탭이 보이는 동안만 12초마다 부른다. */
CREATE OR REPLACE FUNCTION public.get_teacher_spelling_claw_history_v1(p_class_id UUID, p_limit INTEGER DEFAULT 100)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::DATE;
    v_rows JSONB;
    v_today_summary JSONB;
BEGIN
    PERFORM public.spelling_claw_assert_teacher_v1(p_class_id);

    SELECT COALESCE(jsonb_agg(row_data ORDER BY finished_at DESC), '[]'::JSONB) INTO v_rows
    FROM (
        SELECT play.finished_at, jsonb_build_object(
            'play_id', play.id,
            'student_id', play.student_id,
            'student_name', student.name,
            'finished_at', play.finished_at,
            'caught', play.caught,
            'prizes', play.prizes,
            'consolation_points', play.consolation_points
        ) AS row_data
        FROM public.spelling_claw_plays play
        JOIN public.students student ON student.id = play.student_id
        WHERE play.class_id = p_class_id
          AND play.status = 'done'
          AND (jsonb_array_length(play.prizes) > 0 OR play.consolation_points > 0)
        ORDER BY play.finished_at DESC
        LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 100)
    ) latest;

    SELECT jsonb_build_object(
        'plays', COUNT(*) FILTER (WHERE play.status = 'done'),
        'players', COUNT(DISTINCT play.student_id),
        'gifts', COALESCE(SUM((SELECT COUNT(*) FROM jsonb_array_elements(play.prizes) prize WHERE prize ->> 'kind' = 'gift')), 0),
        'decor', COALESCE(SUM((SELECT COUNT(*) FROM jsonb_array_elements(play.prizes) prize WHERE prize ->> 'kind' = 'decor')), 0),
        'points', COALESCE(SUM((SELECT COUNT(*) FROM jsonb_array_elements(play.prizes) prize WHERE prize ->> 'kind' = 'points')), 0)
    ) INTO v_today_summary
    FROM public.spelling_claw_plays play
    WHERE play.class_id = p_class_id AND play.played_on = v_today;

    RETURN jsonb_build_object('rows', v_rows, 'today', v_today_summary);
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 4) 학생 — 오늘 상태(한 번에), 코인 넣기
-- ──────────────────────────────────────────────────────────────────────────
/*
 * 학생이 인형뽑기를 열 때 1회. Edge 함수도 학생 토큰으로 이 함수를 불러 학생·학급·단계·보유 아이템을 확인한다
 * (단계 계산은 상점 구매와 같은 함수). 상점 목록은 활성 행만(62개 안팎) — 받을 수 있는 아이템 거르기는
 * prizeTable.js 의 eligibleClawDecor 한 곳에서 한다.
 */
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

/* 코인 넣기. 오늘 받은 코인 중 가장 먼저 받은 것을 쓴다. 끝내지 못한 판(창을 닫음)이 있으면 그 판을 이어 한다. */
CREATE OR REPLACE FUNCTION public.start_my_spelling_claw_play_v1()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID;
    v_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::DATE;
    v_play_id UUID;
    v_resumed BOOLEAN := false;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    SELECT student.class_id INTO v_class_id FROM public.students student WHERE student.id = v_student_id FOR UPDATE;
    IF NOT EXISTS (
        SELECT 1 FROM public.classes class
        WHERE class.id = v_class_id AND class.deleted_at IS NULL AND 'spelling-claw' = ANY(class.enabled_modules)
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
    END IF;

    RETURN jsonb_build_object(
        'play_id', v_play_id,
        'resumed', v_resumed,
        'coins_left', (SELECT COUNT(*) FROM public.spelling_claw_plays play
                       WHERE play.student_id = v_student_id AND play.played_on = v_today AND play.status = 'coin')
    );
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 5) 서버(Edge 함수 service_role)만 — 문제 내기·답 받기·상품 지급
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.spelling_claw_issue_quiz_v1(
    p_student_id UUID,
    p_questions JSONB,
    p_pass_count SMALLINT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_class_id UUID;
    v_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::DATE;
    v_id UUID;
BEGIN
    SELECT student.class_id INTO v_class_id
    FROM public.students student
    JOIN public.classes class ON class.id = student.class_id AND class.deleted_at IS NULL
    WHERE student.id = p_student_id
      AND student.is_active IS DISTINCT FROM false
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
      AND 'spelling-claw' = ANY(class.enabled_modules)
    FOR UPDATE OF student;
    IF v_class_id IS NULL THEN
        RAISE EXCEPTION '인형뽑기를 열 수 없는 학생입니다.' USING ERRCODE = '42501';
    END IF;
    -- 문제를 마구 새로 받는 일을 막는다(하루 60번이면 수업에서 넉넉하다).
    IF (SELECT COUNT(*) FROM public.spelling_claw_quiz_attempts attempt
        WHERE attempt.student_id = p_student_id AND attempt.played_on = v_today) >= 60 THEN
        RAISE EXCEPTION '오늘은 문제를 충분히 풀었어요. 내일 또 만나요!' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.spelling_claw_quiz_attempts SET status = 'abandoned', finished_at = NOW()
    WHERE student_id = p_student_id AND status = 'active';

    INSERT INTO public.spelling_claw_quiz_attempts (student_id, class_id, played_on, questions, pass_count)
    VALUES (p_student_id, v_class_id, v_today, p_questions, p_pass_count)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

/*
 * 답 하나. 채점은 Edge 함수가 spellingQuizBuilder.js 로 하고(원본 하나) 결과만 넘긴다.
 * 답은 순서대로 한 번씩만 — 같은 번호를 다시 보내면 처음 결과를 돌려준다. 마지막 답이면 끝내고 목표를 넘었으면 코인 1개.
 */
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
            SELECT COUNT(*) INTO v_coins_earned FROM public.spelling_claw_plays
            WHERE student_id = p_student_id AND played_on = v_today;
            IF v_coins_earned < GREATEST(COALESCE(p_daily_plays, 0), 0) THEN
                INSERT INTO public.spelling_claw_plays (student_id, class_id, played_on, attempt_id)
                VALUES (p_student_id, v_attempt.class_id, v_today, p_attempt_id);
                v_coin := true;
            END IF;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'repeat', false, 'correct', COALESCE(p_correct, false),
        'answered', v_answered, 'correct_count', v_attempt.correct_count,
        'finished', v_finished, 'passed', v_passed, 'coin_granted', v_coin,
        'coins_left', (SELECT COUNT(*) FROM public.spelling_claw_plays
                       WHERE student_id = p_student_id AND played_on = v_today AND status = 'coin'),
        'coins_earned', (SELECT COUNT(*) FROM public.spelling_claw_plays
                         WHERE student_id = p_student_id AND played_on = v_today)
    );
END;
$$;

/*
 * 한 판 끝 — 잡은 인형(caught)과 Edge 함수가 뽑은 상품(prizes, 최대 2개)을 같은 트랜잭션에서 지급한다.
 *   포인트: point_engine_apply(spelling_claw, 판·순번 키로 한 번만)
 *   수호룡 아이템: 상점 구매와 같은 조건을 여기서 다시 확인(활성·상점 물건·무료 아님·전설 아님·단계·보유) → 어긋나면 10P
 *   선생님 선물: 기록만(교사가 뽑기 내역에서 보고 준다)
 *   알림: 본인 prize_awarded, 선물이면 반 친구 모두 class_gift_won(교사 설정으로 끌 수 있음)
 *   하루 기회를 다 쓰고 오늘 하나도 못 뽑았으면 최소 포인트 + consolation_awarded(하루 한 번)
 * 같은 판을 다시 보내면(재시도) 처음 결과를 돌려준다.
 */
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
        SELECT COUNT(*) FILTER (WHERE status = 'done'), COALESCE(SUM(jsonb_array_length(prizes)), 0)
        INTO v_done_today, v_prizes_today
        FROM public.spelling_claw_plays
        WHERE student_id = p_student_id AND played_on = v_play.played_on;
        IF v_done_today >= GREATEST(COALESCE(p_daily_plays, 1), 1) AND v_prizes_today = 0 THEN
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

-- ──────────────────────────────────────────────────────────────────────────
-- 6) 권한
-- ──────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.get_teacher_spelling_claw_settings_v1(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_teacher_spelling_claw_settings_v1(UUID, JSONB, JSONB, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_teacher_spelling_claw_history_v1(UUID, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_spelling_claw_context_v1() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.start_my_spelling_claw_play_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_spelling_claw_settings_v1(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_teacher_spelling_claw_settings_v1(UUID, JSONB, JSONB, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_teacher_spelling_claw_history_v1(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_spelling_claw_context_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_my_spelling_claw_play_v1() TO authenticated;

REVOKE ALL ON FUNCTION public.spelling_claw_issue_quiz_v1(UUID, JSONB, SMALLINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.spelling_claw_answer_v1(UUID, UUID, INTEGER, TEXT, BOOLEAN, SMALLINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.spelling_claw_finish_play_v1(UUID, UUID, JSONB, JSONB, INTEGER, INTEGER, SMALLINT, SMALLINT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spelling_claw_issue_quiz_v1(UUID, JSONB, SMALLINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.spelling_claw_answer_v1(UUID, UUID, INTEGER, TEXT, BOOLEAN, SMALLINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.spelling_claw_finish_play_v1(UUID, UUID, JSONB, JSONB, INTEGER, INTEGER, SMALLINT, SMALLINT, BOOLEAN) TO service_role;
