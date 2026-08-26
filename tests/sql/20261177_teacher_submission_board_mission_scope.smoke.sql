DO $$
DECLARE
    v_student public.students%ROWTYPE;
    v_teacher_id UUID;
    v_mission public.writing_missions%ROWTYPE;
    v_global JSONB;
    v_scoped JSONB;
    v_status JSONB;
    v_recent JSONB;
    v_denied BOOLEAN := false;
    v_invalid BOOLEAN := false;
BEGIN
    IF has_function_privilege('anon', 'public.get_teacher_assignment_submission_board_v2(uuid,uuid,integer)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.teacher_assignment_submission_board_snapshot_v2(uuid,uuid,integer,integer)', 'EXECUTE') THEN
        RAISE EXCEPTION '미션별 제출 현황 함수 권한이 너무 넓습니다.';
    END IF;

    SELECT student.*
    INTO v_student
    FROM public.students student
    JOIN public.classes class ON class.id = student.class_id
    WHERE student.auth_id IS NOT NULL
      AND student.is_active IS DISTINCT FROM false
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
      AND class.deleted_at IS NULL
      AND class.teacher_id IS NOT NULL
      AND EXISTS (
          SELECT 1
          FROM public.writing_missions mission
          WHERE mission.class_id = student.class_id
            AND mission.is_archived IS FALSE
            AND mission.mission_type IS DISTINCT FROM 'meeting'
      )
    ORDER BY student.created_at
    LIMIT 1;

    IF v_student.id IS NULL THEN
        RAISE NOTICE '미션별 제출 현황 스모크에 사용할 학급이 없어 건너뜀';
        RETURN;
    END IF;

    SELECT class.teacher_id INTO v_teacher_id
    FROM public.classes class
    WHERE class.id = v_student.class_id;

    SELECT mission.* INTO v_mission
    FROM public.writing_missions mission
    WHERE mission.class_id = v_student.class_id
      AND mission.is_archived IS FALSE
      AND mission.mission_type IS DISTINCT FROM 'meeting'
    ORDER BY mission.created_at DESC, mission.id DESC
    LIMIT 1;

    PERFORM set_config('request.jwt.claim.sub', v_student.auth_id::TEXT, true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_student.auth_id, 'role', 'authenticated'
    )::TEXT, true);

    BEGIN
        PERFORM public.get_teacher_assignment_submission_board_v2(v_student.class_id, v_mission.id, 8);
    EXCEPTION WHEN insufficient_privilege THEN
        v_denied := true;
    END;
    IF NOT v_denied THEN
        RAISE EXCEPTION '학생이 미션별 교사용 제출 현황을 조회했습니다.';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_teacher_id::TEXT, true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_teacher_id, 'role', 'authenticated'
    )::TEXT, true);

    v_global := public.get_teacher_assignment_submission_board_v2(v_student.class_id, NULL, 1000);
    v_scoped := public.get_teacher_assignment_submission_board_v2(v_student.class_id, v_mission.id, 1000);

    IF (v_global->>'version')::INTEGER <> 2
       OR v_global->>'scope' <> 'all'
       OR v_global->>'selected_mission_id' IS NOT NULL
       OR jsonb_array_length(v_global->'student_statuses') > 100
       OR jsonb_array_length(v_global->'recent_submissions') > 8 THEN
        RAISE EXCEPTION '전체 미션 v2 응답 계약이 다릅니다: %', v_global;
    END IF;

    IF (v_scoped->>'version')::INTEGER <> 2
       OR v_scoped->>'scope' <> 'mission'
       OR (v_scoped->>'selected_mission_id')::UUID <> v_mission.id
       OR v_scoped->>'selected_mission_title' <> v_mission.title
       OR jsonb_array_length(v_scoped->'student_statuses') > 100
       OR jsonb_array_length(v_scoped->'recent_submissions') > 8 THEN
        RAISE EXCEPTION '선택 미션 v2 응답 계약이 다릅니다: %', v_scoped;
    END IF;

    FOR v_status IN SELECT value FROM jsonb_array_elements(v_scoped->'student_statuses')
    LOOP
        IF (v_status->>'assignment_count')::INTEGER <> 1
           OR COALESCE(v_status->>'status', '') NOT IN ('confirmed', 'pending', 'rewriting', 'not_submitted')
           OR (v_status->>'confirmed_count')::INTEGER
              + (v_status->>'pending_count')::INTEGER
              + (v_status->>'rewriting_count')::INTEGER
              + (v_status->>'not_submitted_count')::INTEGER <> 1 THEN
            RAISE EXCEPTION '선택 미션의 학생 상태가 단일 상태가 아닙니다: %', v_status;
        END IF;
    END LOOP;

    IF (v_scoped->'scope_summary'->>'confirmed_count')::INTEGER
       <> COALESCE((v_scoped->'mission_statuses'->(v_mission.id::TEXT)->>'confirmedCount')::INTEGER, 0)
       OR (v_scoped->'scope_summary'->>'pending_count')::INTEGER
       <> COALESCE((v_scoped->'mission_statuses'->(v_mission.id::TEXT)->>'pendingCount')::INTEGER, 0)
       OR (v_scoped->'scope_summary'->>'rewriting_count')::INTEGER
       <> COALESCE((v_scoped->'mission_statuses'->(v_mission.id::TEXT)->>'rewritingCount')::INTEGER, 0)
       OR (v_scoped->'scope_summary'->>'not_submitted_count')::INTEGER
       <> COALESCE((v_scoped->'mission_statuses'->(v_mission.id::TEXT)->>'notSubmittedCount')::INTEGER, 0) THEN
        RAISE EXCEPTION '선택 미션 요약과 기존 과제 상태 원본이 다릅니다: %', v_scoped->'scope_summary';
    END IF;

    FOR v_recent IN SELECT value FROM jsonb_array_elements(v_scoped->'recent_submissions')
    LOOP
        IF (v_recent->>'mission_id')::UUID <> v_mission.id
           OR COALESCE((v_recent->>'submission_number')::INTEGER, 0) < 1 THEN
            RAISE EXCEPTION '다른 미션 제출 또는 잘못된 제출 차수가 포함됐습니다: %', v_recent;
        END IF;
    END LOOP;

    BEGIN
        PERFORM public.get_teacher_assignment_submission_board_v2(
            v_student.class_id,
            '00000000-0000-0000-0000-000000000001'::UUID,
            8
        );
    EXCEPTION WHEN invalid_parameter_value THEN
        v_invalid := true;
    END;
    IF NOT v_invalid THEN
        RAISE EXCEPTION '담당 학급의 활성 글 과제가 아닌 ID를 선택했습니다.';
    END IF;
END;
$$;
