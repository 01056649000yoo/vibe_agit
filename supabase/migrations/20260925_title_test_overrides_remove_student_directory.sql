-- QA용 칭호 고정값을 친구 아지트의 학생용 목록에서도 제거한다.
-- 교사용 get_teacher_dragon_growth_dashboard()만 override 테이블을 읽는다.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_student_hideout_directory()
RETURNS TABLE(id UUID, name TEXT, pet_data JSONB, writer_total_chars BIGINT, writer_completed_posts BIGINT, reader_score BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_class_id UUID := public.auth_user_class_id();
    v_student_id UUID := public.auth_student_id();
    v_class_started_at TIMESTAMPTZ;
    v_season public.dragon_growth_seasons%ROWTYPE;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_class_id IS NULL OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(c.season_started_at, c.created_at) INTO v_class_started_at
    FROM public.classes c WHERE c.id = v_class_id;

    SELECT season.* INTO v_season FROM public.dragon_growth_seasons season
    WHERE season.class_id = v_class_id
    ORDER BY (season.status IN ('active', 'closing')) DESC, season.season_number DESC LIMIT 1;

    RETURN QUERY
    WITH active_classmates AS MATERIALIZED (
        SELECT s.id, s.class_id, s.name, COALESCE(s.pet_data, '{}'::JSONB) AS stored_pet_data
        FROM public.students s
        WHERE s.class_id = v_class_id AND s.id <> v_student_id
          AND s.is_active IS DISTINCT FROM false
          AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
        ORDER BY s.name LIMIT 100
    ), completed_posts AS MATERIALIZED (
        SELECT p.id, p.student_id, p.mission_id, COALESCE(p.char_count, 0)::INTEGER AS char_count,
               p.created_at,
               CASE WHEN COALESCE(p.writing_context, 'assignment') = 'self'
                    THEN COALESCE(p.published_at, p.updated_at, p.created_at)
                    ELSE COALESCE(p.approved_at, p.updated_at, p.created_at) END AS completed_at
        FROM public.student_posts p
        JOIN active_classmates classmate ON classmate.id = p.student_id AND classmate.class_id = p.class_id
        WHERE p.class_id = v_class_id
          AND public.writing_counts_as_completed(p.writing_context, p.is_confirmed, p.is_submitted)
    ), level_posts AS (
        SELECT DISTINCT ON (p.student_id, COALESCE('mission:' || p.mission_id::TEXT, 'post:' || p.id::TEXT))
               p.student_id, p.char_count
        FROM completed_posts p
        WHERE p.completed_at >= COALESCE(v_season.started_at, v_class_started_at, NOW())
          AND (v_season.closing_started_at IS NULL OR p.completed_at <= v_season.closing_started_at)
        ORDER BY p.student_id, COALESCE('mission:' || p.mission_id::TEXT, 'post:' || p.id::TEXT), p.created_at DESC
    ), writer_stats AS (
        SELECT p.student_id, COALESCE(SUM(p.char_count), 0)::BIGINT AS total_chars, COUNT(*)::BIGINT AS completed_posts
        FROM level_posts p GROUP BY p.student_id
    ), comment_activity AS (
        SELECT c.student_id, c.post_id,
               SUM(char_length(translate(COALESCE(c.content, ''),
                   chr(8203) || chr(8204) || chr(8205) || chr(8288) || chr(65279), '')))::BIGINT AS comment_chars
        FROM public.post_comments c
        JOIN active_classmates classmate ON classmate.id = c.student_id AND classmate.class_id = c.class_id
        JOIN public.student_posts post ON post.id = c.post_id AND post.class_id = c.class_id
        WHERE c.class_id = v_class_id AND c.status = 'approved' AND post.student_id <> c.student_id
          AND c.created_at >= COALESCE(v_season.started_at, v_class_started_at, NOW())
          AND (v_season.closing_started_at IS NULL OR c.created_at <= v_season.closing_started_at)
        GROUP BY c.student_id, c.post_id
    ), reaction_activity AS (
        SELECT DISTINCT r.student_id, r.post_id
        FROM public.post_reactions r
        JOIN active_classmates classmate ON classmate.id = r.student_id AND classmate.class_id = r.class_id
        JOIN public.student_posts post ON post.id = r.post_id AND post.class_id = r.class_id
        WHERE r.class_id = v_class_id AND post.student_id <> r.student_id
          AND r.created_at >= COALESCE(v_season.started_at, v_class_started_at, NOW())
          AND (v_season.closing_started_at IS NULL OR r.created_at <= v_season.closing_started_at)
    ), reader_per_post AS (
        SELECT COALESCE(comment.student_id, reaction.student_id) AS student_id,
               COALESCE(comment.post_id, reaction.post_id) AS post_id,
               COALESCE(comment.comment_chars, 0)::BIGINT AS comment_chars
        FROM comment_activity comment
        FULL OUTER JOIN reaction_activity reaction
          ON reaction.student_id = comment.student_id AND reaction.post_id = comment.post_id
    ), reader_stats AS (
        SELECT activity.student_id, SUM(1 + LEAST(activity.comment_chars / 20, 3))::BIGINT AS score
        FROM reader_per_post activity GROUP BY activity.student_id
    ), live_rows AS (
        SELECT classmate.id, classmate.name, classmate.stored_pet_data AS pet_data,
               COALESCE(writer.total_chars, 0)::BIGINT AS writer_total_chars,
               COALESCE(writer.completed_posts, 0)::BIGINT AS writer_completed_posts,
               COALESCE(reader.score, 0)::BIGINT AS reader_score
        FROM active_classmates classmate
        LEFT JOIN writer_stats writer ON writer.student_id = classmate.id
        LEFT JOIN reader_stats reader ON reader.student_id = classmate.id
    ), frozen_rows AS (
        SELECT classmate.id, classmate.name,
               COALESCE(record.snapshot -> 'pet_data', classmate.stored_pet_data) AS pet_data,
               COALESCE((record.snapshot ->> 'writer_total_chars')::BIGINT, 0) AS writer_total_chars,
               COALESCE((record.snapshot ->> 'writer_completed_posts')::BIGINT, 0) AS writer_completed_posts,
               COALESCE((record.snapshot ->> 'reader_score')::BIGINT, 0) AS reader_score
        FROM active_classmates classmate
        LEFT JOIN public.dragon_season_students record
          ON record.class_id = classmate.class_id AND record.student_id = classmate.id AND record.season_id = v_season.id
    )
    SELECT live.id, live.name, live.pet_data, live.writer_total_chars, live.writer_completed_posts, live.reader_score
    FROM live_rows live WHERE COALESCE(v_season.status, 'active') = 'active'
    UNION ALL
    SELECT frozen.id, frozen.name, frozen.pet_data, frozen.writer_total_chars, frozen.writer_completed_posts, frozen.reader_score
    FROM frozen_rows frozen WHERE v_season.status IN ('closing', 'closed')
    ORDER BY 2;
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_hideout_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_hideout_directory() TO authenticated, service_role;

COMMENT ON FUNCTION public.get_student_hideout_directory() IS
    '같은 학급 친구의 실제 학기 칭호·수호룡 목록. QA 칭호 오버라이드는 노출하지 않는다.';

COMMIT;
