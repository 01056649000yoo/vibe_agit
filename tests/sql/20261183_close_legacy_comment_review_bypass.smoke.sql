-- 학생이 자기 댓글을 스스로 승인하는 경로가 완전히 막혔는지 실제 DB에서 확인한다.
BEGIN;

DO $$
DECLARE
    v_auth UUID; v_post UUID; v_comment UUID; v_status TEXT;
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('record_comment_ai_review', 'claim_comment_ai_review_v1')
    ) THEN
        RAISE EXCEPTION '구형 댓글 판정 함수가 아직 존재합니다.';
    END IF;

    SELECT s.auth_id, p.id INTO v_auth, v_post
    FROM public.students s
    JOIN public.student_posts p
      ON p.class_id = s.class_id AND p.is_submitted IS TRUE AND p.visibility = 'class'
    WHERE s.auth_id IS NOT NULL
      AND s.is_active IS DISTINCT FROM FALSE
      AND s.deleted_at IS NULL
    LIMIT 1;
    IF v_auth IS NULL THEN
        RAISE NOTICE '검증용 학생·글이 없어 상태 확인은 건너뜁니다.';
        RETURN;
    END IF;

    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_auth, 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('role', 'authenticated', true);

    v_comment := (public.create_my_post_comment_v1(v_post, '스모크 검증용 임시 댓글입니다 롤백됩니다')->'comment'->>'id')::UUID;
    SELECT status INTO v_status FROM public.post_comments WHERE id = v_comment;
    IF v_status <> 'pending' THEN
        RAISE EXCEPTION '새 댓글이 검사 대기 상태로 저장되지 않았습니다: %', v_status;
    END IF;

    -- 학생 권한으로는 판정 RPC 어느 것도 실행할 수 없어야 한다.
    IF has_function_privilege('authenticated', 'public.complete_comment_ai_review_v2(uuid,uuid,boolean,text,text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.claim_next_comment_ai_review_v2()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.fail_comment_ai_review_v2(uuid,uuid,text)', 'EXECUTE') THEN
        RAISE EXCEPTION '댓글 판정 RPC가 클라이언트에 공개됐습니다.';
    END IF;
END $$;

ROLLBACK;
