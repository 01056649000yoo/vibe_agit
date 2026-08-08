-- 운영 데이터로 함수 계약을 검사하되 모든 변경은 마지막에 되돌린다.
BEGIN;

DO $$
DECLARE
    v_post public.student_posts%ROWTYPE;
    v_teacher_id UUID;
    v_before_points INTEGER;
    v_after_points INTEGER;
    v_before_positive_logs INTEGER;
    v_after_positive_logs INTEGER;
    v_result JSONB;
    v_awarded INTEGER;
    v_student_ids UUID[];
    v_before_sum BIGINT;
    v_after_sum BIGINT;
    v_other_teacher_id UUID;
    v_cross_class_blocked BOOLEAN := FALSE;
    v_request_id UUID := gen_random_uuid();
    v_snapshot JSONB;
    v_meeting_post public.student_posts%ROWTYPE;
    v_meeting_original_status TEXT;
    v_meeting_before_points INTEGER;
BEGIN
    ASSERT NOT has_function_privilege(
        'authenticated',
        'public.point_engine_apply(uuid,integer,text,text,text,uuid,uuid,jsonb)',
        'EXECUTE'
    ), '클라이언트가 공용 포인트 엔진을 직접 실행할 수 있습니다.';
    ASSERT NOT has_function_privilege(
        'authenticated',
        'public.increment_student_points(uuid,integer,text,uuid,uuid)',
        'EXECUTE'
    ), '클라이언트가 구형 범용 포인트 함수를 직접 실행할 수 있습니다.';
    ASSERT NOT has_table_privilege('authenticated', 'public.point_logs', 'INSERT'),
        '클라이언트가 포인트 원장에 직접 INSERT할 수 있습니다.';

    SELECT sp.*
    INTO v_post
    FROM public.student_posts sp
    JOIN public.classes c ON c.id = sp.class_id
    JOIN public.students s ON s.id = sp.student_id AND s.class_id = sp.class_id
    JOIN public.writing_missions m ON m.id = sp.mission_id AND m.class_id = sp.class_id
    WHERE sp.writing_context = 'assignment'
      AND sp.is_submitted IS TRUE
      AND sp.is_confirmed IS FALSE
      AND sp.is_returned IS FALSE
      AND s.deleted_at IS NULL
      AND m.mission_type IS DISTINCT FROM 'meeting'
      AND COALESCE(sp.awarded_base_reward, m.base_reward, 0) > 0
    ORDER BY sp.created_at DESC
    LIMIT 1;
    IF v_post.id IS NULL THEN
        RAISE EXCEPTION '원자적 승인 검증에 사용할 제출 글이 없습니다.';
    END IF;

    SELECT c.teacher_id INTO v_teacher_id
    FROM public.classes c WHERE c.id = v_post.class_id;

    SELECT p.id INTO v_other_teacher_id
    FROM public.profiles p
    WHERE p.role = 'TEACHER' AND p.id <> v_teacher_id
    LIMIT 1;
    IF v_other_teacher_id IS NOT NULL THEN
        PERFORM set_config('request.jwt.claim.sub', v_other_teacher_id::TEXT, true);
        BEGIN
            PERFORM public.approve_assignment_post(v_post.id, NULL);
        EXCEPTION WHEN insufficient_privilege THEN
            v_cross_class_blocked := TRUE;
        END;
        ASSERT v_cross_class_blocked, '다른 학급 교사의 승인이 차단되지 않았습니다.';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_teacher_id::TEXT, true);
    SELECT total_points INTO v_before_points FROM public.students WHERE id = v_post.student_id;

    v_result := public.point_engine_apply(
        v_post.student_id, 1, 'ROLLBACK 공용 엔진 중복 검증', 'private_adjustment',
        format('rollback-engine:%s', v_request_id), NULL, NULL,
        jsonb_build_object('source', 'rollback_test')
    );
    ASSERT v_result->>'status' = 'applied', '공용 포인트 엔진이 첫 요청을 적용하지 않았습니다.';
    v_result := public.point_engine_apply(
        v_post.student_id, 1, 'ROLLBACK 공용 엔진 중복 검증', 'private_adjustment',
        format('rollback-engine:%s', v_request_id), NULL, NULL,
        jsonb_build_object('source', 'rollback_test')
    );
    ASSERT v_result->>'status' = 'duplicate', '공용 엔진의 event_key 중복 방지가 작동하지 않았습니다.';
    PERFORM public.point_engine_apply(
        v_post.student_id, -1, 'ROLLBACK 공용 엔진 원복', 'private_adjustment',
        format('rollback-engine:%s:restore', v_request_id), NULL, NULL,
        jsonb_build_object('source', 'rollback_test')
    );
    SELECT count(*) INTO v_before_positive_logs
    FROM public.point_logs
    WHERE post_id = v_post.id AND student_id = v_post.student_id
      AND mission_id = v_post.mission_id AND amount > 0 AND reason ILIKE '%승인%';

    v_result := public.approve_assignment_post(v_post.id, 'ROLLBACK 검증');
    ASSERT v_result->>'status' = 'approved', '첫 승인이 처리되지 않았습니다.';
    v_awarded := (v_result->>'points_awarded')::INTEGER;
    ASSERT v_awarded > 0, '승인 포인트가 0 이하입니다.';

    v_result := public.approve_assignment_post(v_post.id, '중복 호출');
    ASSERT v_result->>'status' = 'already_approved', '중복 승인이 차단되지 않았습니다.';
    SELECT total_points INTO v_after_points FROM public.students WHERE id = v_post.student_id;
    ASSERT v_after_points = v_before_points + v_awarded, '중복 호출 후 학생 포인트가 정확하지 않습니다.';
    SELECT count(*) INTO v_after_positive_logs
    FROM public.point_logs
    WHERE post_id = v_post.id AND student_id = v_post.student_id
      AND mission_id = v_post.mission_id AND amount > 0 AND reason ILIKE '%승인%';
    ASSERT v_after_positive_logs = v_before_positive_logs + 1, '승인 로그가 중복 생성되었습니다.';

    v_result := public.recover_assignment_post_approval(v_post.id, NULL);
    ASSERT v_result->>'status' = 'recovered', '승인 취소가 처리되지 않았습니다.';
    ASSERT (v_result->>'points_recovered')::INTEGER = v_awarded, '정확한 승인 포인트가 회수되지 않았습니다.';
    SELECT total_points INTO v_after_points FROM public.students WHERE id = v_post.student_id;
    ASSERT v_after_points = v_before_points, '승인 취소 후 원래 포인트로 돌아오지 않았습니다.';

    v_result := public.recover_assignment_post_approval(v_post.id, NULL);
    ASSERT v_result->>'status' = 'already_recovered', '중복 회수가 차단되지 않았습니다.';

    v_result := public.bulk_approve_posts(jsonb_build_array(jsonb_build_object('post_id', v_post.id)));
    ASSERT (v_result->>'approved_count')::INTEGER = 1, '일괄 승인 래퍼가 글을 승인하지 못했습니다.';
    v_result := public.bulk_recover_assignment_posts(ARRAY[v_post.id], NULL);
    ASSERT (v_result->>'recovered_count')::INTEGER = 1, '일괄 회수 래퍼가 승인을 취소하지 못했습니다.';
    SELECT total_points INTO v_after_points FROM public.students WHERE id = v_post.student_id;
    ASSERT v_after_points = v_before_points, '일괄 승인·회수 후 원래 포인트로 돌아오지 않았습니다.';

    SELECT array_agg(s.id ORDER BY s.id) INTO v_student_ids
    FROM (
        SELECT id FROM public.students
        WHERE class_id = v_post.class_id AND deleted_at IS NULL
        ORDER BY id LIMIT 2
    ) s;
    IF cardinality(v_student_ids) >= 1 THEN
        SELECT sum(total_points) INTO v_before_sum FROM public.students WHERE id = ANY(v_student_ids);
        v_request_id := gen_random_uuid();
        v_result := public.teacher_manage_points_bulk(v_student_ids, 1, 'ROLLBACK 일괄 포인트 검증', v_request_id);
        SELECT sum(total_points) INTO v_after_sum FROM public.students WHERE id = ANY(v_student_ids);
        ASSERT v_after_sum = v_before_sum + cardinality(v_student_ids), '일괄 포인트 지급 결과가 정확하지 않습니다.';
        v_result := public.teacher_manage_points_bulk(v_student_ids, 1, 'ROLLBACK 일괄 포인트 검증', v_request_id);
        ASSERT v_result->>'status' = 'duplicate', '교사 일괄 포인트 요청의 중복 방지가 작동하지 않았습니다.';
        SELECT sum(total_points) INTO v_after_sum FROM public.students WHERE id = ANY(v_student_ids);
        ASSERT v_after_sum = v_before_sum + cardinality(v_student_ids), '중복 일괄 요청으로 포인트가 다시 지급됐습니다.';
        v_result := public.teacher_manage_points_bulk(v_student_ids, -1, 'ROLLBACK 일괄 포인트 회수 검증', gen_random_uuid());
        SELECT sum(total_points) INTO v_after_sum FROM public.students WHERE id = ANY(v_student_ids);
        ASSERT v_after_sum = v_before_sum, '일괄 포인트 회수 후 원래 합계로 돌아오지 않았습니다.';
    END IF;

    v_snapshot := public.get_teacher_point_manager_snapshot(v_post.class_id);
    ASSERT jsonb_typeof(v_snapshot->'students') = 'array', '교사 포인트 스냅샷이 학생 배열을 반환하지 않았습니다.';
    v_snapshot := public.get_teacher_student_point_history(v_post.student_id, 100, 0);
    ASSERT jsonb_typeof(v_snapshot->'logs') = 'array', '교사 포인트 내역 RPC가 로그 배열을 반환하지 않았습니다.';

    SELECT sp.* INTO v_meeting_post
    FROM public.student_posts sp
    JOIN public.writing_missions m ON m.id = sp.mission_id AND m.class_id = sp.class_id
    JOIN public.students s ON s.id = sp.student_id AND s.class_id = sp.class_id
    WHERE m.mission_type = 'meeting'
      AND sp.status IN ('제안중', '검토중')
      AND sp.is_submitted IS TRUE
      AND s.deleted_at IS NULL
      AND COALESCE(m.bonus_reward, 50) > 0
      AND COALESCE(sp.char_count, 0) >= COALESCE(m.min_chars, 100) + COALESCE(m.bonus_threshold, 0)
      AND NOT EXISTS (
          SELECT 1 FROM public.point_logs pl
          WHERE pl.post_id = sp.id AND pl.amount > 0 AND pl.reason ILIKE '%안건 결정%'
      )
    ORDER BY sp.created_at DESC
    LIMIT 1;

    IF v_meeting_post.id IS NOT NULL THEN
        SELECT c.teacher_id INTO v_teacher_id FROM public.classes c WHERE c.id = v_meeting_post.class_id;
        PERFORM set_config('request.jwt.claim.sub', v_teacher_id::TEXT, true);
        v_meeting_original_status := v_meeting_post.status;
        SELECT total_points INTO v_meeting_before_points FROM public.students WHERE id = v_meeting_post.student_id;
        v_result := public.set_meeting_idea_status(v_meeting_post.id, '결정됨');
        ASSERT (v_result->>'points_awarded')::INTEGER > 0, '회의 안건 결정 보상이 지급되지 않았습니다.';
        v_result := public.set_meeting_idea_status(v_meeting_post.id, '결정됨');
        ASSERT (v_result->>'points_awarded')::INTEGER = 0, '회의 안건 중복 결정으로 보상이 다시 지급됐습니다.';
        v_result := public.set_meeting_idea_status(v_meeting_post.id, v_meeting_original_status);
        ASSERT (v_result->>'points_recovered')::INTEGER > 0, '회의 안건 결정 취소 보상이 회수되지 않았습니다.';
        SELECT total_points INTO v_after_points FROM public.students WHERE id = v_meeting_post.student_id;
        ASSERT v_after_points = v_meeting_before_points, '회의 안건 결정·취소 후 원래 포인트로 돌아오지 않았습니다.';
    END IF;
END;
$$;

ROLLBACK;
