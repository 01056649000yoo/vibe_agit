-- ============================================================================
-- 교사용 학생 독서록 관리
--
-- 학생 글 원문과 공개 설정은 그대로 두고, 교사의 확인 여부와 한마디만 별도
-- 저장한다. 목록 RPC는 요약만 반환하며 글 본문은 기존 RLS로 선택 시 조회한다.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.reading_log_teacher_reviews (
    post_id UUID PRIMARY KEY REFERENCES public.student_posts(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    review_status TEXT NOT NULL DEFAULT 'checked'
        CHECK (review_status IN ('checked', 'commented')),
    teacher_comment TEXT NOT NULL DEFAULT ''
        CHECK (char_length(teacher_comment) <= 500),
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT reading_log_review_comment_shape CHECK (
        (review_status = 'checked' AND teacher_comment = '')
        OR (review_status = 'commented' AND btrim(teacher_comment) <> '')
    )
);

CREATE INDEX IF NOT EXISTS idx_reading_log_reviews_class_status
    ON public.reading_log_teacher_reviews (class_id, review_status, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_reading_log_reviews_student
    ON public.reading_log_teacher_reviews (student_id, reviewed_at DESC);

ALTER TABLE public.reading_log_teacher_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reading_Log_Teacher_Review_Read_V1"
    ON public.reading_log_teacher_reviews;
CREATE POLICY "Reading_Log_Teacher_Review_Read_V1"
ON public.reading_log_teacher_reviews
FOR SELECT TO authenticated
USING (
    public.auth_user_role() = 'ADMIN'
    OR student_id = public.auth_student_id()
    OR EXISTS (
        SELECT 1
        FROM public.classes c
        WHERE c.id = reading_log_teacher_reviews.class_id
          AND c.teacher_id = auth.uid()
    )
);

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
        LEFT JOIN public.reading_log_teacher_reviews rr ON rr.post_id = p.id
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

CREATE OR REPLACE FUNCTION public.save_teacher_reading_log_review(
    p_post_id UUID,
    p_teacher_comment TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID;
    v_class_id UUID;
    v_comment TEXT;
    v_status TEXT;
    v_is_admin BOOLEAN := false;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT p.student_id, p.class_id
    INTO v_student_id, v_class_id
    FROM public.student_posts p
    WHERE p.id = p_post_id
      AND p.writing_context = 'self'
      AND p.self_writing_type = 'reading_log'
      AND p.is_submitted = true;

    IF v_student_id IS NULL THEN
        RAISE EXCEPTION '확인할 독서록을 찾을 수 없습니다.' USING ERRCODE = 'P0002';
    END IF;

    v_is_admin := public.auth_user_role() = 'ADMIN';
    IF NOT v_is_admin AND NOT EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = v_class_id AND c.teacher_id = auth.uid()
    ) THEN
        RAISE EXCEPTION '이 독서록을 확인할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    v_comment := left(btrim(COALESCE(p_teacher_comment, '')), 500);
    v_status := CASE WHEN v_comment = '' THEN 'checked' ELSE 'commented' END;

    INSERT INTO public.reading_log_teacher_reviews (
        post_id, student_id, class_id, teacher_id,
        review_status, teacher_comment, reviewed_at
    ) VALUES (
        p_post_id, v_student_id, v_class_id, auth.uid(),
        v_status, v_comment, NOW()
    )
    ON CONFLICT (post_id) DO UPDATE
    SET student_id = EXCLUDED.student_id,
        class_id = EXCLUDED.class_id,
        teacher_id = EXCLUDED.teacher_id,
        review_status = EXCLUDED.review_status,
        teacher_comment = EXCLUDED.teacher_comment,
        reviewed_at = NOW(),
        updated_at = NOW();

    RETURN jsonb_build_object(
        'success', true,
        'post_id', p_post_id,
        'review_status', v_status,
        'teacher_comment', v_comment,
        'reviewed_at', NOW()
    );
END;
$$;

REVOKE ALL ON TABLE public.reading_log_teacher_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.reading_log_teacher_reviews TO authenticated;
GRANT ALL ON TABLE public.reading_log_teacher_reviews TO service_role;

REVOKE ALL ON FUNCTION public.get_teacher_reading_log_overview(UUID, TEXT, UUID, TEXT, INTEGER, INTEGER)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_reading_log_overview(UUID, TEXT, UUID, TEXT, INTEGER, INTEGER)
    TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.save_teacher_reading_log_review(UUID, TEXT)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_teacher_reading_log_review(UUID, TEXT)
    TO authenticated, service_role;

COMMIT;
