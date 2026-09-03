-- run-rollback-smoke가 만든 바깥 트랜잭션 안에서 실행되고 마지막에 모두 롤백된다.
-- 반복 보너스의 계산 공식·기존 호환·제출 스냅샷 경계를 실제 스키마에서 확인한다.

DO $$
DECLARE
    v_guard_trigger TEXT;
    v_snapshot_trigger TEXT := 'trg_snapshot_student_post_repeat_bonus_v1';
    v_definition TEXT;
BEGIN
    -- 기존 설정·기존 글은 반복 보너스 OFF로 그대로 동작해야 한다.
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('writing_missions', 'class_writing_policies')
          AND column_name = 'repeat_bonus_enabled'
          AND (is_nullable <> 'NO' OR column_default NOT LIKE '%false%')
    ) THEN
        RAISE EXCEPTION '반복 보너스 스위치의 기본값이 꺼짐이 아닙니다(기존 설정 호환이 깨집니다).';
    END IF;

    IF (
        SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'student_posts'
          AND column_name IN ('awarded_min_chars', 'awarded_repeat_bonus_enabled',
                              'awarded_repeat_bonus_threshold', 'awarded_repeat_bonus_reward',
                              'awarded_repeat_bonus_max_count')
    ) <> 5 THEN
        RAISE EXCEPTION '제출 스냅샷 다섯 열이 모두 있지 않습니다.';
    END IF;

    -- 최소 글자 수도 스냅샷을 우선해야 반복 구간 시작점이 제출 뒤에 흔들리지 않는다.
    FOR v_definition IN
        SELECT pg_get_functiondef(p.oid)
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('approve_assignment_post', 'award_self_writing_review_points_v1',
                            'emit_assignment_status_notification_v1')
    LOOP
        IF v_definition NOT LIKE '%awarded_min_chars%' THEN
            RAISE EXCEPTION '지급 경로 하나가 최소 글자 수 스냅샷을 쓰지 않습니다.';
        END IF;
    END LOOP;

    -- 지급 계산 함수는 브라우저 역할에 열지 않는다.
    IF has_function_privilege('anon',
        'public.calculate_writing_reward_total_v1(integer,integer,integer,integer,integer,boolean,integer,integer,integer)', 'EXECUTE')
       OR has_function_privilege('authenticated',
        'public.calculate_writing_reward_total_v1(integer,integer,integer,integer,integer,boolean,integer,integer,integer)', 'EXECUTE') THEN
        RAISE EXCEPTION '보상 계산 함수가 브라우저 역할에 열려 있습니다.';
    END IF;

    -- 세 지급 경로가 모두 같은 계산을 쓴다. 한 곳이라도 자기 식을 쓰면 금액이 갈린다.
    FOR v_definition IN
        SELECT pg_get_functiondef(p.oid)
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('approve_assignment_post', 'award_self_writing_review_points_v1',
                            'emit_assignment_status_notification_v1')
    LOOP
        IF v_definition NOT LIKE '%calculate_writing_reward_total_v1%' THEN
            RAISE EXCEPTION '지급 경로 하나가 공용 보상 계산을 쓰지 않습니다.';
        END IF;
    END LOOP;

    -- 자율 글 지급은 제출 스냅샷만 읽는다. 학급 설정을 다시 읽으면 제출 뒤 변경이 새어 든다.
    SELECT pg_get_functiondef('public.award_self_writing_review_points_v1(uuid)'::regprocedure)
    INTO v_definition;
    IF v_definition NOT LIKE '%awarded_repeat_bonus_threshold%' THEN
        RAISE EXCEPTION '자율 글 지급이 제출 스냅샷을 읽지 않습니다.';
    END IF;

    -- ⚠️ 두 BEFORE 트리거는 이름 알파벳 순서로 돈다. 가드가 스냅샷보다 뒤에 돌면
    --    학생 제출 때 방금 찍은 스냅샷을 NULL로 지워 버린다. 이름이 바뀌면 여기서 잡는다.
    SELECT t.tgname INTO v_guard_trigger
    FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = 'public.student_posts'::regclass
      AND NOT t.tgisinternal
      AND p.proname = 'guard_student_post_server_columns';
    IF v_guard_trigger IS NULL THEN
        RAISE EXCEPTION '학생 쓰기 가드 트리거를 찾지 못했습니다.';
    END IF;
    IF NOT (v_guard_trigger < v_snapshot_trigger) THEN
        RAISE EXCEPTION '가드 트리거(%)가 스냅샷 트리거(%)보다 뒤에 돌아 스냅샷이 지워집니다.',
            v_guard_trigger, v_snapshot_trigger;
    END IF;
