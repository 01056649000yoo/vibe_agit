-- 어휘의 탑 코인 스모크(전부 롤백): 70% 미만·8문제 미만·중도 종료는 지급 없음, 조건을 채우면 1개, 하루 3개 한도,
-- 같은 판 중복 없음, 인형뽑기 꺼진 학급은 지급 없음, 코인으로 한 판 시작(남은 수 감소), 맞춤법 코인이 있으면 그것을 먼저 쓴다.
DO $$
DECLARE
    v_class UUID; v_student UUID; v_auth UUID; v_run UUID; v_n INTEGER; v_res JSONB; v_i INTEGER;
BEGIN
    SELECT class.id INTO v_class FROM public.classes class
    WHERE class.deleted_at IS NULL
      AND (SELECT COUNT(*) FROM public.students s WHERE s.class_id = class.id AND s.auth_id IS NOT NULL
           AND s.is_active IS DISTINCT FROM false AND s.deleted_at IS NULL) >= 1
    ORDER BY class.created_at DESC LIMIT 1;
    SELECT id, auth_id INTO v_student, v_auth FROM public.students
    WHERE class_id = v_class AND auth_id IS NOT NULL AND is_active IS DISTINCT FROM false AND deleted_at IS NULL ORDER BY id LIMIT 1;
    IF v_student IS NULL THEN RAISE EXCEPTION '검증할 학생이 없습니다.'; END IF;
    UPDATE public.classes SET enabled_modules = array_append(COALESCE(enabled_modules, ARRAY[]::TEXT[]), 'spelling-claw')
    WHERE id = v_class AND NOT ('spelling-claw' = ANY(COALESCE(enabled_modules, ARRAY[]::TEXT[])));
    DELETE FROM public.spelling_claw_plays WHERE student_id = v_student;
    DELETE FROM public.vocab_tower_coins WHERE student_id = v_student;
    DELETE FROM public.vocab_tower_runs WHERE student_id = v_student AND status = 'active';

    -- 1) 정답률 60% (10문제 중 6) → 지급 없음
    INSERT INTO public.vocab_tower_runs (student_id, class_id, run_date, grade, daily_limit, floor_time_limit, reward_cap, answer_count, correct_count, wrong_count, content_version, v2_deck_number, target_question_count)
    VALUES (v_student, v_class, CURRENT_DATE, 4, 3, 60, 0, 10, 6, 4, 'v2', 1, 10) RETURNING id INTO v_run;
    UPDATE public.vocab_tower_runs SET status = 'finished', finish_reason = 'completed', finished_at = NOW() WHERE id = v_run;
    IF (SELECT COUNT(*) FROM public.vocab_tower_coins WHERE student_id = v_student) <> 0 THEN RAISE EXCEPTION '60%% 판에 코인이 나갔습니다'; END IF;
    -- 2) 7문제만 푼 판(정답 7) → 지급 없음
    INSERT INTO public.vocab_tower_runs (student_id, class_id, run_date, grade, daily_limit, floor_time_limit, reward_cap, answer_count, correct_count, wrong_count, content_version, v2_deck_number, target_question_count)
    VALUES (v_student, v_class, CURRENT_DATE, 4, 3, 60, 0, 7, 7, 0, 'v2', 1, 10) RETURNING id INTO v_run;
    UPDATE public.vocab_tower_runs SET status = 'finished', finish_reason = 'completed', finished_at = NOW() WHERE id = v_run;
    IF (SELECT COUNT(*) FROM public.vocab_tower_coins WHERE student_id = v_student) <> 0 THEN RAISE EXCEPTION '7문제 판에 코인이 나갔습니다'; END IF;
    -- 3) 70% 이상이어도 중도 종료(exited)는 지급 없음
    INSERT INTO public.vocab_tower_runs (student_id, class_id, run_date, grade, daily_limit, floor_time_limit, reward_cap, answer_count, correct_count, wrong_count, content_version, v2_deck_number, target_question_count)
    VALUES (v_student, v_class, CURRENT_DATE, 4, 3, 60, 0, 10, 9, 1, 'v2', 1, 10) RETURNING id INTO v_run;
    UPDATE public.vocab_tower_runs SET status = 'finished', finish_reason = 'exited', finished_at = NOW() WHERE id = v_run;
    IF (SELECT COUNT(*) FROM public.vocab_tower_coins WHERE student_id = v_student) <> 0 THEN RAISE EXCEPTION '중도 종료 판에 코인이 나갔습니다'; END IF;

    -- 4) 정확히 70%(10문제 중 7) → 1개, 같은 판을 다시 갱신해도 중복 없음, 알림 1건
    INSERT INTO public.vocab_tower_runs (student_id, class_id, run_date, grade, daily_limit, floor_time_limit, reward_cap, answer_count, correct_count, wrong_count, content_version, v2_deck_number, target_question_count)
    VALUES (v_student, v_class, CURRENT_DATE, 4, 3, 60, 0, 10, 7, 3, 'v2', 1, 10) RETURNING id INTO v_run;
    UPDATE public.vocab_tower_runs SET status = 'finished', finish_reason = 'completed', finished_at = NOW() WHERE id = v_run;
    UPDATE public.vocab_tower_runs SET status = 'finished', finished_at = NOW() WHERE id = v_run;
    IF (SELECT COUNT(*) FROM public.vocab_tower_coins WHERE student_id = v_student) <> 1 THEN RAISE EXCEPTION '70%% 판에 코인이 1개가 아닙니다'; END IF;
    IF (SELECT COUNT(*) FROM public.student_notification_events WHERE student_id = v_student AND event_type = 'vocab-tower.coin_awarded') <> 1 THEN
        RAISE EXCEPTION '코인 알림이 1건이 아닙니다';
    END IF;

    -- 5) 하루 3개 한도: 셋을 더 끝내도 총 3개
    FOR v_i IN 1..4 LOOP
        INSERT INTO public.vocab_tower_runs (student_id, class_id, run_date, grade, daily_limit, floor_time_limit, reward_cap, answer_count, correct_count, wrong_count, content_version, v2_deck_number, target_question_count)
        VALUES (v_student, v_class, CURRENT_DATE, 4, 3, 60, 0, 10, 10, 0, 'v2', 1, 10) RETURNING id INTO v_run;
        UPDATE public.vocab_tower_runs SET status = 'finished', finish_reason = 'completed', finished_at = NOW() WHERE id = v_run;
    END LOOP;
    IF (SELECT COUNT(*) FROM public.vocab_tower_coins WHERE student_id = v_student AND earned_on = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::DATE) <> 3 THEN
        RAISE EXCEPTION '하루 3개 한도가 지켜지지 않습니다: %', (SELECT COUNT(*) FROM public.vocab_tower_coins WHERE student_id = v_student);
    END IF;

    -- 6) 학생으로 컨텍스트·코인 넣기
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth, 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('request.jwt.claim.sub', v_auth::TEXT, true);
    v_res := public.get_my_spelling_claw_context_v1();
    IF (v_res -> 'today' ->> 'tower_coins_left')::INTEGER <> 3 OR (v_res -> 'today' ->> 'tower_coins_earned_today')::INTEGER <> 3 THEN
        RAISE EXCEPTION '컨텍스트의 어휘의 탑 코인 수가 틀립니다: %', v_res -> 'today';
    END IF;
    v_res := public.start_my_spelling_claw_play_v1();
    IF v_res ->> 'play_id' IS NULL OR (v_res ->> 'tower_coins_left')::INTEGER <> 2 THEN
        RAISE EXCEPTION '어휘의 탑 코인으로 한 판을 시작하지 못했습니다: %', v_res;
    END IF;
    IF (SELECT COUNT(*) FROM public.spelling_claw_plays WHERE student_id = v_student AND tower_coin_id IS NOT NULL AND status = 'playing') <> 1 THEN
        RAISE EXCEPTION '어휘의 탑 코인 판이 장부에 없습니다';
    END IF;
    -- 이어하기: 이미 하는 판이 있으면 코인을 더 쓰지 않는다
    v_res := public.start_my_spelling_claw_play_v1();
    IF (v_res ->> 'resumed')::BOOLEAN IS NOT TRUE OR (v_res ->> 'tower_coins_left')::INTEGER <> 2 THEN
        RAISE EXCEPTION '진행 중인 판이 이어지지 않습니다: %', v_res;
    END IF;

    -- 7) 인형뽑기가 꺼진 학급에는 지급 없음
    RESET ROLE;
    UPDATE public.classes SET enabled_modules = ARRAY['__configured__', 'vocab-tower'] WHERE id = v_class;
    INSERT INTO public.vocab_tower_runs (student_id, class_id, run_date, grade, daily_limit, floor_time_limit, reward_cap, answer_count, correct_count, wrong_count, content_version, v2_deck_number, target_question_count)
    SELECT v_student, v_class, CURRENT_DATE - 1, 4, 3, 60, 0, 10, 10, 0, 'v2', 1, 10 RETURNING id INTO v_run;
    DELETE FROM public.vocab_tower_coins WHERE student_id = v_student AND status = 'held';
    UPDATE public.vocab_tower_runs SET status = 'finished', finish_reason = 'completed', finished_at = NOW() WHERE id = v_run;
    IF (SELECT COUNT(*) FROM public.vocab_tower_coins WHERE run_id = v_run) <> 0 THEN RAISE EXCEPTION '인형뽑기가 꺼진 학급에 코인이 나갔습니다'; END IF;
END $$;
