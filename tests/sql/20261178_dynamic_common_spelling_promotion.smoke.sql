DO $$
DECLARE
    v_admin UUID;
    v_teacher UUID;
    v_class UUID;
    v_student_auth UUID;
    v_entry_id UUID;
    v_student_data JSONB;
    v_workspace JSONB;
BEGIN
    IF has_table_privilege('authenticated', 'public.spelling_common_reviews', 'SELECT')
       OR has_table_privilege('authenticated', 'public.spelling_common_reviews', 'INSERT')
       OR has_table_privilege('authenticated', 'public.spelling_common_reviews', 'UPDATE') THEN
        RAISE EXCEPTION '공통 맞춤법 검토 원장이 브라우저 역할에 직접 공개됐습니다.';
    END IF;
    IF has_function_privilege('anon', 'public.admin_publish_common_spelling_entry_v1(text,text,text,jsonb,uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.admin_reject_spelling_candidate_v1(text,text,text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.admin_set_common_spelling_entry_status_v1(uuid,boolean)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.get_student_spelling_entries_v2()', 'EXECUTE') THEN
        RAISE EXCEPTION '공통 맞춤법 RPC가 익명 역할에 공개됐습니다.';
    END IF;

    SELECT profile.id INTO v_admin
    FROM public.profiles profile
    WHERE profile.role = 'ADMIN'
    ORDER BY profile.created_at
    LIMIT 1;

    SELECT class.teacher_id, class.id INTO v_teacher, v_class
    FROM public.classes class
    WHERE class.teacher_id IS NOT NULL
      AND class.deleted_at IS NULL
      AND EXISTS (
          SELECT 1 FROM public.students student
          WHERE student.class_id = class.id
            AND student.auth_id IS NOT NULL
            AND student.deleted_at IS NULL
      )
    ORDER BY class.created_at
    LIMIT 1;

    SELECT student.auth_id INTO v_student_auth
    FROM public.students student
    WHERE student.class_id = v_class
      AND student.auth_id IS NOT NULL
      AND student.deleted_at IS NULL
    ORDER BY student.created_at
    LIMIT 1;

    IF v_admin IS NULL OR v_teacher IS NULL OR v_student_auth IS NULL THEN
        RAISE EXCEPTION '공통 맞춤법 스모크용 관리자·교사·학생 fixture가 없습니다.';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_admin::TEXT, TRUE);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_admin, 'role', 'authenticated'
    )::TEXT, TRUE);

    v_entry_id := (public.admin_publish_common_spelling_entry_v1(
        'ai',
        '검증오타후보',
        '검증바른후보',
        jsonb_build_object(
            'wrong_expression', '검증오타후보',
            'correct_expression', '검증바른후보',
            'label', '검증용',
            'explanation', '공통 맞춤법 승격 스모크에서 사용하는 설명입니다.',
            'examples', jsonb_build_array('검증바른후보를 사용합니다.')
        ),
        NULL
    )->>'id')::UUID;

    IF NOT EXISTS (
        SELECT 1 FROM public.spelling_learning_entries entry
        WHERE entry.id = v_entry_id
          AND entry.scope = 'common'
          AND entry.status = 'approved'
          AND entry.class_id IS NULL
          AND entry.source_kind = 'ai'
    ) THEN
        RAISE EXCEPTION '관리자 승격이 승인된 공통 맞춤법 자료를 만들지 못했습니다.';
    END IF;

    v_workspace := public.admin_get_spelling_promotion_workspace_v2(1, 1, 200);
    IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_workspace->'common_entries') item
        WHERE item->>'id' = v_entry_id::TEXT
    ) THEN
        RAISE EXCEPTION '관리자 작업공간에 게시한 공통 자료가 없습니다.';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_student_auth::TEXT, TRUE);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_student_auth, 'role', 'authenticated'
    )::TEXT, TRUE);

    v_student_data := public.get_student_spelling_entries_v2();
    IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_student_data->'entries') item
        WHERE item->>'id' = v_entry_id::TEXT
          AND item->>'scope' = 'common'
    ) THEN
        RAISE EXCEPTION '학생에게 승인된 공통 맞춤법 자료가 전달되지 않았습니다.';
    END IF;
    IF COALESCE(v_student_data->>'version', '') = '' THEN
        RAISE EXCEPTION '학생 맞춤법 자료 버전이 비어 있습니다.';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_teacher::TEXT, TRUE);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_teacher, 'role', 'authenticated'
    )::TEXT, TRUE);

    BEGIN
        PERFORM public.save_spelling_learning_entry_v1(
            v_class,
            NULL,
            jsonb_build_object(
                'wrong_expression', '검증오타후보',
                'correct_expression', '다른교정',
                'label', '중복',
                'explanation', '공통 자료와 같은 표현을 학급 자료로 등록하면 안 됩니다.',
                'examples', '[]'::JSONB
            ),
            TRUE
        );
        RAISE EXCEPTION '교사가 공통 자료와 같은 표현을 학급 자료로 중복 등록했습니다.';
    EXCEPTION
        WHEN unique_violation THEN NULL;
    END;

    BEGIN
        PERFORM public.admin_set_common_spelling_entry_status_v1(v_entry_id, FALSE);
        RAISE EXCEPTION '일반 교사가 공통 자료 상태를 변경했습니다.';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;

    PERFORM set_config('request.jwt.claim.sub', v_admin::TEXT, TRUE);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_admin, 'role', 'authenticated'
    )::TEXT, TRUE);
    PERFORM public.admin_set_common_spelling_entry_status_v1(v_entry_id, FALSE);

    PERFORM set_config('request.jwt.claim.sub', v_student_auth::TEXT, TRUE);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_student_auth, 'role', 'authenticated'
    )::TEXT, TRUE);
    v_student_data := public.get_student_spelling_entries_v2();
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_student_data->'entries') item
        WHERE item->>'id' = v_entry_id::TEXT
    ) THEN
        RAISE EXCEPTION '중지한 공통 맞춤법 자료가 학생에게 계속 전달됩니다.';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_admin::TEXT, TRUE);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_admin, 'role', 'authenticated'
    )::TEXT, TRUE);
    PERFORM public.admin_reject_spelling_candidate_v1('search', '검증검색후보', '');
    IF NOT EXISTS (
        SELECT 1 FROM public.spelling_common_reviews review
        WHERE review.source_kind = 'search'
          AND review.expression = '검증검색후보'
          AND review.decision = 'rejected'
    ) THEN
        RAISE EXCEPTION '검색 후보 보류 결정이 기록되지 않았습니다.';
    END IF;
END;
$$;
