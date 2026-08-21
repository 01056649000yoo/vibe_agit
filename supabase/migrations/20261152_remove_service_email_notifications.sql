-- 장애 상태는 관리자 화면에 계속 기록하되 외부 메일 발송 판단은 제거한다. (2026-08-21)
--
-- 20261150은 이미 운영 적용된 이력이므로 수정하지 않는다. 이 후속 마이그레이션에서 같은 RPC를
-- 상태 기록 전용으로 바꾼다. system_alert_events.notified_at은 과거 이력 호환을 위해 남겨 두지만
-- 새 기록에서는 더 이상 쓰지 않는다.

BEGIN;

CREATE OR REPLACE FUNCTION public.record_system_alert_v1(
    p_alert_key TEXT,
    p_is_problem BOOLEAN,
    p_detail TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_key TEXT := btrim(COALESCE(p_alert_key, ''));
    v_detail TEXT := left(btrim(COALESCE(p_detail, '')), 500);
    v_open_id BIGINT;
    v_event TEXT := 'unchanged';
BEGIN
    -- 호스트 스크립트는 supabase_admin으로 직접 붙는다. 로그인한 화면에서는 호출하지 못한다.
    IF public.auth_user_role() NOT IN ('', 'ADMIN') THEN
        RAISE EXCEPTION '기록 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;
    IF v_key !~ '^[a-z][a-z0-9_]{1,40}$' THEN
        RAISE EXCEPTION '상태 종류 이름이 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT id INTO v_open_id
    FROM public.system_alert_events
    WHERE alert_key = v_key AND status = 'open';

    IF p_is_problem THEN
        IF v_open_id IS NULL THEN
            INSERT INTO public.system_alert_events(alert_key, status, detail)
            VALUES (v_key, 'open', NULLIF(v_detail, ''));
            v_event := 'opened';
        ELSE
            UPDATE public.system_alert_events
            SET last_seen_at = NOW(), detail = COALESCE(NULLIF(v_detail, ''), detail)
            WHERE id = v_open_id;
        END IF;
    ELSIF v_open_id IS NOT NULL THEN
        UPDATE public.system_alert_events
        SET status = 'resolved', resolved_at = NOW(), last_seen_at = NOW()
        WHERE id = v_open_id;
        v_event := 'resolved';
    END IF;

    DELETE FROM public.system_alert_events
    WHERE status = 'resolved' AND resolved_at < NOW() - INTERVAL '180 days';

    RETURN jsonb_build_object('event', v_event, 'alert_key', v_key);
END;
$$;

COMMENT ON FUNCTION public.record_system_alert_v1(TEXT, BOOLEAN, TEXT)
    IS '맥미니 내부 서비스 상태를 기록한다. 외부 알림 또는 메일 발송 판단은 하지 않는다.';

REVOKE ALL ON FUNCTION public.record_system_alert_v1(TEXT, BOOLEAN, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_system_alert_v1(TEXT, BOOLEAN, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
