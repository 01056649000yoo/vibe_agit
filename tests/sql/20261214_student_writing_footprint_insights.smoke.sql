-- 바깥 검증 트랜잭션에서 새 학생 발자국 RPC를 설치한 뒤 실행하며 마지막에 모두 롤백된다.

DO $$
DECLARE
    v_auth_id UUID;
    v_student_id UUID;
    v_class_id UUID;
    v_result JSONB;
    v_completed_posts INTEGER;
    v_assignment_posts INTEGER;
    v_reading_logs INTEGER;
    v_diaries INTEGER;
    v_other_self_posts INTEGER;
    v_activity_points INTEGER;
    v_teacher_adjustment INTEGER;
    v_feedbacks INTEGER;
BEGIN
    SELECT student.auth_id, student.id, student.class_id
    INTO v_auth_id, v_student_id, v_class_id
    FROM public.students student
    WHERE student.auth_id IS NOT NULL
      AND student.is_active IS DISTINCT FROM FALSE
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
      AND EXISTS (
          SELECT 1
          FROM public.student_posts post
          WHERE post.class_id = student.class_id
            AND post.student_id = student.id
            AND public.writing_counts_as_completed(
                post.writing_context, post.is_confirmed, post.is_submitted
            )
      )
    ORDER BY student.created_at DESC
    LIMIT 1;

    IF v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 발자국 스모크에 사용할 활성 학생이 없습니다.';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_auth_id::TEXT, TRUE);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_auth_id, 'role', 'authenticated'
    )::TEXT, TRUE);

    v_result := public.get_my_writing_footprint_detail();

    WITH my_posts AS (
        SELECT
            post.id,
            post.mission_id,
            COALESCE(post.writing_context, 'assignment') AS writing_context,
            post.self_writing_type,
            CASE
                WHEN COALESCE(post.writing_context, 'assignment') = 'assignment'
                    THEN COALESCE(post.approved_at, post.updated_at, post.created_at)
                ELSE post.created_at
            END AS completed_at
        FROM public.student_posts post
        WHERE post.class_id = v_class_id
          AND post.student_id = v_student_id
          AND public.writing_counts_as_completed(
              post.writing_context, post.is_confirmed, post.is_submitted
          )
    ), level_posts AS (
        SELECT DISTINCT ON (
            COALESCE('mission:' || mission_id::TEXT, 'post:' || id::TEXT)
        ) id, writing_context, self_writing_type
        FROM my_posts
        ORDER BY
            COALESCE('mission:' || mission_id::TEXT, 'post:' || id::TEXT),
            completed_at DESC,
            id DESC
    )
    SELECT
        count(*)::INTEGER,
        count(*) FILTER (WHERE writing_context = 'assignment')::INTEGER,
        count(*) FILTER (
            WHERE writing_context = 'self' AND self_writing_type = 'reading_log'
        )::INTEGER,
        count(*) FILTER (
            WHERE writing_context = 'self' AND self_writing_type = 'diary'
        )::INTEGER,
        count(*) FILTER (
            WHERE writing_context = 'self'
              AND COALESCE(self_writing_type, '') NOT IN ('reading_log', 'diary')
        )::INTEGER
    INTO
        v_completed_posts,
        v_assignment_posts,
        v_reading_logs,
        v_diaries,
        v_other_self_posts
    FROM level_posts;

    IF (v_result #>> '{totals,completed_posts}')::INTEGER <> v_completed_posts
       OR (v_result #>> '{writing_types,assignment_posts}')::INTEGER <> v_assignment_posts
       OR (v_result #>> '{writing_types,reading_logs}')::INTEGER <> v_reading_logs
       OR (v_result #>> '{writing_types,diaries}')::INTEGER <> v_diaries
       OR (v_result #>> '{writing_types,other_self_posts}')::INTEGER <> v_other_self_posts THEN
        RAISE EXCEPTION '학생 완료 글 또는 글 종류 집계가 원자료와 다릅니다: %', v_result;
    END IF;

    SELECT
        COALESCE(sum(log.amount) FILTER (
            WHERE log.amount > 0
              AND COALESCE(log.activity_type, 'etc') NOT IN ('private_adjustment', 'starting_bonus')
        ), 0)::INTEGER,
        COALESCE(sum(log.amount) FILTER (
            WHERE COALESCE(log.activity_type, 'etc') = 'private_adjustment'
        ), 0)::INTEGER
    INTO v_activity_points, v_teacher_adjustment
    FROM public.point_logs log
    WHERE log.class_id = v_class_id
      AND log.student_id = v_student_id;

    IF (v_result #>> '{totals,activity_points_earned}')::INTEGER <> v_activity_points
       OR (v_result #>> '{totals,teacher_adjustment_points}')::INTEGER <> v_teacher_adjustment THEN
        RAISE EXCEPTION '학생 활동 포인트와 교사 조정 집계가 원장과 다릅니다: %', v_result->'totals';
    END IF;

    SELECT count(*)::INTEGER
    INTO v_feedbacks
    FROM public.writing_activity_events event
    WHERE event.class_id = v_class_id
      AND event.student_id = v_student_id
      AND event.event_type = 'feedback_received'
      AND event.occurred_at >= (v_result #>> '{school_year,start}')::DATE::TIMESTAMP AT TIME ZONE 'Asia/Seoul'
      AND event.occurred_at < ((v_result #>> '{school_year,end}')::DATE + 1)::TIMESTAMP AT TIME ZONE 'Asia/Seoul';

    IF (v_result #>> '{learning,feedbacks_received}')::INTEGER <> v_feedbacks THEN
        RAISE EXCEPTION '학생이 받은 교사 피드백 횟수가 이벤트와 다릅니다: %', v_result->'learning';
    END IF;

    IF jsonb_typeof(v_result->'daily') <> 'array'
       OR jsonb_typeof(v_result->'monthly') <> 'array'
       OR jsonb_typeof(v_result->'recent') <> 'object' THEN
        RAISE EXCEPTION '학생 발자국 시계열 또는 최근 성장 응답 형태가 올바르지 않습니다.';
    END IF;
END;
$$;

DO $$
BEGIN
    IF has_function_privilege('anon', 'public.get_my_writing_footprint_detail()', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.get_my_writing_footprint_detail()', 'EXECUTE') THEN
        RAISE EXCEPTION '학생 발자국 RPC 실행 권한이 올바르지 않습니다.';
    END IF;
END;
$$;
