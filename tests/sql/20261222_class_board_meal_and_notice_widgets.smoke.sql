-- 식단표·알림장 저장과 서버 상한을 실제 스키마에서 확인하고 모두 롤백한다.

DO $$
DECLARE
    v_class_id UUID;
    v_layout JSONB := '{"version":3,"preset":"freeform-stage-7-3"}'::JSONB;
    v_widgets JSONB;
BEGIN
    SELECT class.id INTO v_class_id FROM public.classes class ORDER BY class.created_at LIMIT 1;
    IF v_class_id IS NULL THEN RAISE EXCEPTION 'class board widget smoke fixture is missing'; END IF;

    IF has_function_privilege('anon', 'public.validate_class_board_payload_v1(uuid,jsonb,jsonb)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.validate_class_board_legacy_widgets(uuid,jsonb,jsonb)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.validate_class_board_legacy_widgets(uuid,jsonb,jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'class board validators must stay private';
    END IF;

    v_widgets := jsonb_build_array(
        jsonb_build_object('instanceId','meal-smoke','widgetId','meal-board','version',1,'zone','content','order',10,'size','large','visible',true,
            'placement',jsonb_build_object('x',2,'y',2,'width',46,'height',45,'pinned',false),
            'config',jsonb_build_object('heading','오늘의 급식','showAllergens',true)),
        jsonb_build_object('instanceId','notice-smoke','widgetId','notice-board','version',1,'zone','content','order',20,'size','large','visible',true,
            'placement',jsonb_build_object('x',52,'y',2,'width',46,'height',45,'pinned',false),
            'config',jsonb_build_object('heading','알림장','body','준비물을 챙겨 오세요.','tone','yellow'))
    );
    PERFORM public.validate_class_board_payload_v1(v_class_id, v_layout, v_widgets);

    BEGIN
        PERFORM public.validate_class_board_payload_v1(
            v_class_id, v_layout,
            jsonb_set(v_widgets, '{1,config,body}', to_jsonb(repeat('가', 2001)))
        );
        RAISE EXCEPTION '알림장 2000자 상한을 넘긴 payload가 저장됐습니다.';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;

    BEGIN
        PERFORM public.validate_class_board_payload_v1(v_class_id, v_layout, v_widgets || (v_widgets -> 0));
        RAISE EXCEPTION '식단표가 한 스크린에 두 개 저장됐습니다.';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;
END;
$$;
