-- 만점이면 코인 2개 스모크 (전부 롤백된다).
-- ① 기회 3번: 만점 2개 + 통과 1개 + 만점 2개 = 5개, 네 번째 통과는 0개(기회 = 코인 받는 퀴즈 수) — 최대 6판
-- ② 기회 1번에 만점 2개: 첫 판을 못 뽑아도 코인이 남았으니 최소 포인트 없음 → 둘째 판까지 못 뽑으면 그때 최소 포인트

DO $$
DECLARE
    v_class UUID;
    v_a UUID;
    v_b UUID;
    v_q JSONB := (SELECT jsonb_agg(jsonb_build_object('id', 'q' || n, 'answer', '정답')) FROM generate_series(1, 10) n);
    v_attempt UUID;
    v_result JSONB;
    v_play UUID;
    v_total INTEGER := 0;
    n INTEGER;
    k INTEGER;
    v_right INTEGER;
BEGIN
    SELECT class.id INTO v_class FROM public.classes class
    WHERE class.deleted_at IS NULL
      AND (SELECT COUNT(*) FROM public.students student WHERE student.class_id = class.id AND student.deleted_at IS NULL
           AND student.is_active IS DISTINCT FROM false) >= 2
    ORDER BY class.created_at DESC LIMIT 1;
    SELECT id INTO v_a FROM public.students WHERE class_id = v_class AND deleted_at IS NULL AND is_active IS DISTINCT FROM false ORDER BY id LIMIT 1;
    SELECT id INTO v_b FROM public.students WHERE class_id = v_class AND deleted_at IS NULL AND is_active IS DISTINCT FROM false ORDER BY id OFFSET 1 LIMIT 1;
    UPDATE public.classes SET enabled_modules = array_append(COALESCE(enabled_modules, ARRAY[]::TEXT[]), 'spelling-claw')
    WHERE id = v_class AND NOT ('spelling-claw' = ANY(COALESCE(enabled_modules, ARRAY[]::TEXT[])));
    DELETE FROM public.spelling_claw_quiz_attempts WHERE student_id IN (v_a, v_b);

    -- ①
    FOREACH v_right IN ARRAY ARRAY[10, 8, 10, 10] LOOP
        v_attempt := public.spelling_claw_issue_quiz_v1(v_a, v_q, 7::SMALLINT);
        FOR n IN 0..9 LOOP
            v_result := public.spelling_claw_answer_v1(v_attempt, v_a, n, '답', n < v_right, 3::SMALLINT);
        END LOOP;
        v_total := v_total + COALESCE((v_result ->> 'coins_granted')::INTEGER, 0);
        IF v_right = 10 AND (v_result ->> 'perfect') IS DISTINCT FROM 'true' THEN
            RAISE EXCEPTION '만점이 만점으로 표시되지 않았습니다: %', v_result;
        END IF;
    END LOOP;
    IF v_total <> 5 OR (v_result ->> 'coins_granted')::INTEGER <> 0 OR (v_result ->> 'rewarded_quizzes')::INTEGER <> 3 THEN
        RAISE EXCEPTION '만점 2개·기회 3번 규칙이 맞지 않습니다: 합계 %, 마지막 %', v_total, v_result;
    END IF;

    -- ②
    v_attempt := public.spelling_claw_issue_quiz_v1(v_b, v_q, 7::SMALLINT);
    FOR n IN 0..9 LOOP
        v_result := public.spelling_claw_answer_v1(v_attempt, v_b, n, '답', true, 1::SMALLINT);
    END LOOP;
    IF (v_result ->> 'coins_granted')::INTEGER <> 2 THEN
        RAISE EXCEPTION '만점인데 코인이 2개가 아닙니다: %', v_result;
    END IF;
    FOR k IN 0..1 LOOP
        UPDATE public.spelling_claw_plays SET status = 'playing'
        WHERE attempt_id = v_attempt AND coin_index = k RETURNING id INTO v_play;
        v_result := public.spelling_claw_finish_play_v1(v_play, v_b, '[]'::JSONB, '[]'::JSONB, 1, 1, 1::SMALLINT, 20::SMALLINT, true);
        IF k = 0 AND (v_result ->> 'consolation_points')::INTEGER <> 0 THEN
            RAISE EXCEPTION '코인이 남았는데 최소 포인트를 줬습니다.';
        END IF;
        IF k = 1 AND (v_result ->> 'consolation_points')::INTEGER <> 20 THEN
            RAISE EXCEPTION '코인을 다 쓰고 못 뽑았는데 최소 포인트가 없습니다: %', v_result;
        END IF;
    END LOOP;
END;
$$;
