-- 기록가·독서가 칭호를 기존 학기 시즌에 연결하고 학생의 명시적 단계 보상을 추가한다.
-- 운영 반영만으로 전체 학급에 열리지 않도록 학급 공개 등록부는 기본 비어 있다.

BEGIN;

ALTER TABLE public.dragon_growth_seasons
    ADD COLUMN IF NOT EXISTS title_reward_policy JSONB NOT NULL DEFAULT
        '{"version":1,"tracks":{"diary":[0,200,400,600,800,1200,1800],"reading":[0,200,400,600,800,1200,1800]}}'::JSONB;

COMMENT ON TABLE public.dragon_growth_seasons IS
    '작가·소통·기록가·독서가와 수호룡이 함께 쓰는 학기 시즌. 기존 이름은 배포 호환을 위해 유지한다.';
COMMENT ON COLUMN public.dragon_growth_seasons.title_reward_policy IS
    '시즌 시작 시 고정되는 기록가·독서가 단계별 포인트 정책. 1단계부터의 배열이다.';

-- 기존에 시즌 행이 전혀 없던 학급만 현재 학기 시작 시각으로 1번째 시즌을 만든다.
-- 종료된 시즌만 있는 학급은 교사가 새 시즌을 시작해야 하므로 자동으로 열지 않는다.
INSERT INTO public.dragon_growth_seasons (
    class_id, season_number, name, started_at, status, created_by
)
SELECT class_row.id, 1, '1번째 시즌',
       COALESCE(class_row.season_started_at, class_row.created_at, NOW()),
       'active', class_row.teacher_id
