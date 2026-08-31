-- 실제 일기·독서록을 만들지 않고 관리자 테스트 학생의 기록가·독서가 단계와 보상 화면을 시험한다.
-- 일반 학생 원자료는 그대로 두며, 비공개 덮어쓰기 표의 값만 공개 칭호 RPC와 수령 RPC가 함께 읽는다.

BEGIN;

ALTER TABLE public.student_title_test_overrides
    ALTER COLUMN writer_level DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS diary_level SMALLINT CHECK (diary_level BETWEEN 1 AND 7),
    ADD COLUMN IF NOT EXISTS reading_level SMALLINT CHECK (reading_level BETWEEN 1 AND 7);

ALTER TABLE public.student_title_test_overrides
    DROP CONSTRAINT IF EXISTS student_title_test_overrides_has_level;
ALTER TABLE public.student_title_test_overrides
    ADD CONSTRAINT student_title_test_overrides_has_level CHECK (
        num_nonnulls(writer_level, reader_level, diary_level, reading_level) > 0
    );

COMMENT ON TABLE public.student_title_test_overrides IS
    '실제 활동 통계를 바꾸지 않는 관리자 시험 학생의 작가·소통·기록가·독서가 단계 덮어쓰기. 브라우저 직접 접근 금지.';

CREATE OR REPLACE FUNCTION public.get_title_activity_test_state_v1(
    p_student_id UUID,
    p_class_id UUID,
    p_progress JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_diary_override SMALLINT;
    v_reading_override SMALLINT;
BEGIN
    SELECT override.diary_level, override.reading_level
    INTO v_diary_override, v_reading_override
    FROM public.student_title_test_overrides override
    WHERE override.student_id = p_student_id
      AND override.class_id = p_class_id;

    RETURN jsonb_build_object(
        'diary_level_override', v_diary_override,
        'reading_level_override', v_reading_override,
        'diary_level', COALESCE(
            v_diary_override,
            public.dragon_diary_level(COALESCE((p_progress ->> 'diary_days')::BIGINT, 0))
        ),
        'reading_level', COALESCE(
            v_reading_override,
            public.dragon_reading_level(
                COALESCE((p_progress ->> 'reading_log_count')::BIGINT, 0),
                COALESCE((p_progress ->> 'reading_book_count')::BIGINT, 0)
            )
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_title_activity_test_state_v1(UUID, UUID, JSONB)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_title_activity_test_state_v1(UUID, UUID, JSONB) TO service_role;

COMMENT ON FUNCTION public.get_title_activity_test_state_v1(UUID, UUID, JSONB) IS
    '기록가·독서가의 실제 단계와 비공개 시험 덮어쓰기를 한 곳에서 조합한다.';

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
    v_activity_levels JSONB;
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
    v_activity_levels := public.get_title_activity_test_state_v1(
        v_student_id, v_class_id, v_progress
    );
    v_policy := COALESCE(v_context -> 'reward_policy',
        '{"version":1,"tracks":{"diary":[0,200,400,600,800,1200,1800],"reading":[0,200,400,600,800,1200,1800]}}'::JSONB);
    v_season_id := NULLIF(v_context ->> 'id', '')::UUID;
    v_season_status := COALESCE(v_context ->> 'status', 'active');
    v_claiming_enabled := COALESCE((v_context ->> 'rewards_enabled')::BOOLEAN, false)
        AND v_season_status IN ('active', 'closing')
        AND v_season_id IS NOT NULL;

    v_diary := public.build_title_reward_track_state_v1(
        v_student_id, v_season_id, 'diary',
        COALESCE((v_activity_levels ->> 'diary_level')::INTEGER, 1),
        v_policy, v_claiming_enabled
    );
    v_reading := public.build_title_reward_track_state_v1(
        v_student_id, v_season_id, 'reading',
        COALESCE((v_activity_levels ->> 'reading_level')::INTEGER, 1),
        v_policy, v_claiming_enabled
    );

    RETURN v_progress || jsonb_build_object(
        'diary_level_override', NULLIF(v_activity_levels ->> 'diary_level_override', '')::INTEGER,
        'reading_level_override', NULLIF(v_activity_levels ->> 'reading_level_override', '')::INTEGER,
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
    '학생 본인의 네 칭호 원자료와 현재 시즌 보상 상태. 비공개 시험 학생은 기록가·독서가 단계 덮어쓰기를 함께 반환한다.';

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
    v_activity_levels JSONB;
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
    v_activity_levels := public.get_title_activity_test_state_v1(
        v_student_id, v_class_id, v_progress
    );
    v_current_level := CASE p_track_id
        WHEN 'diary' THEN COALESCE((v_activity_levels ->> 'diary_level')::INTEGER, 1)
        ELSE COALESCE((v_activity_levels ->> 'reading_level')::INTEGER, 1)
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
    '현재 시즌에서 실제 활동 또는 비공개 시험 단계로 열린 기록가·독서가 보상을 학생 본인이 명시적으로 수령한다.';

NOTIFY pgrst, 'reload schema';
COMMIT;
