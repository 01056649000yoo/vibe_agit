DO $$
DECLARE
    v_definition TEXT;
BEGIN
    SELECT pg_get_functiondef('public.record_reading_marathon_contribution(uuid)'::regprocedure)
    INTO v_definition;

    IF v_definition NOT LIKE '%COALESCE(v_post.review_status, '''') NOT IN%'
       OR v_definition NOT LIKE '%COALESCE(v_post.page_count, 0) NOT BETWEEN 1 AND 10000%' THEN
        RAISE EXCEPTION 'marathon contribution must treat missing review and page count as pending';
    END IF;

    IF has_function_privilege(
        'authenticated',
        'public.record_reading_marathon_contribution(uuid)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'authenticated must not execute internal marathon contribution function';
    END IF;
END;
$$;
