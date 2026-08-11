DO $$
DECLARE
    v_definition TEXT;
BEGIN
    SELECT pg_get_functiondef('public.get_writing_export_data(uuid,text,uuid)'::regprocedure)
    INTO v_definition;

    IF v_definition NOT LIKE '%structured_content jsonb%'
       OR v_definition NOT LIKE '%input_template text%'
       OR v_definition NOT LIKE '%p.class_id = p_class_id%'
       OR v_definition NOT LIKE '%c.teacher_id = auth.uid()%'
       OR v_definition NOT LIKE '%LIMIT 5000%' THEN
        RAISE EXCEPTION 'writing PDF export RPC contract mismatch';
    END IF;
END;
$$;
