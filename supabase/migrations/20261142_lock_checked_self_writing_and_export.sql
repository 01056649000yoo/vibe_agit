-- 교사가 확인 완료한 독서록·일기는 학생의 완성 기록으로 고정한다.
-- 교사가 보완 요청으로 바꾸면 확인 기록의 상태가 달라져 다시 수정할 수 있다.
-- 학급 전체의 확인 완료 독서록은 학생별 N+1 조회 없이 한 번에 내보낸다.

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_checked_self_writing_student_change_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF public.auth_user_role() = 'STUDENT'
       AND public.auth_student_id() = OLD.student_id
       AND OLD.writing_context = 'self'
       AND OLD.self_writing_type IN ('reading_log', 'diary')
       AND EXISTS (
           SELECT 1
           FROM public.reading_log_teacher_reviews review
           WHERE review.post_id = OLD.id
             AND review.class_id = OLD.class_id
             AND review.student_id = OLD.student_id
             AND review.review_status = 'checked'
       ) THEN
        RAISE EXCEPTION '선생님이 확인한 글은 수정하거나 삭제할 수 없습니다. 고쳐야 할 때는 선생님에게 보완 요청을 부탁하세요.'
            USING ERRCODE = 'P0001';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_checked_self_writing_student_change_v1()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_checked_self_writing_student_change_v1()
    TO service_role;

DROP TRIGGER IF EXISTS trg_guard_checked_self_writing_student_update ON public.student_posts;
CREATE TRIGGER trg_guard_checked_self_writing_student_update
BEFORE UPDATE OF title, content, structured_content, visibility
ON public.student_posts
FOR EACH ROW
EXECUTE FUNCTION public.guard_checked_self_writing_student_change_v1();

DROP TRIGGER IF EXISTS trg_guard_checked_self_writing_student_delete ON public.student_posts;
CREATE TRIGGER trg_guard_checked_self_writing_student_delete
BEFORE DELETE
ON public.student_posts
FOR EACH ROW
EXECUTE FUNCTION public.guard_checked_self_writing_student_change_v1();

CREATE OR REPLACE FUNCTION public.get_teacher_checked_reading_log_export_v1(
    p_class_id UUID,
    p_limit INTEGER DEFAULT 1000
)
RETURNS TABLE (
    post_id UUID,
    student_id UUID,
    student_name TEXT,
    student_code TEXT,
    content_type TEXT,
    content_type_label TEXT,
    group_title TEXT,
    post_title TEXT,
    content TEXT,
    visibility TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    source_title TEXT,
    source_authors TEXT[],
    review_status TEXT,
    teacher_comment TEXT,
    reviewed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.classes class
        WHERE class.id = p_class_id
          AND class.teacher_id = auth.uid()
    ) AND public.auth_user_role() IS DISTINCT FROM 'ADMIN' THEN
        RAISE EXCEPTION '이 학급의 독서록을 내보낼 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        post.id,
        post.student_id,
        student.name,
        student.student_code,
        'reading_log'::TEXT,
        '독서록'::TEXT,
        student.name || ' 학생의 독서록',
        post.title,
        post.content,
        post.visibility,
        post.created_at,
        post.updated_at,
        review.reviewed_at,
        COALESCE(book.title, post.structured_content ->> 'bookTitle'),
        COALESCE(book.authors, CASE
            WHEN jsonb_typeof(post.structured_content -> 'bookAuthors') = 'array' THEN ARRAY(
                SELECT jsonb_array_elements_text(post.structured_content -> 'bookAuthors')
            )
            WHEN NULLIF(post.structured_content ->> 'bookAuthor', '') IS NOT NULL THEN
                ARRAY[post.structured_content ->> 'bookAuthor']
            ELSE '{}'::TEXT[]
        END),
        review.review_status,
        review.teacher_comment,
        review.reviewed_at
    FROM public.student_posts post
    JOIN public.students student
      ON student.id = post.student_id
     AND student.class_id = post.class_id
    JOIN public.reading_log_teacher_reviews review
      ON review.post_id = post.id
     AND review.class_id = post.class_id
     AND review.student_id = post.student_id
     AND review.review_status = 'checked'
    LEFT JOIN public.reading_log_entries entry
      ON entry.post_id = post.id
     AND entry.class_id = post.class_id
    LEFT JOIN public.student_library_items library_item
      ON library_item.id = entry.library_item_id
     AND library_item.class_id = post.class_id
    LEFT JOIN public.book_catalog book
      ON book.id = library_item.book_id
    WHERE post.class_id = p_class_id
      AND post.writing_context = 'self'
      AND post.self_writing_type = 'reading_log'
      AND post.is_submitted IS TRUE
    ORDER BY student.created_at, post.created_at, post.id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 2000);
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_checked_reading_log_export_v1(UUID, INTEGER)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_checked_reading_log_export_v1(UUID, INTEGER)
    TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
