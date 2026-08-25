DO $$
DECLARE
    v_student public.students%ROWTYPE;
    v_teacher_id UUID;
    v_board JSONB;
    v_overview JSONB;
    v_denied BOOLEAN := false;
BEGIN
    IF has_function_privilege('anon', 'public.get_teacher_assignment_submission_board_v1(uuid,integer)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.teacher_assignment_submission_board_snapshot_v1(uuid,integer,integer)', 'EXECUTE') THEN
        RAISE EXCEPTION '과제 제출 전광판 내부/외부 함수 권한이 너무 넓습니다.';
    END IF;

    IF NOT has_function_privilege('authenticated', 'public.get_teacher_assignment_submission_board_v1(uuid,integer)', 'EXECUTE') THEN
        RAISE EXCEPTION '인증 교사가 과제 제출 전광판 RPC를 실행할 수 없습니다.';
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
        RAISE EXCEPTION '과제 제출 전광판 스모크에 사용할 학생이 없습니다.';
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
        RAISE EXCEPTION '학생이 교사용 과제 제출 전광판을 조회했습니다.';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_teacher_id::TEXT, true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_teacher_id, 'role', 'authenticated'
    )::TEXT, true);

    v_board := public.get_teacher_assignment_submission_board_v1(v_student.class_id, 1000);
    v_overview := public.get_teacher_mission_overview_v1(v_student.class_id, 1000);

    IF v_board->>'version' <> '1'
       OR v_board->'mission_statuses' IS NULL
       OR v_board->'submission_counts' IS NULL
       OR v_board->'recent_submissions' IS NULL
       OR jsonb_array_length(v_board->'recent_submissions') > 8 THEN
        RAISE EXCEPTION '과제 제출 전광판 응답 계약이 다릅니다: %', v_board;
    END IF;

    IF v_overview->'submission_board' IS NULL
       OR v_overview->'submission_counts' IS DISTINCT FROM v_board->'submission_counts'
       OR v_overview->'submission_board'->'mission_statuses' IS DISTINCT FROM v_board->'mission_statuses' THEN
        RAISE EXCEPTION '첫 과제 개요와 경량 전광판의 상태 원본이 다릅니다.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'idx_student_posts_class_mission_assignment_status'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'idx_writing_events_class_submission_time'
    ) THEN
        RAISE EXCEPTION '과제 제출 전광판 인덱스가 없습니다.';
    END IF;
END;
$$;
