DO $$
DECLARE
    v_student public.students%ROWTYPE;
    v_teacher_id UUID;
    v_other_class_id UUID;
    v_history JSONB;
    v_denied BOOLEAN := FALSE;
BEGIN
    IF has_function_privilege('anon', 'public.get_teacher_assignment_submission_history_v1(uuid,integer)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.get_teacher_assignment_submission_history_v1(uuid,integer)', 'EXECUTE') THEN
        RAISE EXCEPTION '과제 제출 기록 RPC 권한이 올바르지 않습니다.';
    END IF;

    SELECT student.*
    INTO v_student
    FROM public.students student
    JOIN public.classes class ON class.id = student.class_id
    WHERE student.auth_id IS NOT NULL
      AND student.is_active IS DISTINCT FROM FALSE
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
      AND class.deleted_at IS NULL
      AND class.teacher_id IS NOT NULL
    ORDER BY student.created_at
    LIMIT 1;

    IF v_student.id IS NULL THEN
        RAISE EXCEPTION '과제 제출 기록 스모크에 사용할 학생이 없습니다.';
    END IF;

    SELECT class.teacher_id INTO v_teacher_id
    FROM public.classes class
    WHERE class.id = v_student.class_id;

    PERFORM set_config('request.jwt.claim.sub', v_student.auth_id::TEXT, TRUE);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_student.auth_id, 'role', 'authenticated'
    )::TEXT, TRUE);

    BEGIN
        PERFORM public.get_teacher_assignment_submission_history_v1(v_student.class_id, 100);
    EXCEPTION WHEN insufficient_privilege THEN
        v_denied := TRUE;
    END;
    IF NOT v_denied THEN
        RAISE EXCEPTION '학생이 교사용 과제 제출 기록을 조회했습니다.';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_teacher_id::TEXT, TRUE);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_teacher_id, 'role', 'authenticated'
    )::TEXT, TRUE);

    v_history := public.get_teacher_assignment_submission_history_v1(v_student.class_id, 1000);
    IF v_history->>'version' <> '1'
       OR jsonb_typeof(v_history->'has_more') <> 'boolean'
       OR jsonb_typeof(v_history->'submissions') <> 'array'
       OR jsonb_array_length(v_history->'submissions') > 100 THEN
        RAISE EXCEPTION '과제 제출 기록 응답 계약이 다릅니다: %', v_history;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_history->'submissions') item
        WHERE item ?| ARRAY['content', 'title', 'feedback', 'mission_title']
    ) THEN
        RAISE EXCEPTION '과제 제출 기록에 불필요한 글 내용이나 반복 과제명이 포함됐습니다.';
    END IF;

    SELECT class.id INTO v_other_class_id
    FROM public.classes class
    WHERE class.deleted_at IS NULL
      AND class.teacher_id IS DISTINCT FROM v_teacher_id
    LIMIT 1;

    IF v_other_class_id IS NOT NULL THEN
        v_denied := FALSE;
        BEGIN
            PERFORM public.get_teacher_assignment_submission_history_v1(v_other_class_id, 100);
        EXCEPTION WHEN insufficient_privilege THEN
            v_denied := TRUE;
        END;
        IF NOT v_denied THEN
            RAISE EXCEPTION '교사가 다른 학급의 과제 제출 기록을 조회했습니다.';
        END IF;
    END IF;
END;
$$;
