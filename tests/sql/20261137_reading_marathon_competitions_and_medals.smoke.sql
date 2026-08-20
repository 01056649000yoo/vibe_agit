BEGIN;

DO $$
BEGIN
    IF has_table_privilege('authenticated', 'public.reading_marathon_medals', 'SELECT') THEN
        RAISE EXCEPTION 'authenticated must not read marathon medals directly';
    END IF;
    IF has_table_privilege('authenticated', 'public.reading_marathon_participants', 'SELECT') THEN
        RAISE EXCEPTION 'authenticated must not read marathon participants directly';
    END IF;
    IF has_function_privilege('anon', 'public.get_my_reading_marathon_medals_v1(integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must not execute medal RPC';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.get_my_reading_marathon_medals_v1(integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must execute medal RPC';
    END IF;
    IF has_function_privilege('authenticated', 'public.refresh_reading_marathon_campaign_v1(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must not execute internal marathon refresh';
    END IF;
END;
$$;

ROLLBACK;
