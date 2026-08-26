-- 바깥에서 BEGIN ... ROLLBACK으로 실행한다. 운영 댓글·포인트는 남지 않는다.

DO $$
BEGIN
    IF (SELECT count(*) FROM public.comment_ai_review_slots) <> 3 THEN
        RAISE EXCEPTION '댓글 AI 작업 슬롯이 정확히 3개가 아닙니다.';
    END IF;
    IF has_table_privilege('authenticated', 'public.comment_ai_review_slots', 'SELECT')
       OR has_function_privilege('authenticated', 'public.claim_next_comment_ai_review_v2()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.complete_comment_ai_review_v2(uuid,uuid,boolean,text,text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.fail_comment_ai_review_v2(uuid,uuid,text)', 'EXECUTE') THEN
        RAISE EXCEPTION '댓글 AI 내부 대기열이 브라우저 역할에 공개됐습니다.';
    END IF;
    IF has_function_privilege('authenticated', 'public.reward_for_comment(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION '구형 댓글 포인트 함수가 학생에게 남아 있습니다.';
    END IF;
END;
$$;

-- 기존 운영 슬롯 상태와 무관하게 격리된 롤백 검사를 위해 현재 슬롯을 비운다.
UPDATE public.comment_ai_review_slots
SET comment_id = NULL, review_token = NULL, leased_at = NULL, lease_until = NULL;

SELECT set_config('test.comment_queue_post_id', (
    SELECT post.id::TEXT
    FROM public.student_posts post
    JOIN public.students writer ON writer.id = post.student_id AND writer.class_id = post.class_id
    WHERE writer.deleted_at IS NULL AND post.class_id IS NOT NULL
    LIMIT 1
), true);
SELECT set_config('test.comment_queue_class_id', (
    SELECT post.class_id::TEXT
    FROM public.student_posts post
    WHERE post.id = current_setting('test.comment_queue_post_id')::UUID
), true);
SELECT set_config('test.comment_queue_student_id', (
    SELECT student.id::TEXT
    FROM public.students student
    WHERE student.class_id = current_setting('test.comment_queue_class_id')::UUID
      AND student.deleted_at IS NULL
    LIMIT 1
), true);

INSERT INTO public.post_comments(
    post_id, student_id, class_id, content, status,
    ai_review_attempts, ai_review_enqueued_at, ai_review_next_at
)
SELECT
    current_setting('test.comment_queue_post_id')::UUID,
    current_setting('test.comment_queue_student_id')::UUID,
    current_setting('test.comment_queue_class_id')::UUID,
    format('ROLLBACK 댓글 AI 대기열 검사 문장 %s입니다.', number),
    'pending', 0, NOW(), NOW()
FROM generate_series(1, 4) AS number;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::TEXT, true);

DO $$
DECLARE
    v_first JSONB;
    v_second JSONB;
    v_third JSONB;
    v_fourth JSONB;
    v_after_release JSONB;
    v_completed JSONB;
BEGIN
    v_first := public.claim_next_comment_ai_review_v2();
    v_second := public.claim_next_comment_ai_review_v2();
    v_third := public.claim_next_comment_ai_review_v2();
    v_fourth := public.claim_next_comment_ai_review_v2();

    IF COALESCE((v_first->>'claimed')::BOOLEAN, false) IS NOT TRUE
       OR COALESCE((v_second->>'claimed')::BOOLEAN, false) IS NOT TRUE
       OR COALESCE((v_third->>'claimed')::BOOLEAN, false) IS NOT TRUE THEN
        RAISE EXCEPTION '세 작업 슬롯을 모두 선점하지 못했습니다.';
    END IF;
    IF COALESCE((v_fourth->>'claimed')::BOOLEAN, false) IS TRUE OR v_fourth->>'status' <> 'busy' THEN
        RAISE EXCEPTION '네 번째 댓글이 동시 실행 제한을 우회했습니다: %', v_fourth;
    END IF;

    v_completed := public.complete_comment_ai_review_v2(
        (v_first->>'comment_id')::UUID,
        (v_first->>'review_token')::UUID,
        false,
        'ROLLBACK 검사에서 공개를 보류합니다.',
        'local_rule'
    );
    IF COALESCE((v_completed->>'recorded')::BOOLEAN, false) IS NOT TRUE THEN
        RAISE EXCEPTION '댓글 검사 완료를 기록하지 못했습니다: %', v_completed;
    END IF;

    v_after_release := public.claim_next_comment_ai_review_v2();
    IF COALESCE((v_after_release->>'claimed')::BOOLEAN, false) IS NOT TRUE THEN
        RAISE EXCEPTION '완료 뒤 빈 슬롯이 다음 댓글을 받지 못했습니다: %', v_after_release;
    END IF;

    PERFORM public.fail_comment_ai_review_v2(
        (v_after_release->>'comment_id')::UUID,
        (v_after_release->>'review_token')::UUID,
        'rollback_test'
    );
END;
$$;

RESET ROLE;

DO $$
DECLARE
    v_processing INTEGER;
BEGIN
    SELECT count(*) INTO v_processing
    FROM public.comment_ai_review_slots
    WHERE lease_until > NOW();
    IF v_processing > 3 THEN
        RAISE EXCEPTION '댓글 AI 동시 실행이 3건을 넘었습니다: %', v_processing;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.point_logs
        WHERE activity_type = 'comment_reward'
           OR reason LIKE '친구 글에 따뜻한 응원을 남겨주셨네요!%'
    ) THEN
        -- 운영에 과거 댓글 보상이 없을 수 있으므로 제약이 새 유형을 허용하는지만 직접 확인한다.
        IF position('comment_reward' IN pg_get_constraintdef(
            (SELECT oid FROM pg_constraint
             WHERE conrelid = 'public.point_logs'::regclass
               AND conname = 'point_logs_activity_type_check')
        )) = 0 THEN
            RAISE EXCEPTION '포인트 활동 유형에 댓글 보상이 없습니다.';
        END IF;
    END IF;
END;
$$;
