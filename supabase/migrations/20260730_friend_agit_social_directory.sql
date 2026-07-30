-- 친구 아지트 목록에 필요한 이름·작가/독자 칭호만 한 번에 돌려준다.
-- 친구별 RPC를 반복하지 않고, 인증 학생과 같은 학급의 활성 학생만 집계한다.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_student_hideout_directory()
RETURNS TABLE (
    id UUID,
    name TEXT,
    pet_data JSONB,
    writer_total_chars BIGINT,
    writer_completed_posts BIGINT,
    reader_score BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_class_id UUID := public.auth_user_class_id();
    v_student_id UUID := public.auth_student_id();
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_class_id IS NULL OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH active_classmates AS MATERIALIZED (
        SELECT s.id, s.name, s.pet_data
        FROM public.students s
        WHERE s.class_id = v_class_id
          AND s.id <> v_student_id
          AND s.is_active IS DISTINCT FROM false
          AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
        ORDER BY s.name
        LIMIT 100
    ), confirmed_posts AS MATERIALIZED (
        SELECT p.id, p.student_id, p.mission_id, p.char_count, p.created_at
        FROM public.student_posts p
        JOIN active_classmates classmate ON classmate.id = p.student_id
        WHERE p.class_id = v_class_id
          AND p.is_confirmed = true
    ), level_posts AS (
        SELECT DISTINCT ON (
            p.student_id,
            COALESCE('mission:' || p.mission_id::TEXT, 'post:' || p.id::TEXT)
        )
            p.student_id,
            p.char_count
        FROM confirmed_posts p
        ORDER BY
            p.student_id,
            COALESCE('mission:' || p.mission_id::TEXT, 'post:' || p.id::TEXT),
            p.created_at DESC
    ), writer_stats AS (
        SELECT
            p.student_id,
            COALESCE(SUM(p.char_count), 0)::BIGINT AS total_chars,
            COUNT(*)::BIGINT AS completed_posts
        FROM level_posts p
        GROUP BY p.student_id
    ), comment_activity AS (
        SELECT
            c.student_id,
            c.post_id,
            SUM(char_length(translate(
                COALESCE(c.content, ''),
                chr(8203) || chr(8204) || chr(8205) || chr(8288) || chr(65279),
                ''
            )))::BIGINT AS comment_chars
        FROM public.post_comments c
        JOIN active_classmates classmate ON classmate.id = c.student_id
        JOIN public.student_posts p
          ON p.id = c.post_id
         AND p.class_id = c.class_id
        WHERE c.class_id = v_class_id
          AND c.status = 'approved'
          AND p.student_id <> c.student_id
        GROUP BY c.student_id, c.post_id
    ), reaction_activity AS (
        SELECT DISTINCT r.student_id, r.post_id
        FROM public.post_reactions r
        JOIN active_classmates classmate ON classmate.id = r.student_id
        JOIN public.student_posts p
          ON p.id = r.post_id
         AND p.class_id = r.class_id
        WHERE r.class_id = v_class_id
          AND p.student_id <> r.student_id
    ), reader_per_post AS (
        SELECT
            COALESCE(c.student_id, r.student_id) AS student_id,
            COALESCE(c.post_id, r.post_id) AS post_id,
            COALESCE(c.comment_chars, 0)::BIGINT AS comment_chars
        FROM comment_activity c
        FULL OUTER JOIN reaction_activity r
          ON r.student_id = c.student_id
         AND r.post_id = c.post_id
    ), reader_stats AS (
        SELECT
            activity.student_id,
            SUM(1 + LEAST(activity.comment_chars / 20, 3))::BIGINT AS score
        FROM reader_per_post activity
        GROUP BY activity.student_id
    )
    SELECT
        classmate.id,
        classmate.name,
        classmate.pet_data,
        COALESCE(writer.total_chars, 0)::BIGINT,
        COALESCE(writer.completed_posts, 0)::BIGINT,
        COALESCE(reader.score, 0)::BIGINT
    FROM active_classmates classmate
    LEFT JOIN writer_stats writer ON writer.student_id = classmate.id
    LEFT JOIN reader_stats reader ON reader.student_id = classmate.id
    ORDER BY classmate.name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_hideout_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_hideout_directory() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
