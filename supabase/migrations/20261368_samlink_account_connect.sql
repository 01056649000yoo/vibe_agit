-- 쌤링크 ↔ 아지트 선생님 계정 연결 (2026-10-05, 선생님 결정).
--
-- 쌤링크 링크 목록은 브라우저(기기 쿠키)에만 묶여 있어 기기를 바꾸면 사라지고, 아지트 안 iframe 과
-- 쌤링크.kr 직접 접속이 서로 다른 목록을 보였다. 아지트 선생님이면 계정으로 이어 준다.
--
-- 흐름: 아지트(로그인한 선생님) → issue_samlink_connect_ticket_v1() 로 1분짜리 한 번 쓰는 연결표를 받음
--       → 쌤링크에 넘김(iframe 은 postMessage, 직접 접속은 /connect#ticket=) → 쌤링크 서버가
--       redeem_samlink_connect_ticket_v1(service_role 전용) 으로 "누구인지" 만 받아 자기 세션 쿠키를 만든다.
-- 아지트 로그인 토큰은 쌤링크로 넘어가지 않는다. 표에는 연결표의 해시만 둔다.

CREATE TABLE IF NOT EXISTS public.samlink_connect_tickets (
    ticket_hash TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ
);

ALTER TABLE public.samlink_connect_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.samlink_connect_tickets FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.issue_samlink_connect_ticket_v1()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ticket TEXT;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() NOT IN ('TEACHER', 'ADMIN') THEN
        RAISE EXCEPTION '승인된 선생님 계정만 쌤링크에 연결할 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    DELETE FROM public.samlink_connect_tickets
    WHERE expires_at < NOW() - INTERVAL '1 hour';

    -- 한 사람이 연결표를 쌓아 두지 못하게 1분에 5개까지.
    IF (SELECT COUNT(*) FROM public.samlink_connect_tickets
        WHERE user_id = auth.uid() AND created_at > NOW() - INTERVAL '1 minute') >= 5 THEN
        RAISE EXCEPTION '잠시 뒤 다시 시도해 주세요.' USING ERRCODE = '54000';
    END IF;

    v_ticket := encode(extensions.gen_random_bytes(24), 'hex');
    INSERT INTO public.samlink_connect_tickets(ticket_hash, user_id, expires_at)
    VALUES (encode(extensions.digest(v_ticket, 'sha256'), 'hex'), auth.uid(), NOW() + INTERVAL '1 minute');

    RETURN v_ticket;
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_samlink_connect_ticket_v1(p_ticket TEXT)
RETURNS TABLE(user_id UUID, display_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user UUID;
BEGIN
    UPDATE public.samlink_connect_tickets t
    SET used_at = NOW()
    WHERE t.ticket_hash = encode(extensions.digest(COALESCE(p_ticket, ''), 'sha256'), 'hex')
      AND t.used_at IS NULL
      AND t.expires_at > NOW()
    RETURNING t.user_id INTO v_user;

    IF v_user IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT p.id, COALESCE(NULLIF(btrim(p.full_name), ''), '선생님')
    FROM public.profiles p
    WHERE p.id = v_user
      AND (p.role = 'ADMIN' OR (p.role = 'TEACHER' AND p.is_approved IS TRUE AND p.approval_revoked_at IS NULL));
END;
$$;

REVOKE ALL ON FUNCTION public.issue_samlink_connect_ticket_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_samlink_connect_ticket_v1() TO authenticated;
REVOKE ALL ON FUNCTION public.redeem_samlink_connect_ticket_v1(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_samlink_connect_ticket_v1(TEXT) TO service_role;
