DO $$
BEGIN
    IF (SELECT value #>> '{}' FROM public.system_settings WHERE key = 'teacher_guide_ai_stage') <> 'public' THEN
        RAISE EXCEPTION 'teacher guide AI must be available to approved teachers';
    END IF;
END;
$$;
