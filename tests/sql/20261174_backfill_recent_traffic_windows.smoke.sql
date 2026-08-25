DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.system_daily_metrics
        WHERE metric_day BETWEEN DATE '2026-08-24' AND DATE '2026-08-25'
          AND rx_bytes IS NOT NULL
          AND tx_bytes IS NOT NULL
          AND (traffic_period_started_at IS NULL OR traffic_measured_at IS NULL)
    ) THEN
        RAISE EXCEPTION '기존 최근 트래픽의 측정 구간 시각이 비어 있습니다.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.system_daily_metrics
        WHERE metric_day BETWEEN DATE '2026-08-24' AND DATE '2026-08-25'
          AND traffic_measured_at IS NOT NULL
          AND traffic_measured_at - traffic_period_started_at <> INTERVAL '24 hours'
    ) THEN
        RAISE EXCEPTION '기존 트래픽 측정 구간이 04:50 기준 24시간이 아닙니다.';
    END IF;
END;
$$;
