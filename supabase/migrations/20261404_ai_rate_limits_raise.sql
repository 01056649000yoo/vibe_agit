-- AI 요청 분당 상한을 올린다(2026-10-21).
--
-- 왜: 모델을 gpt-6-luna 로 바꾸며 한 번 부르는 값이 입력 $0.10·출력 $0.50(100만 토큰당)으로 내려가고
-- OpenAI 쪽 한도도 분당 10,000번이라, 우리가 건 상한이 병목이 됐다. 한 학급 30명이 한 분에 맞춤법 검사를
-- 누르면 학급 교사 기준 상한 30에 딱 닿아 "검사 요청이 몰려 있어요" 가 뜰 수 있었다.
--
-- 값(분당, 슬라이딩 1분):
--   comment_safety       12 → 30   학생 한 명 기준(한 아이가 한 분에 댓글 30개를 달 수는 없다 — 여유만 늘린다)
--   student_spell_check  30 → 120  학급 교사 기준(한 학급 30명 × 여러 학급·재시도까지)
--   teacher_ai           20 → 60   교사 한 명 기준
-- 그대로 두는 것: 글 한 편에 맞춤법 검사 한 번(교육 목적), 학생 한 명의 10분 상한, 안내서 AI 길잡이 하루 한도.
-- 범위 이름·서비스 역할 확인·동시 요청 잠금·기록 표는 그대로다.
BEGIN;

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
        WHEN 'comment_safety' THEN 30
        WHEN 'student_spell_check' THEN 120
        ELSE 60
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
