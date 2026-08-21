DO $$
DECLARE
    v_class RECORD;
    v_result JSONB;
    v_other_teacher_id UUID;
    v_student_auth_id UUID;
BEGIN
    IF has_function_privilege(
        'anon',
        'public.set_teacher_reading_marathon_enabled_v1(uuid,boolean)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION '익명 사용자가 독서마라톤 노출을 바꿀 수 있습니다.';
    END IF;
    IF NOT has_function_privilege(
        'authenticated',
        'public.set_teacher_reading_marathon_enabled_v1(uuid,boolean)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION '인증 교사가 독서마라톤 노출을 바꿀 수 없습니다.';
    END IF;

    SELECT class.id, class.teacher_id
    INTO v_class
    FROM public.classes class
    JOIN public.reading_marathon_campaigns campaign
      ON campaign.class_id = class.id
     AND campaign.archived_at IS NULL
     AND campaign.started_at IS NOT NULL
     AND campaign.status IN ('active', 'paused')
     AND (campaign.ends_on IS NULL OR campaign.ends_on >= CURRENT_DATE)
    WHERE class.teacher_id IS NOT NULL
    ORDER BY campaign.updated_at DESC, campaign.id DESC
    LIMIT 1;

    IF v_class.id IS NULL THEN
        RETURN;
    END IF;

    SELECT class.teacher_id
    INTO v_other_teacher_id
    FROM public.classes class
    JOIN public.profiles profile ON profile.id = class.teacher_id
    WHERE class.teacher_id <> v_class.teacher_id
      AND profile.role = 'TEACHER'
    ORDER BY class.created_at DESC
    LIMIT 1;

    IF v_other_teacher_id IS NOT NULL THEN
        PERFORM set_config('request.jwt.claim.sub', v_other_teacher_id::TEXT, TRUE);
        PERFORM set_config('request.jwt.claims', jsonb_build_object(
            'sub', v_other_teacher_id, 'role', 'authenticated'
        )::TEXT, TRUE);
        BEGIN
            PERFORM public.set_teacher_reading_marathon_enabled_v1(v_class.id, FALSE);
            RAISE EXCEPTION '다른 학급 교사가 독서마라톤 노출을 변경했습니다.';
        EXCEPTION
            WHEN insufficient_privilege THEN NULL;
        END;
    END IF;

    SELECT student.auth_id
    INTO v_student_auth_id
    FROM public.students student
    WHERE student.class_id = v_class.id
      AND student.auth_id IS NOT NULL
      AND student.is_active IS DISTINCT FROM FALSE
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
    ORDER BY student.created_at DESC
    LIMIT 1;

    IF v_student_auth_id IS NOT NULL THEN
        PERFORM set_config('request.jwt.claim.sub', v_student_auth_id::TEXT, TRUE);
        PERFORM set_config('request.jwt.claims', jsonb_build_object(
            'sub', v_student_auth_id, 'role', 'authenticated'
        )::TEXT, TRUE);
        BEGIN
            PERFORM public.set_teacher_reading_marathon_enabled_v1(v_class.id, FALSE);
            RAISE EXCEPTION '학생이 독서마라톤 노출을 변경했습니다.';
        EXCEPTION
            WHEN insufficient_privilege THEN NULL;
        END;
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_class.teacher_id::TEXT, TRUE);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_class.teacher_id, 'role', 'authenticated'
    )::TEXT, TRUE);

    v_result := public.set_teacher_reading_marathon_enabled_v1(v_class.id, FALSE);
    IF v_result #>> '{campaign,status}' <> 'paused'
       OR (v_result #>> '{campaign,is_enabled}')::BOOLEAN IS NOT FALSE THEN
        RAISE EXCEPTION '사용 안 함이 즉시 paused 상태로 저장되지 않았습니다: %', v_result;
    END IF;

    v_result := public.set_teacher_reading_marathon_enabled_v1(v_class.id, TRUE);
    IF v_result #>> '{campaign,status}' <> 'active'
       OR (v_result #>> '{campaign,is_enabled}')::BOOLEAN IS NOT TRUE THEN
        RAISE EXCEPTION '사용함이 즉시 active 상태로 저장되지 않았습니다: %', v_result;
    END IF;
END;
$$;
