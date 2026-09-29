-- run-rollback-smoke(migrate:check)가 만든 바깥 트랜잭션 안에서 실행되고 마지막에 모두 롤백된다.
-- 학급 시간표가 담당 교사에게만 열리고, 기초 시간표 판·주간 시간표·되돌리기·지난 기록이 약속대로 움직이는지 본다.

DO $$
BEGIN
    IF has_table_privilege('authenticated', 'public.class_timetable_bases', 'SELECT')
       OR has_table_privilege('authenticated', 'public.class_timetable_weeks', 'INSERT')
       OR has_table_privilege('anon', 'public.class_timetable_weeks', 'SELECT') THEN
        RAISE EXCEPTION '시간표 표가 브라우저 역할에 직접 공개됐습니다.';
    END IF;
    IF has_function_privilege('anon', 'public.get_teacher_class_timetable_v1(uuid,date,integer)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.save_teacher_class_timetable_week_v1(uuid,date,jsonb,smallint,boolean)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.save_teacher_class_timetable_base_v1(uuid,date,smallint,smallint,boolean,jsonb)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.get_teacher_class_timetable_log_v1(uuid,date,integer)', 'EXECUTE') THEN
        RAISE EXCEPTION '시간표 RPC가 익명 역할에 열려 있습니다.';
    END IF;
    IF has_function_privilege('authenticated', 'public.class_timetable_resolve_week(uuid,date)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.class_timetable_assert_teacher(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION '시간표 내부 도우미가 브라우저 역할에 열려 있습니다.';
    END IF;
END;
$$;

SELECT set_config('test.tt_teacher_id', fixture.teacher_id::TEXT, true),
       set_config('test.tt_class_id', fixture.class_id::TEXT, true)
FROM (
    SELECT class.teacher_id, class.id AS class_id
    FROM public.classes class
    JOIN public.profiles teacher
      ON teacher.id = class.teacher_id
     AND teacher.role = 'TEACHER'
     AND teacher.is_approved IS TRUE
     AND teacher.approval_revoked_at IS NULL
    WHERE class.deleted_at IS NULL
    ORDER BY class.created_at DESC
    LIMIT 1
) fixture;

SELECT set_config('test.tt_other_class_id', other.class_id::TEXT, true)
FROM (
    SELECT class.id AS class_id
    FROM public.classes class
    WHERE class.deleted_at IS NULL
      AND class.teacher_id IS DISTINCT FROM current_setting('test.tt_teacher_id')::UUID
    ORDER BY class.created_at DESC
    LIMIT 1
) other;

-- 스크린 저장 검사: 시간표 위젯은 고른 값만, 글상자 글씨 크기도 고른 값만 받는다.
DO $$
DECLARE
    v_class UUID := current_setting('test.tt_class_id')::UUID;
    v_widget JSONB := '{"instanceId":"tt1","widgetId":"timetable","version":1,"zone":"content","size":"large","order":10,"config":{"heading":"시간표","view":"today","switchHour":13,"tone":"sky"},"placement":{"x":2,"y":4,"width":30,"height":40,"pinned":false}}';
    v_layout JSONB := '{"version":3}';
BEGIN
    PERFORM public.validate_class_board_payload_v1(v_class, v_layout, jsonb_build_array(v_widget));
    PERFORM public.validate_class_board_payload_v1(v_class, v_layout,
        jsonb_build_array(v_widget, jsonb_set(v_widget, '{instanceId}', '"tt2"')));

    BEGIN
        PERFORM public.validate_class_board_payload_v1(v_class, v_layout,
            jsonb_build_array(jsonb_set(v_widget, '{config,view}', '"month"')));
        RAISE EXCEPTION '없는 보기(month)가 통과했습니다.';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;
    BEGIN
        PERFORM public.validate_class_board_payload_v1(v_class, v_layout,
            jsonb_build_array(jsonb_set(v_widget, '{config,switchHour}', '3')));
        RAISE EXCEPTION '새벽 3시 넘김이 통과했습니다.';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;
    BEGIN
        PERFORM public.validate_class_board_payload_v1(v_class, v_layout, jsonb_build_array(v_widget,
            jsonb_set(v_widget, '{instanceId}', '"tt2"'), jsonb_set(v_widget, '{instanceId}', '"tt3"')));
        RAISE EXCEPTION '시간표 위젯 셋이 통과했습니다.';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;
    BEGIN
        PERFORM public.validate_class_board_payload_v1(v_class, v_layout, jsonb_build_array(jsonb_build_object(
            'instanceId', 'text1', 'widgetId', 'text', 'version', 1, 'zone', 'content', 'size', 'medium', 'order', 20,
            'config', jsonb_build_object('heading', '안내', 'body', '내용', 'tone', 'paper', 'sizeMode', 'huge'),
            'placement', jsonb_build_object('x', 2, 'y', 4, 'width', 30, 'height', 40, 'pinned', false))));
        RAISE EXCEPTION '없는 글씨 크기 방식이 통과했습니다.';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.tt_teacher_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.tt_teacher_id'), 'role', 'authenticated'
)::TEXT, true);

