-- 수호룡의 인형뽑기 서버 스모크 (전부 롤백된다).
-- ① 표·서버 전용 함수는 브라우저 역할에 닫혀 있다 ② 교사 저장: 합 100%만, 먼저 저장된 값은 덮어쓰지 않음
-- ③ 퀴즈: 순서대로 한 번씩, 목표를 넘으면 코인 1개(하루 기회 수까지) ④ 코인 넣기 → 한 판 → 포인트·아이템·선물 지급과 알림
-- ⑤ 줄 수 없는 아이템(전설)은 10P 로 ⑥ 하루 기회를 다 쓰고 하나도 못 뽑으면 최소 포인트(하루 한 번)
-- ⑦ 학급에서 끄면 코인을 못 넣는다 ⑧ 교사 뽑기 내역

DO $$
DECLARE
    v_class UUID;
    v_teacher UUID;
    v_a UUID;
    v_a_auth UUID;
    v_b UUID;
    v_b_auth UUID;
BEGIN
    SELECT class.id, class.teacher_id INTO v_class, v_teacher
    FROM public.classes class
    JOIN public.profiles profile ON profile.id = class.teacher_id AND profile.role = 'TEACHER' AND profile.is_approved IS TRUE
         AND profile.approval_revoked_at IS NULL
    WHERE class.deleted_at IS NULL
      AND (SELECT COUNT(*) FROM public.students student
           WHERE student.class_id = class.id AND student.auth_id IS NOT NULL
             AND student.is_active IS DISTINCT FROM false AND student.deleted_at IS NULL) >= 3
    ORDER BY class.created_at DESC
    LIMIT 1;
    IF v_class IS NULL THEN
        RAISE EXCEPTION '검증할 학급(학생 3명 이상)이 없습니다.';
    END IF;
    SELECT id, auth_id INTO v_a, v_a_auth FROM public.students
    WHERE class_id = v_class AND auth_id IS NOT NULL AND is_active IS DISTINCT FROM false AND deleted_at IS NULL
    ORDER BY id LIMIT 1;
    SELECT id, auth_id INTO v_b, v_b_auth FROM public.students
    WHERE class_id = v_class AND auth_id IS NOT NULL AND is_active IS DISTINCT FROM false AND deleted_at IS NULL
    ORDER BY id OFFSET 1 LIMIT 1;
    PERFORM set_config('test.sc_class', v_class::TEXT, true);
    PERFORM set_config('test.sc_teacher', v_teacher::TEXT, true);
    PERFORM set_config('test.sc_a', v_a::TEXT, true);
    PERFORM set_config('test.sc_a_auth', v_a_auth::TEXT, true);
    PERFORM set_config('test.sc_b', v_b::TEXT, true);
    PERFORM set_config('test.sc_b_auth', v_b_auth::TEXT, true);

    -- 학급에서 켠다(트랜잭션 안에서만).
    UPDATE public.classes SET enabled_modules = array_append(COALESCE(enabled_modules, ARRAY[]::TEXT[]), 'spelling-claw')
    WHERE id = v_class AND NOT ('spelling-claw' = ANY(COALESCE(enabled_modules, ARRAY[]::TEXT[])));
    -- 오늘 기록이 있으면 결과가 섞이므로 지운다(롤백된다).
    DELETE FROM public.spelling_claw_plays WHERE student_id IN (v_a, v_b);
    DELETE FROM public.spelling_claw_quiz_attempts WHERE student_id IN (v_a, v_b);

    -- ① 권한
    IF has_table_privilege('authenticated', 'public.spelling_claw_quiz_attempts', 'SELECT')
       OR has_table_privilege('authenticated', 'public.spelling_claw_plays', 'SELECT')
       OR has_table_privilege('authenticated', 'public.spelling_claw_class_settings', 'SELECT')
       OR has_table_privilege('anon', 'public.spelling_claw_plays', 'INSERT') THEN
        RAISE EXCEPTION '인형뽑기 표가 브라우저 역할에 열려 있습니다.';
    END IF;
    IF has_function_privilege('authenticated', 'public.spelling_claw_finish_play_v1(uuid,uuid,jsonb,jsonb,integer,integer,smallint,smallint,boolean)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.spelling_claw_answer_v1(uuid,uuid,integer,text,boolean,smallint)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.spelling_claw_issue_quiz_v1(uuid,jsonb,smallint)', 'EXECUTE') THEN
        RAISE EXCEPTION '서버 전용 함수를 브라우저가 부를 수 있습니다.';
    END IF;
    IF has_function_privilege('anon', 'public.get_my_spelling_claw_context_v1()', 'EXECUTE')
       OR has_function_privilege('anon', 'public.save_teacher_spelling_claw_settings_v1(uuid,jsonb,jsonb,timestamptz)', 'EXECUTE') THEN
        RAISE EXCEPTION '로그인하지 않은 사용자가 인형뽑기 함수를 부를 수 있습니다.';
    END IF;
