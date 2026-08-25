-- migrate:check가 신규 함수와 아래 비교를 한 트랜잭션에서 실행하고 마지막에 롤백한다.

DO $$
BEGIN
    IF has_function_privilege('anon', 'public.get_class_operations_dashboard(uuid,text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.get_class_operations_dashboard_core_v1(uuid,text)', 'EXECUTE') THEN
        RAISE EXCEPTION '운영 현황 공개 RPC 또는 내부 코어 함수 권한이 너무 넓습니다.';
    END IF;

    IF NOT has_function_privilege('authenticated', 'public.get_class_operations_dashboard(uuid,text)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.get_class_operations_dashboard_core_v1(uuid,text)', 'EXECUTE') THEN
        RAISE EXCEPTION '운영 현황 RPC 실행 권한이 올바르지 않습니다.';
    END IF;
END;
$$;

DO $$
DECLARE
    v_class_id UUID;
    v_teacher_id UUID;
    v_period_start TIMESTAMPTZ;
    v_result JSONB;
    v_expected BIGINT;
BEGIN
    SELECT class.id, class.teacher_id
    INTO v_class_id, v_teacher_id
    FROM public.classes class
    JOIN public.profiles teacher
      ON teacher.id = class.teacher_id
     AND teacher.role = 'TEACHER'
    WHERE class.deleted_at IS NULL OR class.deleted_at > NOW()
    ORDER BY class.created_at, class.id
    LIMIT 1;

    IF v_class_id IS NULL THEN
        RAISE NOTICE '교사 학급이 없어 운영 현황 계약 스모크를 건너뜀';
        RETURN;
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_teacher_id::TEXT, true);
    PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('sub', v_teacher_id, 'role', 'authenticated')::TEXT,
        true
    );

    v_period_start := (
        ((timezone('Asia/Seoul', NOW()))::DATE - 6)::TIMESTAMP
        AT TIME ZONE 'Asia/Seoul'
    );
    v_result := public.get_class_operations_dashboard(v_class_id, '7d');

    IF (v_result->'summary') ? 'revisions' OR (v_result->'summary') ? 'feedbacks' THEN
        RAISE EXCEPTION '모호한 과거 요약 필드가 응답에 남았습니다: %', v_result->'summary';
    END IF;

    IF NOT (v_result->'summary') ?& ARRAY[
        'rewrite_requests', 'revision_submissions', 'feedback_updates', 'submitted_posts'
    ] THEN
        RAISE EXCEPTION '새 운영 현황 필드가 응답에서 빠졌습니다: %', v_result->'summary';
    END IF;

    SELECT COUNT(*) INTO v_expected
    FROM public.students student
    WHERE student.class_id = v_class_id
      AND student.is_active IS DISTINCT FROM FALSE
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW());
    IF (v_result#>>'{summary,students}')::BIGINT <> v_expected THEN
        RAISE EXCEPTION '현재 활성 학생 수가 다릅니다: %, %', v_result#>>'{summary,students}', v_expected;
    END IF;

    SELECT COUNT(*) INTO v_expected
    FROM public.students student
    LEFT JOIN auth.users auth_user ON auth_user.id = student.auth_id
    WHERE student.class_id = v_class_id
      AND student.is_active IS DISTINCT FROM FALSE
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
      AND GREATEST(student.last_login, auth_user.last_sign_in_at) >= v_period_start;
    IF (v_result#>>'{summary,accessed_students}')::BIGINT <> v_expected THEN
        RAISE EXCEPTION '인증 기록을 보완한 접속 학생 수가 다릅니다: %, %',
            v_result#>>'{summary,accessed_students}', v_expected;
    END IF;

    WITH active_roster AS MATERIALIZED (
        SELECT student.id
        FROM public.students student
        WHERE student.class_id = v_class_id
          AND student.is_active IS DISTINCT FROM FALSE
          AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
    ), submission_times AS MATERIALIZED (
        SELECT event.post_id, MIN(event.occurred_at) AS first_submitted_event_at
        FROM public.writing_activity_events event
        JOIN active_roster student ON student.id = event.student_id
        WHERE event.class_id = v_class_id
          AND event.post_id IS NOT NULL
          AND event.event_type IN ('post_submitted', 'post_resubmitted')
        GROUP BY event.post_id
    )
    SELECT COUNT(*) INTO v_expected
    FROM public.student_posts post
    JOIN active_roster student ON student.id = post.student_id
    LEFT JOIN submission_times submission ON submission.post_id = post.id
    WHERE post.class_id = v_class_id
      AND COALESCE(
          post.first_submitted_at,
          submission.first_submitted_event_at,
          CASE
              WHEN post.is_submitted IS TRUE
                OR post.is_returned IS TRUE
                OR post.is_confirmed IS TRUE
              THEN post.created_at
              ELSE NULL
          END
      ) >= v_period_start;
    IF (v_result#>>'{summary,submitted_posts}')::BIGINT <> v_expected THEN
        RAISE EXCEPTION '최초 제출 이력 기준 작성 완료 글 수가 다릅니다: %, %',
            v_result#>>'{summary,submitted_posts}', v_expected;
    END IF;

    WITH active_roster AS MATERIALIZED (
        SELECT student.id
        FROM public.students student
        WHERE student.class_id = v_class_id
          AND student.is_active IS DISTINCT FROM FALSE
          AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
    )
    SELECT COUNT(*) INTO v_expected
    FROM public.student_notification_events event
    JOIN active_roster student ON student.id = event.student_id
    WHERE event.class_id = v_class_id
      AND event.event_type = 'writing.rewrite_requested'
      AND event.created_at >= v_period_start;
    IF (v_result#>>'{summary,rewrite_requests}')::BIGINT <> v_expected THEN
        RAISE EXCEPTION '다시쓰기 요청 수가 다릅니다: %, %',
            v_result#>>'{summary,rewrite_requests}', v_expected;
    END IF;

    WITH active_roster AS MATERIALIZED (
        SELECT student.id
        FROM public.students student
        WHERE student.class_id = v_class_id
          AND student.is_active IS DISTINCT FROM FALSE
          AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
    ), period_events AS MATERIALIZED (
        SELECT event.event_type, event.metadata
        FROM public.writing_activity_events event
        JOIN active_roster student ON student.id = event.student_id
        WHERE event.class_id = v_class_id
          AND event.occurred_at >= v_period_start
          AND (
              event.actor_student_id IS NULL
              OR EXISTS (
                  SELECT 1 FROM active_roster actor
                  WHERE actor.id = event.actor_student_id
              )
          )
    )
    SELECT COUNT(*) FILTER (
        WHERE event_type = 'post_resubmitted'
          AND metadata->>'writing_context' = 'assignment'
    ) INTO v_expected
    FROM period_events;
    IF (v_result#>>'{summary,revision_submissions}')::BIGINT <> v_expected THEN
        RAISE EXCEPTION '현재 활성 학생의 수정 제출 수가 다릅니다: %, %',
            v_result#>>'{summary,revision_submissions}', v_expected;
    END IF;
END;
$$;
