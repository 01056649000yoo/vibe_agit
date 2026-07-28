-- ============================================================================
-- 독서록 RPC: 확인 기록 조인을 학급 안으로 좁힌다
--
-- 두 RPC 모두 확인 기록을 `LEFT JOIN reading_log_teacher_reviews rr
-- ON rr.post_id = p.id` 로만 붙였다. 조인 조건에 학급이 없으니 계획기가 한 학급
-- 몫을 고를 방법이 없어, 확인 기록이 쌓이면 **전 학급의 기록을 통째로 Seq Scan**
-- 해서 해시로 만든 뒤 붙였다. 한 학급의 미확인 26편을 보려고 7만 7천 건을 읽는 꼴.
--
-- reading_log_teacher_reviews 에는 class_id 와
-- idx_reading_log_reviews_class_status (class_id, review_status, reviewed_at DESC)
-- 가 이미 있다. 조인 조건에 class_id 를 더하면 그 인덱스를 쓸 수 있다.
--
-- 의미는 그대로다: 확인 기록은 저장할 때 그 글의 class_id 를 그대로 넣으므로
-- (save_teacher_reading_log_review 참조) rr.class_id = 글의 class_id 는 항상 참이다.
-- 계획기에게 "이 조인은 학급 안에서만 일어난다"고 알려 주는 것뿐이다.
--
-- 15만 행(독서록 8만, 확인 기록 7.7만, 한 학급 748편) 사본에서 측정:
--   전  8~16ms · reading_log_teacher_reviews 전체 Seq Scan(77,664행)
--   후  2.5~3.5ms · 학급 인덱스 사용(722행)
-- ============================================================================

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
    v_is_admin BOOLEAN := false;
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    v_is_admin := public.auth_user_role() = 'ADMIN';
    IF NOT v_is_admin AND NOT EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = p_class_id AND c.teacher_id = auth.uid()
    ) THEN
        RAISE EXCEPTION '이 학급의 독서록을 관리할 권한이 없습니다.'
            USING ERRCODE = '42501';
    END IF;

    IF p_review_filter NOT IN ('all', 'unreviewed', 'reviewed') THEN
        RAISE EXCEPTION '올바르지 않은 검토 필터입니다.' USING ERRCODE = '22023';
    END IF;

    WITH base AS (
        SELECT
            p.id AS post_id,
            p.student_id,
            s.name AS student_name,
            p.title,
            p.visibility,
            p.updated_at,
            b.title AS book_title,
            COALESCE(b.authors, '{}'::TEXT[]) AS book_authors,
            CASE WHEN rr.post_id IS NULL THEN 'unreviewed' ELSE rr.review_status END AS review_status,
            rr.reviewed_at
        FROM public.student_posts p
        JOIN public.students s ON s.id = p.student_id
        LEFT JOIN public.reading_log_entries re ON re.post_id = p.id
        LEFT JOIN public.student_library_items li ON li.id = re.library_item_id
        LEFT JOIN public.book_catalog b ON b.id = li.book_id
        LEFT JOIN public.reading_log_teacher_reviews rr
               ON rr.post_id = p.id
              AND rr.class_id = p_class_id
        WHERE p.class_id = p_class_id
          AND p.writing_context = 'self'
          AND p.self_writing_type = 'reading_log'
          AND p.is_submitted = true
          AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
          AND (p_student_id IS NULL OR p.student_id = p_student_id)
          AND (
              NULLIF(btrim(COALESCE(p_query, '')), '') IS NULL
              OR position(lower(btrim(p_query)) IN lower(COALESCE(s.name, ''))) > 0
              OR position(lower(btrim(p_query)) IN lower(COALESCE(p.title, ''))) > 0
              OR position(lower(btrim(p_query)) IN lower(COALESCE(b.title, ''))) > 0
          )
    ), counts AS (
        SELECT
            count(*)::INTEGER AS total_count,
            count(*) FILTER (WHERE review_status = 'unreviewed')::INTEGER AS unreviewed_count,
            count(DISTINCT student_id)::INTEGER AS student_count
        FROM base
    ), page AS (
        SELECT *
        FROM base
        WHERE p_review_filter = 'all'
           OR (p_review_filter = 'unreviewed' AND review_status = 'unreviewed')
           OR (p_review_filter = 'reviewed' AND review_status <> 'unreviewed')
        ORDER BY updated_at DESC, post_id
        LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
        OFFSET GREATEST(COALESCE(p_offset, 0), 0)
    )
    SELECT jsonb_build_object(
        'counts', jsonb_build_object(
            'total', counts.total_count,
            'unreviewed', counts.unreviewed_count,
            'reviewed', counts.total_count - counts.unreviewed_count,
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
                    'reviewed_at', page.reviewed_at
                ) ORDER BY page.updated_at DESC, page.post_id
            )
            FROM page
        ), '[]'::JSONB)
    )
    INTO v_result
    FROM counts;

    RETURN COALESCE(v_result, jsonb_build_object(
        'counts', jsonb_build_object('total', 0, 'unreviewed', 0, 'reviewed', 0, 'students', 0),
        'items', '[]'::JSONB
    ));
