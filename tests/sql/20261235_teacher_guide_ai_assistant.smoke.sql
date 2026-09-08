DO $$
BEGIN
    IF (SELECT value #>> '{}' FROM public.system_settings WHERE key = 'teacher_guide_ai_stage') <> 'admin_only' THEN
        RAISE EXCEPTION 'teacher guide AI must start as admin_only';
    END IF;
    IF has_function_privilege('authenticated', 'public.consume_teacher_guide_ai_request_v1(uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.release_teacher_guide_ai_request_v1(uuid,bigint)', 'EXECUTE') THEN
        RAISE EXCEPTION 'browser roles can consume or release AI quota';
    END IF;
    IF NOT has_function_privilege('service_role', 'public.consume_teacher_guide_ai_request_v1(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service role cannot consume AI quota';
    END IF;
    IF has_function_privilege('anon', 'public.get_teacher_guide_ai_availability_v1()', 'EXECUTE') THEN
        RAISE EXCEPTION 'anonymous users must not inspect guide AI availability';
    END IF;
END;
$$;
