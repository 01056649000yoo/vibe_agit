DO $$
DECLARE
    v_admin UUID;
    v_teacher UUID;
    v_week DATE := date_trunc('week', CURRENT_DATE)::DATE;
    v_item UUID;
    v_workspace JSONB;
    v_result JSONB;
BEGIN
    IF has_table_privilege('authenticated', 'public.spelling_weekly_review_runs', 'SELECT')
       OR has_table_privilege('authenticated', 'public.spelling_weekly_ai_review_cache', 'SELECT')
       OR has_table_privilege('authenticated', 'public.spelling_weekly_review_items', 'SELECT') THEN
        RAISE EXCEPTION '주간 맞춤법 검수 원장이 브라우저 역할에 직접 공개됐습니다.';
    END IF;
    IF has_function_privilege('authenticated', 'public.start_spelling_weekly_review_v1(date,text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.admin_get_spelling_promotion_workspace_v3()', 'EXECUTE')
       OR has_function_privilege('anon', 'public.admin_publish_weekly_spelling_entry_v1(uuid,jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION '주간 맞춤법 서버/관리자 RPC 권한이 잘못 공개됐습니다.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns column_info
        WHERE column_info.table_schema = 'public'
          AND column_info.table_name IN ('spelling_weekly_review_runs', 'spelling_weekly_ai_review_cache', 'spelling_weekly_review_items')
          AND column_info.column_name IN ('student_id', 'class_id', 'post_id', 'content')
    ) THEN
        RAISE EXCEPTION '주간 맞춤법 검수 원장에 학생 글·식별자 열이 생겼습니다.';
    END IF;

    SELECT profile.id INTO v_admin
    FROM public.profiles profile
    WHERE profile.role = 'ADMIN'
    ORDER BY profile.created_at
    LIMIT 1;
    SELECT class.teacher_id INTO v_teacher
    FROM public.classes class
    WHERE class.teacher_id IS NOT NULL AND class.deleted_at IS NULL
    ORDER BY class.created_at
    LIMIT 1;
    IF v_admin IS NULL OR v_teacher IS NULL THEN
        RAISE EXCEPTION '주간 맞춤법 스모크용 관리자·교사 fixture가 없습니다.';
    END IF;

    INSERT INTO public.spelling_weekly_review_runs(
        week_start, status, source_since_at, collected_count, ai_reviewed_count,
        catalog_version, model, finished_at
    ) VALUES (v_week, 'ready', NOW() - INTERVAL '7 days', 1, 1, 'smoke', 'gpt-4o-mini', NOW());

    INSERT INTO public.spelling_weekly_review_items(
        week_start, review_key, source_kinds, primary_source, expression,
        source_correction, hit_count, class_count, ai_verdict, ai_correct_expression,
        ai_label, ai_explanation, ai_examples, ai_reason
    ) VALUES (
        v_week, repeat('a', 64), ARRAY['ai', 'search'], 'ai', '주간검증오타',
        '주간 검증 교정', 4, 2, 'recommend', '주간 검증 교정',
        '주간 검증', '주간 자동 검수가 만든 관리자 확인용 설명입니다.',
        jsonb_build_array('주간 검증 교정을 사용합니다.'), '공통 자료 후보로 검토할 수 있습니다.'
    ) RETURNING id INTO v_item;

    PERFORM set_config('request.jwt.claim.sub', v_teacher::TEXT, TRUE);
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_teacher, 'role', 'authenticated')::TEXT, TRUE);
    BEGIN
        PERFORM public.admin_get_spelling_promotion_workspace_v3();
        RAISE EXCEPTION '일반 교사가 주간 맞춤법 검수표를 조회했습니다.';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;

    PERFORM set_config('request.jwt.claim.sub', v_admin::TEXT, TRUE);
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::TEXT, TRUE);
    v_workspace := public.admin_get_spelling_promotion_workspace_v3();
    IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_workspace->'weekly_candidates') item
        WHERE item->>'id' = v_item::TEXT AND item->>'ai_verdict' = 'recommend'
    ) THEN
        RAISE EXCEPTION '관리자 주간 맞춤법 작업공간에 검수 후보가 없습니다.';
    END IF;

    v_result := public.admin_publish_weekly_spelling_entry_v1(v_item, jsonb_build_object(
        'wrong_expression', '주간검증오타',
        'correct_expression', '주간 검증 교정',
        'label', '주간 검증',
        'explanation', '주간 자동 검수 뒤 관리자가 확인한 공통 자료입니다.',
        'examples', jsonb_build_array('주간 검증 교정을 사용합니다.')
    ));
    IF v_result->>'status' <> 'approved' OR NOT EXISTS (
        SELECT 1 FROM public.spelling_weekly_review_items item
        WHERE item.id = v_item AND item.decision = 'published' AND item.common_entry_id IS NOT NULL
    ) THEN
        RAISE EXCEPTION '주간 후보가 관리자 선택 뒤 공통 자료로 게시되지 않았습니다.';
    END IF;
END;
$$;
