BEGIN;

INSERT INTO public.system_backup_runs (
    run_key, job_type, status, backup_day, started_at, finished_at,
    local_ok, drive_ok, external_ok, artifact_count, detail_code
) VALUES (
    'smoke-completion-pass', 'daily', 'PASS', CURRENT_DATE, NOW(), NOW(),
    true, true, true, 7, 'all_good'
);

DO $$
BEGIN
    IF (SELECT status FROM public.system_backup_runs WHERE run_key = 'smoke-completion-pass') <> 'RUNNING' THEN
        RAISE EXCEPTION 'parent PASS must wait for all three app rows';
    END IF;
END;
$$;

INSERT INTO public.system_backup_app_results
    (run_key, app_key, status, db_ok, files_ok, object_count)
VALUES
    ('smoke-completion-pass', 'agit', 'PASS', true, true, 1),
    ('smoke-completion-pass', 'samlink', 'PASS', true, true, 1);

DO $$
BEGIN
    IF (SELECT status FROM public.system_backup_runs WHERE run_key = 'smoke-completion-pass') <> 'RUNNING' THEN
        RAISE EXCEPTION 'two app rows must not finalize the parent';
    END IF;
END;
$$;

INSERT INTO public.system_backup_app_results
    (run_key, app_key, status, db_ok, files_ok, object_count)
VALUES ('smoke-completion-pass', 'jarvis', 'PASS', true, true, 1);

DO $$
BEGIN
    IF (SELECT status FROM public.system_backup_runs WHERE run_key = 'smoke-completion-pass') <> 'PASS' THEN
        RAISE EXCEPTION 'three passing app rows must finalize a complete daily backup';
    END IF;
END;
$$;

INSERT INTO public.system_backup_runs (
    run_key, job_type, status, backup_day, started_at, finished_at,
    local_ok, drive_ok, external_ok, artifact_count, detail_code
) VALUES (
    'smoke-completion-fail', 'daily', 'PASS', CURRENT_DATE, NOW(), NOW(),
    true, true, true, 7, 'all_good'
);

INSERT INTO public.system_backup_app_results
    (run_key, app_key, status, db_ok, files_ok, object_count)
VALUES
    ('smoke-completion-fail', 'agit', 'PASS', true, true, 1),
    ('smoke-completion-fail', 'samlink', 'PASS', true, true, 1),
    ('smoke-completion-fail', 'jarvis', 'FAIL', false, true, 0);

DO $$
BEGIN
    IF (SELECT status FROM public.system_backup_runs WHERE run_key = 'smoke-completion-fail') <> 'FAIL' THEN
        RAISE EXCEPTION 'an app failure must fail the parent run';
    END IF;
END;
$$;

-- 전환 전 8개 산출물 기록은 앱 결과가 없어도 기존 PASS 상태를 유지한다.
INSERT INTO public.system_backup_runs (
    run_key, job_type, status, backup_day, started_at, finished_at,
    local_ok, drive_ok, external_ok, artifact_count, detail_code
) VALUES (
    'smoke-completion-legacy', 'daily', 'PASS', CURRENT_DATE, NOW(), NOW(),
    true, true, true, 8, 'all_good'
);

DO $$
BEGIN
    IF (SELECT status FROM public.system_backup_runs WHERE run_key = 'smoke-completion-legacy') <> 'PASS' THEN
        RAISE EXCEPTION 'legacy run compatibility changed';
    END IF;
END;
$$;

ROLLBACK;
