ALTER TABLE public.student_posts
ADD COLUMN IF NOT EXISTS teacher_edited_title TEXT;

ALTER TABLE public.student_posts
ADD COLUMN IF NOT EXISTS teacher_edited_content TEXT;

ALTER TABLE public.student_posts
ADD COLUMN IF NOT EXISTS teacher_edited_at TIMESTAMPTZ;

ALTER TABLE public.student_posts
ADD COLUMN IF NOT EXISTS teacher_edited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.student_posts
ADD COLUMN IF NOT EXISTS is_teacher_edited BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.teacher_edit_student_post(
    p_post_id UUID,
    p_title TEXT,
    p_content TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_teacher_id UUID := auth.uid();
    v_post RECORD;
    v_char_count INTEGER;
    v_paragraph_count INTEGER;
BEGIN
    IF v_teacher_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF p_post_id IS NULL THEN
        RAISE EXCEPTION 'Post id is required';
    END IF;

    IF COALESCE(BTRIM(p_title), '') = '' THEN
        RAISE EXCEPTION 'Title is required';
    END IF;

    IF COALESCE(BTRIM(p_content), '') = '' THEN
        RAISE EXCEPTION 'Content is required';
    END IF;

    SELECT
        sp.id,
        sp.student_id,
        sp.mission_id,
        sp.class_id,
        c.teacher_id
    INTO v_post
    FROM public.student_posts sp
    JOIN public.classes c
      ON c.id = sp.class_id
    WHERE sp.id = p_post_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Post not found';
    END IF;

    IF v_post.teacher_id <> v_teacher_id AND public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION 'Only the class teacher can edit this post';
    END IF;

    v_char_count := char_length(p_content);
    v_paragraph_count := COALESCE(array_length(regexp_split_to_array(p_content, E'\\n+'), 1), 0);

    UPDATE public.student_posts
    SET
        title = BTRIM(p_title),
        content = p_content,
        char_count = v_char_count,
        paragraph_count = v_paragraph_count,
        teacher_edited_title = BTRIM(p_title),
        teacher_edited_content = p_content,
        teacher_edited_at = NOW(),
        teacher_edited_by = v_teacher_id,
        is_teacher_edited = true,
        is_returned = true,
        is_submitted = false,
        is_confirmed = false
    WHERE id = p_post_id;

    RETURN json_build_object(
        'success', true,
        'post_id', p_post_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_edit_student_post(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_edit_student_post(UUID, TEXT, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
