-- 시간표 위젯 `오늘·내일`(pair) 보기가 저장 검사를 통과하고, 없는 보기는 여전히 막히는지 본다(ROLLBACK 안).
DO $$
DECLARE
    v_class UUID := (SELECT id FROM public.classes WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 1);
    v_widget JSONB := '{"instanceId":"tt1","widgetId":"timetable","version":1,"zone":"content","size":"large","order":10,"config":{"heading":"시간표","view":"pair","switchHour":13,"tone":"sky"},"placement":{"x":2,"y":4,"width":40,"height":40,"pinned":false}}';
    v_layout JSONB := '{"version":3}';
BEGIN
    IF v_class IS NULL THEN RAISE EXCEPTION '스모크에 쓸 학급이 없습니다.'; END IF;
    PERFORM public.validate_class_board_payload_v1(v_class, v_layout, jsonb_build_array(v_widget));
    BEGIN
        PERFORM public.validate_class_board_payload_v1(v_class, v_layout,
            jsonb_build_array(jsonb_set(v_widget, '{config,view}', '"month"')));
        RAISE EXCEPTION '없는 보기(month)가 통과했습니다.';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;
END;
$$;
