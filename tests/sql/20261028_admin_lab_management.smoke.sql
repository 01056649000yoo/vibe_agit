DO $$
DECLARE
    v_admin_id UUID;
    v_summary JSONB;
BEGIN
    SELECT profile.id INTO v_admin_id
    FROM public.profiles profile
    WHERE profile.role = 'ADMIN'
    ORDER BY profile.created_at
    LIMIT 1;

    IF v_admin_id IS NULL THEN
        RAISE EXCEPTION '연구소 관리자 스모크에 사용할 ADMIN 계정이 없습니다.';
    END IF;

    IF has_function_privilege('anon', 'public.admin_get_lab_service_summary_v1()', 'EXECUTE')
       OR has_function_privilege('anon', 'public.admin_set_lab_teacher_access_v1(uuid,boolean)', 'EXECUTE') THEN
        RAISE EXCEPTION '연구소 관리자 RPC가 anon에 노출되어 있습니다.';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_admin_id::TEXT, TRUE);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_admin_id,
        'role', 'authenticated'
    )::TEXT, TRUE);

    v_summary := public.admin_get_lab_service_summary_v1();
    IF v_summary->>'version' <> '1'
       OR v_summary->>'source' <> 'integrated_db'
       OR jsonb_typeof(v_summary->'stats') <> 'object'
       OR jsonb_typeof(v_summary->'linked_teachers') <> 'array' THEN
        RAISE EXCEPTION '연구소 관리자 요약 응답 계약 오류: %', v_summary;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_summary->'linked_teachers') teacher
        WHERE teacher ? 'lab_user_id'
    ) THEN
        RAISE EXCEPTION '연구소 내부 사용자 ID가 관리자 응답에 노출되었습니다.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_summary->'linked_teachers') teacher
        WHERE COALESCE((teacher->>'class_count')::INTEGER, 0) = 0
          AND COALESCE((teacher->>'room_count')::INTEGER, 0) = 0
    ) THEN
        RAISE EXCEPTION '통합 아지트 ID로 연구소 교사 자료를 집계하지 못했습니다: %', v_summary;
    END IF;
END;
$$;
