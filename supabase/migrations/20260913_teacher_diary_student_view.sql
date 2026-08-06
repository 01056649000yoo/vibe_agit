-- 교사가 학생 일기를 독서록처럼 관리할 수 있게 한다.
--
-- 더한 것: ① 학생별 요약(편수·미확인·최근 일기) ② 목록의 학생 필터 ③ 내보내기의 일기 지원.
-- 내보내기는 새 코드를 만들지 않는다 — `get_teacher_writing_content_export` 는 이미 `writing_types` 로
-- 유형을 검증하므로 일기도 통과한다. 다만 확인 상태·한마디를 `reading_log` 로 못박고 있어 자율 글 전체로 넓히고,
-- 일기는 책 제목 자리에 **날짜**를 담는다(`writing/export/README.md` 의 공용 행 계약 그대로).

BEGIN;

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
        SELECT 1 FROM public.classes c
        WHERE c.id = p_class_id AND c.teacher_id = auth.uid()
    ) THEN
        RAISE EXCEPTION '이 학급의 일기를 관리할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    WITH roster AS (
        SELECT s.id, s.name, s.student_code
        FROM public.students s
        WHERE s.class_id = p_class_id
          AND s.is_active IS DISTINCT FROM false
          AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
          AND (v_query IS NULL OR s.name ILIKE '%' || v_query || '%')
        ORDER BY s.name
        LIMIT 100
    ), diaries AS (
        SELECT
            p.student_id,
            count(*)::INTEGER AS total,
            count(*) FILTER (WHERE review.review_status IS NULL)::INTEGER AS unreviewed,
            max(p.structured_content ->> 'diaryDate') AS last_diary_date
        FROM public.student_posts p
        JOIN roster r ON r.id = p.student_id
        LEFT JOIN public.reading_log_teacher_reviews review
          ON review.post_id = p.id AND review.class_id = p.class_id
        WHERE p.class_id = p_class_id
          AND p.writing_context = 'self'
          AND p.self_writing_type = 'diary'
          AND p.is_submitted = true
        GROUP BY p.student_id
    )
    SELECT jsonb_build_object(
        'students', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'student_id', r.id,
                'name', r.name,
                'student_code', r.student_code,
                'total', COALESCE(d.total, 0),
                'unreviewed', COALESCE(d.unreviewed, 0),
                'last_diary_date', d.last_diary_date
            ) ORDER BY r.name)
            FROM roster r
            LEFT JOIN diaries d ON d.student_id = r.id
        ), '[]'::JSONB)
    )
    INTO v_result;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_diary_student_summary(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_diary_student_summary(UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_teacher_diary_overview(p_class_id uuid, p_review_filter text DEFAULT 'all'::text, p_student_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
    v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    IF public.auth_user_role() <> 'ADMIN' AND NOT EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = p_class_id AND c.teacher_id = auth.uid()
    ) THEN
        RAISE EXCEPTION '이 학급의 일기를 관리할 권한이 없습니다.' USING ERRCODE = '42501';
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
            p.char_count,
            p.visibility,
            p.created_at,
            p.structured_content ->> 'diaryDate' AS diary_date,
            review.review_status,
            review.teacher_comment,
            review.reviewed_at
        FROM public.student_posts p
        JOIN public.students s
          ON s.id = p.student_id
         AND s.class_id = p.class_id
        LEFT JOIN public.reading_log_teacher_reviews review
          ON review.post_id = p.id
         AND review.class_id = p.class_id
        WHERE p.class_id = p_class_id
          AND p.writing_context = 'self'
          AND p.self_writing_type = 'diary'
          AND p.is_submitted = true
          AND (p_student_id IS NULL OR p.student_id = p_student_id)
          AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
    ), filtered AS (
        SELECT * FROM base
        WHERE CASE p_review_filter
            WHEN 'unreviewed' THEN review_status IS NULL
            WHEN 'reviewed' THEN review_status IS NOT NULL
            ELSE true
        END
    )
    SELECT jsonb_build_object(
        'total', (SELECT count(*) FROM filtered),
        'pending_count', (SELECT count(*) FROM base WHERE review_status IS NULL),
        'items', COALESCE((
            SELECT jsonb_agg(to_jsonb(item) ORDER BY item.diary_date DESC NULLS LAST, item.created_at DESC)
            FROM (
                SELECT * FROM filtered
                ORDER BY diary_date DESC NULLS LAST, created_at DESC
                LIMIT v_limit OFFSET v_offset
            ) item
        ), '[]'::JSONB)
    )
    INTO v_result;

    RETURN v_result;
END;
$function$

;

REVOKE ALL ON FUNCTION public.get_teacher_diary_overview(UUID, TEXT, UUID, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_diary_overview(UUID, TEXT, UUID, INTEGER, INTEGER) TO authenticated, service_role;
-- 인자가 하나 늘었다. 옛 4인자 시그니처가 남으면 PostgREST 가 어느 쪽을 부를지 헷갈린다.
DROP FUNCTION IF EXISTS public.get_teacher_diary_overview(UUID, TEXT, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.get_teacher_writing_content_export(p_class_id uuid, p_student_id uuid, p_content_type text, p_limit integer DEFAULT 500)
 RETURNS TABLE(post_id uuid, student_id uuid, student_name text, student_code text, content_type text, content_type_label text, group_title text, post_title text, content text, visibility text, created_at timestamp with time zone, updated_at timestamp with time zone, approved_at timestamp with time zone, source_title text, source_authors text[], review_status text, teacher_comment text, reviewed_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.classes c
        WHERE c.id = p_class_id
          AND c.teacher_id = auth.uid()
    ) AND public.auth_user_role() IS DISTINCT FROM 'ADMIN' THEN
        RAISE EXCEPTION '이 학급의 글을 내보낼 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.students s
        WHERE s.id = p_student_id
          AND s.class_id = p_class_id
          AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
    ) THEN
        RAISE EXCEPTION '이 학급의 학생을 찾을 수 없습니다.' USING ERRCODE = '22023';
    END IF;

    IF p_content_type <> 'assignment' AND NOT EXISTS (
        SELECT 1 FROM public.writing_types wt
        WHERE wt.id = p_content_type AND wt.is_active = true
    ) THEN
        RAISE EXCEPTION '지원하지 않는 글 콘텐츠 유형입니다.' USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        p.student_id,
        s.name,
        s.student_code,
        CASE WHEN p.writing_context = 'assignment' THEN 'assignment' ELSE p.self_writing_type END,
        CASE WHEN p.writing_context = 'assignment' THEN '선생님 과제' ELSE COALESCE(wt.label, p.self_writing_type) END,
        CASE WHEN p.writing_context = 'assignment' THEN m.title ELSE COALESCE(wt.label, p.self_writing_type) END,
        p.title,
        p.content,
        p.visibility,
        p.created_at,
        p.updated_at,
        p.approved_at,
        CASE
            WHEN p.self_writing_type = 'reading_log' THEN COALESCE(b.title, p.structured_content ->> 'bookTitle')
            WHEN p.self_writing_type = 'diary' THEN p.structured_content ->> 'diaryDate'
            ELSE NULL
        END,
        CASE
            WHEN p.self_writing_type = 'reading_log' THEN COALESCE(b.authors, '{}'::TEXT[])
            ELSE '{}'::TEXT[]
        END,
        CASE
            WHEN p.writing_context = 'self' THEN COALESCE(rr.review_status, 'unreviewed')
            WHEN p.is_confirmed IS TRUE THEN 'approved'
            ELSE 'unreviewed'
        END,
        CASE WHEN p.writing_context = 'self' THEN rr.teacher_comment ELSE NULL END,
        CASE WHEN p.self_writing_type = 'reading_log' THEN rr.reviewed_at ELSE NULL END
    FROM public.student_posts p
    JOIN public.students s
      ON s.id = p.student_id
     AND s.class_id = p.class_id
    LEFT JOIN public.writing_missions m
      ON m.id = p.mission_id
     AND m.class_id = p.class_id
    LEFT JOIN public.writing_types wt
      ON wt.id = p.self_writing_type
    LEFT JOIN public.reading_log_entries rle
      ON rle.post_id = p.id
     AND rle.class_id = p.class_id
    LEFT JOIN public.student_library_items li
      ON li.id = rle.library_item_id
     AND li.class_id = p.class_id
    LEFT JOIN public.book_catalog b
      ON b.id = li.book_id
    LEFT JOIN public.reading_log_teacher_reviews rr
      ON rr.post_id = p.id
     AND rr.class_id = p.class_id
    WHERE p.class_id = p_class_id
      AND p.student_id = p_student_id
      AND p.is_submitted IS TRUE
      AND (
          (p_content_type = 'assignment' AND p.writing_context = 'assignment')
          OR
          (p_content_type <> 'assignment'
              AND p.writing_context = 'self'
              AND p.self_writing_type = p_content_type)
      )
    ORDER BY p.created_at DESC, p.id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 500), 1), 2000);
END;
$function$

;

NOTIFY pgrst, 'reload schema';

COMMIT;
