-- 이 파일은 check-migrations가 만든 바깥 트랜잭션에서 실행되고 마지막에 롤백된다.

SELECT set_config('test.latest_rewrite_student_auth_id', (
    SELECT student.auth_id::TEXT
    FROM public.students student
    WHERE student.auth_id IS NOT NULL
      AND student.is_active IS DISTINCT FROM false
      AND student.deleted_at IS NULL
    LIMIT 1
), true);

DO $$
BEGIN
    IF current_setting('test.latest_rewrite_student_auth_id', true) IS NULL THEN
        RAISE EXCEPTION '다시 쓰기 RPC 스모크에 사용할 학생 fixture가 없습니다.';
    END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.latest_rewrite_student_auth_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.latest_rewrite_student_auth_id'),
    'role', 'authenticated'
)::TEXT, true);

DO $$
DECLARE
    v_result JSONB;
    v_invalid_count INTEGER;
BEGIN
    v_result := public.get_my_latest_returned_assignment_v1();

    IF v_result IS NOT NULL THEN
        IF (v_result->>'version')::INTEGER <> 1
           OR NULLIF(v_result->>'id', '') IS NULL
           OR NULLIF(v_result->>'mission_id', '') IS NULL THEN
            RAISE EXCEPTION '다시 쓰기 RPC 응답 계약이 잘못됐습니다: %', v_result;
        END IF;

        SELECT count(*)::INTEGER INTO v_invalid_count
        FROM public.student_posts post
        JOIN public.writing_missions mission
          ON mission.id = post.mission_id
         AND mission.class_id = post.class_id
        WHERE post.id = (v_result->>'id')::UUID
          AND (
              post.student_id IS DISTINCT FROM public.auth_student_id()
              OR post.class_id IS DISTINCT FROM public.auth_user_class_id()
              OR mission.is_archived IS DISTINCT FROM false
              OR post.is_returned IS DISTINCT FROM true
              OR post.is_submitted IS DISTINCT FROM false
              OR post.is_confirmed IS DISTINCT FROM false
              OR post.recalled_at IS NOT NULL
          );

        IF v_invalid_count <> 0 THEN
            RAISE EXCEPTION '다시 쓰기 RPC가 현재 학생 범위 밖 글을 반환했습니다.';
        END IF;
    END IF;
END;
$$;

RESET ROLE;
