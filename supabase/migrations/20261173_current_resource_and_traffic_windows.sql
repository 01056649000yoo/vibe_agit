-- 관리자 서버 상태에 "현재"와 "오늘 최악"을 분리하고 트래픽 측정 구간을 남긴다 (2026-08-25).
--
-- 기존 문제:
--   1) 5분 기록은 도커 VM 의 오늘 최저 메모리·최대 스왑만 보존했다. 맥을 재시작해 현재 스왑이
--      0MB 가 되어도 화면에는 그날의 1,024MB 가 계속 보여 현재 상태처럼 오해했다.
--   2) 맥 본체 메모리·스왑은 아예 저장하지 않아, 본체가 굶어도 도커 VM 만 보고 정상이라 했다.
--   3) 04:50 트래픽은 직전 실행부터의 변화량인데 날짜만 보여 "오늘 0시부터"의 값처럼 보였다.
--      같은 행의 recorded_at 을 5분 자원 기록이 덮어 트래픽을 언제 잰 값인지도 잃었다.

BEGIN;

ALTER TABLE public.system_daily_metrics
    ADD COLUMN IF NOT EXISTS resource_sampled_at            TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS host_mem_available_pct         NUMERIC(5, 1),
    ADD COLUMN IF NOT EXISTS host_swap_used_mb              INTEGER,
    ADD COLUMN IF NOT EXISTS vm_mem_available_current_mb    INTEGER,
    ADD COLUMN IF NOT EXISTS vm_swap_used_current_mb        INTEGER,
    ADD COLUMN IF NOT EXISTS gateway_cpu_current_pct        NUMERIC(5, 1),
    ADD COLUMN IF NOT EXISTS gateway_mem_current_mb         INTEGER,
    ADD COLUMN IF NOT EXISTS traffic_period_started_at      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS traffic_measured_at            TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS traffic_complete               BOOLEAN;

COMMENT ON COLUMN public.system_daily_metrics.resource_sampled_at IS
    '맥·도커·디스크·컨테이너 현재값을 마지막으로 잰 시각. 5분 건강검진이 갱신한다.';
COMMENT ON COLUMN public.system_daily_metrics.host_mem_available_pct IS
    '맥 본체 memory_pressure -Q 의 현재 여유 비율. 도커 VM 값과 섞지 않는다.';
COMMENT ON COLUMN public.system_daily_metrics.vm_mem_available_current_mb IS
    '도커 VM 의 현재 여유 메모리. vm_mem_available_min_mb 는 같은 날 최저값이다.';
COMMENT ON COLUMN public.system_daily_metrics.traffic_measured_at IS
    '컨테이너 누적 NET I/O 변화량을 계산한 종료 시각. resource_sampled_at 과 별개다.';
COMMENT ON COLUMN public.system_daily_metrics.traffic_complete IS
    '측정 구간 중 기존 컨테이너 카운터 초기화가 없었으면 true. false 면 재시작 전 일부가 빠질 수 있다.';

