-- 바깥 검증 트랜잭션에서 새 RPC를 설치한 뒤 실행하며 마지막에 모두 롤백된다.

DO $$
DECLARE
    v_auth_id UUID;
    v_student_id UUID;
    v_class_id UUID;
    v_footprint JSONB;
    v_history JSONB;
    v_expected_activity INTEGER;
    v_expected_monthly_earned INTEGER;
    v_before_count BIGINT;
    v_before_total BIGINT;
BEGIN
    SELECT count(*), COALESCE(sum(point.amount), 0)
    INTO v_before_count, v_before_total
    FROM public.point_logs point
    WHERE point.activity_type = 'comment_reward';

    SELECT student.auth_id, student.id, student.class_id
    INTO v_auth_id, v_student_id, v_class_id
    FROM public.students student
    WHERE student.auth_id IS NOT NULL
      AND student.is_active IS DISTINCT FROM FALSE
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
      AND EXISTS (
          SELECT 1 FROM public.point_logs point
          WHERE point.class_id = student.class_id
            AND point.student_id = student.id
            AND point.activity_type = 'comment_reward'
      )
    ORDER BY student.created_at DESC
    LIMIT 1;

    IF v_student_id IS NULL THEN
        RAISE EXCEPTION '종료 댓글 포인트 표시 스모크에 사용할 학생이 없습니다.';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_auth_id::TEXT, TRUE);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_auth_id, 'role', 'authenticated'
    )::TEXT, TRUE);

    v_footprint := public.get_my_writing_footprint_detail();
    v_history := public.get_my_point_history_v1(50);

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(v_footprint->'points_by_type', '[]'::JSONB)) row
        WHERE row.value->>'type' = 'comment_reward'
    ) THEN
        RAISE EXCEPTION '학생 글쓰기 발자국에 종료된 댓글 포인트 유형이 남아 있습니다.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(v_history->'items', '[]'::JSONB)) row
        WHERE row.value->>'activity_type' = 'comment_reward'
    ) THEN
        RAISE EXCEPTION '학생 최근 포인트 내역에 종료된 댓글 포인트가 남아 있습니다.';
    END IF;

    SELECT COALESCE(sum(point.amount), 0)::INTEGER
    INTO v_expected_activity
    FROM public.point_logs point
    WHERE point.class_id = v_class_id
      AND point.student_id = v_student_id
      AND point.amount > 0
      AND COALESCE(point.activity_type, 'etc') NOT IN (
          'private_adjustment', 'starting_bonus', 'comment_reward'
      );

    IF (v_footprint #>> '{totals,activity_points_earned}')::INTEGER <> v_expected_activity THEN
        RAISE EXCEPTION '학생 활동 포인트 합계에서 종료된 댓글 포인트가 빠지지 않았습니다.';
    END IF;

    SELECT COALESCE(sum(point.amount), 0)::INTEGER
    INTO v_expected_monthly_earned
    FROM public.point_logs point
    WHERE point.class_id = v_class_id
      AND point.student_id = v_student_id
      AND point.amount > 0
      AND COALESCE(point.activity_type, 'etc') <> 'comment_reward'
      AND (point.created_at AT TIME ZONE 'Asia/Seoul')::DATE BETWEEN
          (v_footprint #>> '{school_year,start}')::DATE
          AND (v_footprint #>> '{school_year,end}')::DATE;

    IF COALESCE((
        SELECT sum((row.value->>'earned')::INTEGER)
        FROM jsonb_array_elements(COALESCE(v_footprint->'points_monthly', '[]'::JSONB)) row
    ), 0) <> v_expected_monthly_earned THEN
        RAISE EXCEPTION '학생 월별 포인트 흐름에서 종료된 댓글 포인트가 빠지지 않았습니다.';
    END IF;

    IF (SELECT count(*) FROM public.point_logs WHERE activity_type = 'comment_reward') <> v_before_count
       OR (SELECT COALESCE(sum(amount), 0) FROM public.point_logs WHERE activity_type = 'comment_reward') <> v_before_total THEN
        RAISE EXCEPTION '과거 댓글 포인트 원장 또는 잔액 근거가 변경됐습니다.';
    END IF;
END;
$$;

DO $$
BEGIN
    IF has_function_privilege(
        'authenticated', 'public.get_my_writing_footprint_detail_core_v1()', 'EXECUTE'
    ) OR NOT has_function_privilege(
        'authenticated', 'public.get_my_writing_footprint_detail()', 'EXECUTE'
    ) THEN
        RAISE EXCEPTION '학생 발자국 내부 코어와 공개 RPC 권한 경계가 올바르지 않습니다.';
    END IF;
END;
$$;