END;
$$;

-- 계산 공식. 교사에게 안내한 예시 표를 그대로 확인한다.
-- 최소 300자 · 기본 100P · 추가 200자에 +30P · 그 뒤 200자마다 +10P · 최대 3회
DO $$
DECLARE
    v_cases INTEGER[][] := ARRAY[
        ARRAY[299, 0],   -- 최소 글자 미달이어도 계산 자체는 기본 보상만
        ARRAY[300, 100],
        ARRAY[499, 100],
        ARRAY[500, 130],
        ARRAY[699, 130],
        ARRAY[700, 140],
        ARRAY[900, 150],
        ARRAY[1100, 160],
        ARRAY[1300, 160], -- 최대 3회에서 멈춘다
        ARRAY[5000, 160]
    ];
    v_index INTEGER;
    v_chars INTEGER;
    v_expected INTEGER;
    v_actual INTEGER;
BEGIN
    FOR v_index IN 1..array_length(v_cases, 1) LOOP
        v_chars := v_cases[v_index][1];
        v_expected := v_cases[v_index][2];
        v_actual := public.calculate_writing_reward_total_v1(100, 300, v_chars, 200, 30, TRUE, 200, 10, 3);
        -- 최소 글자 미달은 지급 판정 단계에서 막고, 계산은 기본 보상만 돌려준다.
        IF v_chars < 300 THEN v_expected := 100; END IF;
        IF v_actual <> v_expected THEN
            RAISE EXCEPTION '반복 보너스 계산이 예시와 다릅니다: %자 → %P (기대 %P)',
                v_chars, v_actual, v_expected;
        END IF;
    END LOOP;

    -- 반복 보너스를 끄면 지금과 완전히 같다.
    IF public.calculate_writing_reward_total_v1(100, 300, 5000, 200, 30, FALSE, 200, 10, 3) <> 130 THEN
        RAISE EXCEPTION '반복 보너스를 꺼도 금액이 달라집니다(기존 동작 호환이 깨집니다).';
    END IF;

    -- 현행 추가 보너스가 없으면 반복 구간은 최소 글자 수부터 센다.
    IF public.calculate_writing_reward_total_v1(100, 300, 700, 0, 0, TRUE, 200, 10, 3) <> 120 THEN
        RAISE EXCEPTION '추가 보너스가 없을 때 반복 구간 시작점이 최소 글자 수가 아닙니다.';
    END IF;

    -- 값이 하나라도 비어 있으면 반복 보너스는 계산하지 않는다.
    IF public.calculate_writing_reward_total_v1(100, 300, 5000, 200, 30, TRUE, 0, 10, 3) <> 130
       OR public.calculate_writing_reward_total_v1(100, 300, 5000, 200, 30, TRUE, 200, 0, 3) <> 130
       OR public.calculate_writing_reward_total_v1(100, 300, 5000, 200, 30, TRUE, 200, 10, 0) <> 130 THEN
        RAISE EXCEPTION '반복 보너스 설정이 비었는데도 금액이 붙었습니다.';
    END IF;

    -- 최대 횟수는 서버가 20회로 묶는다.
    IF public.calculate_writing_reward_total_v1(0, 0, 1000000, 0, 0, TRUE, 100, 1, 999) <> 20 THEN
        RAISE EXCEPTION '반복 횟수 상한 20회가 서버에서 강제되지 않습니다.';
    END IF;
