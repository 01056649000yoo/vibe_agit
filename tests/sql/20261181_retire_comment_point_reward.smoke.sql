-- 바깥에서 BEGIN ... ROLLBACK으로 실행한다. 운영 댓글·포인트는 남지 않는다.

DO $$
DECLARE
    v_point_engine TEXT := pg_get_functiondef(
        'public.point_engine_apply(uuid,integer,text,text,text,uuid,uuid,jsonb)'::regprocedure
    );
    v_comment_complete TEXT := pg_get_functiondef(
        'public.complete_comment_ai_review_v2(uuid,uuid,boolean,text,text)'::regprocedure
    );
BEGIN
    IF to_regprocedure('public.reward_for_comment(uuid)') IS NOT NULL THEN
        RAISE EXCEPTION '구형 댓글 포인트 함수가 남아 있습니다.';
    END IF;
    IF position('comment_reward' IN v_point_engine) > 0 THEN
        RAISE EXCEPTION '공용 포인트 엔진이 신규 댓글 보상을 아직 허용합니다.';
    END IF;
    IF v_comment_complete ~ 'point_engine_apply|comment_reward|points_awarded' THEN
        RAISE EXCEPTION '댓글 승인 RPC에 포인트 지급 계약이 남아 있습니다.';
    END IF;
    IF position('comment_reward' IN pg_get_constraintdef(
        (SELECT oid FROM pg_constraint
         WHERE conrelid = 'public.point_logs'::regclass
           AND conname = 'point_logs_activity_type_check')
    )) = 0 THEN
        RAISE EXCEPTION '과거 댓글 포인트 원장을 읽을 수 있는 활동 유형이 사라졌습니다.';
    END IF;
END;
$$;

SELECT set_config('test.comment_retire_post_id', (
    SELECT post.id::TEXT
    FROM public.student_posts post
    JOIN public.students writer ON writer.id = post.student_id AND writer.class_id = post.class_id
    WHERE writer.deleted_at IS NULL AND post.class_id IS NOT NULL
    LIMIT 1
), true);
SELECT set_config('test.comment_retire_class_id', (
    SELECT post.class_id::TEXT
    FROM public.student_posts post
    WHERE post.id = current_setting('test.comment_retire_post_id')::UUID
), true);
SELECT set_config('test.comment_retire_student_id', (
    SELECT student.id::TEXT
    FROM public.students student
    WHERE student.class_id = current_setting('test.comment_retire_class_id')::UUID
      AND student.deleted_at IS NULL
    LIMIT 1
), true);
SELECT set_config('test.comment_retire_points_before', (
    SELECT COALESCE(student.total_points, 0)::TEXT
    FROM public.students student
    WHERE student.id = current_setting('test.comment_retire_student_id')::UUID
), true);
SELECT set_config('test.comment_retire_log_count_before', (
    SELECT count(*)::TEXT FROM public.point_logs WHERE activity_type = 'comment_reward'
), true);
SELECT set_config('test.comment_retire_log_sum_before', (
    SELECT COALESCE(sum(amount), 0)::TEXT FROM public.point_logs WHERE activity_type = 'comment_reward'
), true);
SELECT set_config('test.comment_retire_token', gen_random_uuid()::TEXT, true);

WITH inserted AS (
    INSERT INTO public.post_comments(
        post_id, student_id, class_id, content, status,
        ai_review_attempts, ai_review_enqueued_at, ai_review_next_at,
        ai_review_lease_until, ai_review_token
    ) VALUES (
        current_setting('test.comment_retire_post_id')::UUID,
        current_setting('test.comment_retire_student_id')::UUID,
        current_setting('test.comment_retire_class_id')::UUID,
        'ROLLBACK 댓글 포인트 종료 검사 문장입니다.',
        'pending', 1, NOW(), NULL,
        NOW() + INTERVAL '2 minutes',
        current_setting('test.comment_retire_token')::UUID
    )
    RETURNING id
)
SELECT set_config('test.comment_retire_comment_id', id::TEXT, true) FROM inserted;

UPDATE public.comment_ai_review_slots
SET comment_id = current_setting('test.comment_retire_comment_id')::UUID,
    review_token = current_setting('test.comment_retire_token')::UUID,
    leased_at = NOW(),
    lease_until = NOW() + INTERVAL '2 minutes'
WHERE slot_no = 1;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::TEXT, true);
SELECT set_config('test.comment_retire_complete_result', public.complete_comment_ai_review_v2(
    current_setting('test.comment_retire_comment_id')::UUID,
    current_setting('test.comment_retire_token')::UUID,
    true,
    NULL,
    'local_rule'
)::TEXT, true);
RESET ROLE;

DO $$
DECLARE
    v_result JSONB := current_setting('test.comment_retire_complete_result')::JSONB;
BEGIN
    IF v_result <> jsonb_build_object('recorded', true, 'status', 'approved') THEN
        RAISE EXCEPTION '포인트 없는 댓글 승인이 예상 응답과 다릅니다: %', v_result;
    END IF;
    IF (SELECT status FROM public.post_comments
        WHERE id = current_setting('test.comment_retire_comment_id')::UUID) <> 'approved' THEN
        RAISE EXCEPTION '포인트를 없앤 뒤 댓글 승인까지 막혔습니다.';
    END IF;
    IF (SELECT COALESCE(total_points, 0) FROM public.students
        WHERE id = current_setting('test.comment_retire_student_id')::UUID)
       <> current_setting('test.comment_retire_points_before')::INTEGER THEN
        RAISE EXCEPTION '댓글 승인으로 학생 잔액이 바뀌었습니다.';
    END IF;
    IF (SELECT count(*) FROM public.point_logs WHERE activity_type = 'comment_reward')
       <> current_setting('test.comment_retire_log_count_before')::BIGINT
       OR (SELECT COALESCE(sum(amount), 0) FROM public.point_logs WHERE activity_type = 'comment_reward')
       <> current_setting('test.comment_retire_log_sum_before')::BIGINT THEN
        RAISE EXCEPTION '기존 댓글 포인트 원장이 바뀌거나 신규 원장이 생겼습니다.';
    END IF;
END;
$$;

DO $$
BEGIN
    BEGIN
        PERFORM public.point_engine_apply(
            current_setting('test.comment_retire_student_id')::UUID,
            5,
            'ROLLBACK 종료된 댓글 포인트 직접 호출 검사',
            'comment_reward',
            format('rollback-retired-comment:%s', gen_random_uuid()),
            NULL,
            NULL,
            '{}'::JSONB
        );
        RAISE EXCEPTION '공용 포인트 엔진이 종료된 댓글 보상을 허용했습니다.';
    EXCEPTION
        WHEN invalid_parameter_value THEN NULL;
    END;
END;
$$;

DO $$
BEGIN
    IF (SELECT COALESCE(total_points, 0) FROM public.students
        WHERE id = current_setting('test.comment_retire_student_id')::UUID)
       <> current_setting('test.comment_retire_points_before')::INTEGER
       OR (SELECT count(*) FROM public.point_logs WHERE activity_type = 'comment_reward')
       <> current_setting('test.comment_retire_log_count_before')::BIGINT THEN
        RAISE EXCEPTION '차단된 직접 호출 뒤 포인트 상태가 바뀌었습니다.';
    END IF;
END;
$$;
