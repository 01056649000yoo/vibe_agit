-- 내부 전용 알림 함수가 클라이언트에 닫혀 있고, 내부 호출 경로는 살아 있는지 본다.
DO $$
DECLARE
    v_sig TEXT := 'public.notification_emit_v1(UUID, TEXT, TEXT, TEXT, UUID, JSONB, TEXT, SMALLINT, UUID)';
    v_open INTEGER;
BEGIN
    IF has_function_privilege('anon', v_sig, 'EXECUTE') THEN
        RAISE EXCEPTION 'anon 이 아직 내부 전용 알림 함수를 부를 수 있습니다.';
    END IF;
    IF has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated 가 아직 내부 전용 알림 함수를 부를 수 있습니다.';
    END IF;

    -- 내부에서 부르는 함수들은 소유자 권한으로 도는 SECURITY DEFINER 여야 한다.
    SELECT count(*) INTO v_open
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosrc LIKE '%notification_emit_v1%'
      AND p.proname <> 'notification_emit_v1'
      AND (NOT p.prosecdef OR pg_get_userbyid(p.proowner) <> 'supabase_admin');
    IF v_open > 0 THEN
        RAISE EXCEPTION '알림을 부르는 함수 %개가 소유자 권한으로 돌지 않습니다 — 알림이 끊깁니다.', v_open;
    END IF;
END;
$$;
