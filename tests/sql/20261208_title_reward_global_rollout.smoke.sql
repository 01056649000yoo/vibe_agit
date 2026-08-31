-- 바깥 검증 트랜잭션이 마지막에 모두 롤백한다.

DO $$
BEGIN
    IF has_table_privilege('authenticated', 'public.title_reward_rollout_state', 'SELECT')
       OR has_table_privilege('authenticated', 'public.title_reward_rollout_state', 'UPDATE')
       OR has_function_privilege('anon', 'public.set_title_reward_rollout_global_v1(boolean)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.set_title_reward_rollout_global_v1(boolean)', 'EXECUTE') THEN
        RAISE EXCEPTION '칭호 전체 공개 스위치의 권한 경계가 올바르지 않습니다.';
    END IF;
END;
$$;

SELECT set_config('test.title_rollout_admin_id', profile.id::TEXT, true)
FROM public.profiles profile
WHERE profile.role = 'ADMIN'
ORDER BY profile.created_at
LIMIT 1;

SELECT set_config('test.title_rollout_class_id', class_row.id::TEXT, true)
FROM public.classes class_row
WHERE NOT EXISTS (
    SELECT 1 FROM public.title_reward_rollout_classes rollout
    WHERE rollout.class_id = class_row.id
)
ORDER BY class_row.created_at
LIMIT 1;

DO $$
BEGIN
    IF current_setting('test.title_rollout_admin_id', true) IS NULL
       OR current_setting('test.title_rollout_class_id', true) IS NULL THEN
        RAISE EXCEPTION '칭호 전체 공개 스모크에 사용할 관리자·학급이 없습니다.';
    END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', gen_random_uuid()::TEXT, true);
DO $$
BEGIN
    BEGIN
        PERFORM public.set_title_reward_rollout_global_v1(TRUE);
        RAISE EXCEPTION '일반 사용자가 칭호 전체 공개를 켰습니다.';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;
END;
$$;

SELECT set_config('request.jwt.claim.sub', current_setting('test.title_rollout_admin_id'), true);
DO $$
BEGIN
    PERFORM public.set_title_reward_rollout_global_v1(TRUE);
END;
$$;
RESET ROLE;

DO $$
DECLARE
    v_context JSONB;
BEGIN
    v_context := public.get_title_season_context_v1(
        current_setting('test.title_rollout_class_id')::UUID
    );
    IF (v_context ->> 'rewards_enabled')::BOOLEAN IS NOT TRUE
       OR (v_context ->> 'reward_global_enabled')::BOOLEAN IS NOT TRUE THEN
        RAISE EXCEPTION '전역 공개가 학급 시즌 문맥에 반영되지 않았습니다: %', v_context;
    END IF;
END;
$$;

DO $$
BEGIN
    INSERT INTO public.title_reward_rollout_classes(class_id, enabled, enabled_at, updated_at)
    VALUES (current_setting('test.title_rollout_class_id')::UUID, FALSE, NOW(), NOW())
    ON CONFLICT (class_id) DO UPDATE SET enabled = FALSE, updated_at = NOW();

    IF (public.get_title_season_context_v1(
        current_setting('test.title_rollout_class_id')::UUID
    ) ->> 'rewards_enabled')::BOOLEAN IS NOT FALSE THEN
        RAISE EXCEPTION '학급별 OFF가 전역 ON보다 우선하지 않습니다.';
    END IF;
END;
$$;

DO $$
DECLARE
    v_new_class_id UUID := gen_random_uuid();
BEGIN
    INSERT INTO public.classes(id, teacher_id, name)
    VALUES (
        v_new_class_id,
        current_setting('test.title_rollout_admin_id')::UUID,
        'ROLLBACK 칭호 시즌 자동 생성 시험'
    );

    IF NOT EXISTS (
        SELECT 1 FROM public.dragon_growth_seasons season
        WHERE season.class_id = v_new_class_id
          AND season.season_number = 1
          AND season.status = 'active'
    ) THEN
        RAISE EXCEPTION '새 학급의 첫 공용 칭호 시즌이 자동 생성되지 않았습니다.';
    END IF;
END;
$$;
