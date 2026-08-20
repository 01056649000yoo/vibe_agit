DO $$
DECLARE
    v_class RECORD;
    v_student RECORD;
    v_workspace JSONB;
BEGIN
    IF has_function_privilege('anon', 'public.record_spelling_search_batch_v2(jsonb)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.get_spelling_learning_workspace_v2(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION '익명 사용자가 맞춤법 검색 후보 RPC를 실행할 수 있습니다.';
    END IF;

    SELECT class.id, class.teacher_id
    INTO v_class
    FROM public.classes class
    WHERE class.teacher_id IS NOT NULL
      AND class.deleted_at IS NULL
    ORDER BY class.created_at DESC
    LIMIT 1;

    IF v_class.id IS NULL THEN RETURN; END IF;

    SELECT student.id, student.auth_id
    INTO v_student
    FROM public.students student
    WHERE student.class_id = v_class.id
      AND student.auth_id IS NOT NULL
      AND student.deleted_at IS NULL
    ORDER BY student.created_at DESC
    LIMIT 1;

    IF v_student.id IS NULL THEN RETURN; END IF;

    PERFORM set_config('request.jwt.claim.sub', v_student.auth_id::TEXT, TRUE);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_student.auth_id, 'role', 'authenticated'
    )::TEXT, TRUE);

    PERFORM public.record_spelling_search_batch_v2(jsonb_build_array(
        jsonb_build_object('kind', 'candidate', 'display', '가르켜줘', 'count', 3),
        jsonb_build_object('kind', 'sentence', 'display', '오늘 학교에서 친구와 신나게 놀았다.', 'count', 1),
        jsonb_build_object('kind', 'dictionary', 'display', '강아지', 'count', 1),
        jsonb_build_object('kind', 'covered', 'entry_key', 'common:test-entry', 'label', '기존 자료', 'count', 1)
    ));

    IF EXISTS (
        SELECT 1 FROM public.class_spelling_daily_stats stats
        WHERE stats.class_id = v_class.id
          AND (stats.entry_key LIKE '%오늘 학교에서%'
               OR stats.display_expression LIKE '%오늘 학교에서%')
    ) THEN
        RAISE EXCEPTION '문장 검색 원문이 학급 통계에 저장됐습니다.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.class_spelling_daily_stats stats
        WHERE stats.class_id = v_class.id
          AND stats.entry_key = 'summary:sentence'
          AND stats.display_expression IS NULL
    ) THEN
        RAISE EXCEPTION '문장 검색이 원문 없는 요약 횟수로 저장되지 않았습니다.';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_class.teacher_id::TEXT, TRUE);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_class.teacher_id, 'role', 'authenticated'
    )::TEXT, TRUE);

    v_workspace := public.get_spelling_learning_workspace_v2(v_class.id);
    IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_workspace->'candidate_searches') candidate
        WHERE candidate->>'expression' = '가르켜줘'
    ) THEN
        RAISE EXCEPTION '반복된 짧은 미등록 표현이 추천 후보에 없습니다.';
    END IF;
    IF v_workspace::TEXT LIKE '%오늘 학교에서%' OR v_workspace::TEXT LIKE '%강아지%' THEN
        RAISE EXCEPTION '문장 또는 사전 검색 원문이 교사 작업공간에 노출됐습니다.';
    END IF;
END;
$$;