FROM public.classes class_row
WHERE NOT EXISTS (
    SELECT 1 FROM public.dragon_growth_seasons season WHERE season.class_id = class_row.id
)
ON CONFLICT (class_id, season_number) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.title_reward_rollout_classes (
    class_id UUID PRIMARY KEY REFERENCES public.classes(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    enabled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    enabled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.title_reward_rollout_classes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.title_reward_rollout_classes FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.title_reward_rollout_classes TO service_role;

COMMENT ON TABLE public.title_reward_rollout_classes IS
    '칭호 보상 제한 공개 학급 등록부. 행이 없거나 enabled=false이면 학생 화면과 수령 RPC가 모두 닫힌다.';

CREATE TABLE IF NOT EXISTS public.student_title_reward_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_id UUID NOT NULL REFERENCES public.dragon_growth_seasons(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    track_id TEXT NOT NULL CHECK (track_id IN ('diary', 'reading')),
    level SMALLINT NOT NULL CHECK (level BETWEEN 2 AND 7),
    reward_points INTEGER NOT NULL CHECK (reward_points > 0),
    policy_version INTEGER NOT NULL CHECK (policy_version > 0),
    point_log_id UUID NOT NULL REFERENCES public.point_logs(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT student_title_reward_claims_unique UNIQUE (season_id, student_id, track_id, level)
);

CREATE INDEX IF NOT EXISTS idx_title_reward_claims_student_season
    ON public.student_title_reward_claims (student_id, season_id, track_id, level);
CREATE INDEX IF NOT EXISTS idx_title_reward_claims_class_created
    ON public.student_title_reward_claims (class_id, created_at DESC);

ALTER TABLE public.student_title_reward_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.student_title_reward_claims FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.student_title_reward_claims TO service_role;

COMMENT ON TABLE public.student_title_reward_claims IS
    '학생이 직접 받은 시즌별 기록가·독서가 단계 보상 원장. 브라우저는 전용 RPC로만 접근한다.';

ALTER TABLE public.point_logs DROP CONSTRAINT IF EXISTS point_logs_activity_type_check;
ALTER TABLE public.point_logs ADD CONSTRAINT point_logs_activity_type_check CHECK (activity_type IN (
    'writing_reward', 'meeting_activity', 'vocab_tower', 'dragon_care',
    'hideout_purchase', 'starting_bonus', 'private_adjustment', 'comment_reward', 'title_reward'
));

-- 최신 포인트 엔진의 허용 활동에 title_reward만 추가한다.
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
        'hideout_purchase', 'starting_bonus', 'private_adjustment', 'title_reward'
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

-- 기존 원자료 함수 구현은 그대로 보존하고 공개 이름만 새 조합 함수에 넘긴다.
DO $migration$
BEGIN
    IF to_regprocedure('public.get_my_title_progress_v1()') IS NULL THEN
        EXECUTE 'ALTER FUNCTION public.get_my_title_status() RENAME TO get_my_title_progress_v1';
    END IF;
END;
$migration$;

REVOKE ALL ON FUNCTION public.get_my_title_progress_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_title_progress_v1() TO service_role;
COMMENT ON FUNCTION public.get_my_title_progress_v1() IS
    '칭호 단계와 시즌 스냅샷의 원자료 계산. 공개 get_my_title_status가 보상 상태와 조합한다.';

CREATE OR REPLACE FUNCTION public.get_title_season_context_v1(p_class_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'id', season.id,
        'class_id', season.class_id,
        'number', season.season_number,
        'name', season.name,
        'status', season.status,
        'started_at', season.started_at,
        'closing_started_at', season.closing_started_at,
        'closed_at', season.closed_at,
        'reward_policy', season.title_reward_policy,
        'rewards_enabled', COALESCE(rollout.enabled, false)
    )
    FROM public.dragon_growth_seasons season
    LEFT JOIN public.title_reward_rollout_classes rollout ON rollout.class_id = season.class_id
    WHERE season.class_id = p_class_id
    ORDER BY (season.status IN ('active', 'closing')) DESC, season.season_number DESC
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_title_season_context_v1(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_title_season_context_v1(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.build_title_reward_track_state_v1(
    p_student_id UUID,
    p_season_id UUID,
    p_track_id TEXT,
    p_current_level INTEGER,
    p_policy JSONB,
    p_claiming_enabled BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_level INTEGER;
    v_points INTEGER;
    v_claimed BOOLEAN;
    v_status TEXT;
    v_levels JSONB := '[]'::JSONB;
    v_claimable_total INTEGER := 0;
    v_claimed_total INTEGER := 0;
BEGIN
    IF p_track_id NOT IN ('diary', 'reading') THEN
        RAISE EXCEPTION '지원하지 않는 칭호 보상 종목입니다.' USING ERRCODE = '22023';
    END IF;

    FOR v_level IN 1..7 LOOP
        v_points := COALESCE((p_policy #>> ARRAY['tracks', p_track_id, (v_level - 1)::TEXT])::INTEGER, 0);
        SELECT EXISTS (
            SELECT 1 FROM public.student_title_reward_claims claim
            WHERE claim.season_id = p_season_id
              AND claim.student_id = p_student_id
              AND claim.track_id = p_track_id
              AND claim.level = v_level
        ) INTO v_claimed;

        v_status := CASE
            WHEN v_points <= 0 THEN 'none'
            WHEN v_claimed THEN 'claimed'
            WHEN p_claiming_enabled AND v_level <= p_current_level THEN 'claimable'
            ELSE 'locked'
        END;
        IF v_status = 'claimable' THEN v_claimable_total := v_claimable_total + v_points; END IF;
        IF v_status = 'claimed' THEN v_claimed_total := v_claimed_total + v_points; END IF;
        v_levels := v_levels || jsonb_build_array(jsonb_build_object(
            'level', v_level, 'points', v_points, 'status', v_status
        ));
    END LOOP;

    RETURN jsonb_build_object(
        'current_level', p_current_level,
        'claimable_total', v_claimable_total,
        'claimed_total', v_claimed_total,
        'levels', v_levels
    );
END;
$$;

REVOKE ALL ON FUNCTION public.build_title_reward_track_state_v1(UUID, UUID, TEXT, INTEGER, JSONB, BOOLEAN)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.build_title_reward_track_state_v1(UUID, UUID, TEXT, INTEGER, JSONB, BOOLEAN)
    TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_title_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID;
    v_progress JSONB;
    v_context JSONB;
    v_policy JSONB;
    v_season_id UUID;
    v_season_status TEXT;
    v_claiming_enabled BOOLEAN := false;
    v_diary JSONB;
    v_reading JSONB;
BEGIN
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT student.class_id INTO v_class_id
    FROM public.students student
    WHERE student.id = v_student_id
      AND student.deleted_at IS NULL
      AND student.is_active IS DISTINCT FROM false;
    IF v_class_id IS NULL THEN
        RAISE EXCEPTION '활성 학생 정보를 찾을 수 없습니다.' USING ERRCODE = 'P0002';
    END IF;

    v_progress := public.get_my_title_progress_v1();
    v_context := public.get_title_season_context_v1(v_class_id);
    v_policy := COALESCE(v_context -> 'reward_policy',
        '{"version":1,"tracks":{"diary":[0,200,400,600,800,1200,1800],"reading":[0,200,400,600,800,1200,1800]}}'::JSONB);
    v_season_id := NULLIF(v_context ->> 'id', '')::UUID;
    v_season_status := COALESCE(v_context ->> 'status', 'active');
    v_claiming_enabled := COALESCE((v_context ->> 'rewards_enabled')::BOOLEAN, false)
        AND v_season_status IN ('active', 'closing')
        AND v_season_id IS NOT NULL;

    v_diary := public.build_title_reward_track_state_v1(
        v_student_id, v_season_id, 'diary',
        public.dragon_diary_level(COALESCE((v_progress ->> 'diary_days')::BIGINT, 0)),
        v_policy, v_claiming_enabled
    );
    v_reading := public.build_title_reward_track_state_v1(
        v_student_id, v_season_id, 'reading',
        public.dragon_reading_level(
            COALESCE((v_progress ->> 'reading_log_count')::BIGINT, 0),
            COALESCE((v_progress ->> 'reading_book_count')::BIGINT, 0)
        ),
        v_policy, v_claiming_enabled
    );

    RETURN v_progress || jsonb_build_object(
        'season', COALESCE(v_progress -> 'season', '{}'::JSONB) || jsonb_build_object(
            'rewards_enabled', v_claiming_enabled,
            'reward_policy_version', COALESCE((v_policy ->> 'version')::INTEGER, 1)
        ),
        'title_rewards', jsonb_build_object(
            'enabled', v_claiming_enabled,
            'policy_version', COALESCE((v_policy ->> 'version')::INTEGER, 1),
            'season_id', v_season_id,
            'season_status', v_season_status,
            'claimable_total', COALESCE((v_diary ->> 'claimable_total')::INTEGER, 0)
                + COALESCE((v_reading ->> 'claimable_total')::INTEGER, 0),
            'claimed_total', COALESCE((v_diary ->> 'claimed_total')::INTEGER, 0)
                + COALESCE((v_reading ->> 'claimed_total')::INTEGER, 0),
            'tracks', jsonb_build_object('diary', v_diary, 'reading', v_reading)
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_title_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_title_status() TO authenticated, service_role;

COMMENT ON FUNCTION public.get_my_title_status() IS
    '학생 본인의 네 칭호 원자료와 현재 시즌의 기록가·독서가 단계별 보상 상태를 한 번에 반환한다.';

CREATE OR REPLACE FUNCTION public.claim_my_title_rewards_v1(
    p_track_id TEXT,
    p_levels SMALLINT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID;
    v_context JSONB;
    v_policy JSONB;
    v_progress JSONB;
    v_season_id UUID;
    v_season_status TEXT;
    v_current_level INTEGER;
    v_policy_version INTEGER;
    v_level INTEGER;
    v_amount INTEGER;
    v_point_result JSONB;
    v_log_id UUID;
    v_claimed_points INTEGER := 0;
    v_claimed_levels SMALLINT[] := ARRAY[]::SMALLINT[];
    v_total_points INTEGER;
BEGIN
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    IF p_track_id NOT IN ('diary', 'reading') THEN
        RAISE EXCEPTION '기록가 또는 독서가 보상만 받을 수 있습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT student.class_id INTO v_class_id
    FROM public.students student
    WHERE student.id = v_student_id
      AND student.deleted_at IS NULL
      AND student.is_active IS DISTINCT FROM false
    FOR UPDATE;
    IF v_class_id IS NULL THEN
        RAISE EXCEPTION '활성 학생 정보를 찾을 수 없습니다.' USING ERRCODE = 'P0002';
    END IF;

    v_context := public.get_title_season_context_v1(v_class_id);
    v_season_id := NULLIF(v_context ->> 'id', '')::UUID;
    v_season_status := v_context ->> 'status';
    IF v_season_id IS NULL OR v_season_status NOT IN ('active', 'closing') THEN
        RAISE EXCEPTION '현재 받을 수 있는 학기 칭호 시즌이 없습니다.' USING ERRCODE = '22023';
    END IF;
    IF COALESCE((v_context ->> 'rewards_enabled')::BOOLEAN, false) IS NOT TRUE THEN
        RAISE EXCEPTION '이 학급은 아직 칭호 단계 보상 시험 대상이 아닙니다.' USING ERRCODE = '42501';
    END IF;

    v_policy := v_context -> 'reward_policy';
    v_policy_version := COALESCE((v_policy ->> 'version')::INTEGER, 1);
    v_progress := public.get_my_title_progress_v1();
    v_current_level := CASE p_track_id
        WHEN 'diary' THEN public.dragon_diary_level(COALESCE((v_progress ->> 'diary_days')::BIGINT, 0))
        ELSE public.dragon_reading_level(
            COALESCE((v_progress ->> 'reading_log_count')::BIGINT, 0),
            COALESCE((v_progress ->> 'reading_book_count')::BIGINT, 0)
        )
    END;

    IF p_levels IS NOT NULL AND cardinality(p_levels) > 0 AND EXISTS (
        SELECT 1 FROM unnest(p_levels) requested(level)
        WHERE requested.level < 2 OR requested.level > v_current_level
    ) THEN
        RAISE EXCEPTION '아직 달성하지 않은 칭호 단계 보상은 받을 수 없습니다.' USING ERRCODE = '22023';
    END IF;

    FOR v_level IN
        SELECT DISTINCT requested.level
        FROM unnest(CASE
            WHEN p_levels IS NULL OR cardinality(p_levels) = 0
                THEN ARRAY(SELECT generate_series(2, v_current_level))::SMALLINT[]
            ELSE p_levels
        END) requested(level)
        ORDER BY requested.level
    LOOP
        v_amount := COALESCE((v_policy #>> ARRAY['tracks', p_track_id, (v_level - 1)::TEXT])::INTEGER, 0);
        IF v_amount <= 0 THEN
            RAISE EXCEPTION '칭호 보상 정책의 단계 금액이 올바르지 않습니다.' USING ERRCODE = '22023';
        END IF;
        IF EXISTS (
            SELECT 1 FROM public.student_title_reward_claims claim
            WHERE claim.season_id = v_season_id
              AND claim.student_id = v_student_id
              AND claim.track_id = p_track_id
              AND claim.level = v_level
        ) THEN
            CONTINUE;
        END IF;

        v_point_result := public.point_engine_apply(
            v_student_id,
            v_amount,
            CASE p_track_id WHEN 'diary' THEN '기록가' ELSE '독서가' END ||
                ' LV.' || v_level || ' 단계 보상',
            'title_reward',
            format('title-reward:%s:%s:%s', v_season_id, p_track_id, v_level),
            NULL,
            NULL,
            jsonb_build_object(
                'season_id', v_season_id,
                'track_id', p_track_id,
                'level', v_level,
                'policy_version', v_policy_version
            )
        );
        v_log_id := NULLIF(v_point_result ->> 'log_id', '')::UUID;

        INSERT INTO public.student_title_reward_claims (
            season_id, class_id, student_id, track_id, level,
            reward_points, policy_version, point_log_id
        ) VALUES (
            v_season_id, v_class_id, v_student_id, p_track_id, v_level,
            v_amount, v_policy_version, v_log_id
        )
        ON CONFLICT (season_id, student_id, track_id, level) DO NOTHING;

        IF FOUND THEN
            v_claimed_points := v_claimed_points + v_amount;
            v_claimed_levels := array_append(v_claimed_levels, v_level::SMALLINT);
        END IF;
    END LOOP;

    SELECT COALESCE(student.total_points, 0) INTO v_total_points
    FROM public.students student WHERE student.id = v_student_id;

    RETURN jsonb_build_object(
        'success', true,
        'track_id', p_track_id,
        'claimed_levels', to_jsonb(v_claimed_levels),
        'claimed_points', v_claimed_points,
        'total_points', v_total_points,
        'title_status', public.get_my_title_status()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_my_title_rewards_v1(TEXT, SMALLINT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_my_title_rewards_v1(TEXT, SMALLINT[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.claim_my_title_rewards_v1(TEXT, SMALLINT[]) IS
    '현재 시즌에서 서버가 다시 확인한 기록가·독서가 달성 단계만 학생 본인이 명시적으로 수령한다.';

CREATE OR REPLACE FUNCTION public.set_title_reward_rollout_class_v1(
    p_class_id UUID,
    p_enabled BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION '관리자만 칭호 보상 공개 학급을 바꿀 수 있습니다.' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.classes class_row WHERE class_row.id = p_class_id) THEN
        RAISE EXCEPTION '학급을 찾을 수 없습니다.' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.dragon_growth_seasons (
        class_id, season_number, name, started_at, status, created_by
    )
    SELECT class_row.id, 1, '1번째 시즌',
           COALESCE(class_row.season_started_at, class_row.created_at, v_now),
           'active', auth.uid()
    FROM public.classes class_row
    WHERE class_row.id = p_class_id
      AND NOT EXISTS (
          SELECT 1 FROM public.dragon_growth_seasons season WHERE season.class_id = class_row.id
      )
    ON CONFLICT (class_id, season_number) DO NOTHING;

    INSERT INTO public.title_reward_rollout_classes (class_id, enabled, enabled_by, enabled_at, updated_at)
    VALUES (p_class_id, p_enabled, auth.uid(), v_now, v_now)
    ON CONFLICT (class_id) DO UPDATE
    SET enabled = EXCLUDED.enabled,
        enabled_by = EXCLUDED.enabled_by,
        enabled_at = CASE WHEN EXCLUDED.enabled THEN v_now ELSE title_reward_rollout_classes.enabled_at END,
        updated_at = v_now;

    RETURN jsonb_build_object('class_id', p_class_id, 'enabled', p_enabled, 'updated_at', v_now);
END;
$$;

REVOKE ALL ON FUNCTION public.set_title_reward_rollout_class_v1(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_title_reward_rollout_class_v1(UUID, BOOLEAN) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
