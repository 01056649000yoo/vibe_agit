DO $$
DECLARE
    v_row public.system_daily_metrics%ROWTYPE;
BEGIN
    IF has_function_privilege(
        'authenticated',
        'public.record_system_resource_sample_v2(date,integer,integer,integer,numeric,integer,numeric,integer,numeric,integer,integer)',
        'EXECUTE'
    ) OR has_function_privilege(
        'anon',
        'public.record_system_resource_sample_v2(date,integer,integer,integer,numeric,integer,numeric,integer,numeric,integer,integer)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION '브라우저 역할이 현재 자원 기록 RPC를 실행할 수 있습니다.';
    END IF;

    IF has_function_privilege(
        'authenticated',
        'public.record_system_daily_metric_v2(date,bigint,bigint,numeric,numeric,integer,integer,timestamp with time zone,boolean)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION '브라우저 역할이 트래픽 기록 RPC를 실행할 수 있습니다.';
    END IF;

    PERFORM public.record_system_resource_sample_v2(
        CURRENT_DATE, 8427, 1500, 1024, 10.0, 150,
        18, 5400, 110, 35, 35
    );
    PERFORM public.record_system_resource_sample_v2(
        CURRENT_DATE, 8427, 3600, 0, 1.0, 151,
        57, 0, 123, 35, 35
    );

    SELECT * INTO v_row
    FROM public.system_daily_metrics
    WHERE metric_day = CURRENT_DATE;

    IF v_row.host_mem_available_pct <> 57 OR v_row.host_swap_used_mb <> 0 THEN
        RAISE EXCEPTION '맥 본체 현재값이 마지막 표본으로 갱신되지 않았습니다.';
    END IF;
    IF v_row.vm_mem_available_current_mb <> 3600 OR v_row.vm_swap_used_current_mb <> 0 THEN
        RAISE EXCEPTION '도커 VM 현재값이 마지막 표본으로 갱신되지 않았습니다.';
    END IF;
    IF v_row.vm_mem_available_min_mb > 1500 OR v_row.vm_swap_used_max_mb < 1024 THEN
        RAISE EXCEPTION '오늘 최악값이 현재값 갱신 때문에 사라졌습니다.';
    END IF;
    IF v_row.disk_free_gb <> 123 OR v_row.container_healthy <> 35 OR v_row.resource_sampled_at IS NULL THEN
        RAISE EXCEPTION '5분 현재 상태가 디스크·컨테이너·표본 시각을 갱신하지 않았습니다.';
    END IF;

    PERFORM public.record_system_daily_metric_v2(
        CURRENT_DATE, 100, 200, 123, 95.5, 35, 35,
        NOW() - INTERVAL '24 hours', FALSE
    );

    SELECT * INTO v_row
    FROM public.system_daily_metrics
    WHERE metric_day = CURRENT_DATE;

    IF v_row.rx_bytes <> 100 OR v_row.tx_bytes <> 200
       OR v_row.traffic_period_started_at IS NULL
       OR v_row.traffic_measured_at IS NULL
       OR v_row.traffic_complete IS DISTINCT FROM FALSE THEN
        RAISE EXCEPTION '트래픽 값·측정 구간·완전성 표지가 함께 저장되지 않았습니다.';
    END IF;
END;
$$;
