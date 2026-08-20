DO $$
DECLARE
    v_class RECORD;
    v_campaign_id UUID;
    v_first_student_id UUID;
    v_payload_a JSONB;
    v_payload_b JSONB;
    v_result JSONB;
    v_expected_students INTEGER;
    v_assigned_students INTEGER;
    v_first_team_name TEXT;
BEGIN
    IF has_function_privilege(
        'anon',
        'public.save_teacher_reading_marathon_v2(uuid,text,integer,text,text,integer,jsonb,date,boolean,boolean)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION '익명 사용자가 독서마라톤 모둠 배정을 저장할 수 있습니다.';
    END IF;

    SELECT class.id, class.teacher_id
    INTO v_class
    FROM public.classes class
    WHERE class.teacher_id IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM public.reading_marathon_campaigns campaign
          WHERE campaign.class_id = class.id AND campaign.archived_at IS NULL
      )
      AND (SELECT COUNT(*) FROM public.students student
           WHERE student.class_id = class.id
             AND student.is_active IS DISTINCT FROM false
             AND (student.deleted_at IS NULL OR student.deleted_at > NOW())) BETWEEN 2 AND 100
    ORDER BY class.created_at DESC
    LIMIT 1;

    IF v_class.id IS NULL THEN
        RETURN;
    END IF;

    WITH roster AS (
        SELECT student.id, ROW_NUMBER() OVER (ORDER BY student.name, student.id) AS row_number
        FROM public.students student
        WHERE student.class_id = v_class.id
          AND student.is_active IS DISTINCT FROM false
          AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
        ORDER BY student.name, student.id
        LIMIT 100
    )
    SELECT
        COUNT(*)::INTEGER,
        (ARRAY_AGG(id ORDER BY row_number))[1],
        jsonb_build_array(
            jsonb_build_object(
                'name', '햇살 모둠', 'color', '#F97316', 'sort_order', 0,
                'student_ids', COALESCE(jsonb_agg(id) FILTER (WHERE row_number % 2 = 1), '[]'::JSONB)
            ),
            jsonb_build_object(
                'name', '바다 모둠', 'color', '#0EA5E9', 'sort_order', 1,
                'student_ids', COALESCE(jsonb_agg(id) FILTER (WHERE row_number % 2 = 0), '[]'::JSONB)
            )
        ),
        jsonb_build_array(
            jsonb_build_object(
                'name', '햇살 모둠', 'color', '#F97316', 'sort_order', 0,
                'student_ids', COALESCE(jsonb_agg(id) FILTER (WHERE row_number % 2 = 0), '[]'::JSONB)
            ),
            jsonb_build_object(
                'name', '바다 모둠', 'color', '#0EA5E9', 'sort_order', 1,
                'student_ids', COALESCE(jsonb_agg(id) FILTER (WHERE row_number % 2 = 1), '[]'::JSONB)
            )
        )
    INTO v_expected_students, v_first_student_id, v_payload_a, v_payload_b
    FROM roster;

    PERFORM set_config('request.jwt.claim.sub', v_class.teacher_id::TEXT, TRUE);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_class.teacher_id, 'role', 'authenticated'
    )::TEXT, TRUE);

    v_result := public.save_teacher_reading_marathon_v2(
        v_class.id, '모둠 배정 롤백 검사', 10000,
        'group_team', 'books', 1, v_payload_a, NULL, FALSE, FALSE
    );
    v_campaign_id := (v_result->'campaign'->>'id')::UUID;

    IF v_campaign_id IS NULL OR v_result->'campaign'->>'started_at' IS NOT NULL THEN
        RAISE EXCEPTION '초안 저장 단계에서 마라톤이 시작됐습니다.';
    END IF;

    SELECT COUNT(*) INTO v_assigned_students
    FROM public.reading_marathon_participants participant
    WHERE participant.campaign_id = v_campaign_id;
    IF v_assigned_students <> v_expected_students THEN
        RAISE EXCEPTION '초안의 학생 배정이 누락됐습니다: % / %', v_assigned_students, v_expected_students;
    END IF;

    v_result := public.save_teacher_reading_marathon_v2(
        v_class.id, '모둠 배정 롤백 검사', 10000,
        'group_team', 'books', 1, v_payload_a, NULL, TRUE, FALSE
    );
    IF v_result->'campaign'->>'started_at' IS NULL THEN
        RAISE EXCEPTION '명시적인 시작 요청이 캠페인을 시작하지 못했습니다.';
    END IF;

    -- 아직 기여 기록이 없으므로 시작 직후의 잘못된 배정은 안전하게 복구할 수 있어야 한다.
    PERFORM public.save_teacher_reading_marathon_v2(
        v_class.id, '모둠 배정 롤백 검사', 10000,
        'group_team', 'books', 1, v_payload_b, NULL, TRUE, FALSE
    );

    SELECT team.name INTO v_first_team_name
    FROM public.reading_marathon_participants participant
    JOIN public.reading_marathon_teams team
      ON team.id = participant.team_id AND team.campaign_id = participant.campaign_id
    WHERE participant.campaign_id = v_campaign_id
      AND participant.student_id = v_first_student_id;

    IF v_first_team_name IS DISTINCT FROM '바다 모둠' THEN
        RAISE EXCEPTION '시작 직후 학생 배정 복구가 반영되지 않았습니다: %', v_first_team_name;
    END IF;
END;
$$;
