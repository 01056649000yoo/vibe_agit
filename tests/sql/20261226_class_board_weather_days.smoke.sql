-- run-rollback-smoke가 만든 바깥 트랜잭션 안에서 실행되고 마지막에 모두 롤백된다.
-- 날씨 위젯이 보여 줄 날 저장 검증과, 기존 위젯 검증이 그대로 남아 있는지 확인한다.

SELECT set_config('test.weather_class_id', class.id::TEXT, true)
FROM (
    SELECT id FROM public.classes WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 1
) class;

DO $$ BEGIN
    IF current_setting('test.weather_class_id', true) IS NULL THEN
        RAISE EXCEPTION '날씨 위젯 스모크에 사용할 학급이 없습니다.';
    END IF;
END $$;

DO $$
DECLARE
    v_class_id UUID := current_setting('test.weather_class_id')::UUID;
    v_layout JSONB := '{"version":3,"preset":"freeform-stage-7-3"}'::JSONB;
    v_widget JSONB := jsonb_build_object(
        'instanceId', 'weather-smoke', 'widgetId', 'weather', 'version', 1,
        'zone', 'content', 'order', 10, 'size', 'medium', 'visible', true,
        'placement', jsonb_build_object('x', 2, 'y', 50, 'width', 21, 'height', 32, 'pinned', false),
        'config', jsonb_build_object(
            'weatherSource', 'live', 'locationName', '서울',
            'latitude', 37.566, 'longitude', 126.978,
            'message', '오늘도 즐겁게 시작해요!',
            'days', jsonb_build_array('today', 'tomorrow')
        )
    );
BEGIN
    -- 오늘·내일 둘 다, 하나만, 아예 안 적은 경우 모두 통과한다.
    PERFORM public.validate_class_board_payload_v1(v_class_id, v_layout, jsonb_build_array(v_widget));
    PERFORM public.validate_class_board_payload_v1(
        v_class_id, v_layout,
        jsonb_build_array(jsonb_set(v_widget, '{config,days}', '["tomorrow"]'::JSONB))
    );
    PERFORM public.validate_class_board_payload_v1(
        v_class_id, v_layout,
        jsonb_build_array(jsonb_build_object(
            'instanceId', 'weather-smoke', 'widgetId', 'weather', 'version', 1,
            'zone', 'content', 'order', 10, 'size', 'medium', 'visible', true,
            'placement', v_widget -> 'placement',
            'config', (v_widget -> 'config') - 'days'
        ))
    );

    BEGIN
        PERFORM public.validate_class_board_payload_v1(
            v_class_id, v_layout,
            jsonb_build_array(jsonb_set(v_widget, '{config,days}', '["yesterday"]'::JSONB))
        );
        RAISE EXCEPTION '허용하지 않은 날이 저장됐습니다.';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;

    BEGIN
        PERFORM public.validate_class_board_payload_v1(
            v_class_id, v_layout,
            jsonb_build_array(jsonb_set(v_widget, '{config,days}', '["today","today"]'::JSONB))
        );
        RAISE EXCEPTION '같은 날이 두 번 저장됐습니다.';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;

    BEGIN
        PERFORM public.validate_class_board_payload_v1(
            v_class_id, v_layout,
            jsonb_build_array(jsonb_set(v_widget, '{config,days}', '[]'::JSONB))
        );
        RAISE EXCEPTION '빈 날 목록이 저장됐습니다.';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;

    -- 기존 검증이 함께 남아 있는지 본다(오늘 현황 배경색과 알림장 색상).
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
