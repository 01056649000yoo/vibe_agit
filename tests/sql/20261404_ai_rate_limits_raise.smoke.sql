-- AI 요청 분당 상한 시뮬레이션(한 분 안에 몰리는 장면). 함수는 서비스 역할만 부를 수 있다.
DO $$
DECLARE
    teacher UUID := gen_random_uuid();
    other_teacher UUID := gen_random_uuid();
    student UUID := gen_random_uuid();
    ok INTEGER;
    denied INTEGER;
    r JSONB;
    n INTEGER;
BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

    -- 장면 1: 한 학급 30명이 같은 분에 맞춤법 검사를 누른다(학급 교사 기준 한 줄로 센다) → 전부 통과
    ok := 0;
    FOR n IN 1..30 LOOP
        r := public.consume_ai_request_v1(teacher, 'student_spell_check');
        IF (r->>'allowed')::BOOLEAN THEN ok := ok + 1; END IF;
    END LOOP;
    IF ok <> 30 THEN RAISE EXCEPTION '한 학급 30명이 모두 통과해야 합니다: %', ok; END IF;

    -- 장면 2: 같은 교사의 학급 네 개(120명)가 몰려도 120 까지 통과, 121번째만 막힌다(이미 30 썼으니 90 더)
    ok := 0; denied := 0;
    FOR n IN 1..95 LOOP
        r := public.consume_ai_request_v1(teacher, 'student_spell_check');
        IF (r->>'allowed')::BOOLEAN THEN ok := ok + 1; ELSE denied := denied + 1; END IF;
    END LOOP;
    IF ok <> 90 OR denied <> 5 THEN RAISE EXCEPTION '맞춤법 검사 상한은 분당 120 이어야 합니다(통과 %, 거절 %)', ok, denied; END IF;
    IF (r->>'retry_after_seconds')::INTEGER <> 60 THEN RAISE EXCEPTION '거절 응답에 재시도 시간이 없습니다'; END IF;

    -- 장면 3: 다른 교사는 영향을 받지 않는다(상한은 교사마다 따로)
    r := public.consume_ai_request_v1(other_teacher, 'student_spell_check');
    IF NOT (r->>'allowed')::BOOLEAN THEN RAISE EXCEPTION '다른 교사가 막혔습니다'; END IF;

    -- 장면 4: 같은 교사라도 범위가 다르면 따로 센다 → 교사 AI 는 막히지 않고 60 까지
    ok := 0; denied := 0;
    FOR n IN 1..65 LOOP
        r := public.consume_ai_request_v1(teacher, 'teacher_ai');
        IF (r->>'allowed')::BOOLEAN THEN ok := ok + 1; ELSE denied := denied + 1; END IF;
    END LOOP;
    IF ok <> 60 OR denied <> 5 THEN RAISE EXCEPTION '교사 AI 상한은 분당 60 이어야 합니다(통과 %, 거절 %)', ok, denied; END IF;

    -- 장면 5: 댓글 안전 확인은 학생 한 명 기준 분당 30
    ok := 0; denied := 0;
    FOR n IN 1..35 LOOP
        r := public.consume_ai_request_v1(student, 'comment_safety');
        IF (r->>'allowed')::BOOLEAN THEN ok := ok + 1; ELSE denied := denied + 1; END IF;
    END LOOP;
    IF ok <> 30 OR denied <> 5 THEN RAISE EXCEPTION '댓글 안전 확인 상한은 분당 30 이어야 합니다(통과 %, 거절 %)', ok, denied; END IF;

    -- 장면 6: 잘못된 범위·빈 사용자는 거절(예외)
    BEGIN
        PERFORM public.consume_ai_request_v1(teacher, 'nope');
        RAISE EXCEPTION '잘못된 범위가 통과했습니다';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;

    -- 장면 7: 서비스 역할이 아니면 못 부른다
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
    BEGIN
        PERFORM public.consume_ai_request_v1(teacher, 'teacher_ai');
        RAISE EXCEPTION '서비스 역할이 아닌데 통과했습니다';
    EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
    END;
END;
$$;
