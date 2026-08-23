-- 메모리·스왑·게이트웨이 최고치를 하루 한 줄에 함께 남긴다 (2026-08-23).
--
-- 배경: 2026-08-23 에 도커 VM 메모리가 여유 10% 에 스왑 1GB 가 100% 찬 것을 사람이 손으로
--       `free` 를 돌려 보고서야 알았다. 학생 접속이 0명인 방학 중에도 그랬다. 지금 감시하는 것은
--       앱 응답·디스크·컨테이너 상태·백업뿐이라 **메모리는 아무도 보지 않는다**.
--
-- 왜 최고치인가: 지표 기록은 하루 한 번(04:50) 도는데, 그때는 새벽이라 가장 한가하다. 정작 알고 싶은
--       것은 수업 시간의 가장 나쁜 순간이다. 그래서 5분마다 도는 건강검진이 값을 재서
--       **그날의 최악값만 갱신**한다(메모리는 가장 적었던 여유, 스왑·CPU 는 가장 컸던 값).
--
-- 게이트웨이를 따로 보는 이유: kong 워커 수를 언제 올려야 하는지 판단하려면 그 CPU 를 봐야 한다.
--       2026-08-23 에 워커를 10 → 2 로 줄였고(메모리 1,136MB → 147MB), 학생이 늘어 CPU 가 계속
--       높으면 그때 올린다. 그 판단 근거를 화면에서 볼 수 있게 남긴다.

BEGIN;

ALTER TABLE public.system_daily_metrics
    ADD COLUMN IF NOT EXISTS vm_mem_total_mb        INTEGER,
    ADD COLUMN IF NOT EXISTS vm_mem_available_min_mb INTEGER,
    ADD COLUMN IF NOT EXISTS vm_swap_used_max_mb    INTEGER,
    ADD COLUMN IF NOT EXISTS gateway_cpu_max_pct    NUMERIC(5,1),
    ADD COLUMN IF NOT EXISTS gateway_mem_max_mb     INTEGER;

COMMENT ON COLUMN public.system_daily_metrics.vm_mem_available_min_mb IS
    '그날 도커 VM 의 여유 메모리가 가장 적었던 순간의 값(MB). 낮을수록 나쁘다.';
COMMENT ON COLUMN public.system_daily_metrics.vm_swap_used_max_mb IS
    '그날 스왑을 가장 많이 쓴 순간의 값(MB). 0 이 아니면 메모리가 모자랐다는 뜻이다.';
COMMENT ON COLUMN public.system_daily_metrics.gateway_cpu_max_pct IS
    '그날 API 게이트웨이(kong)의 CPU 최고치(%). 계속 높으면 워커 수를 올릴 때다.';

-- 5분마다 부르며 그날의 최악값만 남긴다. 같은 날 여러 번 불러도 나빠진 쪽으로만 움직인다.
CREATE OR REPLACE FUNCTION public.record_system_peak_v1(
    p_day DATE,
    p_mem_total_mb INTEGER,
    p_mem_available_mb INTEGER,
    p_swap_used_mb INTEGER,
    p_gateway_cpu_pct NUMERIC,
    p_gateway_mem_mb INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- 호스트 스크립트만 부른다. 로그인한 교사·학생에게는 실행 권한을 주지 않는다.
    IF public.auth_user_role() IN ('TEACHER', 'STUDENT') THEN
        RAISE EXCEPTION '호스트 기록기만 부를 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.system_daily_metrics AS m (
        metric_day, vm_mem_total_mb, vm_mem_available_min_mb,
        vm_swap_used_max_mb, gateway_cpu_max_pct, gateway_mem_max_mb
    ) VALUES (
        p_day, p_mem_total_mb, p_mem_available_mb,
        p_swap_used_mb, p_gateway_cpu_pct, p_gateway_mem_mb
    )
    ON CONFLICT (metric_day) DO UPDATE SET
        vm_mem_total_mb = COALESCE(EXCLUDED.vm_mem_total_mb, m.vm_mem_total_mb),
        -- 여유 메모리는 가장 적었던 값을 남긴다.
        vm_mem_available_min_mb = LEAST(
            COALESCE(m.vm_mem_available_min_mb, EXCLUDED.vm_mem_available_min_mb),
            COALESCE(EXCLUDED.vm_mem_available_min_mb, m.vm_mem_available_min_mb)
        ),
        -- 스왑과 CPU 는 가장 컸던 값을 남긴다.
        vm_swap_used_max_mb = GREATEST(
            COALESCE(m.vm_swap_used_max_mb, EXCLUDED.vm_swap_used_max_mb),
            COALESCE(EXCLUDED.vm_swap_used_max_mb, m.vm_swap_used_max_mb)
        ),
        gateway_cpu_max_pct = GREATEST(
            COALESCE(m.gateway_cpu_max_pct, EXCLUDED.gateway_cpu_max_pct),
            COALESCE(EXCLUDED.gateway_cpu_max_pct, m.gateway_cpu_max_pct)
        ),
        gateway_mem_max_mb = GREATEST(
            COALESCE(m.gateway_mem_max_mb, EXCLUDED.gateway_mem_max_mb),
            COALESCE(EXCLUDED.gateway_mem_max_mb, m.gateway_mem_max_mb)
        );