-- 5분 건강검진용. 현재값은 덮어 쓰고, 오늘 최악값은 기존처럼 나쁜 방향으로만 보존한다.
CREATE OR REPLACE FUNCTION public.record_system_resource_sample_v2(
    p_day DATE,
    p_vm_mem_total_mb INTEGER,
    p_vm_mem_available_mb INTEGER,
    p_vm_swap_used_mb INTEGER,
    p_gateway_cpu_pct NUMERIC,
    p_gateway_mem_mb INTEGER,
    p_host_mem_available_pct NUMERIC,
    p_host_swap_used_mb INTEGER,
    p_disk_free_gb NUMERIC,
    p_container_total INTEGER,
    p_container_healthy INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF public.auth_user_role() IN ('TEACHER', 'STUDENT') THEN
        RAISE EXCEPTION '호스트 기록기만 부를 수 있습니다.' USING ERRCODE = '42501';
    END IF;
    IF p_day IS NULL OR p_day > CURRENT_DATE + 1
       OR p_vm_mem_total_mb < 0 OR p_vm_mem_available_mb < 0 OR p_vm_swap_used_mb < 0
       OR p_host_mem_available_pct < 0 OR p_host_mem_available_pct > 100
       OR p_host_swap_used_mb < 0 OR p_disk_free_gb < 0
       OR p_container_total < 0 OR p_container_healthy < 0
       OR p_container_healthy > p_container_total THEN
        RAISE EXCEPTION '서버 자원 기록값이 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.system_daily_metrics AS m (
        metric_day,
        vm_mem_total_mb, vm_mem_available_current_mb, vm_mem_available_min_mb,
        vm_swap_used_current_mb, vm_swap_used_max_mb,
        gateway_cpu_current_pct, gateway_cpu_max_pct,
        gateway_mem_current_mb, gateway_mem_max_mb,
        host_mem_available_pct, host_swap_used_mb,
        disk_free_gb, container_total, container_healthy,
        resource_sampled_at, recorded_at
    ) VALUES (
        p_day,
        p_vm_mem_total_mb, p_vm_mem_available_mb, p_vm_mem_available_mb,
        p_vm_swap_used_mb, p_vm_swap_used_mb,
        p_gateway_cpu_pct, p_gateway_cpu_pct,
        p_gateway_mem_mb, p_gateway_mem_mb,
        p_host_mem_available_pct, p_host_swap_used_mb,
        p_disk_free_gb, p_container_total, p_container_healthy,
        NOW(), NOW()
    )
    ON CONFLICT (metric_day) DO UPDATE SET
        vm_mem_total_mb = EXCLUDED.vm_mem_total_mb,
        vm_mem_available_current_mb = EXCLUDED.vm_mem_available_current_mb,
        vm_mem_available_min_mb = LEAST(
            COALESCE(m.vm_mem_available_min_mb, EXCLUDED.vm_mem_available_min_mb),
            EXCLUDED.vm_mem_available_min_mb
        ),
        vm_swap_used_current_mb = EXCLUDED.vm_swap_used_current_mb,
        vm_swap_used_max_mb = GREATEST(
            COALESCE(m.vm_swap_used_max_mb, EXCLUDED.vm_swap_used_max_mb),
            EXCLUDED.vm_swap_used_max_mb
        ),
        gateway_cpu_current_pct = EXCLUDED.gateway_cpu_current_pct,
        gateway_cpu_max_pct = GREATEST(
            COALESCE(m.gateway_cpu_max_pct, EXCLUDED.gateway_cpu_max_pct),
            EXCLUDED.gateway_cpu_max_pct
        ),
        gateway_mem_current_mb = EXCLUDED.gateway_mem_current_mb,
        gateway_mem_max_mb = GREATEST(
            COALESCE(m.gateway_mem_max_mb, EXCLUDED.gateway_mem_max_mb),
            EXCLUDED.gateway_mem_max_mb
        ),
        host_mem_available_pct = EXCLUDED.host_mem_available_pct,
        host_swap_used_mb = EXCLUDED.host_swap_used_mb,
        disk_free_gb = EXCLUDED.disk_free_gb,
        container_total = EXCLUDED.container_total,
        container_healthy = EXCLUDED.container_healthy,
        resource_sampled_at = NOW(),
        recorded_at = NOW();
END;
$function$;

