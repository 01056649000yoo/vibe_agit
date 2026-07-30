-- ============================================================================
-- 교사용 학급 글쓰기 발자국
--
-- 학생 발자국의 칭호 제외 영역을 현재 학년도(3월~다음 해 1월) 기준으로 합쳐
-- 요약·달력·월별 추이·포인트 흐름·학생별 현황을 한 번에 반환한다.
-- 모든 활동 테이블은 class_id로 직접 제한하고, 학급이 있는 테이블의 조인에는
-- class_id를 함께 넣는다. 각 범위 CTE에는 명시적인 상한을 둔다.
-- ============================================================================

BEGIN;

CREATE INDEX IF NOT EXISTS idx_point_logs_class_created
    ON public.point_logs (class_id, created_at DESC);

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
        SELECT p.id, p.student_id, p.char_count, p.created_at
        FROM public.student_posts p
        JOIN active_roster r ON r.id = p.student_id
        WHERE p.class_id = p_class_id
          AND p.is_confirmed = true
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
        SELECT c.student_id, c.created_at
        FROM public.post_comments c
        JOIN active_roster r ON r.id = c.student_id
        WHERE c.class_id = p_class_id
          AND COALESCE(c.status, 'approved') = 'approved'
          AND (c.created_at AT TIME ZONE 'Asia/Seoul')::DATE BETWEEN v_year_start AND v_year_end
        ORDER BY c.created_at DESC, c.id
        LIMIT 100000
    ), year_reactions AS MATERIALIZED (
        SELECT reaction.student_id, reaction.created_at
        FROM public.post_reactions reaction
        JOIN active_roster r ON r.id = reaction.student_id
        WHERE reaction.class_id = p_class_id
          AND (reaction.created_at AT TIME ZONE 'Asia/Seoul')::DATE BETWEEN v_year_start AND v_year_end
        ORDER BY reaction.created_at DESC, reaction.id
        LIMIT 100000
    ), post_by_student AS MATERIALIZED (
        SELECT
            p.student_id,
            count(*)::INTEGER AS posts,
            COALESCE(sum(p.char_count), 0)::BIGINT AS total_chars,
            COALESCE(round(avg(NULLIF(p.char_count, 0)))::INTEGER, 0) AS avg_chars,
            count(DISTINCT (p.created_at AT TIME ZONE 'Asia/Seoul')::DATE)::INTEGER AS active_days,
            max(p.created_at) AS last_post_at
        FROM year_posts p
        GROUP BY p.student_id
    ), comment_by_student AS MATERIALIZED (
        SELECT c.student_id, count(*)::INTEGER AS comments_given
        FROM year_comments c
        GROUP BY c.student_id
    ), reaction_by_student AS MATERIALIZED (
        SELECT reaction.student_id, count(*)::INTEGER AS reactions_given
        FROM year_reactions reaction
        GROUP BY reaction.student_id
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
    ), student_rows AS MATERIALIZED (
        SELECT
            roster.id AS student_id,
            roster.name,
            COALESCE(post.posts, 0) AS posts,
            COALESCE(post.total_chars, 0) AS total_chars,
            COALESCE(post.avg_chars, 0) AS avg_chars,
            COALESCE(post.active_days, 0) AS active_days,
            post.last_post_at,
            COALESCE(comment.comments_given, 0) AS comments_given,
            COALESCE(reaction.reactions_given, 0) AS reactions_given,
            COALESCE(point.points_earned, 0) AS points_earned,
            COALESCE(point.points_used, 0) AS points_used
        FROM active_roster roster
        LEFT JOIN post_by_student post ON post.student_id = roster.id
        LEFT JOIN comment_by_student comment ON comment.student_id = roster.id
        LEFT JOIN reaction_by_student reaction ON reaction.student_id = roster.id
        LEFT JOIN point_by_student point ON point.student_id = roster.id
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
                'total_chars', total_chars,
                'avg_chars', avg_chars,
                'active_days', active_days,
                'last_post_at', last_post_at,
                'comments_given', comments_given,
                'reactions_given', reactions_given,
                'points_earned', points_earned,
                'points_used', points_used
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
