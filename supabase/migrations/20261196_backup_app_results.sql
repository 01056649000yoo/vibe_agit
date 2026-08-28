BEGIN;

-- 한 번의 백업·복구 실행 아래에 3개 앱의 판정만 저장한다.
-- 브라우저에는 표를 공개하지 않고 기존 관리자 RPC 응답에 안전한 필드만 포함한다.
CREATE TABLE IF NOT EXISTS public.system_backup_app_results (
    run_key TEXT NOT NULL REFERENCES public.system_backup_runs(run_key) ON DELETE CASCADE,
    app_key TEXT NOT NULL CHECK (app_key IN ('agit', 'samlink', 'jarvis')),
    status TEXT NOT NULL CHECK (status IN ('PASS', 'FAIL')),
    db_ok BOOLEAN,
    files_ok BOOLEAN,
    object_count INTEGER CHECK (object_count >= 0),
    detail_code TEXT NOT NULL DEFAULT '' CHECK (
        char_length(detail_code) <= 120
        AND detail_code ~ '^[a-z0-9_,:-]*$'
    ),
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (run_key, app_key)
);

CREATE INDEX IF NOT EXISTS idx_system_backup_app_results_app_checked
    ON public.system_backup_app_results (app_key, checked_at DESC);

ALTER TABLE public.system_backup_app_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.system_backup_app_results FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_backup_runs_v1(
    p_limit INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION 'Only admins can read backup status' USING ERRCODE = '42501';
    END IF;

    SELECT jsonb_build_object(
        'server_time', NOW(),
        'daily_stale_after_hours', 26,
        'restore_stale_after_days', 40,
        'expected_app_count', 3,
        'runs', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'run_key', run.run_key,
                    'job_type', run.job_type,
                    'status', run.status,
                    'backup_day', run.backup_day,
                    'started_at', run.started_at,
                    'finished_at', run.finished_at,
                    'local_ok', run.local_ok,
                    'drive_ok', run.drive_ok,
                    'external_ok', run.external_ok,
                    'artifact_count', run.artifact_count,
                    'agit_table_count', run.agit_table_count,
                    'lab_table_count', run.lab_table_count,
                    'storage_file_count', run.storage_file_count,
                    'detail_code', run.detail_code,
                    'app_results', (
                        SELECT COALESCE(
                            jsonb_agg(
                                jsonb_build_object(
                                    'app_key', app.app_key,
                                    'status', app.status,
                                    'db_ok', app.db_ok,
                                    'files_ok', app.files_ok,
                                    'object_count', app.object_count,
                                    'detail_code', app.detail_code,
                                    'checked_at', app.checked_at
                                )
                                ORDER BY CASE app.app_key
                                    WHEN 'agit' THEN 1 WHEN 'samlink' THEN 2 ELSE 3 END
                            ),
                            '[]'::JSONB
                        )
                        FROM public.system_backup_app_results app
                        WHERE app.run_key = run.run_key
                    )
                )
                ORDER BY run.started_at DESC
            ),
            '[]'::JSONB
        )
    )
    INTO v_result
    FROM (
        SELECT backup.*
        FROM public.system_backup_runs backup
        ORDER BY backup.started_at DESC
        LIMIT v_limit
    ) run;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_backup_runs_v1(INTEGER)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_backup_runs_v1(INTEGER)
    TO authenticated, service_role;

-- 관리자 첫 화면과 서버 상태 화면은 이미 이 RPC 하나를 함께 쓴다.
-- 별도 조회를 늘리지 않고 최신 백업·복구의 앱별 집계를 같은 응답에 보탠다.
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
    v_comment_queue JSONB;
    v_backup JSONB;
