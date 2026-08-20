BEGIN;

-- 백업 스크립트가 남기는 운영 상태다. 로그·파일 경로·시크릿은 저장하지 않는다.
-- 브라우저 역할에는 테이블을 공개하지 않고 관리자 전용 RPC만 허용한다.
CREATE TABLE IF NOT EXISTS public.system_backup_runs (
    run_key TEXT PRIMARY KEY,
    job_type TEXT NOT NULL CHECK (job_type IN ('daily', 'restore')),
    status TEXT NOT NULL CHECK (status IN ('RUNNING', 'PASS', 'FAIL')),
    backup_day DATE NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ,
    local_ok BOOLEAN,
    drive_ok BOOLEAN,
    external_ok BOOLEAN,
    artifact_count SMALLINT CHECK (artifact_count BETWEEN 0 AND 50),
    agit_table_count INTEGER CHECK (agit_table_count >= 0),
    lab_table_count INTEGER CHECK (lab_table_count >= 0),
    storage_file_count INTEGER CHECK (storage_file_count >= 0),
    detail_code TEXT NOT NULL DEFAULT '' CHECK (
        char_length(detail_code) <= 120
        AND detail_code ~ '^[a-z0-9_,:-]*$'
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_backup_runs_job_started
    ON public.system_backup_runs (job_type, started_at DESC);

ALTER TABLE public.system_backup_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.system_backup_runs FROM PUBLIC, anon, authenticated;

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
                    'detail_code', run.detail_code
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

COMMIT;