END;
$$;

-- 제출 스냅샷: 제출 뒤 교사가 설정을 바꿔도 그 글의 지급 기준은 그대로여야 한다.
-- 운영 데이터에 제출된 과제 글이 있을 때만 확인한다(빈 DB에서는 위 계약 검사만 한다).
DO $$
DECLARE
    v_post RECORD;
    v_before INTEGER;
    v_after INTEGER;
BEGIN
    SELECT post.id, post.mission_id, post.class_id, post.char_count
    INTO v_post
    FROM public.student_posts post
    JOIN public.writing_missions mission
      ON mission.id = post.mission_id AND mission.class_id = post.class_id
    WHERE post.writing_context = 'assignment'
      AND post.is_submitted IS TRUE
      AND post.awarded_repeat_bonus_enabled IS NOT NULL
    ORDER BY post.created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE NOTICE '제출 스냅샷이 찍힌 과제 글이 아직 없어 데이터 확인은 건너뜁니다.';
        RETURN;
    END IF;

    SELECT public.calculate_writing_reward_total_v1(
        COALESCE(post.awarded_base_reward, mission.base_reward, 0),
        COALESCE(post.awarded_min_chars, mission.min_chars, 0), post.char_count,
        COALESCE(post.awarded_bonus_threshold, mission.bonus_threshold, 0),
        COALESCE(post.awarded_bonus_reward, mission.bonus_reward, 0),
        COALESCE(post.awarded_repeat_bonus_enabled, mission.repeat_bonus_enabled, FALSE),
        COALESCE(post.awarded_repeat_bonus_threshold, mission.repeat_bonus_threshold, 0),
        COALESCE(post.awarded_repeat_bonus_reward, mission.repeat_bonus_reward, 0),
        COALESCE(post.awarded_repeat_bonus_max_count, mission.repeat_bonus_max_count, 0))
    INTO v_before
    FROM public.student_posts post
    JOIN public.writing_missions mission ON mission.id = post.mission_id
    WHERE post.id = v_post.id;

    -- 교사가 제출 뒤에 반복 보너스를 크게 켜고 최소 글자 수까지 낮춰 본다.
    UPDATE public.writing_missions
    SET repeat_bonus_enabled = TRUE, repeat_bonus_threshold = 1,
        repeat_bonus_reward = 1000, repeat_bonus_max_count = 20, min_chars = 0
    WHERE id = v_post.mission_id;

    SELECT public.calculate_writing_reward_total_v1(
        COALESCE(post.awarded_base_reward, mission.base_reward, 0),
        COALESCE(post.awarded_min_chars, mission.min_chars, 0), post.char_count,
        COALESCE(post.awarded_bonus_threshold, mission.bonus_threshold, 0),
        COALESCE(post.awarded_bonus_reward, mission.bonus_reward, 0),
        COALESCE(post.awarded_repeat_bonus_enabled, mission.repeat_bonus_enabled, FALSE),
        COALESCE(post.awarded_repeat_bonus_threshold, mission.repeat_bonus_threshold, 0),
        COALESCE(post.awarded_repeat_bonus_reward, mission.repeat_bonus_reward, 0),
        COALESCE(post.awarded_repeat_bonus_max_count, mission.repeat_bonus_max_count, 0))
    INTO v_after
    FROM public.student_posts post
    JOIN public.writing_missions mission ON mission.id = post.mission_id
    WHERE post.id = v_post.id;

    IF v_after <> v_before THEN
        RAISE EXCEPTION '제출 뒤 과제 설정을 바꾸자 이미 낸 글의 지급액이 %P에서 %P로 달라졌습니다.',
            v_before, v_after;
    END IF;
END;
$$;
