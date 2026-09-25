-- 댓글 200자 상한 검증 스모크: 201자 거절, 8~200자 허용
DO $$
DECLARE
    v_auth UUID;
    v_post UUID;
    v_comment UUID;
    v_too_long TEXT := repeat('가', 201);
    v_valid TEXT := '글이 너무 감동적이에요! 좋은 글 고마워요.';
    v_updated TEXT := '수정된 댓글 내용입니다. 친구 글 최고!';
    v_err_caught BOOLEAN := FALSE;
BEGIN
    SELECT s.auth_id, p.id INTO v_auth, v_post
    FROM public.students s
    JOIN public.student_posts p
      ON p.class_id = s.class_id AND p.is_submitted IS TRUE AND p.visibility = 'class'
    WHERE s.auth_id IS NOT NULL
      AND s.is_active IS DISTINCT FROM FALSE
      AND s.deleted_at IS NULL
    LIMIT 1;

    IF v_auth IS NULL THEN
        RAISE NOTICE '검증용 학생·글이 없어 스모크 테스트를 건너뜁니다.';
        RETURN;
    END IF;

    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_auth, 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('role', 'authenticated', true);

    -- 1) 201자 입력 시 예외 발생 검증
    BEGIN
        PERFORM public.create_my_post_comment_v1(v_post, v_too_long);
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%댓글은 8~200자로 작성해주세요.%' THEN
            v_err_caught := TRUE;
        ELSE
            RAISE EXCEPTION '예상치 못한 오류 발생: %', SQLERRM;
        END IF;
    END;

    IF NOT v_err_caught THEN
        RAISE EXCEPTION '201자 댓글이 차단되지 않았습니다.';
    END IF;

    -- 2) 정상 길이(8~200자) 등록 검증
    v_comment := (public.create_my_post_comment_v1(v_post, v_valid)->'comment'->>'id')::UUID;
    IF v_comment IS NULL THEN
        RAISE EXCEPTION '정상 댓글 등록 실패';
    END IF;

    -- 3) 201자 수정 시 예외 발생 검증
    v_err_caught := FALSE;
    BEGIN
        PERFORM public.update_my_post_comment_v1(v_comment, v_too_long);
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%댓글은 8~200자로 작성해주세요.%' THEN
            v_err_caught := TRUE;
        ELSE
            RAISE EXCEPTION '수정 시 예상치 못한 오류 발생: %', SQLERRM;
        END IF;
    END;

    IF NOT v_err_caught THEN
        RAISE EXCEPTION '201자 댓글 수정이 차단되지 않았습니다.';
    END IF;

    -- 4) 정상 길이 수정 검증
    PERFORM public.update_my_post_comment_v1(v_comment, v_updated);
END $$;
