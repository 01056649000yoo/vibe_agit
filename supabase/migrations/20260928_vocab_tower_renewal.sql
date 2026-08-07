-- 어휘의 탑 리뉴얼: 서버 시도 횟수·문제별 정답 검증·게임 공용 포인트 상한.
-- 기존 랭킹/시즌 표는 유지하고 학생 클라이언트가 직접 호출하던 보상 함수는 차단한다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.game_point_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    module_id TEXT NOT NULL,
    reward_key TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount BETWEEN 0 AND 80),
    earned_on DATE NOT NULL,
    week_started_on DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (student_id, reward_key)
);

CREATE INDEX IF NOT EXISTS idx_game_point_grants_student_day
    ON public.game_point_grants (student_id, earned_on, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_point_grants_student_week
    ON public.game_point_grants (student_id, week_started_on, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_point_grants_class_created
    ON public.game_point_grants (class_id, created_at DESC);

ALTER TABLE public.game_point_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.game_point_grants FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.game_point_grants TO service_role;

CREATE TABLE IF NOT EXISTS public.vocab_tower_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    run_date DATE NOT NULL,
    grade SMALLINT NOT NULL CHECK (grade BETWEEN 3 AND 6),
    daily_limit SMALLINT NOT NULL CHECK (daily_limit BETWEEN 1 AND 5),
    floor_time_limit SMALLINT NOT NULL CHECK (floor_time_limit BETWEEN 30 AND 120),
    reward_cap SMALLINT NOT NULL CHECK (reward_cap BETWEEN 0 AND 50),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished', 'abandoned')),
    finish_reason TEXT CHECK (finish_reason IS NULL OR finish_reason IN ('completed', 'time_up', 'exited')),
    answer_count SMALLINT NOT NULL DEFAULT 0 CHECK (answer_count BETWEEN 0 AND 30),
    correct_count SMALLINT NOT NULL DEFAULT 0 CHECK (correct_count BETWEEN 0 AND 30),
    wrong_count SMALLINT NOT NULL DEFAULT 0 CHECK (wrong_count BETWEEN 0 AND 30),
    review_correct_count SMALLINT NOT NULL DEFAULT 0 CHECK (review_correct_count BETWEEN 0 AND 30),
    current_floor SMALLINT NOT NULL DEFAULT 1 CHECK (current_floor BETWEEN 1 AND 10),
    current_combo SMALLINT NOT NULL DEFAULT 0,
    max_combo SMALLINT NOT NULL DEFAULT 0,
    reward_points SMALLINT NOT NULL DEFAULT 0 CHECK (reward_points BETWEEN 0 AND 80),
    config_reset_at TIMESTAMPTZ,
    last_answered_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vocab_tower_runs_student_date
    ON public.vocab_tower_runs (student_id, run_date, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vocab_tower_runs_class_created
    ON public.vocab_tower_runs (class_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vocab_tower_runs_student_active
    ON public.vocab_tower_runs (student_id)
    WHERE status = 'active';

ALTER TABLE public.vocab_tower_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.vocab_tower_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.vocab_tower_runs TO service_role;

CREATE TABLE IF NOT EXISTS public.vocab_tower_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES public.vocab_tower_runs(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    question_key TEXT NOT NULL CHECK (char_length(question_key) BETWEEN 8 AND 100),
    room_type TEXT NOT NULL CHECK (room_type IN ('meaning', 'sentence', 'distinction', 'boss')),
    word TEXT NOT NULL,
    selected_answer TEXT NOT NULL,
    used_hint BOOLEAN NOT NULL DEFAULT false,
    is_correct BOOLEAN NOT NULL,
    answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (run_id, question_key)
);

CREATE INDEX IF NOT EXISTS idx_vocab_tower_answers_run_answered
    ON public.vocab_tower_answers (run_id, answered_at);
CREATE INDEX IF NOT EXISTS idx_vocab_tower_answers_student_answered
    ON public.vocab_tower_answers (student_id, answered_at DESC);

ALTER TABLE public.vocab_tower_answers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.vocab_tower_answers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.vocab_tower_answers TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_vocab_tower_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID := public.auth_user_class_id();
    v_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::DATE;
    v_week DATE := date_trunc('week', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::DATE;
    v_daily_limit INTEGER;
    v_time_limit INTEGER;
    v_reward_cap INTEGER;
    v_reset_at TIMESTAMPTZ;
    v_attempts INTEGER;
    v_daily_points INTEGER;
    v_weekly_points INTEGER;
    v_active public.vocab_tower_runs%ROWTYPE;
    v_review_words TEXT[] := ARRAY[]::TEXT[];
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL OR v_class_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT
        LEAST(5, GREATEST(1, COALESCE(c.vocab_tower_daily_limit, 3))),
        LEAST(120, GREATEST(30, COALESCE(c.vocab_tower_time_limit, 40))),
        LEAST(50, GREATEST(0, COALESCE(c.vocab_tower_reward_points, 50))),
        c.vocab_tower_reset_date
    INTO v_daily_limit, v_time_limit, v_reward_cap, v_reset_at
    FROM public.classes c
    WHERE c.id = v_class_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION '학급 설정을 찾을 수 없습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT COUNT(*)::INTEGER
    INTO v_attempts
    FROM public.vocab_tower_runs r
    WHERE r.student_id = v_student_id
      AND r.class_id = v_class_id
      AND r.run_date = v_today
      AND (v_reset_at IS NULL OR r.created_at >= v_reset_at);

    SELECT COALESCE(SUM(g.amount), 0)::INTEGER
    INTO v_daily_points
    FROM public.game_point_grants g
    WHERE g.student_id = v_student_id
      AND g.earned_on = v_today;

    SELECT COALESCE(SUM(g.amount), 0)::INTEGER
    INTO v_weekly_points
    FROM public.game_point_grants g
    WHERE g.student_id = v_student_id
      AND g.week_started_on = v_week;

    SELECT r.*
    INTO v_active
    FROM public.vocab_tower_runs r
    WHERE r.student_id = v_student_id
      AND r.class_id = v_class_id
      AND r.status = 'active'
      AND r.run_date = v_today
      AND (v_reset_at IS NULL OR r.created_at >= v_reset_at)
    ORDER BY r.created_at DESC
    LIMIT 1;

    IF v_active.id IS NOT NULL THEN
        SELECT COALESCE(array_agg(DISTINCT wrong_answer.word), ARRAY[]::TEXT[])
        INTO v_review_words
        FROM public.vocab_tower_answers wrong_answer
        WHERE wrong_answer.run_id = v_active.id
          AND wrong_answer.is_correct = false
          AND NOT EXISTS (
              SELECT 1
              FROM public.vocab_tower_answers learned_answer
              WHERE learned_answer.run_id = v_active.id
                AND learned_answer.word = wrong_answer.word
                AND learned_answer.room_type = 'boss'
                AND learned_answer.is_correct = true
          );
    END IF;

    RETURN jsonb_build_object(
        'daily_limit', v_daily_limit,
        'remaining_attempts', GREATEST(0, v_daily_limit - v_attempts),
        'floor_time_limit', v_time_limit,
        'reward_cap', v_reward_cap,
        'daily_points', v_daily_points,
        'daily_point_limit', 80,
        'weekly_points', v_weekly_points,
        'weekly_point_limit', 250,
        'active_run', CASE WHEN v_active.id IS NULL THEN NULL ELSE jsonb_build_object(
            'run_id', v_active.id,
            'answer_count', v_active.answer_count,
            'correct_count', v_active.correct_count,
            'wrong_count', v_active.wrong_count,
            'review_correct_count', v_active.review_correct_count,
            'current_floor', v_active.current_floor,
            'current_combo', v_active.current_combo,
            'max_combo', v_active.max_combo,
            'review_words', to_jsonb(v_review_words)
        ) END
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.start_my_vocab_tower_run()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID := public.auth_user_class_id();
    v_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::DATE;
    v_grade INTEGER;
    v_daily_limit INTEGER;
    v_time_limit INTEGER;
    v_reward_cap INTEGER;
    v_enabled BOOLEAN;
    v_reset_at TIMESTAMPTZ;
    v_attempts INTEGER;
    v_run public.vocab_tower_runs%ROWTYPE;
    v_review_words TEXT[] := ARRAY[]::TEXT[];
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL OR v_class_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    PERFORM 1 FROM public.students s WHERE s.id = v_student_id AND s.class_id = v_class_id FOR UPDATE;

    SELECT
        LEAST(6, GREATEST(3, COALESCE(c.vocab_tower_grade, 3))),
        LEAST(5, GREATEST(1, COALESCE(c.vocab_tower_daily_limit, 3))),
        LEAST(120, GREATEST(30, COALESCE(c.vocab_tower_time_limit, 40))),
        LEAST(50, GREATEST(0, COALESCE(c.vocab_tower_reward_points, 50))),
        CASE
            WHEN c.enabled_modules IS NULL THEN COALESCE(c.vocab_tower_enabled, false)
            ELSE 'vocab-tower' = ANY(c.enabled_modules)
        END,
        c.vocab_tower_reset_date
    INTO v_grade, v_daily_limit, v_time_limit, v_reward_cap, v_enabled, v_reset_at
    FROM public.classes c
    WHERE c.id = v_class_id;

    IF NOT COALESCE(v_enabled, false) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', '선생님이 지금은 어휘의 탑을 열어두지 않았어요.'
        );
    END IF;

    SELECT r.*
    INTO v_run
    FROM public.vocab_tower_runs r
    WHERE r.student_id = v_student_id
      AND r.class_id = v_class_id
      AND r.status = 'active'
      AND r.run_date = v_today
      AND (v_reset_at IS NULL OR r.created_at >= v_reset_at)
    ORDER BY r.created_at DESC
    LIMIT 1;

    IF v_run.id IS NOT NULL THEN
        SELECT COALESCE(array_agg(DISTINCT wrong_answer.word), ARRAY[]::TEXT[])
        INTO v_review_words
        FROM public.vocab_tower_answers wrong_answer
        WHERE wrong_answer.run_id = v_run.id
          AND wrong_answer.is_correct = false
          AND NOT EXISTS (
              SELECT 1
              FROM public.vocab_tower_answers learned_answer
              WHERE learned_answer.run_id = v_run.id
                AND learned_answer.word = wrong_answer.word
                AND learned_answer.room_type = 'boss'
                AND learned_answer.is_correct = true
          );
        RETURN jsonb_build_object(
            'success', true,
            'resumed', true,
            'run_id', v_run.id,
            'grade', v_run.grade,
            'answer_count', v_run.answer_count,
            'correct_count', v_run.correct_count,
            'wrong_count', v_run.wrong_count,
            'review_correct_count', v_run.review_correct_count,
            'current_floor', v_run.current_floor,
            'current_combo', v_run.current_combo,
            'max_combo', v_run.max_combo,
            'review_words', to_jsonb(v_review_words),
            'floor_time_limit', v_run.floor_time_limit,
            'reward_cap', v_run.reward_cap
        );
    END IF;

    UPDATE public.vocab_tower_runs
    SET status = 'abandoned', finish_reason = 'exited', finished_at = NOW()
    WHERE student_id = v_student_id
      AND status = 'active';

    SELECT COUNT(*)::INTEGER
    INTO v_attempts
    FROM public.vocab_tower_runs r
    WHERE r.student_id = v_student_id
      AND r.class_id = v_class_id
      AND r.run_date = v_today
      AND (v_reset_at IS NULL OR r.created_at >= v_reset_at);

    IF v_attempts >= v_daily_limit THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', '오늘의 도전 기회를 모두 사용했어요.',
            'remaining_attempts', 0
        );
    END IF;

    INSERT INTO public.vocab_tower_runs (
        student_id, class_id, run_date, grade, daily_limit, floor_time_limit, reward_cap, config_reset_at
    ) VALUES (
        v_student_id, v_class_id, v_today, v_grade, v_daily_limit, v_time_limit, v_reward_cap, v_reset_at
    )
    RETURNING * INTO v_run;

    RETURN jsonb_build_object(
        'success', true,
        'resumed', false,
        'run_id', v_run.id,
        'grade', v_run.grade,
        'answer_count', 0,
        'correct_count', 0,
        'wrong_count', 0,
        'review_correct_count', 0,
        'current_floor', 1,
        'current_combo', 0,
        'max_combo', 0,
        'review_words', '[]'::JSONB,
        'floor_time_limit', v_run.floor_time_limit,
        'reward_cap', v_run.reward_cap,
        'remaining_attempts', GREATEST(0, v_daily_limit - v_attempts - 1)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_my_vocab_tower_answer(
    p_run_id UUID,
    p_question_key TEXT,
    p_room_type TEXT,
    p_word TEXT,
    p_selected_answer TEXT,
    p_used_hint BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID := public.auth_user_class_id();
    v_run public.vocab_tower_runs%ROWTYPE;
    v_is_correct BOOLEAN;
    v_is_review_correct BOOLEAN := false;
    v_inserted_id UUID;
    v_answer_count INTEGER;
    v_correct_count INTEGER;
    v_wrong_count INTEGER;
    v_review_correct_count INTEGER;
    v_combo INTEGER;
    v_max_combo INTEGER;
    v_floor INTEGER;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL OR v_class_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    IF p_room_type NOT IN ('meaning', 'sentence', 'distinction', 'boss') THEN
        RAISE EXCEPTION '알 수 없는 문제 방입니다.' USING ERRCODE = '22023';
    END IF;
    IF char_length(COALESCE(p_question_key, '')) NOT BETWEEN 8 AND 100 THEN
        RAISE EXCEPTION '문제 확인값이 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT r.* INTO v_run
    FROM public.vocab_tower_runs r
    WHERE r.id = p_run_id
      AND r.student_id = v_student_id
      AND r.class_id = v_class_id
    FOR UPDATE;

    IF NOT FOUND OR v_run.status <> 'active' THEN
        RAISE EXCEPTION '진행 중인 도전을 찾을 수 없습니다.' USING ERRCODE = '22023';
    END IF;
    IF v_run.answer_count >= 30 THEN
        RAISE EXCEPTION '이미 정상까지 모든 문제를 풀었어요.' USING ERRCODE = '22023';
    END IF;
    IF v_run.last_answered_at IS NOT NULL AND NOW() - v_run.last_answered_at < INTERVAL '250 milliseconds' THEN
        RAISE EXCEPTION '문제를 너무 빠르게 제출했어요. 잠시 후 다시 시도해주세요.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.vocab_tower_words w
        WHERE w.grade = v_run.grade AND w.word = p_word
    ) THEN
        RAISE EXCEPTION '출제 학년에 없는 단어입니다.' USING ERRCODE = '22023';
    END IF;

    v_is_correct := p_selected_answer = p_word;
    IF v_is_correct AND p_room_type = 'boss' THEN
        SELECT EXISTS (
            SELECT 1 FROM public.vocab_tower_answers a
            WHERE a.run_id = p_run_id AND a.word = p_word AND a.is_correct = false
              AND NOT EXISTS (
                  SELECT 1 FROM public.vocab_tower_answers learned
                  WHERE learned.run_id = p_run_id
                    AND learned.word = p_word
                    AND learned.room_type = 'boss'
                    AND learned.is_correct = true
              )
        ) INTO v_is_review_correct;
    END IF;

    INSERT INTO public.vocab_tower_answers (
        run_id, student_id, class_id, question_key, room_type, word, selected_answer, used_hint, is_correct
    ) VALUES (
        p_run_id, v_student_id, v_class_id, p_question_key, p_room_type, p_word,
        LEFT(COALESCE(p_selected_answer, ''), 100), COALESCE(p_used_hint, false), v_is_correct
    )
    ON CONFLICT (run_id, question_key) DO NOTHING
    RETURNING id INTO v_inserted_id;

    IF v_inserted_id IS NULL THEN
        SELECT a.is_correct INTO v_is_correct
        FROM public.vocab_tower_answers a
        WHERE a.run_id = p_run_id AND a.question_key = p_question_key;
        RETURN jsonb_build_object(
            'success', true,
            'duplicate', true,
            'is_correct', v_is_correct,
            'answer_count', v_run.answer_count,
            'correct_count', v_run.correct_count,
            'wrong_count', v_run.wrong_count,
            'review_correct_count', v_run.review_correct_count,
            'current_floor', v_run.current_floor,
            'current_combo', v_run.current_combo,
            'max_combo', v_run.max_combo,
            'floor_cleared', MOD(v_run.answer_count, 3) = 0,
            'completed', v_run.answer_count >= 30
        );
    END IF;

    v_answer_count := v_run.answer_count + 1;
    v_correct_count := v_run.correct_count + CASE WHEN v_is_correct THEN 1 ELSE 0 END;
    v_wrong_count := v_run.wrong_count + CASE WHEN v_is_correct THEN 0 ELSE 1 END;
    v_review_correct_count := v_run.review_correct_count + CASE WHEN v_is_review_correct THEN 1 ELSE 0 END;
    v_combo := CASE WHEN v_is_correct THEN v_run.current_combo + 1 ELSE 0 END;
    v_max_combo := GREATEST(v_run.max_combo, v_combo);
    v_floor := LEAST(10, (v_answer_count / 3) + 1);

    UPDATE public.vocab_tower_runs
    SET answer_count = v_answer_count,
        correct_count = v_correct_count,
        wrong_count = v_wrong_count,
        review_correct_count = v_review_correct_count,
        current_floor = v_floor,
        current_combo = v_combo,
        max_combo = v_max_combo,
        last_answered_at = NOW()
    WHERE id = p_run_id;

    RETURN jsonb_build_object(
        'success', true,
        'duplicate', false,
        'is_correct', v_is_correct,
        'is_review_correct', v_is_review_correct,
        'answer_count', v_answer_count,
        'correct_count', v_correct_count,
        'wrong_count', v_wrong_count,
        'review_correct_count', v_review_correct_count,
        'current_floor', v_floor,
        'current_combo', v_combo,
        'max_combo', v_max_combo,
        'floor_cleared', MOD(v_answer_count, 3) = 0,
        'completed', v_answer_count >= 30
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_my_vocab_tower_run(
    p_run_id UUID,
    p_reason TEXT DEFAULT 'exited'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID := public.auth_user_class_id();
    v_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::DATE;
    v_week DATE := date_trunc('week', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::DATE;
    v_run public.vocab_tower_runs%ROWTYPE;
    v_accuracy NUMERIC := 0;
    v_raw_reward INTEGER := 0;
    v_daily_points INTEGER := 0;
    v_weekly_points INTEGER := 0;
    v_award INTEGER := 0;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL OR v_class_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    IF p_reason NOT IN ('completed', 'time_up', 'exited') THEN
        RAISE EXCEPTION '알 수 없는 종료 방식입니다.' USING ERRCODE = '22023';
    END IF;

    SELECT r.* INTO v_run
    FROM public.vocab_tower_runs r
    WHERE r.id = p_run_id
      AND r.student_id = v_student_id
      AND r.class_id = v_class_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION '도전 기록을 찾을 수 없습니다.' USING ERRCODE = '22023';
    END IF;
    IF v_run.status <> 'active' THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_finished', true,
            'reward_points', v_run.reward_points,
            'answer_count', v_run.answer_count,
            'correct_count', v_run.correct_count,
            'wrong_count', v_run.wrong_count,
            'review_correct_count', v_run.review_correct_count,
            'max_floor', v_run.current_floor,
            'max_combo', v_run.max_combo
        );
    END IF;

    -- 학생별 포인트 행을 잠가 다른 게임과 동시에 끝나도 공용 상한을 넘지 않게 한다.
    PERFORM 1
    FROM public.students s
    WHERE s.id = v_student_id AND s.class_id = v_class_id
    FOR UPDATE;

    IF v_run.answer_count > 0 THEN
        v_accuracy := v_run.correct_count::NUMERIC / v_run.answer_count::NUMERIC;
    END IF;
    v_raw_reward := v_run.correct_count * 2 + v_run.review_correct_count * 3;
    IF v_accuracy >= 0.60 AND v_run.current_floor >= 5 THEN
        v_raw_reward := v_raw_reward + 5;
    END IF;
    IF v_accuracy >= 0.60 AND v_run.answer_count >= 30 THEN
        v_raw_reward := v_raw_reward + 10;
    END IF;
    v_raw_reward := LEAST(v_run.reward_cap, v_raw_reward);

    SELECT COALESCE(SUM(g.amount), 0)::INTEGER INTO v_daily_points
    FROM public.game_point_grants g
    WHERE g.student_id = v_student_id AND g.earned_on = v_today;

    SELECT COALESCE(SUM(g.amount), 0)::INTEGER INTO v_weekly_points
    FROM public.game_point_grants g
    WHERE g.student_id = v_student_id AND g.week_started_on = v_week;

    v_award := LEAST(
        v_raw_reward,
        GREATEST(0, 80 - v_daily_points),
        GREATEST(0, 250 - v_weekly_points)
    );

    INSERT INTO public.game_point_grants (
        student_id, class_id, module_id, reward_key, amount, earned_on, week_started_on
    ) VALUES (
        v_student_id, v_class_id, 'vocab-tower', 'vocab-tower:' || p_run_id::TEXT,
        v_award, v_today, v_week
    )
    ON CONFLICT (student_id, reward_key) DO NOTHING;

    IF v_award > 0 THEN
        PERFORM set_config('app.bypass_student_trigger', 'true', true);
        UPDATE public.students
        SET total_points = COALESCE(total_points, 0) + v_award
        WHERE id = v_student_id AND class_id = v_class_id;

        INSERT INTO public.point_logs (student_id, class_id, amount, reason, activity_type)
        VALUES (
            v_student_id, v_class_id, v_award,
            format('어휘의 탑 탐험 보상 · %s층 · 정답 %s개', v_run.current_floor, v_run.correct_count),
            'vocab_tower'
        );
        PERFORM set_config('app.bypass_student_trigger', 'false', true);
    END IF;

    INSERT INTO public.vocab_tower_rankings (student_id, class_id, max_floor, updated_at)
    VALUES (v_student_id, v_class_id, v_run.current_floor, NOW())
    ON CONFLICT (student_id, class_id) DO UPDATE SET
        max_floor = GREATEST(public.vocab_tower_rankings.max_floor, EXCLUDED.max_floor),
        updated_at = NOW();

    UPDATE public.vocab_tower_runs
    SET status = 'finished',
        finish_reason = p_reason,
        reward_points = v_award,
        finished_at = NOW()
    WHERE id = p_run_id;

    RETURN jsonb_build_object(
        'success', true,
        'already_finished', false,
        'reward_points', v_award,
        'raw_reward', v_raw_reward,
        'answer_count', v_run.answer_count,
        'correct_count', v_run.correct_count,
        'wrong_count', v_run.wrong_count,
        'review_correct_count', v_run.review_correct_count,
        'max_floor', v_run.current_floor,
        'max_combo', v_run.max_combo,
        'accuracy', ROUND(v_accuracy * 100),
        'daily_points', v_daily_points + v_award,
        'daily_point_limit', 80,
        'weekly_points', v_weekly_points + v_award,
        'weekly_point_limit', 250
    );
END;
$$;

-- 구버전 클라이언트가 임의 금액·임의 층수를 보내는 경로를 닫는다.
CREATE OR REPLACE FUNCTION public.reward_for_vocab_tower(p_amount INTEGER)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN json_build_object(
        'success', false,
        'error', '어휘의 탑이 새 탐험 보상 방식으로 바뀌었습니다. 화면을 새로고침해주세요.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.update_tower_max_floor(UUID, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reward_for_vocab_tower(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_vocab_tower_status() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.start_my_vocab_tower_run() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_my_vocab_tower_answer(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finish_my_vocab_tower_run(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_vocab_tower_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_my_vocab_tower_run() TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_my_vocab_tower_answer(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_my_vocab_tower_run(UUID, TEXT) TO authenticated;

ALTER TABLE public.classes
    ALTER COLUMN vocab_tower_daily_limit SET DEFAULT 3,
    ALTER COLUMN vocab_tower_time_limit SET DEFAULT 40,
    ALTER COLUMN vocab_tower_reward_points SET DEFAULT 50;
UPDATE public.classes
SET vocab_tower_daily_limit = LEAST(5, GREATEST(1, COALESCE(vocab_tower_daily_limit, 3))),
    vocab_tower_time_limit = LEAST(120, GREATEST(30, COALESCE(vocab_tower_time_limit, 40)))
WHERE vocab_tower_daily_limit IS DISTINCT FROM LEAST(5, GREATEST(1, COALESCE(vocab_tower_daily_limit, 3)))
   OR vocab_tower_time_limit IS DISTINCT FROM LEAST(120, GREATEST(30, COALESCE(vocab_tower_time_limit, 40)));
UPDATE public.classes
SET vocab_tower_reward_points = LEAST(50, GREATEST(0, COALESCE(vocab_tower_reward_points, 50)))
WHERE vocab_tower_reward_points IS DISTINCT FROM LEAST(50, GREATEST(0, COALESCE(vocab_tower_reward_points, 50)));

COMMIT;
