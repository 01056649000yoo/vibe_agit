DO $$
DECLARE
    v_student public.students%ROWTYPE;
    v_event_id UUID;
    v_duplicate_id UUID;
    v_home JSONB;
    v_list JSONB;
    v_mark JSONB;
BEGIN
    SELECT student.* INTO v_student
    FROM public.students student
    JOIN public.classes class ON class.id = student.class_id
    WHERE student.auth_id IS NOT NULL
      AND student.is_active IS DISTINCT FROM FALSE
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
      AND class.deleted_at IS NULL
    ORDER BY student.created_at
    LIMIT 1;
    IF v_student.id IS NULL THEN
        RAISE EXCEPTION '활동 알림 스모크에 사용할 활성 학생이 없습니다.';
    END IF;

    v_event_id := public.notification_emit_v1(
        v_student.id, 'writing', 'writing.rewrite_requested', 'student_post', NULL,
        jsonb_build_object('mission_title', '알림 스모크'),
        'notification-smoke:rewrite'
    );
    v_duplicate_id := public.notification_emit_v1(
        v_student.id, 'writing', 'writing.rewrite_requested', 'student_post', NULL,
        jsonb_build_object('mission_title', '중복 스모크'),
        'notification-smoke:rewrite'
    );
    IF v_event_id IS NULL OR v_event_id IS DISTINCT FROM v_duplicate_id THEN
        RAISE EXCEPTION '알림 event_key 중복 방지가 동작하지 않습니다.';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_student.auth_id::TEXT, true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_student.auth_id, 'role', 'authenticated'
    )::TEXT, true);

    v_home := public.get_student_home_bootstrap_v1();
    IF v_home->>'version' <> '1'
      OR v_home->'home'->'unstarted_missions' IS NULL
      OR v_home->'home'->'draft_missions' IS NULL
      OR v_home->'home'->'returned_count' IS NULL
      OR v_home->'activity_notifications'->>'unread_count' IS NULL
      OR v_home->'activity_notifications'->'latest' IS NULL THEN
        RAISE EXCEPTION '학생 홈 알림 응답 계약이 다릅니다: %', v_home;
    END IF;

    v_list := public.get_my_activity_notifications_v1(20, NULL, NULL);
    IF v_list->>'version' <> '1'
      OR jsonb_array_length(v_list->'items') < 1
      OR v_list->'items'->0->>'id' <> v_event_id::TEXT THEN
        RAISE EXCEPTION '학생 활동 알림 목록 계약이 다릅니다: %', v_list;
    END IF;

    v_mark := public.mark_my_activity_notifications_read_v1(ARRAY[v_event_id]);
    IF v_mark->>'marked_count' <> '1' THEN
        RAISE EXCEPTION '학생 활동 알림 읽음 처리가 실패했습니다: %', v_mark;
    END IF;

    IF has_table_privilege('authenticated', 'public.student_notification_events', 'SELECT') THEN
        RAISE EXCEPTION '활동 알림 원장이 authenticated에 직접 공개되어 있습니다.';
    END IF;
    IF has_function_privilege(
        'authenticated',
        'public.notification_emit_v1(uuid,text,text,text,uuid,jsonb,text,smallint)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION '내부 알림 발행 함수가 authenticated에 공개되어 있습니다.';
    END IF;
END;
$$;
