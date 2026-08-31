-- 바깥 마이그레이션 검사 트랜잭션이 마지막에 모두 롤백한다.

DO $$
BEGIN
    IF has_function_privilege('anon', 'public.claim_my_title_rewards_v1(text,smallint[])', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.claim_my_title_rewards_v1(text,smallint[])', 'EXECUTE')
       OR has_table_privilege('authenticated', 'public.student_title_reward_claims', 'INSERT')
       OR has_table_privilege('authenticated', 'public.student_title_reward_claims', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.student_title_reward_claims', 'DELETE') THEN
        RAISE EXCEPTION '칭호 단계 보상 RPC 또는 원장 권한이 안전하지 않습니다.';
    END IF;
END;
$$;

SELECT set_config('test.title_reward_student_id', candidate.id::TEXT, true),
       set_config('test.title_reward_student_auth_id', candidate.auth_id::TEXT, true),
       set_config('test.title_reward_class_id', candidate.class_id::TEXT, true),
       set_config('test.title_reward_season_id', candidate.season_id::TEXT, true)
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
    IF current_setting('test.title_reward_student_id', true) IS NULL THEN
        RAISE EXCEPTION '칭호 단계 보상 스모크에 사용할 활성 학생·시즌이 없습니다.';
    END IF;

    INSERT INTO public.title_reward_rollout_classes(class_id, enabled, enabled_at, updated_at)
    VALUES (current_setting('test.title_reward_class_id')::UUID, true, NOW(), NOW())
    ON CONFLICT (class_id) DO UPDATE SET enabled = true, updated_at = NOW();

    DELETE FROM public.student_title_reward_claims
    WHERE season_id = current_setting('test.title_reward_season_id')::UUID
      AND student_id = current_setting('test.title_reward_student_id')::UUID;
    DELETE FROM public.point_logs
    WHERE student_id = current_setting('test.title_reward_student_id')::UUID
      AND event_key LIKE 'title-reward:' || current_setting('test.title_reward_season_id') || ':%';
END;
$$;

-- 실제 운영 글을 만들지 않고 수령 계약만 검사하도록 이 롤백 트랜잭션 안에서 원자료를 고정한다.
CREATE OR REPLACE FUNCTION public.get_my_title_progress_v1()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'writer_total_chars', 0,
        'writer_completed_posts', 0,
        'writer_level_override', NULL,
        'reader_score', 0,
        'reader_post_count', 0,
        'reader_level_override', NULL,
        'diary_days', 14,
        'reading_log_count', 5,
        'reading_book_count', 4,
        'season', jsonb_build_object(
            'id', current_setting('test.title_reward_season_id')::UUID,
            'status', 'active'
        )
    );
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.title_reward_student_auth_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.title_reward_student_auth_id'), 'role', 'authenticated'
)::TEXT, true);

DO $$
DECLARE
    v_before INTEGER;
    v_first JSONB;
    v_duplicate JSONB;
    v_diary_rest JSONB;
    v_reading JSONB;
BEGIN
    SELECT total_points INTO v_before
    FROM public.students WHERE id = current_setting('test.title_reward_student_id')::UUID;

    v_first := public.claim_my_title_rewards_v1('diary', ARRAY[2]::SMALLINT[]);
    v_duplicate := public.claim_my_title_rewards_v1('diary', ARRAY[2]::SMALLINT[]);
    v_diary_rest := public.claim_my_title_rewards_v1('diary', NULL);
    v_reading := public.claim_my_title_rewards_v1('reading', NULL);

    IF (v_first ->> 'claimed_points')::INTEGER <> 200
       OR (v_duplicate ->> 'claimed_points')::INTEGER <> 0
       OR (v_diary_rest ->> 'claimed_points')::INTEGER <> 1000
       OR (v_reading ->> 'claimed_points')::INTEGER <> 600
       OR (v_reading ->> 'total_points')::INTEGER <> v_before + 1800 THEN
        RAISE EXCEPTION '단계별·모두 받기·중복 수령 결과가 올바르지 않습니다: %, %, %, %',
            v_first, v_duplicate, v_diary_rest, v_reading;
    END IF;

    BEGIN
        PERFORM public.claim_my_title_rewards_v1('diary', ARRAY[7]::SMALLINT[]);
        RAISE EXCEPTION '미달 단계 보상을 받았습니다.';
    EXCEPTION WHEN invalid_parameter_value THEN
        NULL;
    END;
END;
$$;

RESET ROLE;

DO $$
DECLARE
    v_claim_count INTEGER;
    v_log_count INTEGER;
BEGIN
    SELECT count(*) INTO v_claim_count
    FROM public.student_title_reward_claims claim
    WHERE claim.season_id = current_setting('test.title_reward_season_id')::UUID
      AND claim.student_id = current_setting('test.title_reward_student_id')::UUID;
    SELECT count(*) INTO v_log_count
    FROM public.point_logs point_log
    WHERE point_log.student_id = current_setting('test.title_reward_student_id')::UUID
      AND point_log.activity_type = 'title_reward'
      AND point_log.event_key LIKE 'title-reward:' || current_setting('test.title_reward_season_id') || ':%';
    IF v_claim_count <> 5 OR v_log_count <> 5 THEN
        RAISE EXCEPTION '수령 원장과 포인트 원장이 일치하지 않습니다: claims %, logs %', v_claim_count, v_log_count;
    END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', gen_random_uuid()::TEXT, true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('request.jwt.claim.sub'), 'role', 'authenticated'
)::TEXT, true);
DO $$
BEGIN
    BEGIN
        PERFORM public.claim_my_title_rewards_v1('diary', NULL);
        RAISE EXCEPTION '학생 연결이 없는 사용자가 칭호 보상을 받았습니다.';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;
END;
$$;
RESET ROLE;
