DO $$
BEGIN
    IF has_table_privilege('anon', 'public.system_backup_app_results', 'SELECT')
       OR has_table_privilege('authenticated', 'public.system_backup_app_results', 'SELECT')
       OR has_table_privilege('authenticated', 'public.system_backup_app_results', 'INSERT') THEN
        RAISE EXCEPTION 'browser roles must not access system_backup_app_results directly';
    END IF;
END;
$$;

INSERT INTO public.system_backup_runs (
    run_key, job_type, status, backup_day, started_at, finished_at,
    local_ok, drive_ok, external_ok, artifact_count, detail_code
)
VALUES (
    'migration-smoke-apps', 'daily', 'PASS', CURRENT_DATE, NOW() - INTERVAL '1 minute', NOW(),
    TRUE, TRUE, TRUE, 7, 'all_good'
);

INSERT INTO public.system_backup_app_results (
    run_key, app_key, status, db_ok, files_ok, object_count, detail_code
)
VALUES
    ('migration-smoke-apps', 'agit', 'PASS', TRUE, TRUE, 147, 'backup_verified'),
    ('migration-smoke-apps', 'samlink', 'PASS', TRUE, TRUE, 9, 'backup_verified'),
    ('migration-smoke-apps', 'jarvis', 'PASS', TRUE, TRUE, 9, 'backup_verified');

DO $$
BEGIN
    IF (SELECT count(*) FROM public.system_backup_app_results WHERE run_key = 'migration-smoke-apps') <> 3 THEN
        RAISE EXCEPTION 'three app backup results were not recorded';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.system_backup_app_results
        WHERE run_key = 'migration-smoke-apps' AND (status <> 'PASS' OR db_ok IS NOT TRUE OR files_ok IS NOT TRUE)
    ) THEN
        RAISE EXCEPTION 'app backup result fields are incorrect';
    END IF;
END;
$$;