END;
$$;

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
    v_is_admin BOOLEAN := false;
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    v_is_admin := public.auth_user_role() = 'ADMIN';
    IF NOT v_is_admin AND NOT EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = p_class_id AND c.teacher_id = auth.uid()
    ) THEN
        RAISE EXCEPTION '이 학급의 독서록을 관리할 권한이 없습니다.'
            USING ERRCODE = '42501';
    END IF;

    WITH logs AS (
        SELECT
            p.student_id,
            p.updated_at,
            CASE WHEN rr.post_id IS NULL THEN 'unreviewed' ELSE rr.review_status END AS review_status
        FROM public.student_posts p
        JOIN public.students s ON s.id = p.student_id
        LEFT JOIN public.reading_log_entries re ON re.post_id = p.id
        LEFT JOIN public.student_library_items li ON li.id = re.library_item_id
        LEFT JOIN public.book_catalog b ON b.id = li.book_id
        LEFT JOIN public.reading_log_teacher_reviews rr
               ON rr.post_id = p.id
              AND rr.class_id = p_class_id
        WHERE p.class_id = p_class_id
          AND p.writing_context = 'self'
          AND p.self_writing_type = 'reading_log'
          AND p.is_submitted = true
          AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
          AND (
              NULLIF(btrim(COALESCE(p_query, '')), '') IS NULL
              OR position(lower(btrim(p_query)) IN lower(COALESCE(s.name, ''))) > 0
              OR position(lower(btrim(p_query)) IN lower(COALESCE(p.title, ''))) > 0
              OR position(lower(btrim(p_query)) IN lower(COALESCE(b.title, ''))) > 0
          )
    ), per_student AS (
        SELECT
            s.id AS student_id,
            s.name AS student_name,
            count(l.student_id)::INTEGER AS total_count,
            count(l.student_id) FILTER (WHERE l.review_status = 'unreviewed')::INTEGER
                AS unreviewed_count,
            max(l.updated_at) AS last_written_at
        FROM public.students s
        LEFT JOIN logs l ON l.student_id = s.id
        WHERE s.class_id = p_class_id
          AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
        GROUP BY s.id, s.name
    )
    SELECT jsonb_build_object(
        'students', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'student_id', per_student.student_id,
                    'student_name', per_student.student_name,
                    'total_count', per_student.total_count,
                    'unreviewed_count', per_student.unreviewed_count,
                    'reviewed_count', per_student.total_count - per_student.unreviewed_count,
                    'last_written_at', per_student.last_written_at
                ) ORDER BY per_student.student_name, per_student.student_id
            )
            FROM per_student
        ), '[]'::JSONB)
    )
    INTO v_result;

    RETURN COALESCE(v_result, jsonb_build_object('students', '[]'::JSONB));
END;
$$;

COMMIT;
