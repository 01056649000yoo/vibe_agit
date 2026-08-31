-- 바깥 검증 트랜잭션에서 실행되며 마지막에 모두 롤백된다.

DO $$
DECLARE
    v_class_id UUID;
    v_teacher_id UUID;
    v_student_id UUID;
    v_post_id UUID;
    v_approved_at TIMESTAMPTZ;
    v_before JSONB;
    v_after JSONB;
    v_before_student JSONB;
    v_after_student JSONB;
    v_test_label TEXT := '발자국계약-' || left(gen_random_uuid()::TEXT, 8);
    v_expected_assignment INTEGER;
    v_expected_reading INTEGER;
    v_expected_diary INTEGER;
    v_expected_active_days INTEGER;
    v_expected_activity_points INTEGER;
    v_expected_adjustment_points INTEGER;
    v_expected_feedbacks INTEGER;
BEGIN
    SELECT post.class_id, class.teacher_id, post.student_id, post.id, post.approved_at
    INTO v_class_id, v_teacher_id, v_student_id, v_post_id, v_approved_at
    FROM public.student_posts post
    JOIN public.students student
      ON student.id = post.student_id
     AND student.class_id = post.class_id
     AND student.is_active IS DISTINCT FROM FALSE
     AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
    JOIN public.classes class
      ON class.id = post.class_id
     AND class.teacher_id IS NOT NULL
    WHERE COALESCE(post.writing_context, 'assignment') = 'assignment'
      AND post.is_confirmed IS TRUE
      AND post.approved_at IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM public.post_reactions reaction
          WHERE reaction.post_id = post.id AND reaction.student_id = post.student_id
      )
    ORDER BY post.approved_at DESC
    LIMIT 1;

    IF v_post_id IS NULL THEN
        RAISE EXCEPTION '학급 발자국 정확성 스모크에 사용할 승인 과제가 없습니다.';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_teacher_id::TEXT, TRUE);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_teacher_id, 'role', 'authenticated'
    )::TEXT, TRUE);

    v_before := public.get_class_writing_footprint_dashboard(v_class_id);
    SELECT item.value INTO v_before_student
    FROM jsonb_array_elements(v_before->'students') item
    WHERE item.value->>'student_id' = v_student_id::TEXT;

    IF v_before_student IS NULL THEN
        RAISE EXCEPTION '학급 발자국 응답에서 시험 학생을 찾지 못했습니다.';
    END IF;

    WITH year_posts AS (
        SELECT
            CASE WHEN post.writing_context = 'self'
                 THEN COALESCE(post.self_writing_type, 'free')
                 ELSE 'assignment' END AS post_type,
            CASE WHEN COALESCE(post.writing_context, 'assignment') = 'assignment'
                 THEN COALESCE(post.approved_at, post.updated_at, post.created_at)
                 ELSE post.created_at END AS completed_at
        FROM public.student_posts post
        JOIN public.students student
          ON student.id = post.student_id AND student.class_id = post.class_id
        WHERE post.class_id = v_class_id
          AND student.is_active IS DISTINCT FROM FALSE
          AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
          AND public.writing_counts_as_completed(
              post.writing_context, post.is_confirmed, post.is_submitted
          )
    )
    SELECT
        count(*) FILTER (WHERE post_type = 'assignment')::INTEGER,
        count(*) FILTER (WHERE post_type = 'reading_log')::INTEGER,
        count(*) FILTER (WHERE post_type = 'diary')::INTEGER,
        count(DISTINCT (completed_at AT TIME ZONE 'Asia/Seoul')::DATE)::INTEGER
    INTO v_expected_assignment, v_expected_reading, v_expected_diary, v_expected_active_days
    FROM year_posts
    WHERE (completed_at AT TIME ZONE 'Asia/Seoul')::DATE
          BETWEEN (v_before #>> '{school_year,start}')::DATE
              AND (v_before #>> '{school_year,end}')::DATE;

    IF (v_before #>> '{totals,assignment_posts}')::INTEGER <> v_expected_assignment
       OR (v_before #>> '{totals,reading_logs}')::INTEGER <> v_expected_reading
       OR (v_before #>> '{totals,diaries}')::INTEGER <> v_expected_diary
       OR (v_before #>> '{totals,active_days}')::INTEGER <> v_expected_active_days THEN
        RAISE EXCEPTION '글 유형 합계 또는 학급 활동일이 원자료와 다릅니다: %', v_before->'totals';
    END IF;

    SELECT
        COALESCE(sum(log.amount) FILTER (
            WHERE log.amount > 0
              AND COALESCE(log.activity_type, 'etc') NOT IN ('private_adjustment', 'starting_bonus')
        ), 0)::INTEGER,
        COALESCE(sum(log.amount) FILTER (
            WHERE COALESCE(log.activity_type, 'etc') = 'private_adjustment'
        ), 0)::INTEGER
    INTO v_expected_activity_points, v_expected_adjustment_points
    FROM public.point_logs log
    JOIN public.students student
      ON student.id = log.student_id AND student.class_id = log.class_id
    WHERE log.class_id = v_class_id
      AND student.is_active IS DISTINCT FROM FALSE
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
      AND (log.created_at AT TIME ZONE 'Asia/Seoul')::DATE
          BETWEEN (v_before #>> '{school_year,start}')::DATE
              AND (v_before #>> '{school_year,end}')::DATE;

    IF (v_before #>> '{totals,activity_points_earned}')::INTEGER <> v_expected_activity_points
       OR (v_before #>> '{totals,teacher_adjustment_points}')::INTEGER <> v_expected_adjustment_points THEN
        RAISE EXCEPTION '활동 포인트와 교사 조정 포인트가 원장과 다릅니다: %', v_before->'totals';
    END IF;

    SELECT count(*)::INTEGER
    INTO v_expected_feedbacks
    FROM public.writing_activity_events event
    WHERE event.class_id = v_class_id
      AND event.student_id = v_student_id
      AND event.event_type = 'feedback_received'
      AND (event.occurred_at AT TIME ZONE 'Asia/Seoul')::DATE
          BETWEEN (v_before #>> '{school_year,start}')::DATE
              AND (v_before #>> '{school_year,end}')::DATE;

    IF (v_before_student->>'feedbacks_received')::INTEGER <> v_expected_feedbacks THEN
        RAISE EXCEPTION '학생별 교사 피드백 횟수가 이벤트와 다릅니다: %', v_before_student;
    END IF;

    -- 생성일만 다른 달로 옮겨도 승인일 기준 발자국은 달라지지 않아야 한다.
    UPDATE public.student_posts
    SET created_at = v_approved_at - INTERVAL '40 days'
    WHERE id = v_post_id;

    v_after := public.get_class_writing_footprint_dashboard(v_class_id);
    SELECT item.value INTO v_after_student
    FROM jsonb_array_elements(v_after->'students') item
    WHERE item.value->>'student_id' = v_student_id::TEXT;

    IF v_after->'daily' IS DISTINCT FROM v_before->'daily'
       OR v_after->'monthly' IS DISTINCT FROM v_before->'monthly'
       OR v_after#>'{totals,active_days}' IS DISTINCT FROM v_before#>'{totals,active_days}'
       OR v_after_student->'active_days' IS DISTINCT FROM v_before_student->'active_days'
       OR v_after_student->'last_post_at' IS DISTINCT FROM v_before_student->'last_post_at'
       OR v_after_student->'recent_30_posts' IS DISTINCT FROM v_before_student->'recent_30_posts' THEN
        RAISE EXCEPTION '과제 생성일 변경이 승인일 기준 발자국을 바꿨습니다.';
    END IF;

    -- 자기 글 댓글·반응은 친구 교류에 들어가지 않아야 한다.
    INSERT INTO public.post_comments(post_id, student_id, class_id, content, status)
    VALUES (v_post_id, v_student_id, v_class_id, '자기 글 교류 제외 회귀 검사입니다.', 'approved');
    INSERT INTO public.post_reactions(post_id, student_id, class_id, reaction_type)
    VALUES (v_post_id, v_student_id, v_class_id, 'heart');

    v_after := public.get_class_writing_footprint_dashboard(v_class_id);
    SELECT item.value INTO v_after_student
    FROM jsonb_array_elements(v_after->'students') item
    WHERE item.value->>'student_id' = v_student_id::TEXT;

    IF v_after#>'{totals,comments}' IS DISTINCT FROM v_before#>'{totals,comments}'
       OR v_after#>'{totals,reactions}' IS DISTINCT FROM v_before#>'{totals,reactions}'
       OR v_after_student->'comments_given' IS DISTINCT FROM v_before_student->'comments_given'
       OR v_after_student->'reactions_given' IS DISTINCT FROM v_before_student->'reactions_given' THEN
        RAISE EXCEPTION '자기 글 댓글·반응이 친구 교류에 포함됐습니다.';
    END IF;

    INSERT INTO public.class_spelling_daily_stats(
        class_id, event_date, entry_key, label, display_expression,
        search_count, student_count, last_seen_at
    ) VALUES (
        v_class_id, CURRENT_DATE, 'test:footprint-contract:' || gen_random_uuid()::TEXT,
        v_test_label, NULL, 100000, 1, NOW()
    );

    v_after := public.get_class_writing_footprint_dashboard(v_class_id);
    IF jsonb_typeof(v_after->'spelling_labels') <> 'array'
       OR NOT EXISTS (
           SELECT 1
           FROM jsonb_array_elements(v_after->'spelling_labels') label
           WHERE label.value->>'type' = v_test_label
             AND (label.value->>'total')::INTEGER = 100000
       ) THEN
        RAISE EXCEPTION '맞춤법 발자국이 화면 계약의 최상위 배열에 없습니다: %',
            v_after->'spelling_labels';
    END IF;
END;
$$;

DO $$
BEGIN
    IF has_function_privilege(
        'authenticated',
        'public.get_class_writing_footprint_dashboard_core_v1(uuid)',
        'EXECUTE'
    ) OR NOT has_function_privilege(
        'authenticated',
        'public.get_class_writing_footprint_dashboard(uuid)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION '학급 발자국 내부 코어와 공개 RPC 권한 경계가 올바르지 않습니다.';
    END IF;
END;
$$;
