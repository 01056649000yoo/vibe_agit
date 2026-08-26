DO $$
DECLARE
    v_student public.students%ROWTYPE;
    v_teacher_id UUID;
    v_board JSONB;
    v_overview JSONB;
    v_status JSONB;
    v_recent JSONB;
    v_expected_attempts INTEGER;
    v_denied BOOLEAN := false;
BEGIN
    IF has_function_privilege('anon', 'public.get_teacher_assignment_submission_board_v1(uuid,integer)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.teacher_assignment_submission_board_snapshot_v1(uuid,integer,integer)', 'EXECUTE') THEN
        RAISE EXCEPTION '학생별 제출 현황 내부/외부 함수 권한이 너무 넓습니다.';
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
    ORDER BY student.created_at
    LIMIT 1;

    IF v_student.id IS NULL THEN
        RAISE NOTICE '학생별 제출 현황 스모크에 사용할 학생이 없어 건너뜀';
        RETURN;
    END IF;

    SELECT class.teacher_id INTO v_teacher_id
    FROM public.classes class
    WHERE class.id = v_student.class_id;

    PERFORM set_config('request.jwt.claim.sub', v_student.auth_id::TEXT, true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_student.auth_id, 'role', 'authenticated'
    )::TEXT, true);

    BEGIN
        PERFORM public.get_teacher_assignment_submission_board_v1(v_student.class_id, 8);
    EXCEPTION WHEN insufficient_privilege THEN
        v_denied := true;
    END;
    IF NOT v_denied THEN
        RAISE EXCEPTION '학생이 학생별 교사용 제출 현황을 조회했습니다.';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_teacher_id::TEXT, true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_teacher_id, 'role', 'authenticated'
    )::TEXT, true);

    v_board := public.get_teacher_assignment_submission_board_v1(v_student.class_id, 1000);
    v_overview := public.get_teacher_mission_overview_v1(v_student.class_id, 1000);

    IF v_board->'student_statuses' IS NULL
       OR jsonb_typeof(v_board->'student_statuses') <> 'array'
       OR jsonb_array_length(v_board->'student_statuses') > 100 THEN
        RAISE EXCEPTION '학생별 제출 현황 응답 계약이 다릅니다: %', v_board->'student_statuses';
    END IF;

    FOR v_status IN SELECT value FROM jsonb_array_elements(v_board->'student_statuses')
    LOOP
        IF NOT v_status ?& ARRAY[
            'student_id', 'student_name', 'assignment_count', 'confirmed_count',
            'pending_count', 'rewriting_count', 'not_submitted_count'
        ] THEN
            RAISE EXCEPTION '학생별 제출 상태 필드가 빠졌습니다: %', v_status;
        END IF;

        IF (v_status->>'assignment_count')::INTEGER < 0
           OR (v_status->>'assignment_count')::INTEGER <>
              (v_status->>'confirmed_count')::INTEGER
              + (v_status->>'pending_count')::INTEGER
              + (v_status->>'rewriting_count')::INTEGER
              + (v_status->>'not_submitted_count')::INTEGER THEN
            RAISE EXCEPTION '학생별 네 상태의 합이 활성 글 과제 수와 다릅니다: %', v_status;
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM public.students student
            WHERE student.id = (v_status->>'student_id')::UUID
              AND student.class_id = v_student.class_id
              AND student.name = v_status->>'student_name'
              AND student.is_active IS DISTINCT FROM false
              AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
        ) THEN
            RAISE EXCEPTION '다른 학급 또는 비활성 학생이 상태표에 포함됐습니다: %', v_status;
        END IF;
    END LOOP;

    IF v_overview->'submission_board'->'student_statuses' IS DISTINCT FROM v_board->'student_statuses' THEN
        RAISE EXCEPTION '첫 과제 개요와 12초 전광판의 학생별 상태 원본이 다릅니다.';
    END IF;

    FOR v_recent IN SELECT value FROM jsonb_array_elements(v_board->'recent_submissions')
    LOOP
        IF COALESCE((v_recent->>'submission_number')::INTEGER, 0) < 1 THEN
            RAISE EXCEPTION '최근 제출 차수가 올바르지 않습니다: %', v_recent;
        END IF;

        SELECT COUNT(*)::INTEGER INTO v_expected_attempts
        FROM public.writing_activity_events event
        WHERE event.object_id = (v_recent->>'post_id')::UUID
          AND event.event_type IN ('post_submitted', 'post_resubmitted')
          AND (event.occurred_at, event.id) <= (
              (v_recent->>'occurred_at')::TIMESTAMPTZ,
              (v_recent->>'event_id')::BIGINT
          );
        IF (v_recent->>'submission_number')::INTEGER <> (CASE
            WHEN v_expected_attempts > 0 THEN v_expected_attempts
            WHEN v_recent->>'event_type' = 'post_resubmitted' THEN 2
            ELSE 1
        END) THEN
            RAISE EXCEPTION '최근 제출 차수 계산이 원장과 다릅니다: %, %', v_recent, v_expected_attempts;
        END IF;
    END LOOP;
END;
$$;
