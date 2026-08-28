-- 지운 함수는 사라지고, 역할 판정에 실제로 쓰는 것은 그대로 도는지 확인한다.
BEGIN;

DO $$
DECLARE
    v_teacher UUID;
BEGIN
    IF to_regprocedure('public.get_my_role()') IS NOT NULL
       OR to_regprocedure('public.admin_dashboard_snapshot()') IS NOT NULL THEN
        RAISE EXCEPTION '지운 함수가 아직 존재합니다.';
    END IF;

    SELECT teacher_id INTO v_teacher
    FROM public.classes WHERE deleted_at IS NULL AND teacher_id IS NOT NULL LIMIT 1;
    IF v_teacher IS NULL THEN
        RAISE NOTICE '검증용 교사가 없어 호출 확인은 건너뜁니다.';
        RETURN;
    END IF;

    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_teacher, 'role', 'authenticated'
    )::TEXT, TRUE);

    -- 앱이 실제로 쓰는 역할 판정 경로는 계속 응답해야 한다.
    IF public.auth_user_role() NOT IN ('TEACHER', 'ADMIN') THEN
        RAISE EXCEPTION '교사 역할 판정이 깨졌습니다: %', public.auth_user_role();
    END IF;
END $$;

ROLLBACK;