DO $$
DECLARE
    v_class UUID := current_setting('test.tt_class_id')::UUID;
    v_other TEXT := current_setting('test.tt_other_class_id', true);
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
    v_this_week DATE := (v_today - (EXTRACT(ISODOW FROM v_today)::INTEGER - 1))::DATE;
    v_empty JSONB := (SELECT jsonb_agg((SELECT jsonb_agg(NULL::JSONB) FROM generate_series(1, 8))) FROM generate_series(1, 6));
    v_base_cells JSONB;
    v_week_cells JSONB;
    v_result JSONB;
    v_week JSONB;
    v_log JSONB;
BEGIN
    -- 기초 시간표: 월요일 1교시 국어, 2교시 수학
    v_base_cells := jsonb_set(jsonb_set(v_empty, '{0,0}', '{"s":"국어"}'), '{0,1}', '{"s":"수학","m":""}');

    -- 잘못된 모양은 막는다
    BEGIN
        PERFORM public.save_teacher_class_timetable_base_v1(v_class, v_this_week, 3::SMALLINT, 4::SMALLINT, FALSE, '[[1]]'::JSONB);
        RAISE EXCEPTION '잘못된 칸 모양이 저장됐습니다.';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;
    BEGIN
        PERFORM public.save_teacher_class_timetable_base_v1(v_class, v_this_week, 3::SMALLINT, 4::SMALLINT, FALSE,
            jsonb_set(v_empty, '{0,0}', jsonb_build_object('s', repeat('가', 21))));
        RAISE EXCEPTION '21자 과목이 저장됐습니다.';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;
    BEGIN
        PERFORM public.save_teacher_class_timetable_base_v1(v_class, v_this_week, 3::SMALLINT, 8::SMALLINT, FALSE, v_empty);
        RAISE EXCEPTION '8교시 뒤 점심이 저장됐습니다.';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;

    -- 기초 시간표 저장(수요일을 넘겨도 그 주 월요일로 맞춘다)
    v_result := public.save_teacher_class_timetable_base_v1(v_class, v_this_week + 2, 3::SMALLINT, 5::SMALLINT, FALSE, v_base_cells);
    IF (v_result -> 'base' ->> 'effectiveFrom')::DATE <> v_this_week THEN
        RAISE EXCEPTION '적용 시작이 월요일로 맞춰지지 않았습니다: %', v_result;
    END IF;

    -- 이번 주·다음 주를 한 번에: 둘 다 기초 시간표
    v_result := public.get_teacher_class_timetable_v1(v_class, NULL, 2);
    IF jsonb_array_length(v_result -> 'weeks') <> 2
       OR (v_result -> 'weeks' -> 0 ->> 'saved')::BOOLEAN
       OR v_result -> 'weeks' -> 1 -> 'cells' -> 0 -> 0 ->> 's' <> '국어'
       OR (v_result -> 'weeks' -> 0 ->> 'lunchAfter')::INTEGER <> 5 THEN
        RAISE EXCEPTION '기초 시간표가 두 주에 맞게 나오지 않았습니다: %', v_result;
    END IF;

    -- 이번 주만 1교시를 외부 강의로 바꾼다 → 따로 저장, 바뀐 칸 1
    v_week_cells := jsonb_set(v_base_cells, '{0,0}', '{"s":"생존수영","m":"외부강사"}');
    v_week := public.save_teacher_class_timetable_week_v1(v_class, v_this_week, v_week_cells, NULL, NULL) -> 'week';
    IF NOT (v_week ->> 'saved')::BOOLEAN OR (v_week ->> 'changedCells')::INTEGER <> 1
       OR v_week -> 'cells' -> 0 -> 0 ->> 's' <> '생존수영'
       OR v_week -> 'base' -> 'cells' -> 0 -> 0 ->> 's' <> '국어' THEN
        RAISE EXCEPTION '주간 시간표가 따로 저장되지 않았습니다: %', v_week;
    END IF;

    -- 다음 주는 여전히 기초 시간표
    v_result := public.get_teacher_class_timetable_v1(v_class, v_this_week + 7, 1);
    IF (v_result -> 'weeks' -> 0 ->> 'saved')::BOOLEAN OR v_result -> 'weeks' -> 0 -> 'cells' -> 0 -> 0 ->> 's' <> '국어' THEN
        RAISE EXCEPTION '다른 주까지 바뀌었습니다: %', v_result;
    END IF;

    -- 다음 주부터 기초 시간표를 바꿔도(2학기) 이번 주 기록과 이번 주 기초는 그대로다
    PERFORM public.save_teacher_class_timetable_base_v1(v_class, v_this_week + 7, 3::SMALLINT, 4::SMALLINT, FALSE,
        jsonb_set(v_base_cells, '{0,0}', '{"s":"과학"}'));
    v_result := public.get_teacher_class_timetable_v1(v_class, NULL, 2);
    IF v_result -> 'weeks' -> 0 -> 'base' -> 'cells' -> 0 -> 0 ->> 's' <> '국어'
       OR v_result -> 'weeks' -> 1 -> 'cells' -> 0 -> 0 ->> 's' <> '과학'
       OR (v_result -> 'latestBase' ->> 'effectiveFrom')::DATE <> v_this_week + 7 THEN
        RAISE EXCEPTION '기초 시간표 판이 지난 주를 바꿨습니다: %', v_result;
    END IF;

    -- 지난 기록: 따로 저장한 주 하나, 기초 판 둘
    v_log := public.get_teacher_class_timetable_log_v1(v_class, NULL, 20);
    IF jsonb_array_length(v_log -> 'weeks') <> 1 OR jsonb_array_length(v_log -> 'bases') <> 2
       OR (v_log -> 'weeks' -> 0 ->> 'changedCells')::INTEGER <> 1 THEN
        RAISE EXCEPTION '지난 기록이 맞지 않습니다: %', v_log;
    END IF;

    -- 기초와 같게 되돌려 저장하면 기록에서 빠진다
    v_week := public.save_teacher_class_timetable_week_v1(v_class, v_this_week, v_base_cells, NULL, NULL) -> 'week';
    IF (v_week ->> 'saved')::BOOLEAN THEN
        RAISE EXCEPTION '기초와 같은데 주간 기록이 남았습니다: %', v_week;
    END IF;

    -- 다시 바꾼 뒤 `기초 시간표로 되돌리기`(칸 NULL)
    PERFORM public.save_teacher_class_timetable_week_v1(v_class, v_this_week, v_week_cells, NULL, NULL);
    v_week := public.save_teacher_class_timetable_week_v1(v_class, v_this_week, NULL, NULL, NULL) -> 'week';
    IF (v_week ->> 'saved')::BOOLEAN OR v_week -> 'cells' -> 0 -> 0 ->> 's' <> '국어' THEN
        RAISE EXCEPTION '기초 시간표로 되돌리지 못했습니다: %', v_week;
    END IF;

    -- 점심만 바꿔도 그 주 기록으로 남는다
    v_week := public.save_teacher_class_timetable_week_v1(v_class, v_this_week, v_base_cells, 3::SMALLINT, NULL) -> 'week';
    IF NOT (v_week ->> 'saved')::BOOLEAN OR (v_week ->> 'lunchAfter')::INTEGER <> 3 THEN
        RAISE EXCEPTION '점심 위치만 바꾼 주가 저장되지 않았습니다: %', v_week;
    END IF;

    -- 다른 교사의 학급은 읽지도 쓰지도 못한다
    IF v_other IS NOT NULL THEN
        BEGIN
            PERFORM public.get_teacher_class_timetable_v1(v_other::UUID, NULL, 1);
            RAISE EXCEPTION '다른 교사의 시간표를 읽었습니다.';
        EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
        END;
        BEGIN
            PERFORM public.save_teacher_class_timetable_week_v1(v_other::UUID, v_this_week, v_week_cells, NULL, NULL);
            RAISE EXCEPTION '다른 교사의 시간표를 고쳤습니다.';
        EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
        END;
    END IF;
END;
$$;

RESET ROLE;
