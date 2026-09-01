-- migrate:check 바깥 트랜잭션에서 실행되며 마지막에 모두 롤백된다.

DO $$
DECLARE
    v_rejected BOOLEAN;
    v_widgets JSONB := '[
      {"instanceId":"text","widgetId":"text","version":1,"zone":"content","order":10,"size":"medium","visible":true,"placement":{"x":1.4,"y":2,"width":22.4,"height":24,"pinned":false},"config":{"heading":"알림","body":"준비물을 확인해요","tone":"paper","fontScale":1.25}},
      {"instanceId":"weather","widgetId":"weather","version":1,"zone":"content","order":20,"size":"medium","visible":true,"placement":{"x":25,"y":2,"width":16.8,"height":24,"pinned":false},"config":{"weatherSource":"live","locationName":"서울","latitude":37.566,"longitude":126.978,"message":"우산을 확인해요"}},
      {"instanceId":"timer","widgetId":"timer","version":1,"zone":"content","order":30,"size":"medium","visible":true,"placement":{"x":43,"y":2,"width":16.8,"height":24,"pinned":false},"config":{"label":"모둠 활동","durationSeconds":300,"soundEnabled":true,"alarmSound":"bell","alarmVolume":0.7}},
      {"instanceId":"picker","widgetId":"student-picker","version":1,"zone":"content","order":40,"size":"medium","visible":true,"placement":{"x":61,"y":2,"width":22.4,"height":24,"pinned":false},"config":{"title":"발표자","allowRepeats":false,"soundEnabled":false,"soundVolume":0.55}}
    ]'::JSONB;
BEGIN
    PERFORM public.validate_class_board_payload_v1(
        '00000000-0000-0000-0000-000000000001'::UUID,
        '{"version":3,"preset":"freeform-stage-7-3"}'::JSONB,
        v_widgets
    );

    v_rejected := FALSE;
    BEGIN
        PERFORM public.validate_class_board_payload_v1(
            '00000000-0000-0000-0000-000000000001'::UUID,
            '{"version":3,"preset":"freeform-stage-7-3"}'::JSONB,
            JSONB_SET(v_widgets, '{0,config,fontScale}', '2'::JSONB)
        );
    EXCEPTION WHEN SQLSTATE '22023' THEN
        v_rejected := TRUE;
    END;
    IF NOT v_rejected THEN
        RAISE EXCEPTION '허용 범위를 넘은 텍스트 크기가 저장됐습니다.';
    END IF;

    v_rejected := FALSE;
    BEGIN
        PERFORM public.validate_class_board_payload_v1(
            '00000000-0000-0000-0000-000000000001'::UUID,
            '{"version":3,"preset":"freeform-stage-7-3"}'::JSONB,
            JSONB_SET(v_widgets, '{1,config,latitude}', '120'::JSONB)
        );
    EXCEPTION WHEN SQLSTATE '22023' THEN
        v_rejected := TRUE;
    END;
    IF NOT v_rejected THEN
        RAISE EXCEPTION '범위를 벗어난 날씨 좌표가 저장됐습니다.';
    END IF;

    v_rejected := FALSE;
    BEGIN
        PERFORM public.validate_class_board_payload_v1(
            '00000000-0000-0000-0000-000000000001'::UUID,
            '{"version":3,"preset":"freeform-stage-7-3"}'::JSONB,
            JSONB_SET(v_widgets, '{2,config,alarmVolume}', '1.5'::JSONB)
        );
    EXCEPTION WHEN SQLSTATE '22023' THEN
        v_rejected := TRUE;
    END;
    IF NOT v_rejected THEN
        RAISE EXCEPTION '허용 범위를 넘은 타이머 소리 크기가 저장됐습니다.';
    END IF;

    v_rejected := FALSE;
    BEGIN
        PERFORM public.validate_class_board_payload_v1(
            '00000000-0000-0000-0000-000000000001'::UUID,
            '{"version":3,"preset":"freeform-stage-7-3"}'::JSONB,
            JSONB_SET(v_widgets, '{3,config,soundVolume}', '-0.1'::JSONB)
        );
    EXCEPTION WHEN SQLSTATE '22023' THEN
        v_rejected := TRUE;
    END;
    IF NOT v_rejected THEN
        RAISE EXCEPTION '허용 범위를 벗어난 뽑기 소리 크기가 저장됐습니다.';
    END IF;
END;
$$;
