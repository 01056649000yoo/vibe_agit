DO $$
DECLARE
    v_student public.students%ROWTYPE;
    v_teacher_id UUID;
    v_student_result JSONB;
    v_teacher_result JSONB;
    v_workspace_result JSONB;
    v_denied BOOLEAN := false;
BEGIN
    SELECT student.*
    INTO v_student
    FROM public.students student
    JOIN public.classes class ON class.id = student.class_id
    WHERE student.auth_id IS NOT NULL
      AND student.is_active IS DISTINCT FROM false
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
      AND class.deleted_at IS NULL
      AND class.teacher_id IS NOT NULL
    ORDER BY student.created_at
    LIMIT 1;

    IF v_student.id IS NULL THEN
        RAISE EXCEPTION '과제 목록 스모크에 사용할 활성 학생이 없습니다.';
    END IF;

    SELECT class.teacher_id INTO v_teacher_id
    FROM public.classes class
    WHERE class.id = v_student.class_id;

    PERFORM set_config('request.jwt.claim.sub', v_student.auth_id::TEXT, true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_student.auth_id, 'role', 'authenticated'
    )::TEXT, true);

    v_student_result := public.get_student_mission_list_v1(1000);
    IF v_student_result->>'version' <> '1'
       OR v_student_result->'missions' IS NULL
       OR v_student_result->'posts' IS NULL
       OR jsonb_array_length(v_student_result->'missions') > 100 THEN
        RAISE EXCEPTION '학생 과제 목록 계약이 다릅니다: %', v_student_result;
    END IF;

    IF jsonb_array_length(v_student_result->'missions') > 0 THEN
        v_workspace_result := public.get_student_assignment_workspace_v1(
            (v_student_result->'missions'->0->>'id')::UUID,
            NULL
        );
        IF v_workspace_result->>'version' <> '1'
           OR v_workspace_result->'mission' IS NULL THEN
            RAISE EXCEPTION '학생 글쓰기 작업공간 계약이 다릅니다: %', v_workspace_result;
        END IF;
    END IF;

    BEGIN
        PERFORM public.get_teacher_mission_overview_v1(v_student.class_id, 100);
    EXCEPTION WHEN insufficient_privilege THEN
        v_denied := true;
    END;
    IF NOT v_denied THEN
        RAISE EXCEPTION '학생이 교사 과제 개요를 조회했습니다.';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_teacher_id::TEXT, true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_teacher_id, 'role', 'authenticated'
    )::TEXT, true);

    v_teacher_result := public.get_teacher_mission_overview_v1(v_student.class_id, 1000);
    IF v_teacher_result->>'version' <> '1'
       OR v_teacher_result->'missions' IS NULL
       OR v_teacher_result->'submission_counts' IS NULL
       OR v_teacher_result->'total_students' IS NULL
       OR jsonb_array_length(v_teacher_result->'missions') > 100 THEN
        RAISE EXCEPTION '교사 과제 개요 계약이 다릅니다: %', v_teacher_result;
    END IF;

    IF has_function_privilege('anon', 'public.get_student_mission_list_v1(integer)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.get_teacher_mission_overview_v1(uuid,integer)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.get_student_assignment_workspace_v1(uuid,uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION '과제 목록 RPC가 anon에 공개되어 있습니다.';
    END IF;
END;
$$;
