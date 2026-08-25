-- 이 파일은 check-migrations가 만든 바깥 트랜잭션에서 실행되고 마지막에 전부 롤백된다.

DO $$
DECLARE
    v_post public.student_posts%ROWTYPE;
    v_student public.students%ROWTYPE;
    v_before_count INTEGER;
    v_after_count INTEGER;
    v_cursor_at TIMESTAMPTZ;
    v_event_id UUID;
    v_result JSONB;
BEGIN
    SELECT post.* INTO v_post
    FROM public.student_posts post
    JOIN public.students student
      ON student.id = post.student_id
     AND student.class_id = post.class_id
     AND student.auth_id IS NOT NULL
     AND student.is_active IS DISTINCT FROM FALSE
     AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
    JOIN public.writing_missions mission
      ON mission.id = post.mission_id
     AND mission.class_id = post.class_id
    WHERE post.writing_context = 'assignment'
    ORDER BY post.created_at DESC
    LIMIT 1;
    IF v_post.id IS NULL THEN
        RAISE EXCEPTION '회수 되돌려주기 알림 스모크에 사용할 과제 글이 없습니다.';
    END IF;

    SELECT student.* INTO v_student
    FROM public.students student
    WHERE student.id = v_post.student_id
      AND student.class_id = v_post.class_id;

    -- 강제 회수된 상태: 학생에게는 글이 잠기고 교사 제출 목록으로 돌아와 있다.
    UPDATE public.student_posts
    SET is_returned = FALSE,
        is_submitted = TRUE,
        is_confirmed = FALSE,
        recalled_at = clock_timestamp()
    WHERE id = v_post.id AND class_id = v_post.class_id;

    SELECT count(*)::INTEGER INTO v_before_count
    FROM public.student_notification_events event
    WHERE event.student_id = v_post.student_id
      AND event.entity_id = v_post.id
      AND event.event_type = 'writing.rewrite_requested';

    v_cursor_at := clock_timestamp();
    PERFORM pg_sleep(0.002);

    -- 교사가 다시 주면 실제 다시쓰기 상태로 바뀌며 새 알림을 반드시 남긴다.
    UPDATE public.student_posts
    SET is_returned = TRUE,
        is_submitted = FALSE,
        is_confirmed = FALSE,
        recalled_at = NULL,
        recalled_by = NULL
    WHERE id = v_post.id AND class_id = v_post.class_id;

    SELECT count(*)::INTEGER INTO v_after_count
    FROM public.student_notification_events event
    WHERE event.student_id = v_post.student_id
      AND event.entity_id = v_post.id
      AND event.event_type = 'writing.rewrite_requested';
    SELECT event.id INTO v_event_id
    FROM public.student_notification_events event
    WHERE event.student_id = v_post.student_id
      AND event.entity_id = v_post.id
      AND event.event_type = 'writing.rewrite_requested'
    ORDER BY event.created_at DESC, event.id DESC
    LIMIT 1;

    IF v_after_count <> v_before_count + 1 OR v_event_id IS NULL THEN
        RAISE EXCEPTION '강제 회수한 글을 다시 줬을 때 반려 알림이 생성되지 않았습니다.';
    END IF;

    -- 바깥 migrate:check 트랜잭션의 NOW() 고정값 대신 실제 전환 뒤 시각으로 맞춘다.
    UPDATE public.student_notification_events
    SET created_at = clock_timestamp()
    WHERE id = v_event_id;

    PERFORM set_config('request.jwt.claim.sub', v_student.auth_id::TEXT, true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_student.auth_id, 'role', 'authenticated'
    )::TEXT, true);

    v_result := public.poll_my_priority_writing_notifications_v1(
        v_cursor_at, '00000000-0000-0000-0000-000000000000'::UUID
    );
    IF jsonb_array_length(v_result->'items') <> 1
       OR v_result->'items'->0->>'event_type' <> 'writing.rewrite_requested'
       OR v_result->'items'->0->>'entity_id' <> v_post.id::TEXT THEN
        RAISE EXCEPTION '회수 뒤 다시 준 글의 상단 알림 신호를 찾지 못했습니다: %', v_result;
    END IF;

    -- 이미 다시쓰기 중인 같은 상태를 다시 저장해도 같은 알림을 반복해서 만들지 않는다.
    UPDATE public.student_posts
    SET is_returned = TRUE,
        is_submitted = FALSE,
        is_confirmed = FALSE,
        recalled_at = NULL
    WHERE id = v_post.id AND class_id = v_post.class_id;

    SELECT count(*)::INTEGER INTO v_after_count
    FROM public.student_notification_events event
    WHERE event.student_id = v_post.student_id
      AND event.entity_id = v_post.id
      AND event.event_type = 'writing.rewrite_requested';
    IF v_after_count <> v_before_count + 1 THEN
        RAISE EXCEPTION '같은 다시쓰기 상태 재저장에서 중복 알림이 생성되었습니다.';
    END IF;
END;
$$;
