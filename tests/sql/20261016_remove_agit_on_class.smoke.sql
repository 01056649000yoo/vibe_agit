DO $$
BEGIN
    IF to_regclass('public.agit_honor_roll') IS NOT NULL THEN
        RAISE EXCEPTION 'agit_honor_roll table still exists';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'classes' AND column_name = 'agit_settings'
    ) THEN
        RAISE EXCEPTION 'classes.agit_settings column still exists';
    END IF;

    -- writing_helper.classes.agit_class_id는 연구소 통합용 별개 컬럼(다른 스키마)이라 이 마이그레이션과
    -- 무관하다. public.classes만 건드렸는지 위 두 확인으로 충분하다.

    IF to_regprocedure('public.get_student_home_bootstrap_v1()') IS NULL THEN
        RAISE EXCEPTION 'get_student_home_bootstrap_v1 is missing';
    END IF;
END;
$$;
