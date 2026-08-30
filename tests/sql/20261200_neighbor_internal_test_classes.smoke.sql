DO $$
BEGIN
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.neighbor_internal_test_classes'::regclass)
       OR has_table_privilege('anon', 'public.neighbor_internal_test_classes', 'SELECT')
       OR has_table_privilege('authenticated', 'public.neighbor_internal_test_classes', 'SELECT')
       OR has_table_privilege('service_role', 'public.neighbor_internal_test_classes', 'SELECT') THEN
        RAISE EXCEPTION 'neighbor internal test class registry must be private with RLS enabled';
    END IF;
END;
$$;

DO $$
DECLARE
    v_admin UUID;
    v_teacher UUID;
    v_registered_classes UUID[] := ARRAY[gen_random_uuid(), gen_random_uuid()];
    v_unregistered_class UUID := gen_random_uuid();
    v_dashboard JSONB;
    v_result JSONB;
    v_unregistered_blocked BOOLEAN := FALSE;
BEGIN
    SELECT profile.id INTO v_admin
    FROM public.profiles profile
    WHERE profile.role = 'ADMIN'
    ORDER BY profile.created_at, profile.id
    LIMIT 1;

    SELECT profile.id INTO v_teacher
    FROM public.profiles profile
    WHERE profile.role = 'TEACHER'
      AND profile.is_approved IS TRUE
      AND profile.approval_revoked_at IS NULL
    ORDER BY profile.created_at, profile.id
    LIMIT 1;

    IF v_admin IS NULL OR v_teacher IS NULL THEN
        RAISE EXCEPTION 'admin and approved teacher profiles are required for neighbor test class smoke';
    END IF;

    INSERT INTO public.classes (id, teacher_id, name) VALUES
        (v_registered_classes[1], v_teacher, '등록 테스트 학급 1'),
        (v_registered_classes[2], v_teacher, '등록 테스트 학급 2'),
        (v_unregistered_class, v_teacher, '미등록 운영 학급');

    INSERT INTO public.neighbor_internal_test_classes (class_id, created_by, note)
    SELECT class_id, v_admin, 'rollback smoke'
    FROM unnest(v_registered_classes) class_id;

    PERFORM set_config('request.jwt.claim.sub', v_admin::TEXT, TRUE);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', TRUE);
    PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('sub', v_admin, 'role', 'authenticated')::TEXT,
        TRUE
    );

    v_dashboard := public.get_neighbor_admin_dashboard_v1();
    IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_dashboard->'eligible_classes') item
        WHERE (item->>'class_id')::UUID = v_registered_classes[1]
    ) OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_dashboard->'eligible_classes') item
        WHERE (item->>'class_id')::UUID = v_registered_classes[2]
    ) OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_dashboard->'eligible_classes') item
        WHERE (item->>'class_id')::UUID = v_unregistered_class
    ) THEN
        RAISE EXCEPTION 'admin dashboard must include registered test classes and exclude operational classes';
    END IF;

    BEGIN
        PERFORM public.create_neighbor_internal_trial_v1(
            '미등록 학급 차단 스모크',
            ARRAY[v_registered_classes[1], v_unregistered_class]
        );
    EXCEPTION WHEN SQLSTATE '22023' THEN
        v_unregistered_blocked := TRUE;
    END;
    IF NOT v_unregistered_blocked THEN
        RAISE EXCEPTION 'unregistered operational class must be rejected from internal trial';
    END IF;

    v_result := public.create_neighbor_internal_trial_v1(
        '등록 학급 내부 시험',
        v_registered_classes
    );
    IF COALESCE((v_result->>'success')::BOOLEAN, FALSE) IS NOT TRUE
       OR (v_result->>'active_class_count')::INTEGER <> 2
       OR EXISTS (
           SELECT 1 FROM public.neighbor_space_classes membership
           WHERE membership.space_id = (v_result->>'space_id')::UUID
             AND membership.student_access_enabled IS TRUE
       ) THEN
        RAISE EXCEPTION 'registered test classes did not create a student-OFF internal trial safely: %', v_result;
    END IF;
END;
$$;
