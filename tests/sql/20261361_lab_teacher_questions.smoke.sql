-- 연구소 선생님 질문 스모크 (전부 롤백된다).
-- ① 선생님 질문이 아지트 `연구소 질문 불러오기` 꾸러미 맨 앞에 `선생님` 으로 실린다 ② 방 목록의 질문 수에 더해진다
-- ③ 로그인한 사용자·anon 은 표를 직접 읽지도 쓰지도 못한다(연구소 service_role 만) ④ 빈 질문은 들어가지 않는다

DO $$
DECLARE
    v_room UUID;
    v_class UUID;
    v_teacher UUID;
BEGIN
    SELECT r.id, r.agit_class_id, r.teacher_id INTO v_room, v_class, v_teacher
    FROM writing_helper.rooms r
    JOIN public.classes c ON c.id = r.agit_class_id AND c.teacher_id = r.teacher_id AND c.deleted_at IS NULL
    WHERE r.activity_type = 'question_generator'
    ORDER BY r.created_at DESC
    LIMIT 1;
    IF v_room IS NULL THEN
        RAISE EXCEPTION '검증할 질문 만들기 방이 없습니다.';
    END IF;
    PERFORM set_config('test.tq_room', v_room::TEXT, true);
    PERFORM set_config('test.tq_class', v_class::TEXT, true);
    PERFORM set_config('test.tq_teacher', v_teacher::TEXT, true);

    IF has_table_privilege('authenticated', 'writing_helper.room_teacher_questions', 'SELECT')
       OR has_table_privilege('anon', 'writing_helper.room_teacher_questions', 'INSERT') THEN
        RAISE EXCEPTION '선생님 질문 표가 브라우저 역할에 열려 있습니다.';
    END IF;
    IF NOT has_table_privilege('service_role', 'writing_helper.room_teacher_questions', 'INSERT') THEN
        RAISE EXCEPTION '연구소(service_role)가 선생님 질문을 쓸 수 없습니다.';
    END IF;

    BEGIN
        INSERT INTO writing_helper.room_teacher_questions (room_id, teacher_id, text) VALUES (v_room, v_teacher, '   ');
        RAISE EXCEPTION '빈 질문이 들어갔습니다.';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;
END;
$$;

DO $$
DECLARE
    v_before INTEGER;
    v_after INTEGER;
    v_first RECORD;
BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', current_setting('test.tq_teacher'), 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('role', 'authenticated', true);
    SELECT question_count INTO v_before FROM public.get_teacher_question_rooms_v1(current_setting('test.tq_class')::UUID)
    WHERE room_id = current_setting('test.tq_room')::UUID;
    RESET ROLE;

    INSERT INTO writing_helper.room_teacher_questions (room_id, teacher_id, text)
    VALUES (current_setting('test.tq_room')::UUID, current_setting('test.tq_teacher')::UUID, '스모크 선생님 질문: 주인공은 왜 그렇게 했을까?');

    PERFORM set_config('role', 'authenticated', true);
    SELECT question_count INTO v_after FROM public.get_teacher_question_rooms_v1(current_setting('test.tq_class')::UUID)
    WHERE room_id = current_setting('test.tq_room')::UUID;
    IF v_after IS DISTINCT FROM COALESCE(v_before, 0) + 1 THEN
        RAISE EXCEPTION '방 목록 질문 수에 선생님 질문이 더해지지 않았습니다: % → %', v_before, v_after;
    END IF;

    SELECT * INTO v_first FROM public.get_teacher_room_question_pool_v1(
        current_setting('test.tq_class')::UUID, current_setting('test.tq_room')::UUID) LIMIT 1;
    IF v_first.question_id NOT LIKE 'teacher-%' OR v_first.authors <> '선생님' OR v_first.picked_count <> 0
       OR v_first.text <> '스모크 선생님 질문: 주인공은 왜 그렇게 했을까?' THEN
        RAISE EXCEPTION '선생님 질문이 꾸러미 맨 앞에 선생님으로 실리지 않았습니다: %', row_to_json(v_first);
    END IF;

    BEGIN
        PERFORM 1 FROM writing_helper.room_teacher_questions LIMIT 1;
        RAISE EXCEPTION '로그인한 사용자가 선생님 질문 표를 직접 읽었습니다.';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;
END;
$$;
RESET ROLE;
