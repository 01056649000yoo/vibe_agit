-- 교사가 검토 대기 독서록을 최대 100편까지 한 요청으로 확인 완료 처리한다.
-- 이미 확인한 글은 건너뛰어 기존 한마디를 지우지 않는다.

BEGIN;

CREATE OR REPLACE FUNCTION public.save_teacher_reading_log_reviews_bulk(p_post_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_requested_count INTEGER;
    v_found_count INTEGER;
    v_confirmed_count INTEGER;
    v_is_admin BOOLEAN := false;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT COUNT(DISTINCT post_id)::INTEGER
    INTO v_requested_count
    FROM unnest(COALESCE(p_post_ids, '{}'::UUID[])) AS post_id;

    IF v_requested_count NOT BETWEEN 1 AND 100 THEN
        RAISE EXCEPTION '한 번에 확인할 독서록은 1~100편이어야 합니다.' USING ERRCODE = '22023';
    END IF;

    SELECT COUNT(*)::INTEGER
    INTO v_found_count
    FROM public.student_posts post
    WHERE post.id = ANY(p_post_ids)
      AND post.writing_context = 'self'
      AND post.self_writing_type = 'reading_log'
      AND post.is_submitted IS TRUE;

    IF v_found_count <> v_requested_count THEN
        RAISE EXCEPTION '확인할 수 없는 독서록이 포함되어 있습니다.' USING ERRCODE = 'P0002';
    END IF;

    v_is_admin := public.auth_user_role() = 'ADMIN';
    IF NOT v_is_admin AND EXISTS (
        SELECT 1
        FROM public.student_posts post
        LEFT JOIN public.classes class
          ON class.id = post.class_id
         AND class.teacher_id = auth.uid()
        WHERE post.id = ANY(p_post_ids)
          AND class.id IS NULL
    ) THEN
        RAISE EXCEPTION '이 독서록을 확인할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    WITH inserted AS (
        INSERT INTO public.reading_log_teacher_reviews (
            post_id, student_id, class_id, teacher_id,
            review_status, teacher_comment, reviewed_at
        )
        SELECT
            post.id, post.student_id, post.class_id, auth.uid(),
            'checked', '', NOW()
        FROM public.student_posts post
        LEFT JOIN public.reading_log_teacher_reviews review ON review.post_id = post.id
        WHERE post.id = ANY(p_post_ids)
          AND review.post_id IS NULL
        ON CONFLICT (post_id) DO NOTHING
        RETURNING post_id
    )
    SELECT COUNT(*)::INTEGER INTO v_confirmed_count FROM inserted;

    RETURN jsonb_build_object(
        'success', TRUE,
        'requested_count', v_requested_count,
        'confirmed_count', v_confirmed_count,
        'already_reviewed_count', v_requested_count - v_confirmed_count,
        'reviewed_at', NOW()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.save_teacher_reading_log_reviews_bulk(UUID[])
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_teacher_reading_log_reviews_bulk(UUID[])
    TO authenticated, service_role;

COMMIT;