END;
$$;

-- ② 교사 저장
DO $$
DECLARE
    v_saved JSONB;
    v_prize JSONB := '{"points":[{"id":"p10","points":10,"percent":94}],"gifts":[{"id":"seat","name":"자리 고르기권","percent":1}],"decor":{"starter":3,"common":1.5,"rare":0.4,"hero":0.1}}';
BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', current_setting('test.sc_teacher'), 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('role', 'authenticated', true);
    BEGIN
        PERFORM public.save_teacher_spelling_claw_settings_v1(
            current_setting('test.sc_class')::UUID, '{"passCount":7}'::JSONB,
            '{"points":[{"points":10,"percent":50}],"gifts":[],"decor":{}}'::JSONB, NULL);
        RAISE EXCEPTION '합이 100%%가 아닌 상품 설정이 저장됐습니다.';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
    -- 지난 설정이 있으면 그 시각으로 덮어쓴다.
    v_saved := public.get_teacher_spelling_claw_settings_v1(current_setting('test.sc_class')::UUID);
    v_saved := public.save_teacher_spelling_claw_settings_v1(
        current_setting('test.sc_class')::UUID,
        '{"passCount":7,"dailyPlays":3,"quizLevel":"normal","minPoints":20,"grip":"easy","announceGifts":true}'::JSONB,
        v_prize, NULLIF(v_saved ->> 'updated_at', '')::TIMESTAMPTZ);
    IF NOT (v_saved ->> 'saved')::BOOLEAN THEN
        RAISE EXCEPTION '교사 설정이 저장되지 않았습니다.';
    END IF;
    BEGIN
        PERFORM public.save_teacher_spelling_claw_settings_v1(
            current_setting('test.sc_class')::UUID, '{}'::JSONB, v_prize, '2000-01-01'::TIMESTAMPTZ);
        RAISE EXCEPTION '먼저 저장된 설정을 덮어썼습니다.';
    EXCEPTION WHEN serialization_failure THEN NULL;
    END;
    RESET ROLE;

    -- 다른 교사는 못 읽는다.
    PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('role', 'authenticated', true);
    BEGIN
        PERFORM public.get_teacher_spelling_claw_settings_v1(current_setting('test.sc_class')::UUID);
        RAISE EXCEPTION '다른 사람이 학급 설정을 읽었습니다.';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RESET ROLE;
END;
$$;

-- ③ 퀴즈와 코인
DO $$
DECLARE
    v_questions JSONB := (SELECT jsonb_agg(jsonb_build_object('id', 'q' || n, 'answer', '정답')) FROM generate_series(1, 10) n);
    v_attempt UUID;
    v_result JSONB;
    v_context JSONB;
    n INTEGER;
