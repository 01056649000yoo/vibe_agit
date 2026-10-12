-- 교사 일기·독서록 확인 화면: '확인 완료' 목록이 늘 비던 것을 고치고, 한마디를 남긴 글을 따로 나눈다.
--
-- [원인] 필터는 review_status = 'reviewed' 로 골랐지만 저장되는 값은 'checked' 라 한 편도 맞지 않았다
--        (개수는 'checked' 로 세서 숫자만 보이고 목록은 비었다).
-- [바꿈] 글마다 review_group 하나를 정해 필터·개수·학생별 요약이 모두 이것만 본다. 칸은 겹치지 않는다:
--        미확인(unreviewed) / 보완 중(revision_requested) / 확인만(reviewed) / 한마디 남김(commented) / 전체.
--        한마디 남김 = 확인 완료이면서 teacher_comment 가 비어 있지 않은 글. 보완 요청은 사유가 있어도 보완 중.
--        저장된 review_status 값은 그대로 두고 응답에도 그대로 싣는다(학생 화면·포인트 규칙은 그대로).

BEGIN;

CREATE OR REPLACE FUNCTION public.get_teacher_reading_log_overview(
    p_class_id UUID,
    p_review_filter TEXT DEFAULT 'all',
    p_student_id UUID DEFAULT NULL,
    p_query TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    IF public.auth_user_role() <> 'ADMIN' AND NOT EXISTS (
        SELECT 1 FROM public.classes class
        WHERE class.id = p_class_id AND class.teacher_id = auth.uid()
    ) THEN
        RAISE EXCEPTION '이 학급의 독서록을 관리할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;
    IF p_review_filter NOT IN ('all', 'unreviewed', 'revision_requested', 'reviewed', 'commented') THEN
        RAISE EXCEPTION '올바르지 않은 검토 필터입니다.' USING ERRCODE = '22023';
    END IF;

    WITH base AS (
        SELECT
            post.id AS post_id,
            post.student_id,
            student.name AS student_name,
            post.title,
            post.visibility,
            post.updated_at,
            book.title AS book_title,
            COALESCE(book.authors, '{}'::TEXT[]) AS book_authors,
            CASE WHEN review.post_id IS NULL THEN 'unreviewed' ELSE review.review_status END AS review_status,
            CASE
                WHEN review.post_id IS NULL THEN 'unreviewed'
                WHEN review.review_status = 'revision_requested' THEN 'revision_requested'
                WHEN NULLIF(BTRIM(COALESCE(review.teacher_comment, '')), '') IS NOT NULL THEN 'commented'
                ELSE 'reviewed'
            END AS review_group,
            review.reviewed_at
        FROM public.student_posts post
        JOIN public.students student
          ON student.id = post.student_id
         AND student.class_id = post.class_id
        LEFT JOIN public.reading_log_entries entry
          ON entry.post_id = post.id
         AND entry.class_id = post.class_id
         AND entry.student_id = post.student_id
        LEFT JOIN public.student_library_items library_item
          ON library_item.id = entry.library_item_id
         AND library_item.class_id = entry.class_id
         AND library_item.student_id = entry.student_id
        LEFT JOIN public.book_catalog book ON book.id = library_item.book_id
        LEFT JOIN public.reading_log_teacher_reviews review
          ON review.post_id = post.id
         AND review.class_id = post.class_id
         AND review.student_id = post.student_id
        WHERE post.class_id = p_class_id
          AND post.writing_context = 'self'
          AND post.self_writing_type = 'reading_log'
          AND post.is_submitted IS TRUE
          AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
          AND (p_student_id IS NULL OR post.student_id = p_student_id)
          AND (
              NULLIF(BTRIM(COALESCE(p_query, '')), '') IS NULL
              OR POSITION(LOWER(BTRIM(p_query)) IN LOWER(COALESCE(student.name, ''))) > 0
              OR POSITION(LOWER(BTRIM(p_query)) IN LOWER(COALESCE(post.title, ''))) > 0
              OR POSITION(LOWER(BTRIM(p_query)) IN LOWER(COALESCE(book.title, ''))) > 0
          )
    ), counts AS (
        SELECT
            COUNT(*)::INTEGER AS total_count,
            COUNT(*) FILTER (WHERE review_group = 'unreviewed')::INTEGER AS unreviewed_count,
            COUNT(*) FILTER (WHERE review_group = 'revision_requested')::INTEGER AS revision_requested_count,
            COUNT(*) FILTER (WHERE review_group = 'reviewed')::INTEGER AS reviewed_count,
            COUNT(*) FILTER (WHERE review_group = 'commented')::INTEGER AS commented_count,
            COUNT(DISTINCT student_id)::INTEGER AS student_count
        FROM base
    ), page AS (
        SELECT *
        FROM base
        WHERE p_review_filter = 'all'
           OR review_group = p_review_filter
        ORDER BY updated_at DESC, post_id
        LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
        OFFSET GREATEST(COALESCE(p_offset, 0), 0)
    )
    SELECT jsonb_build_object(
        'counts', jsonb_build_object(
            'total', counts.total_count,
            'unreviewed', counts.unreviewed_count,
            'revision_requested', counts.revision_requested_count,
            'reviewed', counts.reviewed_count,
            'commented', counts.commented_count,
            'students', counts.student_count
        ),
        'items', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'post_id', page.post_id,
                    'student_id', page.student_id,
                    'student_name', page.student_name,
                    'title', page.title,
                    'visibility', page.visibility,
                    'updated_at', page.updated_at,
                    'book_title', page.book_title,
                    'book_authors', to_jsonb(page.book_authors),
                    'review_status', page.review_status,
                    'review_group', page.review_group,
                    'reviewed_at', page.reviewed_at
                ) ORDER BY page.updated_at DESC, page.post_id
            )
            FROM page
        ), '[]'::JSONB)
    )
    INTO v_result
    FROM counts;

    RETURN COALESCE(v_result, jsonb_build_object(
        'counts', jsonb_build_object(
            'total', 0,
            'unreviewed', 0,
            'revision_requested', 0,
            'reviewed', 0,
            'commented', 0,
            'students', 0
        ),
        'items', '[]'::JSONB
    ));
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_reading_log_overview(UUID, TEXT, UUID, TEXT, INTEGER, INTEGER)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_reading_log_overview(UUID, TEXT, UUID, TEXT, INTEGER, INTEGER)
    TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_teacher_reading_log_student_summary(
    p_class_id UUID,
    p_query TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    IF public.auth_user_role() <> 'ADMIN' AND NOT EXISTS (
        SELECT 1 FROM public.classes class
        WHERE class.id = p_class_id AND class.teacher_id = auth.uid()
    ) THEN
        RAISE EXCEPTION '이 학급의 독서록을 관리할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    WITH logs AS (
        SELECT
            post.student_id,
            post.updated_at,
            CASE
                WHEN review.post_id IS NULL THEN 'unreviewed'
                WHEN review.review_status = 'revision_requested' THEN 'revision_requested'
                WHEN NULLIF(BTRIM(COALESCE(review.teacher_comment, '')), '') IS NOT NULL THEN 'commented'
                ELSE 'reviewed'
            END AS review_group
        FROM public.student_posts post
        JOIN public.students student
          ON student.id = post.student_id
         AND student.class_id = post.class_id
        LEFT JOIN public.reading_log_entries entry
          ON entry.post_id = post.id
         AND entry.class_id = post.class_id
         AND entry.student_id = post.student_id
        LEFT JOIN public.student_library_items library_item
          ON library_item.id = entry.library_item_id
         AND library_item.class_id = entry.class_id
         AND library_item.student_id = entry.student_id
        LEFT JOIN public.book_catalog book ON book.id = library_item.book_id
        LEFT JOIN public.reading_log_teacher_reviews review
          ON review.post_id = post.id
         AND review.class_id = post.class_id
         AND review.student_id = post.student_id
        WHERE post.class_id = p_class_id
          AND post.writing_context = 'self'
          AND post.self_writing_type = 'reading_log'
          AND post.is_submitted IS TRUE
          AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
          AND (
              NULLIF(BTRIM(COALESCE(p_query, '')), '') IS NULL
              OR POSITION(LOWER(BTRIM(p_query)) IN LOWER(COALESCE(student.name, ''))) > 0
              OR POSITION(LOWER(BTRIM(p_query)) IN LOWER(COALESCE(post.title, ''))) > 0
              OR POSITION(LOWER(BTRIM(p_query)) IN LOWER(COALESCE(book.title, ''))) > 0
          )
    ), per_student AS (
        SELECT
            student.id AS student_id,
            student.name AS student_name,
            COUNT(log.student_id)::INTEGER AS total_count,
            COUNT(log.student_id) FILTER (WHERE log.review_group = 'unreviewed')::INTEGER AS unreviewed_count,
            COUNT(log.student_id) FILTER (WHERE log.review_group = 'revision_requested')::INTEGER AS revision_requested_count,
            COUNT(log.student_id) FILTER (WHERE log.review_group = 'reviewed')::INTEGER AS reviewed_count,
            COUNT(log.student_id) FILTER (WHERE log.review_group = 'commented')::INTEGER AS commented_count,
            MAX(log.updated_at) AS last_written_at
        FROM public.students student
        LEFT JOIN logs log ON log.student_id = student.id
        WHERE student.class_id = p_class_id
          AND student.is_active IS DISTINCT FROM FALSE
          AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
        GROUP BY student.id, student.name
        ORDER BY student.name
        LIMIT 100
    )
    SELECT jsonb_build_object(
        'students', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'student_id', per_student.student_id,
                'student_name', per_student.student_name,
                'total_count', per_student.total_count,
                'unreviewed_count', per_student.unreviewed_count,
                'revision_requested_count', per_student.revision_requested_count,
                'reviewed_count', per_student.reviewed_count,
                'commented_count', per_student.commented_count,
                'last_written_at', per_student.last_written_at
            ) ORDER BY per_student.student_name, per_student.student_id)
            FROM per_student
        ), '[]'::JSONB)
    )
    INTO v_result;

    RETURN COALESCE(v_result, jsonb_build_object('students', '[]'::JSONB));
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_reading_log_student_summary(UUID, TEXT)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_reading_log_student_summary(UUID, TEXT)
    TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_teacher_diary_overview(
    p_class_id UUID,
    p_review_filter TEXT DEFAULT 'all',
    p_student_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
    v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    IF public.auth_user_role() <> 'ADMIN' AND NOT EXISTS (
        SELECT 1 FROM public.classes class
        WHERE class.id = p_class_id AND class.teacher_id = auth.uid()
    ) THEN
        RAISE EXCEPTION '이 학급의 일기를 관리할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;
    IF p_review_filter NOT IN ('all', 'unreviewed', 'revision_requested', 'reviewed', 'commented') THEN
        RAISE EXCEPTION '올바르지 않은 검토 필터입니다.' USING ERRCODE = '22023';
    END IF;

    WITH base AS (
        SELECT
            post.id AS post_id,
            post.student_id,
            student.name AS student_name,
            post.title,
            post.char_count,
            post.visibility,
            post.created_at,
            post.structured_content ->> 'diaryDate' AS diary_date,
            CASE WHEN review.post_id IS NULL THEN 'unreviewed' ELSE review.review_status END AS review_status,
            CASE
                WHEN review.post_id IS NULL THEN 'unreviewed'
                WHEN review.review_status = 'revision_requested' THEN 'revision_requested'
                WHEN NULLIF(BTRIM(COALESCE(review.teacher_comment, '')), '') IS NOT NULL THEN 'commented'
                ELSE 'reviewed'
            END AS review_group,
            review.teacher_comment,
            review.reviewed_at
        FROM public.student_posts post
        JOIN public.students student
          ON student.id = post.student_id
         AND student.class_id = post.class_id
        LEFT JOIN public.reading_log_teacher_reviews review
          ON review.post_id = post.id
         AND review.class_id = post.class_id
         AND review.student_id = post.student_id
        WHERE post.class_id = p_class_id
          AND post.writing_context = 'self'
          AND post.self_writing_type = 'diary'
          AND post.is_submitted IS TRUE
          AND (p_student_id IS NULL OR post.student_id = p_student_id)
          AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
    ), counts AS (
        SELECT
            COUNT(*)::INTEGER AS total_count,
            COUNT(*) FILTER (WHERE review_group = 'unreviewed')::INTEGER AS unreviewed_count,
            COUNT(*) FILTER (WHERE review_group = 'revision_requested')::INTEGER AS revision_requested_count,
            COUNT(*) FILTER (WHERE review_group = 'reviewed')::INTEGER AS reviewed_count,
            COUNT(*) FILTER (WHERE review_group = 'commented')::INTEGER AS commented_count,
            COUNT(DISTINCT student_id)::INTEGER AS student_count
        FROM base
    ), filtered AS (
        SELECT *
        FROM base
        WHERE p_review_filter = 'all'
           OR review_group = p_review_filter
    ), page AS (
        SELECT * FROM filtered
        ORDER BY diary_date DESC NULLS LAST, created_at DESC, post_id
        LIMIT v_limit OFFSET v_offset
    )
    SELECT jsonb_build_object(
        'total', (SELECT COUNT(*) FROM filtered),
        'pending_count', counts.unreviewed_count,
        'counts', jsonb_build_object(
            'total', counts.total_count,
            'unreviewed', counts.unreviewed_count,
            'revision_requested', counts.revision_requested_count,
            'reviewed', counts.reviewed_count,
            'commented', counts.commented_count,
            'students', counts.student_count
        ),
        'items', COALESCE((
            SELECT jsonb_agg(to_jsonb(item) ORDER BY item.diary_date DESC NULLS LAST, item.created_at DESC, item.post_id)
            FROM page item
        ), '[]'::JSONB)
    )
    INTO v_result
    FROM counts;

    RETURN COALESCE(v_result, jsonb_build_object(
        'total', 0,
        'pending_count', 0,
        'counts', jsonb_build_object(
            'total', 0,
            'unreviewed', 0,
            'revision_requested', 0,
            'reviewed', 0,
            'commented', 0,
            'students', 0
        ),
        'items', '[]'::JSONB
    ));
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_diary_overview(UUID, TEXT, UUID, INTEGER, INTEGER)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_diary_overview(UUID, TEXT, UUID, INTEGER, INTEGER)
    TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_teacher_diary_student_summary(
    p_class_id UUID,
    p_query TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_query TEXT := NULLIF(BTRIM(COALESCE(p_query, '')), '');
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    IF public.auth_user_role() <> 'ADMIN' AND NOT EXISTS (
        SELECT 1 FROM public.classes class
        WHERE class.id = p_class_id AND class.teacher_id = auth.uid()
    ) THEN
        RAISE EXCEPTION '이 학급의 일기를 관리할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    WITH roster AS (
        SELECT student.id, student.name, student.student_code
        FROM public.students student
        WHERE student.class_id = p_class_id
          AND student.is_active IS DISTINCT FROM FALSE
          AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
          AND (v_query IS NULL OR student.name ILIKE '%' || v_query || '%')
        ORDER BY student.name
        LIMIT 100
    ), diaries AS (
        SELECT
            post.student_id,
            COUNT(*)::INTEGER AS total,
            COUNT(*) FILTER (WHERE review.post_id IS NULL)::INTEGER AS unreviewed,
            COUNT(*) FILTER (WHERE review.review_status = 'revision_requested')::INTEGER AS revision_requested,
            COUNT(*) FILTER (
                WHERE review.post_id IS NOT NULL
                  AND review.review_status <> 'revision_requested'
                  AND NULLIF(BTRIM(COALESCE(review.teacher_comment, '')), '') IS NULL
            )::INTEGER AS reviewed,
            COUNT(*) FILTER (
                WHERE review.post_id IS NOT NULL
                  AND review.review_status <> 'revision_requested'
                  AND NULLIF(BTRIM(COALESCE(review.teacher_comment, '')), '') IS NOT NULL
            )::INTEGER AS commented,
            MAX(post.structured_content ->> 'diaryDate') AS last_diary_date
        FROM public.student_posts post
        JOIN roster ON roster.id = post.student_id
        LEFT JOIN public.reading_log_teacher_reviews review
          ON review.post_id = post.id
         AND review.class_id = post.class_id
         AND review.student_id = post.student_id
        WHERE post.class_id = p_class_id
          AND post.writing_context = 'self'
          AND post.self_writing_type = 'diary'
          AND post.is_submitted IS TRUE
        GROUP BY post.student_id
    )
    SELECT jsonb_build_object(
        'students', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'student_id', roster.id,
                'name', roster.name,
                'student_code', roster.student_code,
                'total', COALESCE(diaries.total, 0),
                'unreviewed', COALESCE(diaries.unreviewed, 0),
                'revision_requested', COALESCE(diaries.revision_requested, 0),
                'reviewed', COALESCE(diaries.reviewed, 0),
                'commented', COALESCE(diaries.commented, 0),
                'last_diary_date', diaries.last_diary_date
            ) ORDER BY roster.name)
            FROM roster
            LEFT JOIN diaries ON diaries.student_id = roster.id
        ), '[]'::JSONB)
    )
    INTO v_result;

    RETURN COALESCE(v_result, jsonb_build_object('students', '[]'::JSONB));
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_diary_student_summary(UUID, TEXT)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_diary_student_summary(UUID, TEXT)
    TO authenticated, service_role;

COMMIT;
