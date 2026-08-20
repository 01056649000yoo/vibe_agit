DO $$
DECLARE
    v_review_constraint TEXT;
    v_review_function TEXT;
    v_reading_submit_function TEXT;
    v_diary_submit_function TEXT;
BEGIN
    SELECT pg_get_constraintdef(oid) INTO v_review_constraint
    FROM pg_constraint
    WHERE conname = 'reading_log_teacher_reviews_review_status_check';

    IF v_review_constraint NOT LIKE '%checked%revision_requested%'
       OR v_review_constraint LIKE '%commented%' THEN
        RAISE EXCEPTION '자율 글 교사 반응은 확인/보완 요청 두 상태여야 합니다.';
    END IF;

    SELECT pg_get_functiondef('public.save_teacher_self_writing_review_v2(uuid,text,text)'::regprocedure)
    INTO v_review_function;
    IF v_review_function NOT LIKE '%award_self_writing_review_points_v1%'
       OR v_review_function LIKE '%p_decision = ''revision_requested'' AND v_comment = ''''%' THEN
        RAISE EXCEPTION '교사 확인 지급 또는 선택 사유 계약이 없습니다.';
    END IF;

    SELECT pg_get_functiondef('public.upsert_my_reading_log_rewarded(uuid,jsonb,text,text,text,text)'::regprocedure)
    INTO v_reading_submit_function;
    SELECT pg_get_functiondef('public.upsert_my_diary(uuid,date,text,text,text)'::regprocedure)
    INTO v_diary_submit_function;
    IF v_reading_submit_function LIKE '%point_engine_apply%'
       OR v_reading_submit_function LIKE '%INSERT INTO public.writing_reward_claims%'
       OR v_diary_submit_function LIKE '%point_engine_apply%'
       OR v_diary_submit_function LIKE '%INSERT INTO public.writing_reward_claims%' THEN
        RAISE EXCEPTION '학생 제출 함수가 포인트 또는 보상 원장을 직접 쓰고 있습니다.';
    END IF;

    IF has_function_privilege(
        'authenticated', 'public.award_self_writing_review_points_v1(uuid)', 'EXECUTE'
    ) THEN
        RAISE EXCEPTION '학생/교사 역할이 내부 자율 글 보상 함수를 직접 실행할 수 있습니다.';
    END IF;

    IF pg_get_functiondef('public.bond_with_my_dragon()'::regprocedure)
       LIKE '%FROM public.writing_reward_claims claim%' THEN
        RAISE EXCEPTION '수호룡이 오늘 쓴 자율 글을 포인트 원장으로 판정하고 있습니다.';
    END IF;
END;
$$;

-- 실제 포인트 엔진 연결과 재시도 중복 방지를 운영 데이터 한 건으로 검증한다.
-- 바깥 트랜잭션이 모든 변경을 롤백한다. 글이 전혀 없는 빈 DB에서는 계약 검사만 수행한다.
DO $$
DECLARE
    v_post RECORD;
    v_before INTEGER;
    v_after INTEGER;
    v_first JSONB;
    v_second JSONB;
    v_day_start TIMESTAMPTZ;
BEGIN
    SELECT post.id, post.student_id, post.class_id, post.self_writing_type, post.created_at
    INTO v_post
    FROM public.student_posts post
    JOIN public.students student
      ON student.id = post.student_id AND student.class_id = post.class_id
     AND student.is_active IS DISTINCT FROM FALSE AND student.deleted_at IS NULL
    JOIN public.class_writing_policies policy
      ON policy.class_id = post.class_id AND policy.writing_type = post.self_writing_type
     AND policy.is_enabled IS TRUE AND policy.base_reward > 0
    WHERE post.writing_context = 'self'
      AND post.self_writing_type IN ('reading_log', 'diary')
      AND post.is_submitted IS TRUE
    ORDER BY post.created_at DESC, post.id
    LIMIT 1;

    IF v_post.id IS NULL THEN
        RETURN;
    END IF;

    v_day_start := (
        (v_post.created_at AT TIME ZONE 'Asia/Seoul')::DATE::TIMESTAMP
        AT TIME ZONE 'Asia/Seoul'
    );

    -- 시험 글의 제출일 보상 상한과 기존 중복 키를 트랜잭션 안에서만 비운다.
    DELETE FROM public.point_logs
    WHERE student_id = v_post.student_id
      AND event_key = format('self-writing-review:%s', v_post.id);
    DELETE FROM public.writing_reward_claims
    WHERE student_id = v_post.student_id
      AND writing_type = v_post.self_writing_type
      AND reward_kind = 'completion'
      AND created_at >= v_day_start AND created_at < v_day_start + INTERVAL '1 day';

    SELECT total_points INTO v_before FROM public.students WHERE id = v_post.student_id;
    v_first := public.award_self_writing_review_points_v1(v_post.id);
    SELECT total_points INTO v_after FROM public.students WHERE id = v_post.student_id;

    IF COALESCE((v_first ->> 'points_awarded')::INTEGER, 0) <= 0
       OR v_after <> v_before + (v_first ->> 'points_awarded')::INTEGER THEN
        RAISE EXCEPTION '교사 확인 보상이 포인트 엔진으로 한 번 지급되지 않았습니다.';
    END IF;

    v_second := public.award_self_writing_review_points_v1(v_post.id);
    IF COALESCE((v_second ->> 'points_awarded')::INTEGER, -1) <> 0 THEN
        RAISE EXCEPTION '같은 자율 글 확인 보상이 중복 지급됐습니다.';
    END IF;
END;
$$;
