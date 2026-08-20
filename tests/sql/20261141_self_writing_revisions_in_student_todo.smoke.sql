-- check-migrations의 바깥 트랜잭션에서 실행되고 마지막에 모두 롤백된다.

DO $$
DECLARE
    v_post RECORD;
BEGIN
    SELECT post.id, post.student_id, post.class_id, post.self_writing_type,
           student.auth_id, class.teacher_id
    INTO v_post
    FROM public.student_posts post
    JOIN public.students student
      ON student.id = post.student_id AND student.class_id = post.class_id
    JOIN public.classes class ON class.id = post.class_id
    WHERE post.writing_context = 'self'
      AND post.self_writing_type IN ('reading_log', 'diary')
      AND post.is_submitted IS TRUE
      AND student.auth_id IS NOT NULL
      AND student.is_active IS DISTINCT FROM FALSE
      AND student.deleted_at IS NULL
      AND class.teacher_id IS NOT NULL
      AND class.deleted_at IS NULL
    ORDER BY post.updated_at DESC, post.id DESC
    LIMIT 1;

    IF v_post.id IS NULL THEN
        RAISE EXCEPTION '자율 글 다시 쓰기 스모크에 사용할 글이 없습니다.';
    END IF;

    INSERT INTO public.reading_log_teacher_reviews (
        post_id, student_id, class_id, teacher_id,
        review_status, teacher_comment, reviewed_at, updated_at
    ) VALUES (
        v_post.id, v_post.student_id, v_post.class_id, v_post.teacher_id,
        'revision_requested', '', NOW() + INTERVAL '1 minute', NOW()
    )
    ON CONFLICT (post_id) DO UPDATE SET
        teacher_id = EXCLUDED.teacher_id,
        review_status = EXCLUDED.review_status,
        teacher_comment = EXCLUDED.teacher_comment,
        reviewed_at = EXCLUDED.reviewed_at,
        updated_at = EXCLUDED.updated_at;

    PERFORM set_config('test.self_rewrite_auth_id', v_post.auth_id::TEXT, true);
    PERFORM set_config('test.self_rewrite_post_id', v_post.id::TEXT, true);
    PERFORM set_config('test.self_rewrite_type', v_post.self_writing_type, true);
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.self_rewrite_auth_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.self_rewrite_auth_id'),
    'role', 'authenticated'
)::TEXT, true);

DO $$
DECLARE
    v_home JSONB;
    v_latest JSONB;
    v_assignment_count INTEGER;
    v_self_count INTEGER;
BEGIN
    SELECT COUNT(*)::INTEGER INTO v_assignment_count
    FROM public.student_posts post
    JOIN public.writing_missions mission
      ON mission.id = post.mission_id AND mission.class_id = post.class_id
    WHERE post.class_id = public.auth_user_class_id()
      AND post.student_id = public.auth_student_id()
      AND mission.is_archived IS FALSE
      AND post.is_returned IS TRUE
      AND post.is_submitted IS FALSE
      AND post.is_confirmed IS FALSE
      AND post.recalled_at IS NULL;

    SELECT COUNT(*)::INTEGER INTO v_self_count
    FROM public.reading_log_teacher_reviews review
    JOIN public.student_posts post
      ON post.id = review.post_id
     AND post.class_id = review.class_id
     AND post.student_id = review.student_id
    WHERE review.class_id = public.auth_user_class_id()
      AND review.student_id = public.auth_student_id()
      AND review.review_status = 'revision_requested'
      AND post.writing_context = 'self'
      AND post.self_writing_type IN ('reading_log', 'diary')
      AND post.is_submitted IS TRUE;

    v_home := public.get_student_home_bootstrap_v1();
    IF (v_home #>> '{home,returned_count}')::INTEGER <> v_assignment_count + v_self_count THEN
        RAISE EXCEPTION '홈 다시 쓰기 개수에 자율 글 보완 요청이 합쳐지지 않았습니다: %', v_home;
    END IF;

    v_latest := public.get_my_latest_rewrite_v1();
    IF v_latest->>'version' <> '1'
       OR v_latest->>'id' <> current_setting('test.self_rewrite_post_id')
       OR v_latest->>'kind' <> current_setting('test.self_rewrite_type') THEN
        RAISE EXCEPTION '최신 자율 글 보완 바로가기 응답이 다릅니다: %', v_latest;
    END IF;
END;
$$;

RESET ROLE;

DO $$
BEGIN
    IF has_function_privilege('anon', 'public.get_my_latest_rewrite_v1()', 'EXECUTE') THEN
        RAISE EXCEPTION '익명 역할에 최신 다시 쓰기 RPC가 노출됐습니다.';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.get_my_latest_rewrite_v1()', 'EXECUTE') THEN
        RAISE EXCEPTION '인증 학생이 최신 다시 쓰기 RPC를 실행할 수 없습니다.';
    END IF;
    IF has_function_privilege('authenticated', 'public.get_student_home_bootstrap_core_20261137()', 'EXECUTE') THEN
        RAISE EXCEPTION '학생 홈 내부 core 함수가 브라우저에 노출됐습니다.';
    END IF;
END;
$$;
