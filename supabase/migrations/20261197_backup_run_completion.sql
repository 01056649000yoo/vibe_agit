BEGIN;

-- 새 형식(산출물 7개) 백업·복구는 부모 PASS만 먼저 남겨 성공으로 보이지 않게 한다.
-- 앱 결과 3행이 모두 기록된 뒤에야 부모 실행을 PASS/FAIL로 최종 확정한다.
CREATE OR REPLACE FUNCTION public.prepare_system_backup_run_completion_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_recorded INTEGER;
    v_passed INTEGER;
    v_integrity_ok BOOLEAN;
BEGIN
    IF NEW.status <> 'PASS' OR NEW.artifact_count IS DISTINCT FROM 7 THEN
        RETURN NEW;
    END IF;

    SELECT count(*), count(*) FILTER (WHERE status = 'PASS')
      INTO v_recorded, v_passed
      FROM public.system_backup_app_results
     WHERE run_key = NEW.run_key;

    v_integrity_ok := CASE NEW.job_type
        WHEN 'daily' THEN NEW.local_ok IS TRUE
                       AND NEW.drive_ok IS TRUE
                       AND NEW.external_ok IS TRUE
        WHEN 'restore' THEN NEW.local_ok IS TRUE
                         AND NEW.drive_ok IS TRUE
        ELSE false
    END;

    IF v_recorded < 3 THEN
        NEW.status := 'RUNNING';
        NEW.detail_code := 'app_results_pending';
    ELSIF v_recorded = 3 AND v_passed = 3 AND v_integrity_ok THEN
        NEW.detail_code := CASE NEW.job_type
            WHEN 'daily' THEN 'all_good'
            ELSE 'restore_verified'
        END;
    ELSE
        NEW.status := 'FAIL';
        NEW.detail_code := 'app_result_failed';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_system_backup_run_from_apps_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_run public.system_backup_runs%ROWTYPE;
    v_recorded INTEGER;
    v_passed INTEGER;
    v_integrity_ok BOOLEAN;
BEGIN
    SELECT * INTO v_run
      FROM public.system_backup_runs
     WHERE run_key = NEW.run_key
     FOR UPDATE;

    -- 산출물 8개였던 전환 전 실행은 그대로 둔다. 부모가 이미 FAIL이면 앱 결과가 덮어쓰지 않는다.
    IF v_run.artifact_count IS DISTINCT FROM 7 OR v_run.status = 'FAIL' THEN
        RETURN NEW;
    END IF;

    SELECT count(*), count(*) FILTER (WHERE status = 'PASS')
      INTO v_recorded, v_passed
      FROM public.system_backup_app_results
     WHERE run_key = NEW.run_key;

    v_integrity_ok := CASE v_run.job_type
        WHEN 'daily' THEN v_run.local_ok IS TRUE
                       AND v_run.drive_ok IS TRUE
                       AND v_run.external_ok IS TRUE
        WHEN 'restore' THEN v_run.local_ok IS TRUE
                         AND v_run.drive_ok IS TRUE
        ELSE false
    END;

    IF v_recorded < 3 THEN
        UPDATE public.system_backup_runs
           SET status = 'RUNNING',
               detail_code = 'app_results_pending',
               updated_at = NOW()
         WHERE run_key = NEW.run_key;
    ELSIF v_recorded = 3 AND v_passed = 3 AND v_integrity_ok THEN
        UPDATE public.system_backup_runs
           SET status = 'PASS',
               detail_code = CASE v_run.job_type
                   WHEN 'daily' THEN 'all_good'
                   ELSE 'restore_verified'
               END,
               updated_at = NOW()
         WHERE run_key = NEW.run_key;
    ELSE
        UPDATE public.system_backup_runs
           SET status = 'FAIL',
               detail_code = 'app_result_failed',
               updated_at = NOW()
         WHERE run_key = NEW.run_key;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prepare_system_backup_run_completion
    ON public.system_backup_runs;
CREATE TRIGGER trg_prepare_system_backup_run_completion
BEFORE INSERT OR UPDATE OF status, artifact_count, local_ok, drive_ok, external_ok
ON public.system_backup_runs
FOR EACH ROW
EXECUTE FUNCTION public.prepare_system_backup_run_completion_v1();

DROP TRIGGER IF EXISTS trg_finalize_system_backup_run_from_apps
    ON public.system_backup_app_results;
CREATE TRIGGER trg_finalize_system_backup_run_from_apps
AFTER INSERT OR UPDATE OF status, db_ok, files_ok, object_count, detail_code
ON public.system_backup_app_results
FOR EACH ROW
EXECUTE FUNCTION public.finalize_system_backup_run_from_apps_v1();

REVOKE ALL ON FUNCTION public.prepare_system_backup_run_completion_v1()
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_system_backup_run_from_apps_v1()
    FROM PUBLIC, anon, authenticated;

COMMIT;
