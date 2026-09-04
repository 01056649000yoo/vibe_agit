-- 자리표와 역할표를 나란히 둘 수 있는지, 셋은 막는지 본다.
-- check-migrations.mjs 가 바깥을 BEGIN/ROLLBACK 으로 감싼다.

DO $$
DECLARE
    v_class UUID;
    v_one JSONB;
    v_two JSONB;
BEGIN
    SELECT id INTO v_class FROM public.classes LIMIT 1;
    IF v_class IS NULL THEN
        RAISE NOTICE '학급이 없어 저장 검증은 건너뜁니다.';
        RETURN;
    END IF;

    v_one := JSONB_BUILD_OBJECT(
        'instanceId', 'arrange-seat', 'widgetId', 'arrangement-board', 'version', 1,
        'zone', 'content', 'size', 'large', 'order', 1,
        'placement', JSONB_BUILD_OBJECT('x', 2, 'y', 2, 'width', 40, 'height', 40, 'pinned', false),
        'config', JSONB_BUILD_OBJECT('heading', '오늘의 자리', 'kind', 'seat')
    );
    v_two := JSONB_BUILD_OBJECT(
        'instanceId', 'arrange-role', 'widgetId', 'arrangement-board', 'version', 1,
        'zone', 'content', 'size', 'large', 'order', 2,
        'placement', JSONB_BUILD_OBJECT('x', 50, 'y', 2, 'width', 40, 'height', 40, 'pinned', false),
        'config', JSONB_BUILD_OBJECT('heading', '오늘의 역할', 'kind', 'role')
    );

    -- 자리 하나만 두는 경우.
    PERFORM public.validate_class_board_payload_v1(
        v_class, JSONB_BUILD_OBJECT('version', 3), JSONB_BUILD_ARRAY(v_one));

    -- ⚠️ 이번 요청의 핵심 — 자리와 역할을 **나란히** 둘 수 있어야 한다.
    PERFORM public.validate_class_board_payload_v1(
        v_class, JSONB_BUILD_OBJECT('version', 3), JSONB_BUILD_ARRAY(v_one, v_two));

    -- 셋은 막는다. 종류가 둘뿐이라 셋째는 같은 것을 겹쳐 놓는 셈이다.
    BEGIN
        PERFORM public.validate_class_board_payload_v1(
            v_class, JSONB_BUILD_OBJECT('version', 3),
            JSONB_BUILD_ARRAY(v_one, v_two,
                JSONB_SET(JSONB_SET(v_one, '{instanceId}', '"arrange-third"'::JSONB), '{order}', '3'::JSONB)));
        RAISE EXCEPTION '자리·역할 배치 위젯이 셋까지 통과했습니다.';
    EXCEPTION WHEN SQLSTATE '22023' THEN
        NULL;
    END;

    -- 둘이어도 종류 검사는 그대로여야 한다.
    BEGIN
        PERFORM public.validate_class_board_payload_v1(
            v_class, JSONB_BUILD_OBJECT('version', 3),
            JSONB_BUILD_ARRAY(v_one, JSONB_SET(v_two, '{config,kind}', '"모둠"'::JSONB)));
        RAISE EXCEPTION '엉뚱한 배치 종류가 그대로 통과했습니다.';
    EXCEPTION WHEN SQLSTATE '22023' THEN
        NULL;
    END;
END;
$$;

SELECT '자리·역할 배치 위젯 둘 검증 통과' AS smoke_result;
