-- 고친 자리 수·교사 수정본 보관 스모크 (전부 롤백된다).
-- ① 담임은 승인된 글의 수를 저장한다 ② 글쓴 학생은 함수로도, 표를 직접 고쳐서도 바꾸지 못한다
-- ③ 승인 전 글은 저장되지 않는다 ④ 글 내용이 바뀌면 수가 비워진다
-- ⑤ 교사 수정본은 교사가 고칠 때 담기고, 학생이 다시 내도 남으며, 직접 바꾸지 못한다 ⑥ anon 은 부르지 못한다

DO $$
DECLARE
    v_post UUID;
    v_teacher UUID;
    v_student_auth UUID;
    v_draft UUID;
BEGIN
    SELECT post.id, class.teacher_id, student.auth_id INTO v_post, v_teacher, v_student_auth
    FROM public.student_posts post
    JOIN public.classes class ON class.id = post.class_id
    JOIN public.students student ON student.id = post.student_id
    WHERE post.is_confirmed IS TRUE AND class.teacher_id IS NOT NULL AND student.auth_id IS NOT NULL
    ORDER BY post.approved_at DESC NULLS LAST
    LIMIT 1;
    IF v_post IS NULL THEN
        RAISE EXCEPTION '검증할 승인된 글이 없습니다.';
    END IF;
    SELECT post.id INTO v_draft
    FROM public.student_posts post
    JOIN public.classes class ON class.id = post.class_id
    WHERE post.is_confirmed IS NOT TRUE AND class.teacher_id = v_teacher
    LIMIT 1;
    PERFORM set_config('test.rev_post', v_post::TEXT, true);
    PERFORM set_config('test.rev_draft', COALESCE(v_draft::TEXT, ''), true);
    PERFORM set_config('test.rev_teacher', v_teacher::TEXT, true);
    PERFORM set_config('test.rev_student', v_student_auth::TEXT, true);

    IF position('post.teacher_revision_content' IN pg_get_functiondef('public.get_student_assignment_workspace_v1(uuid, uuid)'::regprocedure)) = 0 THEN
        RAISE EXCEPTION '학생 글쓰기 작업공간이 교사 수정본을 돌려주지 않습니다.';
    END IF;
    IF has_function_privilege('anon', 'public.record_post_revision_counts_v1(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon 이 고친 자리 수 함수를 부를 수 있습니다.';
    END IF;
END;
$$;

-- ① 담임이 저장한다 / ③ 승인 전 글은 건너뛴다
DO $$
DECLARE
    v_result JSONB;
BEGIN
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', current_setting('test.rev_teacher'), 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('role', 'authenticated', true);
    v_result := public.record_post_revision_counts_v1(jsonb_build_array(
        jsonb_build_object('post_id', current_setting('test.rev_post'), 'count', 5)
    ));
    IF (v_result->>'updated')::INT <> 1 THEN
        RAISE EXCEPTION '담임이 고친 자리 수를 저장하지 못했습니다: %', v_result;
    END IF;
    IF current_setting('test.rev_draft') <> '' THEN
        v_result := public.record_post_revision_counts_v1(jsonb_build_array(
            jsonb_build_object('post_id', current_setting('test.rev_draft'), 'count', 3)
        ));
        IF (v_result->>'updated')::INT <> 0 THEN
            RAISE EXCEPTION '승인 전 글에 고친 자리 수가 저장됐습니다: %', v_result;
        END IF;
    END IF;
    -- 잘못된 항목은 건너뛰고 오류를 내지 않는다.
    v_result := public.record_post_revision_counts_v1('[{"post_id":"not-a-uuid","count":2},{"count":1},3]'::JSONB);
    IF (v_result->>'updated')::INT <> 0 THEN
        RAISE EXCEPTION '잘못된 항목이 저장됐습니다: %', v_result;
    END IF;
END;
$$;
RESET ROLE;

-- ② 글쓴 학생은 바꾸지 못한다
DO $$
DECLARE
    v_result JSONB;
BEGIN
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', current_setting('test.rev_student'), 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('role', 'authenticated', true);
    v_result := public.record_post_revision_counts_v1(jsonb_build_array(
        jsonb_build_object('post_id', current_setting('test.rev_post'), 'count', 99)
    ));
    IF (v_result->>'updated')::INT <> 0 THEN
        RAISE EXCEPTION '학생이 자기 글의 고친 자리 수를 바꿨습니다: %', v_result;
    END IF;
    BEGIN
        UPDATE public.student_posts SET revision_change_count = 99 WHERE id = current_setting('test.rev_post')::UUID;
    EXCEPTION WHEN insufficient_privilege THEN
        NULL; -- 표 권한에서 막혀도 괜찮다.
    END;
END;
$$;
RESET ROLE;

DO $$
DECLARE
    v_post UUID := current_setting('test.rev_post')::UUID;
    v_count SMALLINT;
    v_saved TEXT;
BEGIN
    SELECT revision_change_count INTO v_count FROM public.student_posts WHERE id = v_post;
    IF v_count IS DISTINCT FROM 5 THEN
        RAISE EXCEPTION '고친 자리 수가 전용 함수 밖에서 바뀌었습니다: %', v_count;
    END IF;

    -- ④ 글 내용이 바뀌면 비워진다
    UPDATE public.student_posts SET content = content || ' ' WHERE id = v_post;
    SELECT revision_change_count INTO v_count FROM public.student_posts WHERE id = v_post;
    IF v_count IS NOT NULL THEN
        RAISE EXCEPTION '글이 바뀌었는데 고친 자리 수가 남았습니다: %', v_count;
    END IF;

    -- ⑤ 교사 수정본 보관
    UPDATE public.student_posts SET teacher_edited_content = '교사가 고친 글' WHERE id = v_post;
    SELECT teacher_revision_content INTO v_saved FROM public.student_posts WHERE id = v_post;
    IF v_saved IS DISTINCT FROM '교사가 고친 글' THEN
        RAISE EXCEPTION '교사가 고친 글이 보관되지 않았습니다: %', v_saved;
    END IF;
    UPDATE public.student_posts SET teacher_edited_content = NULL, content = '학생이 다시 낸 글' WHERE id = v_post;
    SELECT teacher_revision_content INTO v_saved FROM public.student_posts WHERE id = v_post;
    IF v_saved IS DISTINCT FROM '교사가 고친 글' THEN
        RAISE EXCEPTION '학생이 다시 냈더니 교사 수정본이 사라졌습니다: %', v_saved;
    END IF;
    UPDATE public.student_posts SET teacher_revision_content = '몰래 바꾼 글' WHERE id = v_post;
    SELECT teacher_revision_content INTO v_saved FROM public.student_posts WHERE id = v_post;
    IF v_saved IS DISTINCT FROM '교사가 고친 글' THEN
        RAISE EXCEPTION '교사 수정본이 전용 경로 밖에서 바뀌었습니다: %', v_saved;
    END IF;
END;
$$;
