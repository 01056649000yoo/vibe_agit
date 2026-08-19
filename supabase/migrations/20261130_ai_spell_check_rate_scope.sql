-- AI 맞춤법 검사에도 분당 속도 제한을 건다 (2026-08-19)
--
-- 글 한 편에 한 번이라는 제한이 이미 있지만, 한 학급이 같은 순간에 누르면(수업 끝 5분 전)
-- 요청이 한꺼번에 몰린다. 학급 교사를 기준으로 분당 상한을 둬 폭주를 막는다.
-- 상한 30은 한 학급 인원(보통 20~25명)보다 조금 넉넉한 값이다.

BEGIN;

ALTER TABLE public.ai_request_events
    DROP CONSTRAINT IF EXISTS ai_request_events_scope_check;
ALTER TABLE public.ai_request_events
    ADD CONSTRAINT ai_request_events_scope_check
    CHECK (scope IN ('teacher_ai', 'comment_safety', 'student_spell_check'));

-- 원본(20261014)과 같은 몸통이다. 바뀐 것은 허용 범위와 상한 두 줄뿐이다.
-- ⚠️ service_role 확인을 지우지 않는다 — 이 함수는 Edge Function 만 부른다.
CREATE OR REPLACE FUNCTION public.consume_ai_request_v1(p_actor_id UUID, p_scope TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_limit INTEGER;
    v_count INTEGER;
BEGIN
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
    END IF;
    IF p_actor_id IS NULL OR p_scope NOT IN ('teacher_ai', 'comment_safety', 'student_spell_check') THEN
        RAISE EXCEPTION 'invalid AI request scope' USING ERRCODE = '22023';
    END IF;
    v_limit := CASE p_scope
        WHEN 'comment_safety' THEN 12
        WHEN 'student_spell_check' THEN 30
        ELSE 20
    END;
    PERFORM pg_advisory_xact_lock(hashtextextended(p_actor_id::TEXT || ':' || p_scope, 0));
    SELECT count(*) INTO v_count FROM public.ai_request_events
    WHERE actor_id = p_actor_id AND scope = p_scope AND created_at > NOW() - INTERVAL '1 minute';
    IF v_count >= v_limit THEN
        RETURN jsonb_build_object('allowed', false, 'retry_after_seconds', 60);
    END IF;
    INSERT INTO public.ai_request_events(actor_id, scope) VALUES(p_actor_id, p_scope);
    RETURN jsonb_build_object('allowed', true, 'remaining', v_limit - v_count - 1);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_request_v1(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_request_v1(UUID, TEXT) TO service_role;

COMMIT;
