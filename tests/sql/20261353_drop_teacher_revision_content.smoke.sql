-- 교사 수정본 칸 빼기 스모크 (전부 롤백된다): 칸이 없고, 작업공간 함수가 그 칸을 찾지 않으며, 고친 자리 수 보호는 그대로다.
DO $$
DECLARE
    v_post UUID;
    v_count SMALLINT;
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'student_posts' AND column_name = 'teacher_revision_content'
    ) THEN
        RAISE EXCEPTION '교사 수정본 칸이 남아 있습니다.';
    END IF;
    IF position('teacher_revision_content' IN pg_get_functiondef('public.get_student_assignment_workspace_v1(uuid, uuid)'::regprocedure)) > 0 THEN
        RAISE EXCEPTION '학생 작업공간 함수가 지운 칸을 찾습니다.';
    END IF;
    IF position('teacher_revision_content' IN pg_get_functiondef('public.guard_student_post_revision_fields()'::regprocedure)) > 0 THEN
        RAISE EXCEPTION '트리거가 지운 칸을 찾습니다.';
    END IF;

    SELECT id INTO v_post FROM public.student_posts WHERE is_confirmed IS TRUE AND revision_change_count IS NOT NULL LIMIT 1;
    IF v_post IS NULL THEN
        RAISE EXCEPTION '검증할 승인된 글이 없습니다.';
    END IF;
    -- 전용 경로 밖에서 바꾸면 되돌린다(학생 직접 UPDATE 와 같은 길).
    UPDATE public.student_posts SET revision_change_count = 999 WHERE id = v_post;
    SELECT revision_change_count INTO v_count FROM public.student_posts WHERE id = v_post;
    IF v_count = 999 THEN
        RAISE EXCEPTION '고친 자리 수 보호가 풀렸습니다.';
    END IF;
    -- 교사가 고치는 길(teacher_edited_content 채우기)도 여전히 오류 없이 지나간다.
    UPDATE public.student_posts SET teacher_edited_content = teacher_edited_content WHERE id = v_post;
END;
$$;
