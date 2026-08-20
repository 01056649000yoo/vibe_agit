-- 독서록·일기 검토 대기함을 같은 일괄 확인 계약으로 처리한다.
-- 교사 동작 한 번은 RPC 한 번/트랜잭션 한 번이며, 개별 확인 함수가 권한·포인트·알림을 다시 검증한다.

BEGIN;

CREATE OR REPLACE FUNCTION public.save_teacher_self_writing_reviews_bulk_v1(
    p_post_ids UUID[],
    p_writing_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_requested_count INTEGER;
    v_found_count INTEGER;
    v_confirmed_count INTEGER := 0;
    v_points_awarded INTEGER := 0;
    v_post_id UUID;
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    IF p_writing_type NOT IN ('reading_log', 'diary') THEN
        RAISE EXCEPTION '일괄 확인할 글 종류가 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT COUNT(DISTINCT requested.post_id)::INTEGER
    INTO v_requested_count
    FROM unnest(COALESCE(p_post_ids, '{}'::UUID[])) AS requested(post_id);
    IF v_requested_count NOT BETWEEN 1 AND 100 THEN
        RAISE EXCEPTION '한 번에 확인할 글은 1~100편이어야 합니다.' USING ERRCODE = '22023';
    END IF;

    SELECT COUNT(*)::INTEGER
    INTO v_found_count
    FROM public.student_posts post
    WHERE post.id = ANY(p_post_ids)
      AND post.writing_context = 'self'
      AND post.self_writing_type = p_writing_type
      AND post.is_submitted IS TRUE;
    IF v_found_count <> v_requested_count THEN
        RAISE EXCEPTION '확인할 수 없거나 종류가 다른 글이 포함되어 있습니다.' USING ERRCODE = 'P0002';
    END IF;

    FOR v_post_id IN
        SELECT DISTINCT requested.post_id
        FROM unnest(p_post_ids) AS requested(post_id)
    LOOP
        v_result := public.save_teacher_self_writing_review_v2(v_post_id, '', 'accepted');
        IF COALESCE((v_result ->> 'changed')::BOOLEAN, FALSE) THEN
            v_confirmed_count := v_confirmed_count + 1;
        END IF;
        v_points_awarded := v_points_awarded
            + COALESCE((v_result ->> 'points_awarded')::INTEGER, 0);
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE,
        'requested_count', v_requested_count,
        'confirmed_count', v_confirmed_count,
        'unchanged_count', v_requested_count - v_confirmed_count,
        'points_awarded', v_points_awarded,
        'reviewed_at', NOW()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.save_teacher_self_writing_reviews_bulk_v1(UUID[], TEXT)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_teacher_self_writing_reviews_bulk_v1(UUID[], TEXT)
    TO authenticated, service_role;

-- 구 버전 독서록 화면도 같은 구현을 타게 해 두어 처리 결과가 갈라지지 않게 한다.
CREATE OR REPLACE FUNCTION public.save_teacher_reading_log_reviews_bulk_v2(p_post_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN public.save_teacher_self_writing_reviews_bulk_v1(p_post_ids, 'reading_log');
END;
$$;

REVOKE ALL ON FUNCTION public.save_teacher_reading_log_reviews_bulk_v2(UUID[])
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_teacher_reading_log_reviews_bulk_v2(UUID[])
    TO authenticated, service_role;

-- 일기에도 독서록과 같은 미확인/확인/전체/작성 학생 통계를 한 목록 RPC에서 돌려준다.
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
    IF p_review_filter NOT IN ('all', 'unreviewed', 'reviewed') THEN
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
            review.review_status,
            review.teacher_comment,
            review.reviewed_at
        FROM public.student_posts post
        JOIN public.students student
          ON student.id = post.student_id
         AND student.class_id = post.class_id
        LEFT JOIN public.reading_log_teacher_reviews review
          ON review.post_id = post.id
         AND review.class_id = post.class_id
        WHERE post.class_id = p_class_id
          AND post.writing_context = 'self'
          AND post.self_writing_type = 'diary'
          AND post.is_submitted IS TRUE
          AND (p_student_id IS NULL OR post.student_id = p_student_id)
          AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
    ), counts AS (
        SELECT
            COUNT(*)::INTEGER AS total_count,
            COUNT(*) FILTER (WHERE review_status IS NULL)::INTEGER AS unreviewed_count,
            COUNT(DISTINCT student_id)::INTEGER AS student_count
        FROM base
    ), filtered AS (
        SELECT * FROM base
        WHERE CASE p_review_filter
            WHEN 'unreviewed' THEN review_status IS NULL
            WHEN 'reviewed' THEN review_status IS NOT NULL
            ELSE TRUE
        END
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
            'reviewed', counts.total_count - counts.unreviewed_count,
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
        'counts', jsonb_build_object('total', 0, 'unreviewed', 0, 'reviewed', 0, 'students', 0),
        'items', '[]'::JSONB
    ));
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_diary_overview(UUID, TEXT, UUID, INTEGER, INTEGER)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_diary_overview(UUID, TEXT, UUID, INTEGER, INTEGER)
    TO authenticated, service_role;

COMMIT;