BEGIN
    v_attempt := public.spelling_claw_issue_quiz_v1(current_setting('test.sc_a')::UUID, v_questions, 7::SMALLINT);
    FOR n IN 0..9 LOOP
        v_result := public.spelling_claw_answer_v1(v_attempt, current_setting('test.sc_a')::UUID, n, '답', n < 7, 3::SMALLINT);
    END LOOP;
    IF NOT (v_result ->> 'finished')::BOOLEAN OR NOT (v_result ->> 'passed')::BOOLEAN OR NOT (v_result ->> 'coin_granted')::BOOLEAN THEN
        RAISE EXCEPTION '7/10 을 맞혔는데 코인을 못 받았습니다: %', v_result;
    END IF;
    v_result := public.spelling_claw_answer_v1(v_attempt, current_setting('test.sc_a')::UUID, 3, '다른 답', false, 3::SMALLINT);
    IF NOT (v_result ->> 'repeat')::BOOLEAN OR NOT (v_result ->> 'correct')::BOOLEAN THEN
        RAISE EXCEPTION '이미 낸 답을 다시 채점했습니다: %', v_result;
    END IF;

    -- 6/10 은 목표 미달 — 코인 없음. 순서를 건너뛰면 막힌다.
    v_attempt := public.spelling_claw_issue_quiz_v1(current_setting('test.sc_a')::UUID, v_questions, 7::SMALLINT);
    BEGIN
        PERFORM public.spelling_claw_answer_v1(v_attempt, current_setting('test.sc_a')::UUID, 2, '답', true, 3::SMALLINT);
        RAISE EXCEPTION '순서를 건너뛴 답을 받았습니다.';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
    FOR n IN 0..9 LOOP
        v_result := public.spelling_claw_answer_v1(v_attempt, current_setting('test.sc_a')::UUID, n, '답', n < 6, 3::SMALLINT);
    END LOOP;
    IF (v_result ->> 'passed')::BOOLEAN OR (v_result ->> 'coin_granted')::BOOLEAN THEN
        RAISE EXCEPTION '6/10 인데 코인을 받았습니다.';
    END IF;

    -- 코인 두 개 더(하루 3개, 만점이 아닌 9/10) → 네 번째 통과는 코인 없음.
    FOR n IN 1..3 LOOP
        v_attempt := public.spelling_claw_issue_quiz_v1(current_setting('test.sc_a')::UUID, v_questions, 7::SMALLINT);
        FOR n2 IN 0..9 LOOP
            v_result := public.spelling_claw_answer_v1(v_attempt, current_setting('test.sc_a')::UUID, n2, '답', n2 < 9, 3::SMALLINT);
        END LOOP;
    END LOOP;
    IF (v_result ->> 'coin_granted')::BOOLEAN OR (v_result ->> 'coins_earned')::INTEGER <> 3 THEN
        RAISE EXCEPTION '하루 기회 수(3)를 넘겨 코인을 줬습니다: %', v_result;
    END IF;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', current_setting('test.sc_a_auth'), 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('role', 'authenticated', true);
    v_context := public.get_my_spelling_claw_context_v1();
    RESET ROLE;
    IF NOT (v_context ->> 'enabled')::BOOLEAN OR (v_context -> 'today' ->> 'coins_left')::INTEGER <> 3
       OR jsonb_array_length(v_context -> 'catalog') = 0 OR (v_context -> 'settings' ->> 'passCount')::INTEGER <> 7 THEN
        RAISE EXCEPTION '학생 오늘 상태가 맞지 않습니다: %', v_context - 'catalog';
    END IF;
END;
$$;

-- ④⑤ 코인 넣기 → 지급
DO $$
DECLARE
    v_play UUID;
    v_result JSONB;
    v_item TEXT;
    v_points_before INTEGER;
    v_points_after INTEGER;
    v_classmates INTEGER;
