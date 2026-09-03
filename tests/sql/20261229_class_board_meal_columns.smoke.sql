-- run-rollback-smoke가 만든 바깥 트랜잭션 안에서 실행되고 마지막에 모두 롤백된다.
-- 식단표 열 수 저장 검증과, 기존 위젯 검증이 그대로 남아 있는지 확인한다.

SELECT set_config('test.meal_columns_class_id', class.id::TEXT, true)
FROM (
    SELECT id FROM public.classes WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 1
) class;

DO $$ BEGIN
    IF current_setting('test.meal_columns_class_id', true) IS NULL THEN
        RAISE EXCEPTION '식단표 스모크에 사용할 학급이 없습니다.';
    END IF;
END $$;

DO $$
DECLARE
    v_class_id UUID := current_setting('test.meal_columns_class_id')::UUID;
    v_layout JSONB := '{"version":3,"preset":"freeform-stage-7-3"}'::JSONB;
    v_widget JSONB := jsonb_build_object(
        'instanceId', 'meal-smoke', 'widgetId', 'meal-board', 'version', 1,
        'zone', 'content', 'order', 10, 'size', 'large', 'visible', true,
        'placement', jsonb_build_object('x', 3, 'y', 5, 'width', 46, 'height', 46, 'pinned', false),
        'config', jsonb_build_object('heading', '오늘의 급식', 'showAllergens', true, 'columns', '2')
    );
BEGIN
    -- 2열·3열, 그리고 아예 안 적은 기존 스크린 모두 통과한다.
    PERFORM public.validate_class_board_payload_v1(v_class_id, v_layout, jsonb_build_array(v_widget));
    PERFORM public.validate_class_board_payload_v1(
        v_class_id, v_layout,
        jsonb_build_array(jsonb_set(v_widget, '{config,columns}', '"3"'::JSONB))
    );
    PERFORM public.validate_class_board_payload_v1(
        v_class_id, v_layout,
        jsonb_build_array(jsonb_set(v_widget, '{config}', (v_widget -> 'config') - 'columns'))
    );

    BEGIN
        PERFORM public.validate_class_board_payload_v1(
            v_class_id, v_layout,
            jsonb_build_array(jsonb_set(v_widget, '{config,columns}', '"4"'::JSONB))
        );
        RAISE EXCEPTION '허용하지 않은 급식 열 수가 저장됐습니다.';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;

    BEGIN
        PERFORM public.validate_class_board_payload_v1(
            v_class_id, v_layout,
            jsonb_build_array(jsonb_set(v_widget, '{config,columns}', '"한 줄"'::JSONB))
        );
        RAISE EXCEPTION '급식 열 수에 아무 글자나 저장됐습니다.';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;

    -- 기존 식단표 검증(알레르기 표시·한 스크린 한 개)이 함께 남아 있는지 본다.
    BEGIN
        PERFORM public.validate_class_board_payload_v1(
            v_class_id, v_layout,
            jsonb_build_array(jsonb_set(v_widget, '{config,showAllergens}', '"예"'::JSONB))
        );
        RAISE EXCEPTION '식단표 알레르기 표시 검증이 사라졌습니다.';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;

    BEGIN
        PERFORM public.validate_class_board_payload_v1(
            v_class_id, v_layout,
            jsonb_build_array(v_widget, jsonb_set(v_widget, '{instanceId}', '"meal-smoke-2"'::JSONB))
        );
        RAISE EXCEPTION '식단표가 한 스크린에 두 개 저장됐습니다.';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;

    -- 다른 위젯 검증(날씨 보여 줄 날·오늘 현황 배경색·알림장 색)도 그대로인지 본다.
    BEGIN
        PERFORM public.validate_class_board_payload_v1(
            v_class_id, v_layout,
            jsonb_build_array(jsonb_build_object(
                'instanceId', 'weather-smoke', 'widgetId', 'weather', 'version', 1,
                'zone', 'content', 'order', 10, 'size', 'medium', 'visible', true,
                'placement', jsonb_build_object('x', 2, 'y', 50, 'width', 21, 'height', 32, 'pinned', false),
                'config', jsonb_build_object('days', jsonb_build_array('yesterday'))
            ))
        );
        RAISE EXCEPTION '날씨 보여 줄 날 검증이 사라졌습니다.';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;

    BEGIN
        PERFORM public.validate_class_board_payload_v1(
            v_class_id, v_layout,
            jsonb_build_array(jsonb_build_object(
                'instanceId', 'status-smoke', 'widgetId', 'writing-status', 'version', 1,
                'zone', 'sidebar', 'order', 10, 'size', 'large', 'visible', true,
                'config', jsonb_build_object('tone', '무지개')
            ))
        );
        RAISE EXCEPTION '오늘 현황 배경색 검증이 사라졌습니다.';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;

    BEGIN
        PERFORM public.validate_class_board_payload_v1(
            v_class_id, v_layout,
            jsonb_build_array(jsonb_build_object(
                'instanceId', 'notice-smoke', 'widgetId', 'notice-board', 'version', 1,
                'zone', 'content', 'order', 10, 'size', 'large', 'visible', true,
                'placement', jsonb_build_object('x', 2, 'y', 2, 'width', 46, 'height', 45, 'pinned', false),
                'config', jsonb_build_object('heading', '알림장', 'tone', '무지개')
            ))
        );
        RAISE EXCEPTION '알림장 색상 검증이 사라졌습니다.';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;
END;
$$;
