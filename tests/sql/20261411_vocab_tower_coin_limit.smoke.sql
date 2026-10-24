-- 어휘의 탑 코인 하루 한도(학급 설정)와 연습 결과 창 값 스모크(전부 롤백).
-- ① 기본 한도 3 ② 한도 2 로 바꾸면 셋째 코인은 없음 ③ 한도 0 이면 코인 없음 ④ 연습 마무리 함수가 코인 여부·오늘 수·한도·까닭을 돌려줌
-- ⑤ 컨텍스트가 학급 한도를 알림 ⑥ 범위 밖 한도는 저장 거절
DO $$
DECLARE
    v_class UUID; v_student UUID; v_auth UUID; v_run UUID; v_res JSONB; v_i INTEGER; v_bad BOOLEAN := false;
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

    -- ① 기본 한도
    IF (SELECT vocab_tower_coin_daily_limit FROM public.classes WHERE id = v_class) <> 3 THEN RAISE EXCEPTION '기본 하루 한도가 3 이 아닙니다'; END IF;

    -- ② 한도 2: 세 판을 끝내도 코인은 2개
    UPDATE public.classes SET vocab_tower_coin_daily_limit = 2 WHERE id = v_class;
    FOR v_i IN 1..3 LOOP
        INSERT INTO public.vocab_tower_runs (student_id, class_id, run_date, grade, daily_limit, floor_time_limit, reward_cap, answer_count, correct_count, wrong_count, content_version, v2_deck_number, target_question_count)
        VALUES (v_student, v_class, CURRENT_DATE, 4, 3, 60, 0, 12, 12, 0, 'v2', 1, 12) RETURNING id INTO v_run;
        UPDATE public.vocab_tower_runs SET status = 'finished', finish_reason = 'completed', finished_at = NOW() WHERE id = v_run;
    END LOOP;
    IF (SELECT COUNT(*) FROM public.vocab_tower_coins WHERE student_id = v_student) <> 2 THEN
        RAISE EXCEPTION '한도 2 가 지켜지지 않습니다: %', (SELECT COUNT(*) FROM public.vocab_tower_coins WHERE student_id = v_student);
    END IF;

    -- ③ 한도 0: 코인 없음
    DELETE FROM public.vocab_tower_coins WHERE student_id = v_student;
    UPDATE public.classes SET vocab_tower_coin_daily_limit = 0 WHERE id = v_class;
    INSERT INTO public.vocab_tower_runs (student_id, class_id, run_date, grade, daily_limit, floor_time_limit, reward_cap, answer_count, correct_count, wrong_count, content_version, v2_deck_number, target_question_count)
    VALUES (v_student, v_class, CURRENT_DATE, 4, 3, 60, 0, 12, 12, 0, 'v2', 1, 12) RETURNING id INTO v_run;
    UPDATE public.vocab_tower_runs SET status = 'finished', finish_reason = 'completed', finished_at = NOW() WHERE id = v_run;
    IF (SELECT COUNT(*) FROM public.vocab_tower_coins WHERE student_id = v_student) <> 0 THEN RAISE EXCEPTION '한도 0 인데 코인이 나갔습니다'; END IF;

    -- ④ 연습 마무리 함수(학생): 한도 3 으로 돌려 놓고 12문항 중 9개 정답으로 마친다
    UPDATE public.classes SET vocab_tower_coin_daily_limit = 3 WHERE id = v_class;
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth, 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('request.jwt.claim.sub', v_auth::TEXT, true);
    INSERT INTO public.vocab_tower_runs (student_id, class_id, run_date, grade, daily_limit, floor_time_limit, reward_cap, answer_count, correct_count, wrong_count, content_version, v2_deck_number, target_question_count)
    VALUES (v_student, v_class, CURRENT_DATE, 4, 3, 60, 0, 12, 9, 3, 'v2', 1, 12) RETURNING id INTO v_run;
    v_res := public.finish_my_vocab_tower_v2_practice_v1(v_run, 'completed');
    IF (v_res ->> 'tower_coin_earned')::BOOLEAN IS NOT TRUE OR v_res ->> 'tower_coin_reason' <> 'earned'
       OR (v_res ->> 'tower_coins_today')::INTEGER <> 1 OR (v_res ->> 'tower_coin_cap')::INTEGER <> 3 THEN
        RAISE EXCEPTION '결과 창 값이 틀립니다(받음): %', v_res;
    END IF;
    -- 60% 판은 까닭 accuracy
    INSERT INTO public.vocab_tower_runs (student_id, class_id, run_date, grade, daily_limit, floor_time_limit, reward_cap, answer_count, correct_count, wrong_count, content_version, v2_deck_number, target_question_count)
    VALUES (v_student, v_class, CURRENT_DATE, 4, 3, 60, 0, 12, 7, 5, 'v2', 1, 12) RETURNING id INTO v_run;
    v_res := public.finish_my_vocab_tower_v2_practice_v1(v_run, 'completed');
    IF (v_res ->> 'tower_coin_earned')::BOOLEAN IS NOT FALSE OR v_res ->> 'tower_coin_reason' <> 'accuracy' THEN
        RAISE EXCEPTION '결과 창 값이 틀립니다(정답률): %', v_res;
    END IF;
    -- 중도 종료는 까닭 not_completed
    INSERT INTO public.vocab_tower_runs (student_id, class_id, run_date, grade, daily_limit, floor_time_limit, reward_cap, answer_count, correct_count, wrong_count, content_version, v2_deck_number, target_question_count)
    VALUES (v_student, v_class, CURRENT_DATE, 4, 3, 60, 0, 5, 5, 0, 'v2', 1, 12) RETURNING id INTO v_run;
    v_res := public.finish_my_vocab_tower_v2_practice_v1(v_run, 'exited');
    IF v_res ->> 'tower_coin_reason' <> 'not_completed' THEN RAISE EXCEPTION '결과 창 값이 틀립니다(중도): %', v_res; END IF;
    -- 한도를 다 채운 뒤 70% 판은 까닭 daily_limit (오늘 이미 1개, 한도를 1 로)
    UPDATE public.classes SET vocab_tower_coin_daily_limit = 1 WHERE id = v_class;
    INSERT INTO public.vocab_tower_runs (student_id, class_id, run_date, grade, daily_limit, floor_time_limit, reward_cap, answer_count, correct_count, wrong_count, content_version, v2_deck_number, target_question_count)
    VALUES (v_student, v_class, CURRENT_DATE, 4, 3, 60, 0, 12, 12, 0, 'v2', 1, 12) RETURNING id INTO v_run;
    v_res := public.finish_my_vocab_tower_v2_practice_v1(v_run, 'completed');
    IF v_res ->> 'tower_coin_reason' <> 'daily_limit' OR (v_res ->> 'tower_coins_today')::INTEGER <> 1 THEN
        RAISE EXCEPTION '결과 창 값이 틀립니다(한도): %', v_res;
    END IF;

    -- ⑤ 컨텍스트가 학급 한도를 알린다
    UPDATE public.classes SET vocab_tower_coin_daily_limit = 5 WHERE id = v_class;
    v_res := public.get_my_spelling_claw_context_v1();
    IF (v_res -> 'today' ->> 'tower_coin_daily_cap')::INTEGER <> 5 THEN RAISE EXCEPTION '컨텍스트 한도가 틀립니다: %', v_res -> 'today'; END IF;

    -- ⑥ 범위 밖 한도는 저장 거절
    BEGIN UPDATE public.classes SET vocab_tower_coin_daily_limit = 11 WHERE id = v_class;
    EXCEPTION WHEN check_violation THEN v_bad := true; END;
    IF NOT v_bad THEN RAISE EXCEPTION '한도 11 이 저장됩니다'; END IF;
END $$;