BEGIN
    IF public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION '관리자만 볼 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    v_today_start := v_today_date::TIMESTAMP AT TIME ZONE 'Asia/Seoul';
    v_week_start := (v_today_date - 6)::TIMESTAMP AT TIME ZONE 'Asia/Seoul';
    v_scope_start := (v_today_date - (v_days - 1))::TIMESTAMP AT TIME ZONE 'Asia/Seoul';

    SELECT jsonb_build_object(
        'teachers', (SELECT count(*) FROM public.profiles WHERE role = 'TEACHER' AND last_login_at >= v_today_start),
        'students', (SELECT count(*) FROM public.students WHERE last_login >= v_today_start AND (deleted_at IS NULL OR deleted_at > NOW())),
        'ai_calls', (SELECT count(*) FROM public.ai_request_events WHERE created_at >= v_today_start),
        'posts', (SELECT count(*) FROM public.student_posts WHERE is_submitted IS TRUE AND COALESCE(first_submitted_at, created_at) >= v_today_start)
    ) INTO v_today;

    SELECT jsonb_build_object(
        'teachers', (SELECT count(*) FROM public.profiles WHERE role = 'TEACHER' AND last_login_at >= v_week_start),
        'students', (SELECT count(*) FROM public.students WHERE last_login >= v_week_start AND (deleted_at IS NULL OR deleted_at > NOW())),
        'ai_calls', (SELECT count(*) FROM public.ai_request_events WHERE created_at >= v_week_start),
        'posts', (SELECT count(*) FROM public.student_posts WHERE is_submitted IS TRUE AND COALESCE(first_submitted_at, created_at) >= v_week_start)
    ) INTO v_week;

    SELECT COALESCE(jsonb_object_agg(scope, cnt), '{}'::JSONB) INTO v_ai_scopes
    FROM (
        SELECT scope, count(*) AS cnt FROM public.ai_request_events
        WHERE created_at >= v_scope_start GROUP BY scope
    ) scope_counts;

    SELECT COALESCE(jsonb_agg(to_jsonb(day_row) ORDER BY day_row.metric_day), '[]'::JSONB) INTO v_trend
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
        WHERE metric_day >= v_today_date - (v_days - 1) AND metric_day <= v_today_date
        ORDER BY metric_day
    ) day_row;

    SELECT to_jsonb(latest_row) INTO v_latest FROM (
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
        ORDER BY metric_day DESC LIMIT 1
    ) latest_row;

    SELECT COALESCE(jsonb_agg(to_jsonb(alert_row) ORDER BY alert_row.last_seen_at DESC), '[]'::JSONB) INTO v_alerts
    FROM (
        SELECT alert_key, status, detail, first_seen_at, last_seen_at, resolved_at, notified_at
        FROM public.system_alert_events ORDER BY last_seen_at DESC LIMIT 20
    ) alert_row;

    SELECT jsonb_build_object(
        'limit', 3,
        'queued', count(*) FILTER (
            WHERE status = 'pending' AND ai_review_attempts < 2
              AND ai_review_next_at IS NOT NULL AND ai_review_token IS NULL
        ),
        'processing', (SELECT count(*) FROM public.comment_ai_review_slots WHERE lease_until > NOW()),
        'needs_teacher', count(*) FILTER (
            WHERE status = 'pending' AND ai_review_attempts >= 2 AND ai_review_last_error_code IS NOT NULL
        ),
        'completed_today', count(*) FILTER (
            WHERE status IN ('approved', 'blocked') AND moderated_by IN ('ai', 'local_rule')
              AND moderated_at >= v_today_start
        ),
        'oldest_wait_seconds', COALESCE(floor(extract(epoch FROM NOW() - (
            min(ai_review_enqueued_at) FILTER (
                WHERE status = 'pending' AND ai_review_attempts < 2 AND ai_review_next_at IS NOT NULL
            )
        ))), 0)
    ) INTO v_comment_queue
    FROM public.post_comments;

    WITH latest_runs AS (
        SELECT DISTINCT ON (job_type) run_key, job_type, status, finished_at, started_at
        FROM public.system_backup_runs
        ORDER BY job_type, started_at DESC
    ), app_counts AS (
        SELECT result.run_key,
               count(*) AS recorded,
               count(*) FILTER (WHERE result.status = 'PASS') AS passed
        FROM public.system_backup_app_results result
        GROUP BY result.run_key
    )
    SELECT jsonb_build_object(
        'expected_apps', 3,
        'daily_status', daily.status,
        'daily_finished_at', COALESCE(daily.finished_at, daily.started_at),
        'daily_app_recorded', COALESCE(daily_count.recorded, 0),
        'daily_app_passed', COALESCE(daily_count.passed, 0),
        'daily_fresh', COALESCE(COALESCE(daily.finished_at, daily.started_at) >= NOW() - INTERVAL '26 hours', false),
        'restore_status', restore.status,
        'restore_finished_at', COALESCE(restore.finished_at, restore.started_at),
        'restore_app_recorded', COALESCE(restore_count.recorded, 0),
        'restore_app_passed', COALESCE(restore_count.passed, 0),
        'restore_fresh', COALESCE(COALESCE(restore.finished_at, restore.started_at) >= NOW() - INTERVAL '40 days', false),
        'attention_count', CASE
            WHEN daily.run_key IS NULL OR daily.status <> 'PASS'
              OR COALESCE(daily.finished_at, daily.started_at) < NOW() - INTERVAL '26 hours' THEN 3
            WHEN COALESCE(daily_count.recorded, 0) > 0 AND COALESCE(daily_count.passed, 0) < 3
              THEN 3 - COALESCE(daily_count.passed, 0)
            WHEN restore.run_key IS NULL OR restore.status <> 'PASS'
              OR COALESCE(restore.finished_at, restore.started_at) < NOW() - INTERVAL '40 days' THEN 3
            WHEN COALESCE(restore_count.recorded, 0) > 0 AND COALESCE(restore_count.passed, 0) < 3
              THEN 3 - COALESCE(restore_count.passed, 0)
            ELSE 0
        END
    ) INTO v_backup
    FROM (SELECT 1) seed
    LEFT JOIN latest_runs daily ON daily.job_type = 'daily'
    LEFT JOIN latest_runs restore ON restore.job_type = 'restore'
    LEFT JOIN app_counts daily_count ON daily_count.run_key = daily.run_key
    LEFT JOIN app_counts restore_count ON restore_count.run_key = restore.run_key;

    RETURN jsonb_build_object(
        'version', 4,
        'trend_days', v_days,
        'today', v_today,
        'week', v_week,
        'ai_scopes', v_ai_scopes,
        'comment_ai_queue', v_comment_queue,
        'backup', v_backup,
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
