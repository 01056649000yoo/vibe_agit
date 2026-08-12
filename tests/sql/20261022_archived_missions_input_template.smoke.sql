DO $$
DECLARE
    v_definition TEXT;
BEGIN
    SELECT pg_get_functiondef('public.get_teacher_archived_missions_page(uuid,integer,integer)'::regprocedure)
    INTO v_definition;

    IF v_definition NOT LIKE '%mission.input_template%' THEN
        RAISE EXCEPTION 'archived missions RPC does not return input_template';
    END IF;
END;
$$;