END;
$function$;

COMMENT ON FUNCTION public.record_system_peak_v1(DATE, INTEGER, INTEGER, INTEGER, NUMERIC, INTEGER) IS
    '5분마다 도는 건강검진이 부른다. 그날의 메모리 최저 여유와 스왑·게이트웨이 최고치를 남긴다.';

REVOKE ALL ON FUNCTION public.record_system_peak_v1(DATE, INTEGER, INTEGER, INTEGER, NUMERIC, INTEGER)
    FROM PUBLIC, anon, authenticated;

-- 화면이 새 값을 읽을 수 있도록 조회 RPC 도 함께 다시 만든다.
-- 함수 본문은 운영 DB 원문을 그대로 떠서 select 목록에만 새 칸을 더했다.
CREATE OR REPLACE FUNCTION public.admin_get_service_overview_v1(p_trend_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_days INTEGER := LEAST(GREATEST(COALESCE(p_trend_days, 30), 7), 90);
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

    SELECT jsonb_build_object(
        'teachers', (SELECT count(*) FROM public.profiles
                     WHERE role = 'TEACHER' AND last_login_at >= date_trunc('day', NOW())),
        'students', (SELECT count(*) FROM public.students
                     WHERE last_login >= date_trunc('day', NOW())),
        'ai_calls', (SELECT count(*) FROM public.ai_request_events
                     WHERE created_at >= date_trunc('day', NOW())),
        'posts',    (SELECT count(*) FROM public.student_posts
                     WHERE created_at >= date_trunc('day', NOW()))
    ) INTO v_today;

    SELECT jsonb_build_object(
        'teachers', (SELECT count(*) FROM public.profiles
                     WHERE role = 'TEACHER' AND last_login_at >= NOW() - INTERVAL '7 days'),
        'students', (SELECT count(*) FROM public.students
                     WHERE last_login >= NOW() - INTERVAL '7 days'),
        'ai_calls', (SELECT count(*) FROM public.ai_request_events
                     WHERE created_at >= NOW() - INTERVAL '7 days'),
        'posts',    (SELECT count(*) FROM public.student_posts
                     WHERE created_at >= NOW() - INTERVAL '7 days')
    ) INTO v_week;

    -- AI 호출은 종류별로 나눠 본다. 어디서 비용이 나는지가 여기서 갈린다.
    SELECT COALESCE(jsonb_object_agg(scope, cnt), '{}'::jsonb) INTO v_ai_scopes
    FROM (
        SELECT scope, count(*) AS cnt FROM public.ai_request_events
        WHERE created_at >= NOW() - (v_days || ' days')::INTERVAL
        GROUP BY scope
    ) s;

    -- 추세: 하루 한 줄. 기록이 없는 날은 빠진다(스크립트가 아직 안 돌았거나 꺼진 날).
    SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.metric_day), '[]'::jsonb) INTO v_trend
    FROM (
        SELECT metric_day, rx_bytes, tx_bytes, disk_free_gb, db_size_mb,
               container_total, container_healthy,
               vm_mem_total_mb, vm_mem_available_min_mb, vm_swap_used_max_mb,
               gateway_cpu_max_pct, gateway_mem_max_mb
        FROM public.system_daily_metrics
        WHERE metric_day >= (CURRENT_DATE - v_days)
        ORDER BY metric_day
    ) d;

    SELECT to_jsonb(m) INTO v_latest FROM (
        SELECT metric_day, rx_bytes, tx_bytes, disk_free_gb, db_size_mb,
               container_total, container_healthy, recorded_at,
               vm_mem_total_mb, vm_mem_available_min_mb, vm_swap_used_max_mb,
               gateway_cpu_max_pct, gateway_mem_max_mb
        FROM public.system_daily_metrics ORDER BY metric_day DESC LIMIT 1
    ) m;

    SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.last_seen_at DESC), '[]'::jsonb) INTO v_alerts
    FROM (
        SELECT alert_key, status, detail, first_seen_at, last_seen_at, resolved_at, notified_at
        FROM public.system_alert_events
        ORDER BY last_seen_at DESC LIMIT 20
    ) a;

    RETURN jsonb_build_object(
        'version', 1,
        'trend_days', v_days,
        'today', v_today,
        'week', v_week,
        'ai_scopes', v_ai_scopes,
        'trend', v_trend,
        'latest', COALESCE(v_latest, 'null'::jsonb),
        'alerts', v_alerts,
        'open_alerts', (SELECT count(*) FROM public.system_alert_events WHERE status = 'open')
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_get_service_overview_v1(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_service_overview_v1(INTEGER) TO authenticated, service_role;

COMMIT;
