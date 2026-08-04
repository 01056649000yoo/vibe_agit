-- ============================================================================
-- 학급 글쓰기 발자국 학생별 현황 확장
--
-- 기본 표 한 행에서 과제/독서록, 연속 기록, 고쳐쓰기·피드백, 주고받은 교류,
-- 포인트와 최근 30일 변화를 함께 판단할 수 있게 한다.
-- 학급 원본은 각 테이블의 class_id로 직접 제한하고 모든 범위 CTE에 상한을 둔다.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_class_writing_footprint_dashboard(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_today DATE;
    v_year_start DATE;
    v_year_end DATE;
    v_is_admin BOOLEAN := false;
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    v_is_admin := public.auth_user_role() = 'ADMIN';
    IF NOT v_is_admin AND NOT EXISTS (
        SELECT 1
        FROM public.classes c
        WHERE c.id = p_class_id
          AND c.teacher_id = auth.uid()
    ) THEN
        RAISE EXCEPTION '이 학급의 발자국을 볼 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    v_today := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
    v_year_start := make_date(
        CASE WHEN extract(month FROM v_today) >= 3
             THEN extract(year FROM v_today)::INTEGER
             ELSE extract(year FROM v_today)::INTEGER - 1 END,
        3, 1
    );
    v_year_end := (v_year_start + INTERVAL '11 months' - INTERVAL '1 day')::DATE;

    WITH active_roster AS MATERIALIZED (
        SELECT s.id, s.name
        FROM public.students s
        WHERE s.class_id = p_class_id
          AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
        ORDER BY s.name, s.id
        LIMIT 100
    ), year_posts AS MATERIALIZED (
        -- 과제는 교사 승인 글, 독서록은 학생이 저장 완료한 글을 발자국으로 센다.
        SELECT
            p.id, p.student_id, p.mission_id, p.char_count, p.created_at,
            CASE WHEN p.writing_context = 'self' THEN 'reading_log' ELSE 'assignment' END AS post_type
        FROM public.student_posts p
        JOIN active_roster r ON r.id = p.student_id
        WHERE p.class_id = p_class_id
          AND (
            (COALESCE(p.writing_context, 'assignment') = 'assignment' AND p.is_confirmed = true)
            OR (
                p.writing_context = 'self'
                AND p.self_writing_type = 'reading_log'
                AND p.is_submitted = true
            )
          )
          AND (p.created_at AT TIME ZONE 'Asia/Seoul')::DATE BETWEEN v_year_start AND v_year_end
        ORDER BY p.created_at DESC, p.id
        LIMIT 100000
    ), year_points AS MATERIALIZED (
        SELECT l.student_id, l.amount, COALESCE(l.activity_type, 'etc') AS activity_type, l.created_at
        FROM public.point_logs l
        JOIN active_roster r ON r.id = l.student_id
        WHERE l.class_id = p_class_id
          AND (l.created_at AT TIME ZONE 'Asia/Seoul')::DATE BETWEEN v_year_start AND v_year_end
        ORDER BY l.created_at DESC
        LIMIT 100000
    ), year_comments AS MATERIALIZED (
        SELECT c.student_id AS actor_student_id, p.student_id AS owner_student_id, c.post_id, c.created_at
        FROM public.post_comments c
        JOIN active_roster actor ON actor.id = c.student_id
        JOIN public.student_posts p ON p.id = c.post_id AND p.class_id = c.class_id
        JOIN active_roster owner ON owner.id = p.student_id
        WHERE c.class_id = p_class_id
          AND p.class_id = p_class_id
          AND COALESCE(c.status, 'approved') = 'approved'
          AND (c.created_at AT TIME ZONE 'Asia/Seoul')::DATE BETWEEN v_year_start AND v_year_end
        ORDER BY c.created_at DESC, c.id
        LIMIT 100000
    ), year_reactions AS MATERIALIZED (
        SELECT reaction.student_id AS actor_student_id, p.student_id AS owner_student_id, reaction.post_id, reaction.created_at
        FROM public.post_reactions reaction
        JOIN active_roster actor ON actor.id = reaction.student_id
        JOIN public.student_posts p ON p.id = reaction.post_id AND p.class_id = reaction.class_id
        JOIN active_roster owner ON owner.id = p.student_id
        WHERE reaction.class_id = p_class_id
          AND p.class_id = p_class_id
          AND (reaction.created_at AT TIME ZONE 'Asia/Seoul')::DATE BETWEEN v_year_start AND v_year_end
        ORDER BY reaction.created_at DESC, reaction.id
        LIMIT 100000
    ), year_events AS MATERIALIZED (
        SELECT e.student_id, e.event_type, e.post_id, e.occurred_at
        FROM public.writing_activity_events e
        JOIN active_roster r ON r.id = e.student_id
        WHERE e.class_id = p_class_id
          AND e.event_type IN ('post_revised', 'feedback_received')
          AND (e.occurred_at AT TIME ZONE 'Asia/Seoul')::DATE BETWEEN v_year_start AND v_year_end
        ORDER BY e.occurred_at DESC, e.id DESC
        LIMIT 100000
    ), post_by_student AS MATERIALIZED (
        SELECT
            p.student_id,
            count(*)::INTEGER AS posts,
            count(*) FILTER (WHERE p.post_type = 'assignment')::INTEGER AS assignment_posts,
            count(*) FILTER (WHERE p.post_type = 'reading_log')::INTEGER AS reading_logs,
            COALESCE(sum(p.char_count), 0)::BIGINT AS total_chars,
            COALESCE(round(avg(NULLIF(p.char_count, 0)))::INTEGER, 0) AS avg_chars,
            count(DISTINCT (p.created_at AT TIME ZONE 'Asia/Seoul')::DATE)::INTEGER AS active_days,
            max(p.created_at) AS last_post_at
        FROM year_posts p
        GROUP BY p.student_id
    ), writing_days AS MATERIALIZED (
        SELECT DISTINCT
            p.student_id,
            (p.created_at AT TIME ZONE 'Asia/Seoul')::DATE AS active_date
        FROM year_posts p
    ), streak_groups AS MATERIALIZED (
        SELECT
            d.student_id,
            d.active_date,
            d.active_date - (row_number() OVER (
                PARTITION BY d.student_id ORDER BY d.active_date
            ))::INTEGER AS streak_group
        FROM writing_days d
    ), streaks AS MATERIALIZED (
        SELECT student_id, streak_group, count(*)::INTEGER AS length, max(active_date) AS last_day
        FROM streak_groups
        GROUP BY student_id, streak_group
    ), streak_by_student AS MATERIALIZED (
        SELECT
            student_id,
            max(length)::INTEGER AS best_streak,
            COALESCE(max(length) FILTER (WHERE last_day >= v_today - 1), 0)::INTEGER AS current_streak
        FROM streaks
        GROUP BY student_id
    ), comment_by_student AS MATERIALIZED (
        SELECT c.actor_student_id AS student_id, count(*)::INTEGER AS comments_given
        FROM year_comments c
        GROUP BY c.actor_student_id
    ), comment_received_by_student AS MATERIALIZED (
        SELECT
            c.owner_student_id AS student_id,
            count(DISTINCT (c.post_id, c.actor_student_id))
                FILTER (WHERE c.actor_student_id IS DISTINCT FROM c.owner_student_id)::INTEGER AS comments_received
        FROM year_comments c
        GROUP BY c.owner_student_id
    ), reaction_by_student AS MATERIALIZED (
        SELECT reaction.actor_student_id AS student_id, count(*)::INTEGER AS reactions_given
        FROM year_reactions reaction
        GROUP BY reaction.actor_student_id
    ), reaction_received_by_student AS MATERIALIZED (
        SELECT
            reaction.owner_student_id AS student_id,
            count(*) FILTER (
                WHERE reaction.actor_student_id IS DISTINCT FROM reaction.owner_student_id
            )::INTEGER AS reactions_received
        FROM year_reactions reaction
        GROUP BY reaction.owner_student_id
    ), event_by_student AS MATERIALIZED (
        SELECT
            e.student_id,
            count(DISTINCT (e.post_id, (e.occurred_at AT TIME ZONE 'Asia/Seoul')::DATE))
                FILTER (WHERE e.event_type = 'post_revised')::INTEGER AS revisions,
            count(DISTINCT (e.post_id, (e.occurred_at AT TIME ZONE 'Asia/Seoul')::DATE))
                FILTER (WHERE e.event_type = 'feedback_received')::INTEGER AS feedbacks_received
        FROM year_events e
        GROUP BY e.student_id
    ), point_by_student AS MATERIALIZED (
        SELECT
            point.student_id,
            COALESCE(sum(point.amount) FILTER (WHERE point.amount > 0), 0)::INTEGER AS points_earned,
            COALESCE(-sum(point.amount) FILTER (
                WHERE point.amount < 0
                  AND point.activity_type NOT IN ('writing_reward', 'private_adjustment', 'starting_bonus')
            ), 0)::INTEGER AS points_used
        FROM year_points point
        GROUP BY point.student_id
    ), recent_raw AS MATERIALIZED (
        SELECT
            p.student_id,
            count(*) FILTER (
                WHERE (p.created_at AT TIME ZONE 'Asia/Seoul')::DATE >= v_today - 29
            )::INTEGER AS recent_30_posts,
            round(avg(NULLIF(p.char_count, 0)) FILTER (
                WHERE (p.created_at AT TIME ZONE 'Asia/Seoul')::DATE >= v_today - 29
            ))::INTEGER AS recent_30_avg_chars,
            round(avg(NULLIF(p.char_count, 0)) FILTER (
                WHERE (p.created_at AT TIME ZONE 'Asia/Seoul')::DATE BETWEEN v_today - 59 AND v_today - 30
            ))::INTEGER AS previous_30_avg_chars
        FROM year_posts p
        GROUP BY p.student_id
    ), recent_by_student AS MATERIALIZED (
        SELECT
            student_id,
            recent_30_posts,
            COALESCE(recent_30_avg_chars, 0) AS recent_30_avg_chars,
            CASE
                WHEN recent_30_avg_chars IS NULL OR previous_30_avg_chars IS NULL THEN NULL
                ELSE recent_30_avg_chars - previous_30_avg_chars
            END AS avg_chars_change
        FROM recent_raw
    ), student_rows AS MATERIALIZED (
        SELECT
            roster.id AS student_id,
            roster.name,
            COALESCE(post.posts, 0) AS posts,
            COALESCE(post.assignment_posts, 0) AS assignment_posts,
            COALESCE(post.reading_logs, 0) AS reading_logs,
            COALESCE(post.total_chars, 0) AS total_chars,
            COALESCE(post.avg_chars, 0) AS avg_chars,
            COALESCE(post.active_days, 0) AS active_days,
            post.last_post_at,
            COALESCE(streak.current_streak, 0) AS current_streak,
            COALESCE(streak.best_streak, 0) AS best_streak,
            COALESCE(event.revisions, 0) AS revisions,
            COALESCE(event.feedbacks_received, 0) AS feedbacks_received,
            COALESCE(comment.comments_given, 0) AS comments_given,
            COALESCE(comment_received.comments_received, 0) AS comments_received,
            COALESCE(reaction.reactions_given, 0) AS reactions_given,
            COALESCE(reaction_received.reactions_received, 0) AS reactions_received,
            COALESCE(point.points_earned, 0) AS points_earned,
            COALESCE(point.points_used, 0) AS points_used,
            COALESCE(recent.recent_30_posts, 0) AS recent_30_posts,
            COALESCE(recent.recent_30_avg_chars, 0) AS recent_30_avg_chars,
            recent.avg_chars_change
        FROM active_roster roster
        LEFT JOIN post_by_student post ON post.student_id = roster.id
        LEFT JOIN streak_by_student streak ON streak.student_id = roster.id
        LEFT JOIN event_by_student event ON event.student_id = roster.id
        LEFT JOIN comment_by_student comment ON comment.student_id = roster.id
        LEFT JOIN comment_received_by_student comment_received ON comment_received.student_id = roster.id
        LEFT JOIN reaction_by_student reaction ON reaction.student_id = roster.id
        LEFT JOIN reaction_received_by_student reaction_received ON reaction_received.student_id = roster.id
        LEFT JOIN point_by_student point ON point.student_id = roster.id
        LEFT JOIN recent_by_student recent ON recent.student_id = roster.id
    )
    SELECT jsonb_build_object(
        'school_year', jsonb_build_object('start', v_year_start, 'end', v_year_end),
        'totals', jsonb_build_object(
            'total_students', (SELECT count(*)::INTEGER FROM active_roster),
            'active_students', (SELECT count(*)::INTEGER FROM student_rows WHERE posts > 0),
            'total_posts', (SELECT count(*)::INTEGER FROM year_posts),
            'total_chars', COALESCE((SELECT sum(char_count) FROM year_posts), 0),
            'avg_posts_per_student', COALESCE((
                SELECT round(count(*)::NUMERIC / NULLIF((SELECT count(*) FROM active_roster), 0), 1)
                FROM year_posts
            ), 0),
            'avg_chars_per_post', COALESCE((SELECT round(avg(NULLIF(char_count, 0)))::INTEGER FROM year_posts), 0),
            'active_days', COALESCE((SELECT count(DISTINCT (created_at AT TIME ZONE 'Asia/Seoul')::DATE)::INTEGER FROM year_posts), 0),
            'comments', (SELECT count(*)::INTEGER FROM year_comments),
            'reactions', (SELECT count(*)::INTEGER FROM year_reactions),
            'points_earned', COALESCE((SELECT sum(amount) FROM year_points WHERE amount > 0), 0),
            'points_used', COALESCE((
                SELECT -sum(amount)
                FROM year_points
                WHERE amount < 0
                  AND activity_type NOT IN ('writing_reward', 'private_adjustment', 'starting_bonus')
            ), 0)
        ),
        'daily', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('d', day, 'posts', posts) ORDER BY day)
            FROM (
                SELECT (created_at AT TIME ZONE 'Asia/Seoul')::DATE AS day, count(*)::INTEGER AS posts
                FROM year_posts
                GROUP BY 1
            ) daily_rows
        ), '[]'::JSONB),
        'monthly', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'm', month_key,
                'posts', posts,
                'avg_chars', avg_chars,
                'active_students', active_students
            ) ORDER BY month_key)
            FROM (
                SELECT
                    to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') AS month_key,
                    count(*)::INTEGER AS posts,
                    COALESCE(round(avg(NULLIF(char_count, 0)))::INTEGER, 0) AS avg_chars,
                    count(DISTINCT student_id)::INTEGER AS active_students
                FROM year_posts
                GROUP BY 1
            ) monthly_rows
        ), '[]'::JSONB),
        'points_monthly', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('m', month_key, 'earned', earned, 'spent', spent) ORDER BY month_key)
            FROM (
                SELECT
                    to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') AS month_key,
                    COALESCE(sum(amount) FILTER (WHERE amount > 0), 0)::INTEGER AS earned,
                    COALESCE(-sum(amount) FILTER (WHERE amount < 0), 0)::INTEGER AS spent
                FROM year_points
                GROUP BY 1
            ) point_month_rows
        ), '[]'::JSONB),
        'points_by_type', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('type', activity_type, 'total', total) ORDER BY total DESC)
            FROM (
                SELECT activity_type, sum(amount)::INTEGER AS total
                FROM year_points
                WHERE amount > 0
                GROUP BY activity_type
            ) earning_rows
        ), '[]'::JSONB),
        'spending_by_type', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('type', activity_type, 'total', total) ORDER BY total DESC)
            FROM (
                SELECT activity_type, -sum(amount)::INTEGER AS total
                FROM year_points
                WHERE amount < 0
                  AND activity_type NOT IN ('writing_reward', 'private_adjustment', 'starting_bonus')
                GROUP BY activity_type
            ) spending_rows
        ), '[]'::JSONB),
        'students', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'student_id', student_id,
                'name', name,
                'posts', posts,
                'assignment_posts', assignment_posts,
                'reading_logs', reading_logs,
                'total_chars', total_chars,
                'avg_chars', avg_chars,
                'active_days', active_days,
                'last_post_at', last_post_at,
                'current_streak', current_streak,
                'best_streak', best_streak,
                'revisions', revisions,
                'feedbacks_received', feedbacks_received,
                'comments_given', comments_given,
                'comments_received', comments_received,
                'reactions_given', reactions_given,
                'reactions_received', reactions_received,
                'points_earned', points_earned,
                'points_used', points_used,
                'recent_30_posts', recent_30_posts,
                'recent_30_avg_chars', recent_30_avg_chars,
                'avg_chars_change', avg_chars_change
            ) ORDER BY name, student_id)
            FROM student_rows
        ), '[]'::JSONB)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_class_writing_footprint_dashboard(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_class_writing_footprint_dashboard(UUID) TO authenticated, service_role;

COMMIT;
