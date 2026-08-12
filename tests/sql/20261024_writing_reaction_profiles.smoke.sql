DO $$
DECLARE
    v_student public.students%ROWTYPE;
    v_report_post_id UUID;
    v_standard_post_id UUID;
    v_report_result JSONB;
    v_standard_result JSONB;
    v_teacher_id UUID;
    v_report_mission_id UUID;
    v_teacher_result JSONB;
BEGIN
    SELECT student.* INTO v_student
    FROM public.students student
    WHERE student.auth_id IS NOT NULL
      AND student.is_active IS DISTINCT FROM FALSE
      AND student.deleted_at IS NULL
      AND EXISTS (
          SELECT 1
          FROM public.student_posts post
          JOIN public.writing_missions mission
            ON mission.id = post.mission_id AND mission.class_id = post.class_id
          WHERE post.class_id = student.class_id
            AND post.is_submitted IS TRUE
            AND post.visibility = 'class'
            AND COALESCE(NULLIF(mission.input_template, ''), NULLIF(mission.mission_type, '')) = 'report'
      )
    ORDER BY student.created_at
    LIMIT 1;
    IF v_student.id IS NULL THEN
        RAISE EXCEPTION '보고서 반응 스모크에 사용할 학생이 없습니다.';
    END IF;

    SELECT post.id INTO v_report_post_id
    FROM public.student_posts post
    JOIN public.writing_missions mission
      ON mission.id = post.mission_id AND mission.class_id = post.class_id
    WHERE post.class_id = v_student.class_id
      AND post.is_submitted IS TRUE
      AND post.visibility = 'class'
      AND COALESCE(NULLIF(mission.input_template, ''), NULLIF(mission.mission_type, '')) = 'report'
    ORDER BY post.created_at
    LIMIT 1;
    IF v_report_post_id IS NULL THEN
        RAISE EXCEPTION '보고서 반응 스모크에 사용할 공개 글이 없습니다.';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_student.auth_id::TEXT, TRUE);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_student.auth_id, 'role', 'authenticated'
    )::TEXT, TRUE);

    v_report_result := public.toggle_my_post_reaction_v1(v_report_post_id, 'report_detail');
    IF v_report_result->>'version' <> '1'
       OR v_report_result->>'reaction_profile' <> 'report' THEN
        RAISE EXCEPTION '보고서 반응 프로필 계약 오류: %', v_report_result;
    END IF;
    PERFORM public.toggle_my_post_reaction_v1(v_report_post_id, 'report_detail');

    BEGIN
        PERFORM public.toggle_my_post_reaction_v1(v_report_post_id, 'heart');
        RAISE EXCEPTION '보고서 글에 기본 반응이 허용되었습니다.';
    EXCEPTION WHEN SQLSTATE '22023' THEN
        NULL;
    END;

    SELECT post.id INTO v_standard_post_id
    FROM public.student_posts post
    LEFT JOIN public.writing_missions mission
      ON mission.id = post.mission_id AND mission.class_id = post.class_id
    WHERE post.class_id = v_student.class_id
      AND post.is_submitted IS TRUE
      AND post.visibility = 'class'
      AND COALESCE(NULLIF(mission.input_template, ''), NULLIF(mission.mission_type, ''), 'standard')
          NOT IN ('report', 'meeting')
    ORDER BY post.created_at
    LIMIT 1;
    IF v_standard_post_id IS NULL THEN
        RAISE EXCEPTION '기본 반응 스모크에 사용할 공개 글이 없습니다.';
    END IF;

    v_standard_result := public.toggle_my_post_reaction_v1(v_standard_post_id, 'heart');
    IF v_standard_result->>'reaction_profile' <> 'standard' THEN
        RAISE EXCEPTION '기본 반응 프로필 계약 오류: %', v_standard_result;
    END IF;
    PERFORM public.toggle_my_post_reaction_v1(v_standard_post_id, 'heart');

    BEGIN
        PERFORM public.toggle_my_post_reaction_v1(v_standard_post_id, 'report_clear');
        RAISE EXCEPTION '기본 글에 보고서 반응이 허용되었습니다.';
    EXCEPTION WHEN SQLSTATE '22023' THEN
        NULL;
    END;

    SELECT mission.id, class.teacher_id
    INTO v_report_mission_id, v_teacher_id
    FROM public.writing_missions mission
    JOIN public.classes class ON class.id = mission.class_id
    WHERE COALESCE(NULLIF(mission.input_template, ''), NULLIF(mission.mission_type, '')) = 'report'
      AND class.teacher_id IS NOT NULL
      AND class.deleted_at IS NULL
    ORDER BY mission.created_at
    LIMIT 1;

    PERFORM set_config('request.jwt.claim.sub', v_teacher_id::TEXT, TRUE);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_teacher_id, 'role', 'authenticated'
    )::TEXT, TRUE);
    v_teacher_result := public.get_teacher_mission_engagement_v1(v_report_mission_id);
    IF v_teacher_result->>'version' <> '1'
       OR v_teacher_result->>'reaction_profile' <> 'report'
       OR v_teacher_result->>'max_rows' <> '100'
       OR v_teacher_result->'items' IS NULL THEN
        RAISE EXCEPTION '교사 반응 모아보기 계약 오류: %', v_teacher_result;
    END IF;

    IF has_table_privilege('authenticated', 'public.post_reactions', 'INSERT')
       OR has_table_privilege('authenticated', 'public.post_reactions', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.post_reactions', 'DELETE') THEN
        RAISE EXCEPTION '학생 반응 원장 쓰기가 authenticated에 직접 공개되어 있습니다.';
    END IF;
    IF has_table_privilege('authenticated', 'public.writing_reaction_profile_types', 'SELECT') THEN
        RAISE EXCEPTION '내부 반응 프로필 카탈로그가 authenticated에 공개되어 있습니다.';
    END IF;
    IF has_function_privilege('anon', 'public.toggle_my_post_reaction_v1(uuid,text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.get_teacher_mission_engagement_v1(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION '반응 RPC가 anon에 공개되어 있습니다.';
    END IF;
END;
$$;
