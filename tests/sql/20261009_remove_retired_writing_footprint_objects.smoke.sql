DO $$
BEGIN
    IF to_regprocedure('public.get_friend_point_activity_summary(uuid)') IS NOT NULL
        OR to_regprocedure('public.get_friend_writing_footprint(uuid)') IS NOT NULL
        OR to_regprocedure('public.get_my_writing_footprint()') IS NOT NULL
        OR to_regprocedure('public.refresh_writing_footprint_snapshots(date)') IS NOT NULL THEN
        RAISE EXCEPTION 'retired writing-footprint functions still exist';
    END IF;

    IF to_regclass('public.student_writing_daily_snapshots') IS NOT NULL
        OR to_regclass('public.writing_footprint_settings') IS NOT NULL THEN
        RAISE EXCEPTION 'retired writing-footprint snapshot tables still exist';
    END IF;

    IF to_regclass('public.writing_activity_events') IS NULL
        OR to_regprocedure('public.record_writing_activity_event(uuid,uuid,uuid,text,uuid,uuid,jsonb)') IS NULL
        OR to_regprocedure('public.get_my_writing_footprint_detail()') IS NULL
        OR to_regprocedure('public.get_class_writing_footprint_dashboard(uuid)') IS NULL THEN
        RAISE EXCEPTION 'an active writing-footprint dependency was removed';
    END IF;
END;
$$;
