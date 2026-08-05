-- 교사가 학생 일기를 확인하고 한마디를 남긴다.
--
-- 리뷰 저장소는 새로 만들지 않는다. `reading_log_teacher_reviews` 는 `post_id` 를 열쇠로 삼고
-- 유형 컬럼이 없어서 자율 글이면 무엇이든 담을 수 있다 — 이름만 독서록처럼 보일 뿐이다.
-- 그래서 저장 함수의 `self_writing_type = 'reading_log'` 제한만 풀어 유형 공용으로 쓴다.
--
-- 목록은 일기 전용으로 새로 둔다. 독서록 목록은 책·책장 조인이 얽혀 있어 그대로 쓰면
-- 일기에 필요 없는 것을 끌고 오기 때문이다.

BEGIN;

-- 자율 글이면 유형을 가리지 않는다. 일기·독서록이 같은 확인 저장소를 쓴다.
CREATE OR REPLACE FUNCTION public.save_teacher_self_writing_review(
    p_post_id UUID,
    p_teacher_comment TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_class_id UUID;
    v_student_id UUID;
    v_comment TEXT := BTRIM(COALESCE(p_teacher_comment, ''));
    v_status TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT p.class_id, p.student_id
    INTO v_class_id, v_student_id
    FROM public.student_posts p
    WHERE p.id = p_post_id
      AND p.writing_context = 'self'
      AND p.self_writing_type IS NOT NULL
      AND p.is_submitted = true;

    IF v_class_id IS NULL THEN
        RAISE EXCEPTION '확인할 학생 글을 찾지 못했습니다.' USING ERRCODE = 'P0002';
    END IF;

    IF public.auth_user_role() <> 'ADMIN' AND NOT EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = v_class_id AND c.teacher_id = auth.uid()
    ) THEN
        RAISE EXCEPTION '이 학급의 학생 글을 확인할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    IF char_length(v_comment) > 500 THEN
        RAISE EXCEPTION '한마디는 500자까지 쓸 수 있어요.' USING ERRCODE = '22023';
    END IF;

    v_status := CASE WHEN v_comment = '' THEN 'checked' ELSE 'commented' END;

    INSERT INTO public.reading_log_teacher_reviews (
        post_id, student_id, class_id, teacher_id, review_status, teacher_comment, reviewed_at
    ) VALUES (
        p_post_id, v_student_id, v_class_id, auth.uid(), v_status, v_comment, NOW()
    )
    ON CONFLICT (post_id) DO UPDATE
    SET teacher_id = EXCLUDED.teacher_id,
        review_status = EXCLUDED.review_status,
        teacher_comment = EXCLUDED.teacher_comment,
        reviewed_at = EXCLUDED.reviewed_at,
        updated_at = NOW();

    RETURN jsonb_build_object('success', true, 'review_status', v_status);
END;
$$;

REVOKE ALL ON FUNCTION public.save_teacher_self_writing_review(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_teacher_self_writing_review(UUID, TEXT) TO authenticated, service_role;

/** 학급의 학생 일기 목록. 미확인이 위로 오고, 확인 상태와 한마디를 함께 준다. */
CREATE OR REPLACE FUNCTION public.get_teacher_diary_overview(
    p_class_id UUID,
    p_review_filter TEXT DEFAULT 'all',
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
$$;

REVOKE ALL ON FUNCTION public.get_teacher_diary_overview(UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_diary_overview(UUID, TEXT, INTEGER, INTEGER) TO authenticated, service_role;

/** 교사가 일기 한 편의 본문을 열어 볼 때. 목록에는 본문을 싣지 않는다. */
CREATE OR REPLACE FUNCTION public.get_teacher_diary_detail(p_post_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_class_id UUID;
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT p.class_id INTO v_class_id
    FROM public.student_posts p
    WHERE p.id = p_post_id
      AND p.writing_context = 'self'
      AND p.self_writing_type = 'diary'
      AND p.is_submitted = true;

    IF v_class_id IS NULL THEN
        RAISE EXCEPTION '일기를 찾지 못했습니다.' USING ERRCODE = 'P0002';
    END IF;

    IF public.auth_user_role() <> 'ADMIN' AND NOT EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = v_class_id AND c.teacher_id = auth.uid()
    ) THEN
        RAISE EXCEPTION '이 학급의 일기를 볼 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT jsonb_build_object(
        'post_id', p.id,
        'student_name', s.name,
        'title', p.title,
        'content', p.content,
        'char_count', p.char_count,
        'visibility', p.visibility,
        'diary_date', p.structured_content ->> 'diaryDate',
        'created_at', p.created_at,
        'review_status', review.review_status,
        'teacher_comment', review.teacher_comment,
        'reviewed_at', review.reviewed_at
    )
    INTO v_result
    FROM public.student_posts p
    JOIN public.students s ON s.id = p.student_id AND s.class_id = p.class_id
    LEFT JOIN public.reading_log_teacher_reviews review
      ON review.post_id = p.id AND review.class_id = p.class_id
    WHERE p.id = p_post_id;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_diary_detail(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_diary_detail(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
