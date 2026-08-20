DO $$
BEGIN
    IF has_table_privilege('anon', 'public.system_backup_runs', 'SELECT')
       OR has_table_privilege('authenticated', 'public.system_backup_runs', 'SELECT')
       OR has_table_privilege('authenticated', 'public.system_backup_runs', 'INSERT') THEN
        RAISE EXCEPTION 'browser roles must not access system_backup_runs directly';
    END IF;

    IF NOT has_function_privilege('authenticated', 'public.admin_get_backup_runs_v1(integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated admins need execute privilege on backup status RPC';
    END IF;
END;
$$;

INSERT INTO public.system_backup_runs (
    run_key, job_type, status, backup_day, started_at, finished_at,
    local_ok, drive_ok, external_ok, artifact_count, detail_code
)
VALUES (
    'migration-smoke-daily', 'daily', 'PASS', CURRENT_DATE, NOW() - INTERVAL '1 minute', NOW(),
    TRUE, TRUE, TRUE, 8, 'all_good'
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.system_backup_runs run
        WHERE run.run_key = 'migration-smoke-daily'
          AND run.artifact_count = 8
          AND run.local_ok IS TRUE
          AND run.drive_ok IS TRUE
          AND run.external_ok IS TRUE
    ) THEN
        RAISE EXCEPTION 'backup status row could not be recorded';
    END IF;
END;
$$;
