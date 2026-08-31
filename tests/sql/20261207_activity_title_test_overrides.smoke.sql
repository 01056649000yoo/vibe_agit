-- 바깥 마이그레이션 검사 트랜잭션이 마지막에 모두 롤백한다.

DO $$
BEGIN
    IF has_table_privilege('authenticated', 'public.student_title_test_overrides', 'SELECT')
       OR has_table_privilege('authenticated', 'public.student_title_test_overrides', 'INSERT')
       OR has_function_privilege(
           'authenticated',
           'public.get_title_activity_test_state_v1(uuid,uuid,jsonb)',
           'EXECUTE'
       ) THEN
        RAISE EXCEPTION '칭호 시험 단계 표 또는 내부 함수가 브라우저에 열려 있습니다.';
    END IF;
END;
$$;

SELECT set_config('test.activity_title_student_id', candidate.id::TEXT, true),
       set_config('test.activity_title_student_auth_id', candidate.auth_id::TEXT, true),
       set_config('test.activity_title_class_id', candidate.class_id::TEXT, true),
       set_config('test.activity_title_season_id', candidate.season_id::TEXT, true)
FROM (
    SELECT student.id, student.auth_id, student.class_id, season.id AS season_id
    FROM public.students student
    JOIN public.dragon_growth_seasons season
      ON season.class_id = student.class_id
     AND season.status = 'active'
    WHERE student.auth_id IS NOT NULL
      AND student.deleted_at IS NULL
      AND student.is_active IS DISTINCT FROM false
    ORDER BY season.season_number DESC
    LIMIT 1
) candidate;

DO $$
BEGIN
    IF current_setting('test.activity_title_student_id', true) IS NULL THEN
        RAISE EXCEPTION '칭호 시험 단계 스모크에 사용할 활성 학생·시즌이 없습니다.';
    END IF;

    INSERT INTO public.student_title_test_overrides (
        student_id, class_id, diary_level, note, updated_at
    ) VALUES (
        current_setting('test.activity_title_student_id')::UUID,
        current_setting('test.activity_title_class_id')::UUID,
        3,
        'ROLLBACK 칭호 시험 단계 스모크',
        NOW()
    )
    ON CONFLICT (student_id) DO UPDATE
    SET class_id = EXCLUDED.class_id,
        diary_level = EXCLUDED.diary_level,
        updated_at = NOW();

    INSERT INTO public.title_reward_rollout_classes(class_id, enabled, enabled_at, updated_at)
    VALUES (current_setting('test.activity_title_class_id')::UUID, true, NOW(), NOW())
    ON CONFLICT (class_id) DO UPDATE SET enabled = true, updated_at = NOW();

    DELETE FROM public.student_title_reward_claims
    WHERE season_id = current_setting('test.activity_title_season_id')::UUID
      AND student_id = current_setting('test.activity_title_student_id')::UUID
      AND track_id = 'diary';
    DELETE FROM public.point_logs
    WHERE student_id = current_setting('test.activity_title_student_id')::UUID
      AND event_key LIKE 'title-reward:' || current_setting('test.activity_title_season_id') || ':diary:%';
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.activity_title_student_auth_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.activity_title_student_auth_id'), 'role', 'authenticated'
)::TEXT, true);

DO $$
DECLARE
    v_status JSONB;
    v_claim JSONB;
BEGIN
    v_status := public.get_my_title_status();
    IF (v_status ->> 'diary_level_override')::INTEGER <> 3
       OR (v_status #>> '{title_rewards,tracks,diary,current_level}')::INTEGER <> 3 THEN
        RAISE EXCEPTION '기록가 시험 단계가 조회·보상 상태에 함께 반영되지 않았습니다: %', v_status;
    END IF;

    v_claim := public.claim_my_title_rewards_v1('diary', ARRAY[3]::SMALLINT[]);
    IF (v_claim ->> 'claimed_points')::INTEGER <> 400 THEN
        RAISE EXCEPTION '기록가 LV.3 시험 보상을 받지 못했습니다: %', v_claim;
    END IF;

    BEGIN
        PERFORM public.claim_my_title_rewards_v1('diary', ARRAY[4]::SMALLINT[]);
        RAISE EXCEPTION '시험 단계보다 높은 보상을 받았습니다.';
    EXCEPTION WHEN invalid_parameter_value THEN
        NULL;
    END;
END;
$$;

RESET ROLE;
