-- ============================================================================
-- 독서록 RPC: reading_log_entries 조인도 학급 안으로 좁힌다 (+ 학급 인덱스)
--
-- 2026-07-28 에 확인 기록(reading_log_teacher_reviews) 조인은 고쳤으나,
-- 책 정보를 잇는 reading_log_entries 조인은 "인덱스가 없어 오히려 나빠질 수 있다"고
-- 보고 측정 후로 미뤄 뒀다. 이번에 측정했고, **예상과 반대로 크게 좋아진다**.
--
-- 원인은 base CTE 다. counts 와 page 가 함께 참조해 CTE 가 materialize 되므로
-- 책 조인이 페이지 50편이 아니라 **그 학급 독서록 전체**에 대해 수행된다.
-- 조인 조건에 학급이 없으면 계획기가 전 학급 항목을 Seq Scan 해서 해시로 만든다.
--
-- 측정 (독서록 8만 · 항목 8만 · 한 학급 748편 사본, 3회):
--   지금            reading_log_entries Seq Scan 80,000행 · 6.9~15.6ms
--   학급 조인만     748행               · 3.3~5.3ms
--   조인 + 인덱스   Bitmap Index Scan    · 1.8~2.3ms   ← 채택
--
-- 의미는 그대로다: reading_log_entries.class_id 는 글의 class_id 와 같게 저장된다.
-- WORKLOG "학급 글 조회 기준" ②·③ 적용.
--
-- CREATE INDEX CONCURRENTLY 는 트랜잭션 안에서 못 쓰므로 인덱스를 먼저 만들고,
-- 함수 교체만 트랜잭션으로 묶는다.
-- ============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reading_log_entries_class
    ON public.reading_log_entries (class_id);

BEGIN;

CREATE OR REPLACE FUNCTION public.get_teacher_reading_log_overview(p_class_id uuid, p_review_filter text DEFAULT 'all'::text, p_student_id uuid DEFAULT NULL::uuid, p_query text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        LEFT JOIN public.reading_log_entries re
               ON re.post_id = p.id AND re.class_id = p_class_id
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
$function$
;
CREATE OR REPLACE FUNCTION public.get_teacher_reading_log_student_summary(p_class_id uuid, p_query text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        LEFT JOIN public.reading_log_entries re
               ON re.post_id = p.id AND re.class_id = p_class_id
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
$function$;

COMMIT;