REVOKE ALL ON FUNCTION public.record_system_resource_sample_v2(
    DATE, INTEGER, INTEGER, INTEGER, NUMERIC, INTEGER, NUMERIC, INTEGER, NUMERIC, INTEGER, INTEGER
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_system_resource_sample_v2(
    DATE, INTEGER, INTEGER, INTEGER, NUMERIC, INTEGER, NUMERIC, INTEGER, NUMERIC, INTEGER, INTEGER
) TO service_role;

-- 하루 트래픽 기록용. 트래픽 시각은 5분 자원 기록 시각과 분리한다.
CREATE OR REPLACE FUNCTION public.record_system_daily_metric_v2(
    p_day DATE,
    p_rx_bytes BIGINT,
    p_tx_bytes BIGINT,
    p_disk_free_gb NUMERIC,
    p_db_size_mb NUMERIC,
    p_container_total INTEGER,
    p_container_healthy INTEGER,
    p_traffic_period_started_at TIMESTAMPTZ,
    p_traffic_complete BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF public.auth_user_role() NOT IN ('', 'ADMIN') THEN
        RAISE EXCEPTION '기록 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;
    IF p_day IS NULL OR p_day > CURRENT_DATE + 1
       OR p_rx_bytes < 0 OR p_tx_bytes < 0
       OR p_disk_free_gb < 0 OR p_db_size_mb < 0
       OR p_container_total < 0 OR p_container_healthy < 0
       OR p_container_healthy > p_container_total
       OR p_traffic_period_started_at > NOW() THEN
        RAISE EXCEPTION '일일 지표 기록값이 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.system_daily_metrics AS m (
        metric_day, rx_bytes, tx_bytes, disk_free_gb, db_size_mb,
        container_total, container_healthy,
        traffic_period_started_at, traffic_measured_at, traffic_complete, recorded_at
    ) VALUES (
        p_day, p_rx_bytes, p_tx_bytes, p_disk_free_gb, p_db_size_mb,
        p_container_total, p_container_healthy,
        p_traffic_period_started_at,
        CASE WHEN p_rx_bytes IS NULL OR p_tx_bytes IS NULL THEN NULL ELSE NOW() END,
        CASE WHEN p_rx_bytes IS NULL OR p_tx_bytes IS NULL THEN NULL ELSE p_traffic_complete END,
        NOW()
    )
    ON CONFLICT (metric_day) DO UPDATE SET
        rx_bytes = EXCLUDED.rx_bytes,
        tx_bytes = EXCLUDED.tx_bytes,
        disk_free_gb = EXCLUDED.disk_free_gb,
        db_size_mb = EXCLUDED.db_size_mb,
        container_total = EXCLUDED.container_total,
        container_healthy = EXCLUDED.container_healthy,
        traffic_period_started_at = EXCLUDED.traffic_period_started_at,
        traffic_measured_at = EXCLUDED.traffic_measured_at,
        traffic_complete = EXCLUDED.traffic_complete,
        recorded_at = NOW();

    DELETE FROM public.system_daily_metrics WHERE metric_day < CURRENT_DATE - 730;

    RETURN jsonb_build_object('success', TRUE, 'day', p_day);
END;
$function$;

REVOKE ALL ON FUNCTION public.record_system_daily_metric_v2(
    DATE, BIGINT, BIGINT, NUMERIC, NUMERIC, INTEGER, INTEGER, TIMESTAMPTZ, BOOLEAN
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_system_daily_metric_v2(
    DATE, BIGINT, BIGINT, NUMERIC, NUMERIC, INTEGER, INTEGER, TIMESTAMPTZ, BOOLEAN
) TO service_role;

-- 기존 한 번짜리 관리자 조회 계약을 유지하면서 현재값과 트래픽 구간을 함께 반환한다.
CREATE OR REPLACE FUNCTION public.admin_get_service_overview_v1(p_trend_days INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_days INTEGER := LEAST(GREATEST(COALESCE(p_trend_days, 30), 7), 90);
    v_today_date DATE := timezone('Asia/Seoul', NOW())::DATE;
    v_today_start TIMESTAMPTZ;
    v_week_start TIMESTAMPTZ;
    v_scope_start TIMESTAMPTZ;
    v_today JSONB;
    v_week JSONB;
    v_ai_scopes JSONB;
    v_trend JSONB;
    v_latest JSONB;
    v_alerts JSONB;
BEGIN
    IF public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION '관리자만 볼 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    v_today_start := v_today_date::TIMESTAMP AT TIME ZONE 'Asia/Seoul';
    v_week_start := (v_today_date - 6)::TIMESTAMP AT TIME ZONE 'Asia/Seoul';
    v_scope_start := (v_today_date - (v_days - 1))::TIMESTAMP AT TIME ZONE 'Asia/Seoul';

    SELECT jsonb_build_object(
        'teachers', (SELECT count(*) FROM public.profiles
                     WHERE role = 'TEACHER' AND last_login_at >= v_today_start),
        'students', (SELECT count(*) FROM public.students
                     WHERE last_login >= v_today_start
                       AND (deleted_at IS NULL OR deleted_at > NOW())),
        'ai_calls', (SELECT count(*) FROM public.ai_request_events
                     WHERE created_at >= v_today_start),
        'posts',    (SELECT count(*) FROM public.student_posts
                     WHERE is_submitted IS TRUE
                       AND COALESCE(first_submitted_at, created_at) >= v_today_start)
    ) INTO v_today;

    SELECT jsonb_build_object(
        'teachers', (SELECT count(*) FROM public.profiles
                     WHERE role = 'TEACHER' AND last_login_at >= v_week_start),
        'students', (SELECT count(*) FROM public.students
                     WHERE last_login >= v_week_start
                       AND (deleted_at IS NULL OR deleted_at > NOW())),
        'ai_calls', (SELECT count(*) FROM public.ai_request_events
                     WHERE created_at >= v_week_start),
        'posts',    (SELECT count(*) FROM public.student_posts
                     WHERE is_submitted IS TRUE
                       AND COALESCE(first_submitted_at, created_at) >= v_week_start)
    ) INTO v_week;

    SELECT COALESCE(jsonb_object_agg(scope, cnt), '{}'::JSONB) INTO v_ai_scopes
    FROM (
        SELECT scope, count(*) AS cnt
        FROM public.ai_request_events
        WHERE created_at >= v_scope_start
        GROUP BY scope
    ) s;

    SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.metric_day), '[]'::JSONB) INTO v_trend
    FROM (
        SELECT metric_day, rx_bytes, tx_bytes,
               traffic_period_started_at, traffic_measured_at, traffic_complete,
               disk_free_gb, db_size_mb, container_total, container_healthy,
               resource_sampled_at, host_mem_available_pct, host_swap_used_mb,
               vm_mem_total_mb, vm_mem_available_current_mb, vm_mem_available_min_mb,
               vm_swap_used_current_mb, vm_swap_used_max_mb,
               gateway_cpu_current_pct, gateway_cpu_max_pct,
               gateway_mem_current_mb, gateway_mem_max_mb
        FROM public.system_daily_metrics
        WHERE metric_day >= v_today_date - (v_days - 1)
          AND metric_day <= v_today_date
        ORDER BY metric_day
    ) d;

    SELECT to_jsonb(m) INTO v_latest FROM (
        SELECT metric_day, rx_bytes, tx_bytes,
               traffic_period_started_at, traffic_measured_at, traffic_complete,
               disk_free_gb, db_size_mb, container_total, container_healthy,
               resource_sampled_at, recorded_at,
               host_mem_available_pct, host_swap_used_mb,
               vm_mem_total_mb, vm_mem_available_current_mb, vm_mem_available_min_mb,
               vm_swap_used_current_mb, vm_swap_used_max_mb,
               gateway_cpu_current_pct, gateway_cpu_max_pct,
               gateway_mem_current_mb, gateway_mem_max_mb
        FROM public.system_daily_metrics
        WHERE metric_day <= v_today_date
        ORDER BY metric_day DESC
        LIMIT 1
    ) m;

    SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.last_seen_at DESC), '[]'::JSONB) INTO v_alerts
    FROM (
        SELECT alert_key, status, detail, first_seen_at, last_seen_at, resolved_at, notified_at
        FROM public.system_alert_events
        ORDER BY last_seen_at DESC
        LIMIT 20
    ) a;

    RETURN jsonb_build_object(
        'version', 2,
        'trend_days', v_days,
        'today', v_today,
        'week', v_week,
        'ai_scopes', v_ai_scopes,
        'trend', v_trend,
        'latest', COALESCE(v_latest, 'null'::JSONB),
        'alerts', v_alerts,
        'open_alerts', (SELECT count(*) FROM public.system_alert_events WHERE status = 'open')
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_get_service_overview_v1(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_service_overview_v1(INTEGER) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