BEGIN
    SELECT item.id INTO v_item FROM public.dragon_decor_catalog item
    JOIN public.students student ON student.id = current_setting('test.sc_a')::UUID
    WHERE item.is_active AND item.acquisition_type = 'shop' AND NOT item.is_default AND item.price > 0
      AND item.rarity = 'starter' AND item.required_writer_level <= 1 AND item.required_reader_level <= 1
      AND NOT (COALESCE(student.pet_data -> 'ownedDecorItems', '[]'::JSONB) ? item.id)
      AND NOT (COALESCE(student.pet_data -> 'ownedItems', '[]'::JSONB) ? item.id)
    ORDER BY item.id LIMIT 1;
    SELECT COALESCE(total_points, 0) INTO v_points_before FROM public.students WHERE id = current_setting('test.sc_a')::UUID;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', current_setting('test.sc_a_auth'), 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('role', 'authenticated', true);
    v_play := (public.start_my_spelling_claw_play_v1() ->> 'play_id')::UUID;
    -- 끝내지 않고 다시 넣으면 같은 판을 이어 한다(코인이 사라지지 않는다).
    IF (public.start_my_spelling_claw_play_v1() ->> 'play_id')::UUID IS DISTINCT FROM v_play THEN
        RAISE EXCEPTION '끝내지 않은 판을 두고 새 코인을 썼습니다.';
    END IF;
    RESET ROLE;

    v_result := public.spelling_claw_finish_play_v1(
        v_play, current_setting('test.sc_a')::UUID, '["shiba","cat"]'::JSONB,
        jsonb_build_array(
            jsonb_build_object('kind', 'points', 'points', 30, 'plush_id', 'shiba', 'plush_name', '시바견'),
            jsonb_build_object('kind', 'decor', 'item_id', v_item, 'plush_id', 'cat', 'plush_name', '고양이')
        ),
        1, 1, 3::SMALLINT, 20::SMALLINT, true);
    SELECT COALESCE(total_points, 0) INTO v_points_after FROM public.students WHERE id = current_setting('test.sc_a')::UUID;
    IF v_points_after - v_points_before <> 30 THEN
        RAISE EXCEPTION '포인트 30P 가 지급되지 않았습니다(% → %).', v_points_before, v_points_after;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.point_logs WHERE student_id = current_setting('test.sc_a')::UUID
                   AND activity_type = 'spelling_claw' AND event_key = format('spelling-claw:%s:1', v_play)) THEN
        RAISE EXCEPTION '인형뽑기 포인트 기록이 없습니다.';
    END IF;
    IF v_item IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.students WHERE id = current_setting('test.sc_a')::UUID
                   AND pet_data -> 'ownedDecorItems' ? v_item) THEN
        RAISE EXCEPTION '수호룡 아이템이 지급되지 않았습니다: %', v_item;
    END IF;
    IF (SELECT COUNT(*) FROM public.student_notification_events
        WHERE student_id = current_setting('test.sc_a')::UUID AND event_type = 'spelling-claw.prize_awarded'
          AND entity_id = v_play) <> 2 THEN
        RAISE EXCEPTION '본인 상품 알림이 두 건이 아닙니다.';
    END IF;
    -- 같은 판을 다시 보내면 처음 결과 그대로(두 번 주지 않는다).
    v_result := public.spelling_claw_finish_play_v1(v_play, current_setting('test.sc_a')::UUID, '[]'::JSONB, '[]'::JSONB,
        1, 1, 3::SMALLINT, 20::SMALLINT, true);
    IF NOT (v_result ->> 'repeat')::BOOLEAN OR jsonb_array_length(v_result -> 'prizes') <> 2 THEN
        RAISE EXCEPTION '끝난 판을 다시 처리했습니다: %', v_result;
    END IF;

    -- 선물 + 줄 수 없는 전설 아이템.
    PERFORM set_config('request.jwt.claims', json_build_object('sub', current_setting('test.sc_a_auth'), 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('role', 'authenticated', true);
    v_play := (public.start_my_spelling_claw_play_v1() ->> 'play_id')::UUID;
    RESET ROLE;
    v_result := public.spelling_claw_finish_play_v1(
        v_play, current_setting('test.sc_a')::UUID, '["panda","rabbit"]'::JSONB,
        jsonb_build_array(
            jsonb_build_object('kind', 'gift', 'gift_id', 'seat', 'gift_name', '자리 고르기권', 'plush_id', 'panda', 'plush_name', '판다'),
            jsonb_build_object('kind', 'decor', 'item_id', (SELECT id FROM public.dragon_decor_catalog WHERE rarity = 'legendary' LIMIT 1),
                               'plush_id', 'rabbit', 'plush_name', '토끼')
        ),
        1, 1, 3::SMALLINT, 20::SMALLINT, true);
    IF v_result -> 'prizes' -> 1 ->> 'kind' <> 'points' OR (v_result -> 'prizes' -> 1 ->> 'points')::INTEGER <> 10 THEN
        RAISE EXCEPTION '전설 아이템이 10P 로 바뀌지 않았습니다: %', v_result;
    END IF;
    SELECT COUNT(*) INTO v_classmates FROM public.students
    WHERE class_id = current_setting('test.sc_class')::UUID AND id <> current_setting('test.sc_a')::UUID
      AND is_active IS DISTINCT FROM false AND (deleted_at IS NULL OR deleted_at > NOW());
    IF (SELECT COUNT(*) FROM public.student_notification_events
        WHERE event_type = 'spelling-claw.class_gift_won' AND entity_id = v_play) <> LEAST(v_classmates, 100) THEN
        RAISE EXCEPTION '반 친구 선물 알림 수가 맞지 않습니다.';
    END IF;
END;
$$;

-- ⑥ 최소 포인트 — 학생 B: 기회 1번(교사가 1번으로 정했다고 보고)을 쓰고 못 뽑음
DO $$
DECLARE
    v_questions JSONB := (SELECT jsonb_agg(jsonb_build_object('id', 'q' || n, 'answer', '정답')) FROM generate_series(1, 10) n);
    v_attempt UUID;
    v_play UUID;
    v_result JSONB;
    n INTEGER;
BEGIN
    v_attempt := public.spelling_claw_issue_quiz_v1(current_setting('test.sc_b')::UUID, v_questions, 7::SMALLINT);
    FOR n IN 0..9 LOOP
        PERFORM public.spelling_claw_answer_v1(v_attempt, current_setting('test.sc_b')::UUID, n, '답', n < 9, 1::SMALLINT);
    END LOOP;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', current_setting('test.sc_b_auth'), 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('role', 'authenticated', true);
    v_play := (public.start_my_spelling_claw_play_v1() ->> 'play_id')::UUID;
    RESET ROLE;
    v_result := public.spelling_claw_finish_play_v1(v_play, current_setting('test.sc_b')::UUID, '[]'::JSONB, '[]'::JSONB,
        1, 1, 1::SMALLINT, 20::SMALLINT, true);
    IF (v_result ->> 'consolation_points')::INTEGER <> 20 THEN
        RAISE EXCEPTION '기회를 다 쓰고 못 뽑았는데 최소 포인트가 없습니다: %', v_result;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.student_notification_events
                   WHERE student_id = current_setting('test.sc_b')::UUID AND event_type = 'spelling-claw.consolation_awarded') THEN
        RAISE EXCEPTION '최소 포인트 알림이 없습니다.';
    END IF;

    -- ⑦ 학급에서 끄면 코인을 못 넣는다.
    UPDATE public.classes SET enabled_modules = array_remove(enabled_modules, 'spelling-claw')
    WHERE id = current_setting('test.sc_class')::UUID;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', current_setting('test.sc_a_auth'), 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('role', 'authenticated', true);
    BEGIN
        PERFORM public.start_my_spelling_claw_play_v1();
        RAISE EXCEPTION '꺼진 학급에서 코인을 넣었습니다.';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    IF (public.get_my_spelling_claw_context_v1() ->> 'enabled')::BOOLEAN THEN
        RAISE EXCEPTION '꺼진 학급인데 켜짐으로 보입니다.';
    END IF;
    RESET ROLE;

    -- ⑧ 교사 뽑기 내역
    PERFORM set_config('request.jwt.claims', json_build_object('sub', current_setting('test.sc_teacher'), 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('role', 'authenticated', true);
    v_result := public.get_teacher_spelling_claw_history_v1(current_setting('test.sc_class')::UUID, 100);
    RESET ROLE;
    IF jsonb_array_length(v_result -> 'rows') < 3 OR (v_result -> 'today' ->> 'gifts')::INTEGER < 1 THEN
        RAISE EXCEPTION '교사 뽑기 내역이 맞지 않습니다: %', v_result;
    END IF;
END;
$$;
