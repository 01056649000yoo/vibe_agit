-- 활용 안내서 AI 길잡이: 관리자 선공개와 계정별 비용 상한 (2026-09-08)

BEGIN;

INSERT INTO public.system_settings(key, value)
VALUES ('teacher_guide_ai_stage', '"admin_only"'::JSONB)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.ai_request_events
    DROP CONSTRAINT IF EXISTS ai_request_events_scope_check;
ALTER TABLE public.ai_request_events
    ADD CONSTRAINT ai_request_events_scope_check
    CHECK (scope IN ('teacher_ai', 'comment_safety', 'student_spell_check', 'teacher_guide_chat'));

CREATE OR REPLACE FUNCTION public.consume_teacher_guide_ai_request_v1(p_actor_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_minute_count INTEGER;
    v_daily_count INTEGER;
    v_event_id BIGINT;
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
BEGIN
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
    END IF;
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'actor required' USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(p_actor_id::TEXT || ':teacher_guide_chat', 0));

    SELECT count(*) INTO v_minute_count
    FROM public.ai_request_events
    WHERE actor_id = p_actor_id
      AND scope = 'teacher_guide_chat'
      AND created_at > NOW() - INTERVAL '1 minute';
    IF v_minute_count >= 3 THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'minute_limit', 'retry_after_seconds', 60);
    END IF;

    SELECT count(*) INTO v_daily_count
    FROM public.ai_request_events
    WHERE actor_id = p_actor_id
      AND scope = 'teacher_guide_chat'
      AND (created_at AT TIME ZONE 'Asia/Seoul')::DATE = v_today;
    IF v_daily_count >= 5 THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'daily_limit', 'daily_limit', 5, 'remaining_today', 0);
    END IF;

    INSERT INTO public.ai_request_events(actor_id, scope)
    VALUES (p_actor_id, 'teacher_guide_chat')
    RETURNING id INTO v_event_id;

    RETURN jsonb_build_object(
        'allowed', true,
        'reservation_id', v_event_id,
        'daily_limit', 5,
        'remaining_today', 5 - v_daily_count - 1
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_teacher_guide_ai_request_v1(p_actor_id UUID, p_reservation_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
    END IF;
    DELETE FROM public.ai_request_events
    WHERE id = p_reservation_id
      AND actor_id = p_actor_id
      AND scope = 'teacher_guide_chat'
      AND created_at > NOW() - INTERVAL '10 minutes';
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_teacher_guide_ai_stage_v1(p_stage TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION 'admin required' USING ERRCODE = '42501';
    END IF;
    IF p_stage NOT IN ('admin_only', 'public') THEN
        RAISE EXCEPTION 'invalid stage' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.system_settings(key, value)
    VALUES ('teacher_guide_ai_stage', to_jsonb(p_stage))
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
    RETURN jsonb_build_object('stage', p_stage);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_teacher_guide_ai_availability_v1()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile public.profiles%ROWTYPE;
    v_stage TEXT := 'admin_only';
    v_used INTEGER := 0;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    IF v_profile.id IS NULL THEN
        RAISE EXCEPTION 'profile required' USING ERRCODE = '42501';
    END IF;
    SELECT COALESCE(value #>> '{}', 'admin_only') INTO v_stage
    FROM public.system_settings WHERE key = 'teacher_guide_ai_stage';
    IF v_stage NOT IN ('admin_only', 'public') THEN v_stage := 'admin_only'; END IF;

    IF v_profile.role = 'ADMIN'
       OR (v_stage = 'public' AND v_profile.role = 'TEACHER'
           AND v_profile.is_approved IS TRUE AND v_profile.approval_revoked_at IS NULL) THEN
        SELECT count(*) INTO v_used FROM public.ai_request_events
        WHERE actor_id = auth.uid() AND scope = 'teacher_guide_chat'
          AND (created_at AT TIME ZONE 'Asia/Seoul')::DATE = (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
        RETURN jsonb_build_object('enabled', true, 'stage', v_stage, 'daily_limit', 5, 'remaining_today', GREATEST(0, 5 - v_used));
    END IF;
    RETURN jsonb_build_object('enabled', false, 'stage', v_stage, 'daily_limit', 5, 'remaining_today', 0);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_teacher_guide_ai_request_v1(UUID),
    public.release_teacher_guide_ai_request_v1(UUID, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_teacher_guide_ai_request_v1(UUID),
    public.release_teacher_guide_ai_request_v1(UUID, BIGINT) TO service_role;

REVOKE ALL ON FUNCTION public.admin_set_teacher_guide_ai_stage_v1(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_teacher_guide_ai_stage_v1(TEXT) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_teacher_guide_ai_availability_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_guide_ai_availability_v1() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_teacher_guide_ai_availability_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_guide_ai_availability_v1() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
