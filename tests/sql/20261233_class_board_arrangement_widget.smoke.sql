-- 자리·역할 배치 위젯을 서버가 받아들이는지, 읽기 함수가 제자리에 있는지 본다.
-- check-migrations.mjs 가 바깥을 BEGIN/ROLLBACK 으로 감싼다.

DO $$
DECLARE
    v_def TEXT;
    v_class UUID;
    v_widgets JSONB;
BEGIN
    -- 1) 가벼운 읽기 함수가 있고, 권한이 교사에게만 열려 있어야 한다.
    SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_class_board_arrangement_result_v1';
    IF v_def IS NULL THEN
        RAISE EXCEPTION '배치 결과 읽기 함수를 찾지 못했습니다.';
    END IF;
    IF v_def NOT LIKE '%SECURITY DEFINER%' THEN
        RAISE EXCEPTION '읽기 함수가 SECURITY DEFINER 가 아닙니다.';
    END IF;
    -- ⚠️ 남의 학급 배치를 볼 수 있으면 안 된다.
    IF v_def NOT LIKE '%class.teacher_id = auth.uid()%' THEN
        RAISE EXCEPTION '읽기 함수가 학급 주인을 확인하지 않습니다.';
    END IF;
    -- 스크린은 오래 열려 있다. 지난 기록을 통째로 읽으면 안 된다.
    IF v_def NOT LIKE '%LIMIT 1%' THEN
        RAISE EXCEPTION '읽기 함수가 한 건만 읽지 않습니다.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.role_routine_grants
        WHERE routine_name = 'get_class_board_arrangement_result_v1' AND grantee = 'anon'
    ) THEN
        RAISE EXCEPTION '로그인하지 않은 사람에게 배치 결과가 열려 있습니다.';
    END IF;

    -- 2) 검증 함수가 새 위젯을 알아야 한다. 모르면 저장할 때마다 경고가 뜬다.
    SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'validate_class_board_payload_v1';
    IF v_def IS NULL OR v_def NOT LIKE '%arrangement-board%' THEN
        RAISE EXCEPTION '스크린 위젯 검증이 자리·역할 배치 위젯을 모릅니다.';
    END IF;
    -- 예전 위젯 검증으로 넘기면 허용 목록에 없어 거부된다. 여기서 직접 봐야 한다.
    IF v_def NOT LIKE '%NOT IN (''meal-board'', ''notice-board'', ''arrangement-board'')%' THEN
        RAISE EXCEPTION '새 위젯이 옛 검증으로 넘어가 거부됩니다.';
    END IF;

    -- 3) 실제로 넣어 본다. 아무 학급이나 하나 잡아 검증만 돌린다(롤백된다).
    SELECT id INTO v_class FROM public.classes LIMIT 1;
    IF v_class IS NULL THEN
        RAISE NOTICE '학급이 없어 저장 검증은 건너뜁니다.';
        RETURN;
    END IF;

    v_widgets := JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT(
        'instanceId', 'arrangement-smoke', 'widgetId', 'arrangement-board', 'version', 1,
        'zone', 'content', 'size', 'large', 'order', 1,
        'placement', JSONB_BUILD_OBJECT('x', 5, 'y', 5, 'width', 40, 'height', 40, 'pinned', false),
        'config', JSONB_BUILD_OBJECT('heading', '자리 배치', 'kind', 'seat')
    ));
    PERFORM public.validate_class_board_payload_v1(
        v_class, JSONB_BUILD_OBJECT('version', 3), v_widgets);

    -- 종류가 자리·역할이 아니면 막아야 한다.
    BEGIN
        PERFORM public.validate_class_board_payload_v1(
            v_class, JSONB_BUILD_OBJECT('version', 3),
            JSONB_SET(v_widgets, '{0,config,kind}', '"모둠"'::JSONB));
        RAISE EXCEPTION '엉뚱한 배치 종류가 그대로 통과했습니다.';
    EXCEPTION WHEN SQLSTATE '22023' THEN
        NULL;
    END;

    -- 같은 위젯을 둘 넣으면 막아야 한다(스크린에 하나만 둔다).
    BEGIN
        PERFORM public.validate_class_board_payload_v1(
            v_class, JSONB_BUILD_OBJECT('version', 3),
            v_widgets || JSONB_SET(v_widgets -> 0, '{instanceId}', '"arrangement-smoke-2"'::JSONB));
        RAISE EXCEPTION '자리·역할 배치 위젯이 두 개 통과했습니다.';
    EXCEPTION WHEN SQLSTATE '22023' THEN
        NULL;
    END;
END;
$$;

SELECT '자리·역할 배치 위젯 검증 통과' AS smoke_result;
