-- 학급이 있는 테이블끼리 조인할 때 class_id를 조인 조건에도 명시한다.
-- 20260919의 직접 class_id 제한은 유지하면서 학생 명단 CTE에도 학급 키를 보존한다.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_teacher_dragon_growth_dashboard(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_class_created_at TIMESTAMPTZ;
    v_legacy_started_at TIMESTAMPTZ;
    v_season_id UUID;
    v_season_number INTEGER;
    v_season_name TEXT;
    v_season_started_at TIMESTAMPTZ;
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT c.created_at, c.season_started_at
    INTO v_class_created_at, v_legacy_started_at
    FROM public.classes c
    WHERE c.id = p_class_id
      AND (
          public.auth_user_role() = 'ADMIN'
          OR c.teacher_id = auth.uid()
      );

    IF NOT FOUND THEN
        RAISE EXCEPTION '이 학급의 수호룡 현황을 볼 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT season.id, season.season_number, season.name, season.started_at
    INTO v_season_id, v_season_number, v_season_name, v_season_started_at
    FROM public.dragon_growth_seasons season
    WHERE season.class_id = p_class_id
      AND season.ended_at IS NULL
    ORDER BY season.started_at DESC
    LIMIT 1;

    IF v_season_id IS NULL THEN
        SELECT COALESCE(MAX(season.season_number), 0) + 1
        INTO v_season_number
        FROM public.dragon_growth_seasons season
        WHERE season.class_id = p_class_id;

        v_season_name := v_season_number::TEXT || '번째 시즌';
        v_season_started_at := COALESCE(v_legacy_started_at, v_class_created_at, NOW());
    END IF;

    WITH active_roster AS MATERIALIZED (
        SELECT
            s.id,
            s.class_id,
            s.name,
            COALESCE(s.pet_data, '{}'::JSONB) AS pet_data,
            title_override.writer_level AS writer_level_override,
            title_override.reader_level AS reader_level_override
        FROM public.students s
        LEFT JOIN public.student_title_test_overrides title_override
          ON title_override.student_id = s.id
         AND title_override.class_id = s.class_id
        WHERE s.class_id = p_class_id
          AND s.is_active IS DISTINCT FROM false
          AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
        ORDER BY s.name, s.id
        LIMIT 100
    ), completed_posts AS MATERIALIZED (
        SELECT
            p.id,
            p.student_id,
            p.mission_id,
            COALESCE(p.char_count, 0)::INTEGER AS char_count,
            p.created_at,
            CASE
                WHEN COALESCE(p.writing_context, 'assignment') = 'self'
                    THEN COALESCE(p.published_at, p.updated_at, p.created_at)
                ELSE COALESCE(p.approved_at, p.updated_at, p.created_at)
            END AS completed_at
        FROM public.student_posts p
        JOIN active_roster roster
          ON roster.id = p.student_id
         AND roster.class_id = p.class_id
        WHERE p.class_id = p_class_id
          AND public.writing_counts_as_completed(p.writing_context, p.is_confirmed, p.is_submitted)
        ORDER BY p.created_at DESC, p.id
        LIMIT 100000
    ), level_posts AS MATERIALIZED (
        -- 작가 칭호와 똑같이 과제는 미션별 최신 한 편, 자율 글은 각 글을 센다.
        SELECT DISTINCT ON (
            p.student_id,
            COALESCE('mission:' || p.mission_id::TEXT, 'post:' || p.id::TEXT)
        )
            p.id,
            p.student_id,
            p.char_count,
            p.completed_at,
            p.created_at
        FROM completed_posts p
        ORDER BY
            p.student_id,
            COALESCE('mission:' || p.mission_id::TEXT, 'post:' || p.id::TEXT),
            p.created_at DESC
    ), writer_stats AS MATERIALIZED (
        SELECT
            p.student_id,
            COALESCE(SUM(p.char_count), 0)::BIGINT AS total_chars,
            COUNT(*)::BIGINT AS completed_posts,
            MAX(p.completed_at) AS latest_completed_at
        FROM level_posts p
        GROUP BY p.student_id
    ), season_stats AS MATERIALIZED (
        SELECT
            p.student_id,
            COUNT(*)::INTEGER AS season_posts,
            COALESCE(SUM(p.char_count), 0)::BIGINT AS season_chars
        FROM level_posts p
        WHERE p.completed_at >= v_season_started_at
        GROUP BY p.student_id
    ), comment_rows AS MATERIALIZED (
        SELECT c.student_id, c.post_id, c.content
        FROM public.post_comments c
        JOIN active_roster actor
          ON actor.id = c.student_id
         AND actor.class_id = c.class_id
        JOIN public.student_posts post
          ON post.id = c.post_id
         AND post.class_id = c.class_id
        WHERE c.class_id = p_class_id
          AND c.status = 'approved'
          AND post.student_id <> c.student_id
        ORDER BY c.created_at DESC, c.id
        LIMIT 100000
    ), comment_activity AS MATERIALIZED (
        SELECT
            c.student_id,
            c.post_id,
            SUM(char_length(translate(
                COALESCE(c.content, ''),
                chr(8203) || chr(8204) || chr(8205) || chr(8288) || chr(65279),
                ''
            )))::BIGINT AS comment_chars
        FROM comment_rows c
        GROUP BY c.student_id, c.post_id
    ), reaction_activity AS MATERIALIZED (
        SELECT DISTINCT reaction.student_id, reaction.post_id
        FROM (
            SELECT r.student_id, r.post_id
            FROM public.post_reactions r
            JOIN active_roster actor
              ON actor.id = r.student_id
             AND actor.class_id = r.class_id
            JOIN public.student_posts post
              ON post.id = r.post_id
             AND post.class_id = r.class_id
            WHERE r.class_id = p_class_id
              AND post.student_id <> r.student_id
            ORDER BY r.created_at DESC, r.id
            LIMIT 100000
        ) reaction
    ), reader_per_post AS MATERIALIZED (
        SELECT
            COALESCE(comment.student_id, reaction.student_id) AS student_id,
            COALESCE(comment.post_id, reaction.post_id) AS post_id,
            COALESCE(comment.comment_chars, 0)::BIGINT AS comment_chars
        FROM comment_activity comment
        FULL OUTER JOIN reaction_activity reaction
          ON reaction.student_id = comment.student_id
         AND reaction.post_id = comment.post_id
    ), reader_stats AS MATERIALIZED (
        SELECT
            activity.student_id,
            COUNT(*)::INTEGER AS post_count,
            SUM(1 + LEAST(activity.comment_chars / 20, 3))::BIGINT AS score
        FROM reader_per_post activity
        GROUP BY activity.student_id
    ), student_rows AS MATERIALIZED (
        SELECT
            roster.id AS student_id,
            roster.name,
            roster.pet_data,
            roster.writer_level_override,
            roster.reader_level_override,
            COALESCE(writer.total_chars, 0)::BIGINT AS writer_total_chars,
            COALESCE(writer.completed_posts, 0)::BIGINT AS writer_completed_posts,
            COALESCE(reader.score, 0)::BIGINT AS reader_score,
            COALESCE(reader.post_count, 0)::INTEGER AS reader_post_count,
            COALESCE(current_season.season_posts, 0)::INTEGER AS season_posts,
            COALESCE(current_season.season_chars, 0)::BIGINT AS season_chars,
            writer.latest_completed_at
        FROM active_roster roster
        LEFT JOIN writer_stats writer ON writer.student_id = roster.id
        LEFT JOIN reader_stats reader ON reader.student_id = roster.id
        LEFT JOIN season_stats current_season ON current_season.student_id = roster.id
        ORDER BY roster.name, roster.id
    ), history_rows AS MATERIALIZED (
        SELECT season.id, season.season_number, season.name, season.started_at,
               season.ended_at, season.snapshot
        FROM public.dragon_growth_seasons season
        WHERE season.class_id = p_class_id
          AND season.ended_at IS NOT NULL
        ORDER BY season.ended_at DESC
        LIMIT 20
    )
    SELECT jsonb_build_object(
        'generated_at', NOW(),
        'season', jsonb_build_object(
            'id', v_season_id,
            'number', v_season_number,
            'name', v_season_name,
            'started_at', v_season_started_at
        ),
        'students', COALESCE((
            SELECT jsonb_agg(to_jsonb(student) ORDER BY student.name, student.student_id)
            FROM student_rows student
        ), '[]'::JSONB),
        'history', COALESCE((
            SELECT jsonb_agg(to_jsonb(history) ORDER BY history.ended_at DESC)
            FROM history_rows history
        ), '[]'::JSONB)
    )
    INTO v_result;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_dragon_growth_dashboard(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_dragon_growth_dashboard(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

