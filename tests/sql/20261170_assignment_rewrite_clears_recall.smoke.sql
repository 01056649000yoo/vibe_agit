-- 이 파일은 check-migrations가 만든 바깥 트랜잭션에서 실행되고 마지막에 전부 롤백된다.

DO $$
DECLARE
    v_post public.student_posts%ROWTYPE;
    v_student public.students%ROWTYPE;
    v_teacher_id UUID;
    v_before_count INTEGER;
    v_after_count INTEGER;
    v_first_event_id UUID;
    v_second_event_id UUID;
    v_cursor_at TIMESTAMPTZ;
    v_cursor_id UUID := '00000000-0000-0000-0000-000000000000'::UUID;
    v_result JSONB;
BEGIN
    SELECT post.*
      INTO v_post
    FROM public.student_posts post
    JOIN public.students student
      ON student.id = post.student_id
     AND student.class_id = post.class_id
     AND student.auth_id IS NOT NULL
     AND student.is_active IS DISTINCT FROM FALSE
     AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
    JOIN public.classes class
      ON class.id = post.class_id
     AND class.teacher_id IS NOT NULL
     AND class.deleted_at IS NULL
    JOIN public.profiles teacher
      ON teacher.id = class.teacher_id
     AND teacher.role IN ('TEACHER', 'ADMIN')
     AND (teacher.role = 'ADMIN' OR (
         teacher.is_approved IS TRUE AND teacher.approval_revoked_at IS NULL
     ))
    JOIN public.writing_missions mission
      ON mission.id = post.mission_id
     AND mission.class_id = post.class_id
     AND mission.is_archived IS FALSE
     AND mission.mission_type <> 'meeting'
     AND public.writing_content_char_count(post.content) >= GREATEST(0, COALESCE(mission.min_chars, 0))
     AND public.writing_content_paragraph_count(post.content) >= GREATEST(0, COALESCE(mission.min_paragraphs, 0))
    WHERE post.writing_context = 'assignment'
      AND btrim(COALESCE(post.title, '')) <> ''
    ORDER BY post.updated_at DESC
    LIMIT 1;
    IF v_post.id IS NULL THEN
        RAISE EXCEPTION '반복 다시쓰기 알림 스모크에 사용할 과제 글·학생·교사가 없습니다.';
    END IF;

    SELECT student.* INTO v_student
    FROM public.students student
    WHERE student.id = v_post.student_id
      AND student.class_id = v_post.class_id;
    SELECT class.teacher_id INTO v_teacher_id
    FROM public.classes class
    WHERE class.id = v_post.class_id;
    IF v_student.auth_id IS NULL OR v_teacher_id IS NULL THEN
        RAISE EXCEPTION '반복 다시쓰기 알림 스모크에 사용할 학생 인증·교사가 없습니다.';
    END IF;

    -- 교사가 이미 강제 회수한 상태를 만든다.
    UPDATE public.student_posts
    SET is_submitted = TRUE,
        is_returned = FALSE,
        is_confirmed = FALSE,
        recalled_at = clock_timestamp(),
        recalled_by = v_teacher_id
    WHERE id = v_post.id AND class_id = v_post.class_id;

    SELECT count(*)::INTEGER INTO v_before_count
    FROM public.student_notification_events event
    WHERE event.student_id = v_post.student_id
      AND event.entity_id = v_post.id
      AND event.event_type = 'writing.rewrite_requested';

    v_cursor_at := clock_timestamp();
    PERFORM pg_sleep(0.002);

    -- 글 상세의 실제 다시쓰기 RPC를 호출한다. 회수 흔적이 없어져야 알림 폴링에 잡힌다.
    PERFORM set_config('request.jwt.claim.sub', v_teacher_id::TEXT, true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_teacher_id, 'role', 'authenticated'
    )::TEXT, true);
    v_result := public.request_assignment_rewrite_v1(v_post.id, '회수 뒤 다시쓰기 안내');
    IF v_result->>'status' <> 'requested' THEN
        RAISE EXCEPTION '강제 회수 뒤 다시쓰기 요청이 처리되지 않았습니다: %', v_result;
    END IF;

    SELECT post.* INTO v_post
    FROM public.student_posts post
    WHERE post.id = v_post.id;
    IF v_post.is_returned IS NOT TRUE
       OR v_post.is_submitted IS NOT FALSE
       OR v_post.is_confirmed IS NOT FALSE
       OR v_post.recalled_at IS NOT NULL
       OR v_post.recalled_by IS NOT NULL THEN
        RAISE EXCEPTION '강제 회수 뒤 다시쓰기 상태가 모순됩니다: %', row_to_json(v_post);
    END IF;

    SELECT count(*)::INTEGER INTO v_after_count
    FROM public.student_notification_events event
    WHERE event.student_id = v_post.student_id
      AND event.entity_id = v_post.id
      AND event.event_type = 'writing.rewrite_requested';
    IF v_after_count <> v_before_count + 1 THEN
        RAISE EXCEPTION '강제 회수 뒤 첫 다시쓰기 알림이 생성되지 않았습니다.';
    END IF;

    SELECT event.id INTO v_first_event_id
    FROM public.student_notification_events event
    WHERE event.student_id = v_post.student_id
      AND event.entity_id = v_post.id
      AND event.event_type = 'writing.rewrite_requested'
    ORDER BY event.created_at DESC, event.id DESC
    LIMIT 1;
    UPDATE public.student_notification_events
    SET created_at = clock_timestamp()
    WHERE id = v_first_event_id;

    PERFORM set_config('request.jwt.claim.sub', v_student.auth_id::TEXT, true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_student.auth_id, 'role', 'authenticated'
    )::TEXT, true);
    v_result := public.poll_my_priority_writing_notifications_v1(v_cursor_at, v_cursor_id);
    IF jsonb_array_length(v_result->'items') <> 1
       OR v_result->'items'->0->>'event_type' <> 'writing.rewrite_requested'
       OR v_result->'items'->0->>'entity_id' <> v_post.id::TEXT THEN
        RAISE EXCEPTION '강제 회수 뒤 첫 상단 알림을 찾지 못했습니다: %', v_result;
    END IF;
    v_cursor_at := (v_result->'cursor'->>'created_at')::TIMESTAMPTZ;
    v_cursor_id := (v_result->'cursor'->>'id')::UUID;

    -- 학생이 실제 제출 RPC로 다시 낸 뒤에도 회수 흔적은 없어야 한다.
    v_result := public.submit_assignment_post_v1(
        v_post.mission_id,
        v_post.title,
        v_post.content,
        COALESCE(v_post.student_answers, '[]'::JSONB),
        v_post.structured_content
    );
    IF COALESCE((v_result->>'success')::BOOLEAN, FALSE) IS NOT TRUE THEN
        RAISE EXCEPTION '학생 재제출이 처리되지 않았습니다: %', v_result;
    END IF;

    SELECT post.* INTO v_post
    FROM public.student_posts post
    WHERE post.id = v_post.id;
    IF v_post.is_submitted IS NOT TRUE
       OR v_post.is_returned IS NOT FALSE
       OR v_post.recalled_at IS NOT NULL
       OR v_post.recalled_by IS NOT NULL THEN
        RAISE EXCEPTION '재제출 뒤 강제 회수 흔적이 남았습니다: %', row_to_json(v_post);
    END IF;

    PERFORM pg_sleep(0.002);
    PERFORM set_config('request.jwt.claim.sub', v_teacher_id::TEXT, true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_teacher_id, 'role', 'authenticated'
    )::TEXT, true);
    v_result := public.request_assignment_rewrite_v1(v_post.id, '재제출 뒤 두 번째 다시쓰기 안내');
    IF v_result->>'status' <> 'requested' THEN
        RAISE EXCEPTION '재제출 뒤 두 번째 다시쓰기 요청이 처리되지 않았습니다: %', v_result;
    END IF;

    SELECT count(*)::INTEGER INTO v_after_count
    FROM public.student_notification_events event
    WHERE event.student_id = v_post.student_id
      AND event.entity_id = v_post.id
      AND event.event_type = 'writing.rewrite_requested';
    IF v_after_count <> v_before_count + 2 THEN
        RAISE EXCEPTION '재제출 뒤 두 번째 다시쓰기 알림이 생성되지 않았습니다.';
    END IF;

    SELECT event.id INTO v_second_event_id
    FROM public.student_notification_events event
    WHERE event.student_id = v_post.student_id
      AND event.entity_id = v_post.id
      AND event.event_type = 'writing.rewrite_requested'
      AND event.id <> v_first_event_id
    ORDER BY event.created_at DESC, event.id DESC
    LIMIT 1;
    UPDATE public.student_notification_events
    SET created_at = clock_timestamp()
    WHERE id = v_second_event_id;

    PERFORM set_config('request.jwt.claim.sub', v_student.auth_id::TEXT, true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_student.auth_id, 'role', 'authenticated'
    )::TEXT, true);
    v_result := public.poll_my_priority_writing_notifications_v1(v_cursor_at, v_cursor_id);
    IF jsonb_array_length(v_result->'items') <> 1
       OR v_result->'items'->0->>'event_type' <> 'writing.rewrite_requested'
       OR v_result->'items'->0->>'id' <> v_second_event_id::TEXT THEN
        RAISE EXCEPTION '재제출 뒤 두 번째 상단 알림을 찾지 못했습니다: %', v_result;
    END IF;

    -- 같은 반려 상태에서 다시 누른 재시도는 새 주기가 아니므로 중복 생성하지 않는다.
    PERFORM set_config('request.jwt.claim.sub', v_teacher_id::TEXT, true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_teacher_id, 'role', 'authenticated'
    )::TEXT, true);
    v_result := public.request_assignment_rewrite_v1(v_post.id, '같은 상태 재시도');
    IF v_result->>'status' <> 'already_requested' THEN
        RAISE EXCEPTION '같은 다시쓰기 상태 재시도 응답이 다릅니다: %', v_result;
    END IF;
    SELECT count(*)::INTEGER INTO v_after_count
    FROM public.student_notification_events event
    WHERE event.student_id = v_post.student_id
      AND event.entity_id = v_post.id
      AND event.event_type = 'writing.rewrite_requested';
    IF v_after_count <> v_before_count + 2 THEN
        RAISE EXCEPTION '같은 다시쓰기 상태 재시도에서 중복 알림이 생성되었습니다.';
    END IF;
END;
$$;
