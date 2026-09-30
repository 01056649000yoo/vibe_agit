-- 선생님 교정 회차 스모크 (전부 롤백된다).
-- ① 고칠 때마다 회차가 남고 고치기 전 글이 보관된다 ② 학생이 다시 내기 전 또 고치면 같은 회차를 고친다
-- ③ 학생이 다시 낸 뒤 고치면 새 회차 — 앞 회차의 "다음에 낸 글" 로 이어진다 ④ 글쓴 학생·담임은 읽고 다른 학생은 못 읽는다
-- ⑤ 학생이 표를 직접 고쳐 회차 수를 바꾸지 못한다 ⑥ anon 은 부르지 못한다

DO $$
DECLARE
    v_post UUID;
    v_teacher UUID;
    v_owner UUID;
    v_other UUID;
BEGIN
    SELECT post.id, class.teacher_id, owner.auth_id INTO v_post, v_teacher, v_owner
    FROM public.student_posts post
    JOIN public.classes class ON class.id = post.class_id
    JOIN public.students owner ON owner.id = post.student_id
    WHERE post.is_submitted IS TRUE AND post.writing_context = 'assignment' AND post.teacher_edit_rounds = 0
      AND class.teacher_id IS NOT NULL AND owner.auth_id IS NOT NULL
    ORDER BY post.updated_at DESC
    LIMIT 1;
    IF v_post IS NULL THEN
        RAISE EXCEPTION '검증할 제출 글이 없습니다.';
    END IF;
    SELECT other.auth_id INTO v_other FROM public.students other
    WHERE other.auth_id IS NOT NULL AND other.auth_id <> v_owner LIMIT 1;
    PERFORM set_config('test.te_post', v_post::TEXT, true);
    PERFORM set_config('test.te_teacher', v_teacher::TEXT, true);
    PERFORM set_config('test.te_owner', v_owner::TEXT, true);
    PERFORM set_config('test.te_other', v_other::TEXT, true);
    PERFORM set_config('test.te_base', (SELECT content FROM public.student_posts WHERE id = v_post), true);
    IF has_function_privilege('anon', 'public.get_post_teacher_edits_v1(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon 이 교정지 함수를 부를 수 있습니다.';
    END IF;
END;
$$;

-- ①② 담임이 두 번 고친다(그 사이 학생은 다시 내지 않음) → 회차 1개, 고친 글은 두 번째 것
DO $$
BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', current_setting('test.te_teacher'), 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('role', 'authenticated', true);
    PERFORM public.teacher_edit_student_post(current_setting('test.te_post')::UUID, '선생님 제목', '선생님이 처음 고친 글');
    PERFORM public.teacher_edit_student_post(current_setting('test.te_post')::UUID, '선생님 제목', '선생님이 다시 고친 글');
END;
$$;
RESET ROLE;

DO $$
DECLARE
    v_post UUID := current_setting('test.te_post')::UUID;
    v_rounds INT;
    v_row public.student_post_teacher_edits%ROWTYPE;
BEGIN
    SELECT count(*) INTO v_rounds FROM public.student_post_teacher_edits WHERE post_id = v_post;
    SELECT * INTO v_row FROM public.student_post_teacher_edits WHERE post_id = v_post AND round = 1;
    IF v_rounds <> 1 THEN
        RAISE EXCEPTION '학생이 다시 내기 전 두 번 고쳤는데 회차가 %개입니다.', v_rounds;
    END IF;
    IF v_row.base_content IS DISTINCT FROM current_setting('test.te_base') THEN
        RAISE EXCEPTION '고치기 전 학생 글이 보관되지 않았습니다.';
    END IF;
    IF v_row.edited_content <> '선생님이 다시 고친 글' THEN
        RAISE EXCEPTION '같은 회차의 고친 글이 바뀌지 않았습니다: %', v_row.edited_content;
    END IF;
    IF (SELECT teacher_edit_rounds FROM public.student_posts WHERE id = v_post) <> 1 THEN
        RAISE EXCEPTION '글의 교정 회차 수가 1이 아닙니다.';
    END IF;
    -- ③ 학생이 다시 낸다(제출 함수 대신 같은 결과만 흉내: 글·제출 상태)
    UPDATE public.student_posts SET content = '학생이 다시 낸 글', is_submitted = TRUE, is_returned = FALSE WHERE id = v_post;
END;
$$;

DO $$
BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', current_setting('test.te_teacher'), 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('role', 'authenticated', true);
    PERFORM public.teacher_edit_student_post(current_setting('test.te_post')::UUID, '선생님 제목', '선생님이 두 번째로 고친 글');
END;
$$;
RESET ROLE;

-- ④ 담임·글쓴 학생은 읽고, 앞 회차의 다음 글이 이어진다
DO $$
DECLARE
    v_result JSONB;
BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', current_setting('test.te_owner'), 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('role', 'authenticated', true);
    v_result := public.get_post_teacher_edits_v1(current_setting('test.te_post')::UUID);
    IF jsonb_array_length(v_result->'rounds') <> 2 THEN
        RAISE EXCEPTION '회차가 2개가 아닙니다: %', v_result;
    END IF;
    IF v_result->'rounds'->0->>'next_content' <> '학생이 다시 낸 글' THEN
        RAISE EXCEPTION '1회차의 다음에 낸 글이 이어지지 않습니다: %', v_result->'rounds'->0;
    END IF;
    IF v_result->'rounds'->1->>'base_content' <> '학생이 다시 낸 글' OR (v_result->'rounds'->1->'next_content') <> 'null'::JSONB THEN
        RAISE EXCEPTION '2회차(아직 다시 내지 않음)가 올바르지 않습니다: %', v_result->'rounds'->1;
    END IF;
    -- ⑤ 학생이 표를 직접 고쳐 회차 수를 바꾸지 못한다(RLS 에서 막혀도 괜찮다)
    BEGIN
        UPDATE public.student_posts SET teacher_edit_rounds = 99 WHERE id = current_setting('test.te_post')::UUID;
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;
END;
$$;
RESET ROLE;

DO $$
DECLARE
    v_blocked BOOLEAN := FALSE;
BEGIN
    IF (SELECT teacher_edit_rounds FROM public.student_posts WHERE id = current_setting('test.te_post')::UUID) <> 2 THEN
        RAISE EXCEPTION '교정 회차 수가 전용 경로 밖에서 바뀌었습니다.';
    END IF;
    IF current_setting('test.te_other') <> '' THEN
        PERFORM set_config('request.jwt.claims', json_build_object('sub', current_setting('test.te_other'), 'role', 'authenticated')::TEXT, true);
        PERFORM set_config('role', 'authenticated', true);
        BEGIN
            PERFORM public.get_post_teacher_edits_v1(current_setting('test.te_post')::UUID);
        EXCEPTION WHEN insufficient_privilege THEN
            v_blocked := TRUE;
        END;
        IF NOT v_blocked THEN
            RAISE EXCEPTION '다른 학생이 교정지를 읽었습니다.';
        END IF;
    END IF;
END;
$$;
RESET ROLE;
