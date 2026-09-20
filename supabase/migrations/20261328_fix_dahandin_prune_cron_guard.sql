-- 다했니 로그 정리 cron(dahandin-prune-logs, 매일 03:00)이 매번 "[보안] 권한이 없습니다"로 실패했다(2026-09-20).
--
-- 원인: 가드가 current_setting('role') 을 봤는데, 이 값은 SET ROLE 하지 않으면 대개 'none' 이라
--   pg_cron(supabase_admin 으로 실행) 도 통과하지 못했다. SECURITY DEFINER 함수에서 "부른 쪽"의
--   실제 로그인 역할은 session_user 다(정의자 current_user 가 아니라). session_user 로 바꾼다.
--   (브라우저/PostgREST 는 session_user 가 'authenticator' 이고 로그인 시 auth.uid() 도 있어 계속 막힌다.)

BEGIN;

CREATE OR REPLACE FUNCTION public.dahandin_prune_old_logs(p_retention_days INTEGER DEFAULT 180)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cutoff TIMESTAMPTZ := NOW() - make_interval(days => GREATEST(COALESCE(p_retention_days, 180), 30));
    v_deleted INTEGER;
BEGIN
    -- 브라우저·로그인 사용자는 막고(백엔드/크론만 허용), 실제 로그인 역할(session_user)로 판별한다.
    IF auth.uid() IS NOT NULL
       OR session_user NOT IN ('service_role', 'supabase_admin', 'postgres') THEN
        RAISE EXCEPTION '[보안] 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    DELETE FROM public.dahandin_sync_runs WHERE started_at < v_cutoff;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;   -- items 는 CASCADE 로 함께 삭제됨
    RETURN v_deleted;
END;
$$;

COMMIT;
