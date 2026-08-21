-- 권한 경계
DO $$
BEGIN
    -- 기록 RPC 는 호스트 스크립트(service_role) 전용이다. 화면에서 부를 일이 없다.
    IF has_function_privilege('authenticated', 'public.record_system_alert_v1(text, boolean, text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.record_system_alert_v1(text, boolean, text)', 'EXECUTE') THEN
        RAISE EXCEPTION '장애 기록 RPC 가 화면에 열려 있습니다.';
    END IF;
    IF has_function_privilege('authenticated', 'public.record_system_daily_metric_v1(date, bigint, bigint, numeric, numeric, integer, integer)', 'EXECUTE') THEN
        RAISE EXCEPTION '지표 기록 RPC 가 화면에 열려 있습니다.';
    END IF;

    -- 조회는 관리자 화면이 쓴다.
    IF NOT has_function_privilege('authenticated', 'public.admin_get_service_overview_v1(integer)', 'EXECUTE') THEN
        RAISE EXCEPTION '관리자 화면이 서비스 현황을 읽을 수 없습니다.';
    END IF;
    IF has_function_privilege('anon', 'public.admin_get_service_overview_v1(integer)', 'EXECUTE') THEN
        RAISE EXCEPTION '익명 사용자에게 서비스 현황이 열려 있습니다.';
    END IF;

    -- 표에 직접 손대는 길은 닫혀 있어야 한다.
    IF has_table_privilege('authenticated', 'public.system_alert_events', 'SELECT') THEN
        RAISE EXCEPTION '교사가 장애 이력 표를 직접 읽을 수 있습니다.';
    END IF;
END;
$$;

/*
 * 이 기능의 핵심: **같은 문제로 반복해서 보내지 않는다.**
 * 앱이 30분 죽어 있으면 5분마다 6번 불리는데, 메일은 처음 1통과 복구 1통뿐이어야 한다.
 */
DO $$
DECLARE
    v1 JSONB; v2 JSONB; v3 JSONB; v4 JSONB;
BEGIN
    -- 1) 처음 발생 → 알린다
    v1 := public.record_system_alert_v1('smoke_test_alert', TRUE, '스모크');
    IF (v1->>'should_notify')::BOOLEAN IS NOT TRUE OR v1->>'event' <> 'opened' THEN
        RAISE EXCEPTION '처음 생긴 문제를 알리지 않습니다: %', v1;
    END IF;

    -- 2) 이어지는 동안 → 조용
    v2 := public.record_system_alert_v1('smoke_test_alert', TRUE, '스모크');
    IF (v2->>'should_notify')::BOOLEAN IS NOT FALSE THEN
        RAISE EXCEPTION '같은 문제로 또 알립니다(메일 폭탄): %', v2;
    END IF;

    -- 3) 풀리면 → 복구도 한 번 알린다
    v3 := public.record_system_alert_v1('smoke_test_alert', FALSE, NULL);
    IF (v3->>'should_notify')::BOOLEAN IS NOT TRUE OR v3->>'event' <> 'resolved' THEN
        RAISE EXCEPTION '복구를 알리지 않습니다: %', v3;
    END IF;

    -- 4) 계속 정상이면 → 조용
    v4 := public.record_system_alert_v1('smoke_test_alert', FALSE, NULL);
    IF (v4->>'should_notify')::BOOLEAN IS NOT FALSE THEN
        RAISE EXCEPTION '정상인데 알립니다: %', v4;
    END IF;

    -- 열린 알림은 종류마다 하나뿐이어야 한다.
    IF (SELECT count(*) FROM public.system_alert_events
        WHERE alert_key = 'smoke_test_alert' AND status = 'open') > 0 THEN
        RAISE EXCEPTION '복구 뒤에도 열린 알림이 남아 있습니다.';
    END IF;
END;
$$;

-- 하루 한 줄: 같은 날 두 번 적어도 한 줄이어야 한다.
DO $$
BEGIN
    PERFORM public.record_system_daily_metric_v1(CURRENT_DATE, 100, 200, 120.5, 317.0, 35, 30);
    PERFORM public.record_system_daily_metric_v1(CURRENT_DATE, 999, 888, 118.0, 318.0, 35, 31);

    IF (SELECT count(*) FROM public.system_daily_metrics WHERE metric_day = CURRENT_DATE) <> 1 THEN
        RAISE EXCEPTION '같은 날 기록이 여러 줄로 쌓입니다.';
    END IF;
    IF (SELECT rx_bytes FROM public.system_daily_metrics WHERE metric_day = CURRENT_DATE) <> 999 THEN
        RAISE EXCEPTION '나중 값으로 덮이지 않았습니다.';
    END IF;
END;
$$;
