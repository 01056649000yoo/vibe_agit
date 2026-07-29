-- ============================================================================
-- 나의 아지트 독자 칭호 조회 인덱스
--
-- 학생 한 명이 같은 학급에서 남긴 승인 댓글·반응과 자기 글 ID를 최근순 상한 조회한다.
-- 학급 글 조회 기준에 맞춰 각 테이블의 class_id를 선두로 둔다.
-- ============================================================================

BEGIN;

CREATE INDEX IF NOT EXISTS idx_post_comments_class_student_approved_created
    ON public.post_comments (class_id, student_id, created_at DESC)
    WHERE student_id IS NOT NULL AND status = 'approved';

CREATE INDEX IF NOT EXISTS idx_post_reactions_class_student_created
    ON public.post_reactions (class_id, student_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_student_posts_class_student_created
    ON public.student_posts (class_id, student_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_my_reader_title()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID;
    v_result JSONB;
BEGIN
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT s.class_id INTO v_class_id
    FROM public.students s
    WHERE s.id = v_student_id;

    WITH comment_activity AS (
        SELECT
            c.post_id,
            SUM(char_length(translate(
                COALESCE(c.content, ''),
                chr(8203) || chr(8204) || chr(8205) || chr(8288) || chr(65279),
                ''
            )))::INTEGER AS comment_chars
        FROM public.post_comments c
        JOIN public.student_posts p
          ON p.id = c.post_id
         AND p.class_id = c.class_id
        WHERE c.class_id = v_class_id
          AND c.student_id = v_student_id
          AND c.status = 'approved'
          AND p.student_id <> v_student_id
        GROUP BY c.post_id
    ), reaction_activity AS (
        SELECT DISTINCT r.post_id
        FROM public.post_reactions r
        JOIN public.student_posts p
          ON p.id = r.post_id
         AND p.class_id = r.class_id
        WHERE r.class_id = v_class_id
          AND r.student_id = v_student_id
          AND p.student_id <> v_student_id
    ), per_post AS (
        SELECT
            COALESCE(c.post_id, r.post_id) AS post_id,
            COALESCE(c.comment_chars, 0) AS comment_chars
        FROM comment_activity c
        FULL OUTER JOIN reaction_activity r ON r.post_id = c.post_id
    )
    SELECT jsonb_build_object(
        'score', COALESCE(SUM(1 + LEAST(comment_chars / 20, 3)), 0)::INTEGER,
        'post_count', COUNT(*)::INTEGER
    )
    INTO v_result
    FROM per_post;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_reader_title() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_reader_title() TO authenticated, service_role;

COMMIT;
