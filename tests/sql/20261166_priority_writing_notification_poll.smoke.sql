-- 이 파일은 check-migrations가 만든 바깥 트랜잭션에서 실행되고 마지막에 전부 롤백된다.

DO $$
DECLARE
    v_post public.student_posts%ROWTYPE;
    v_student public.students%ROWTYPE;
    v_cursor_at TIMESTAMPTZ;
    v_result JSONB;
    v_next_cursor_at TIMESTAMPTZ;
    v_next_cursor_id UUID;
BEGIN
    SELECT post.* INTO v_post
    FROM public.student_posts post
    JOIN public.students student
      ON student.id = post.student_id
     AND student.class_id = post.class_id
     AND student.auth_id IS NOT NULL
     AND student.is_active IS DISTINCT FROM FALSE
     AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
    WHERE post.writing_context = 'assignment'
      AND post.mission_id IS NOT NULL
    ORDER BY post.created_at DESC
    LIMIT 1;
    IF v_post.id IS NULL THEN
        RAISE EXCEPTION '우선 글 알림 폴링 스모크에 사용할 과제 글이 없습니다.';
    END IF;

    SELECT student.* INTO v_student
    FROM public.students student
    WHERE student.id = v_post.student_id
      AND student.class_id = v_post.class_id;

    -- 어떤 과거 상태였든 반려 전환이 한 번 발생하게 중립 상태를 만든다.
    UPDATE public.student_posts
    SET is_returned = FALSE,
        is_submitted = TRUE,
        is_confirmed = FALSE,
        recalled_at = NULL
    WHERE id = v_post.id AND class_id = v_post.class_id;

    v_cursor_at := clock_timestamp();
    PERFORM pg_sleep(0.002);

    UPDATE public.student_posts
    SET is_returned = TRUE,
        is_submitted = FALSE,
        is_confirmed = FALSE,
        recalled_at = NULL
    WHERE id = v_post.id AND class_id = v_post.class_id;

    -- migrate:check는 마이그레이션과 스모크 전체를 한 트랜잭션으로 감싼다.
    -- 알림 기본값 NOW()도 바깥 트랜잭션 시작 시각에 고정되므로, 실제의
    -- `홈 조회 트랜잭션 → 교사 반려 트랜잭션` 순서를 clock_timestamp로 재현한다.
    UPDATE public.student_notification_events event
    SET created_at = clock_timestamp()
    WHERE event.id = (
        SELECT candidate.id
        FROM public.student_notification_events candidate
        WHERE candidate.student_id = v_post.student_id
          AND candidate.class_id = v_post.class_id
          AND candidate.entity_id = v_post.id
          AND candidate.event_type = 'writing.rewrite_requested'
        ORDER BY candidate.created_at DESC, candidate.id DESC
        LIMIT 1
    );

    PERFORM set_config('request.jwt.claim.sub', v_student.auth_id::TEXT, true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_student.auth_id, 'role', 'authenticated'
    )::TEXT, true);

    v_result := public.poll_my_priority_writing_notifications_v1(
        v_cursor_at, '00000000-0000-0000-0000-000000000000'::UUID
    );
    IF v_result->>'version' <> '1'
       OR jsonb_array_length(v_result->'items') <> 1
       OR v_result->'items'->0->>'event_type' <> 'writing.rewrite_requested'
       OR v_result->'items'->0 ? 'payload' THEN
        RAISE EXCEPTION '반려 신호의 최소 응답 계약이 다릅니다: %', v_result;
    END IF;

    v_next_cursor_at := (v_result->'cursor'->>'created_at')::TIMESTAMPTZ;
    v_next_cursor_id := (v_result->'cursor'->>'id')::UUID;

    -- 같은 과제 글이 다음 확인 전 승인되면 현재 상태와 맞는 승인만 새로 보인다.
    UPDATE public.student_posts
    SET is_returned = FALSE,
        is_submitted = TRUE,
        is_confirmed = TRUE,
        recalled_at = NULL
    WHERE id = v_post.id AND class_id = v_post.class_id;

    UPDATE public.student_notification_events event
    SET created_at = clock_timestamp()
    WHERE event.id = (
        SELECT candidate.id
        FROM public.student_notification_events candidate
        WHERE candidate.student_id = v_post.student_id
          AND candidate.class_id = v_post.class_id
          AND candidate.entity_id = v_post.id
          AND candidate.event_type = 'writing.approved'
        ORDER BY candidate.created_at DESC, candidate.id DESC
        LIMIT 1
    );

    v_result := public.poll_my_priority_writing_notifications_v1(v_next_cursor_at, v_next_cursor_id);
    IF jsonb_array_length(v_result->'items') <> 1
       OR v_result->'items'->0->>'event_type' <> 'writing.approved' THEN
        RAISE EXCEPTION '승인 신호를 찾지 못했습니다: %', v_result;
    END IF;

    IF has_table_privilege('authenticated', 'public.student_notification_events', 'SELECT') THEN
        RAISE EXCEPTION '학생 알림 원장이 authenticated에 직접 공개되어 있습니다.';
    END IF;
    IF has_function_privilege(
        'anon',
        'public.poll_my_priority_writing_notifications_v1(timestamptz,uuid)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION '우선 글 알림 폴링 RPC가 anon에 공개되어 있습니다.';
    END IF;
    IF NOT has_function_privilege(
        'authenticated',
        'public.poll_my_priority_writing_notifications_v1(timestamptz,uuid)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION '우선 글 알림 폴링 RPC를 authenticated가 실행할 수 없습니다.';
    END IF;
END;
$$;
