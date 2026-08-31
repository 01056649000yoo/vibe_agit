-- 학급 글쓰기 발자국 정확성·활용 지표 보완
--   1) 과제는 생성일이 아니라 실제 승인일에 완료된 것으로 센다.
--   2) 자기 글 댓글·반응은 친구 교류에서 제외하고 남김/받음 모두 실제 이벤트 수로 맞춘다.
--   3) 학급 활동일·글 유형 합계와 활동/교사 조정 포인트를 한 RPC에서 함께 반환한다.
--   4) 맞춤법 통계를 다른 배열과 같은 최상위 응답 경로에 둔다.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_student_posts_class_completed_at
ON public.student_posts (
    class_id,
    (CASE
        WHEN COALESCE(writing_context, 'assignment') = 'assignment'
            THEN COALESCE(approved_at, updated_at, created_at)
        ELSE created_at
    END) DESC,
    id
);

CREATE OR REPLACE FUNCTION public.get_class_writing_footprint_dashboard_core_v1(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_today DATE;
    v_year_start DATE;
    v_year_end DATE;
    v_is_admin BOOLEAN := FALSE;
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    v_is_admin := public.auth_user_role() = 'ADMIN';
    IF NOT v_is_admin AND NOT EXISTS (
        SELECT 1
        FROM public.classes class
        WHERE class.id = p_class_id
          AND class.teacher_id = auth.uid()
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
        SELECT student.id, student.name
        FROM public.students student
        WHERE student.class_id = p_class_id
          AND student.is_active IS DISTINCT FROM FALSE
          AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
        ORDER BY student.name, student.id
        LIMIT 100
    ), year_posts AS MATERIALIZED (
        SELECT
            post.id,
            post.student_id,
            post.mission_id,
            post.char_count,
            CASE
                WHEN COALESCE(post.writing_context, 'assignment') = 'assignment'
                    THEN COALESCE(post.approved_at, post.updated_at, post.created_at)
                ELSE post.created_at
            END AS completed_at,
            CASE
                WHEN post.writing_context = 'self'
                    THEN COALESCE(post.self_writing_type, 'free')
                ELSE 'assignment'
            END AS post_type
        FROM public.student_posts post
        JOIN active_roster roster ON roster.id = post.student_id
        WHERE post.class_id = p_class_id
          AND public.writing_counts_as_completed(
              post.writing_context, post.is_confirmed, post.is_submitted
          )
          AND (
              CASE
                  WHEN COALESCE(post.writing_context, 'assignment') = 'assignment'
                      THEN COALESCE(post.approved_at, post.updated_at, post.created_at)
                  ELSE post.created_at
              END AT TIME ZONE 'Asia/Seoul'
          )::DATE BETWEEN v_year_start AND v_year_end
        ORDER BY completed_at DESC, post.id
        LIMIT 100000
    ), year_points AS MATERIALIZED (
        SELECT
            log.student_id,
            log.amount,
            COALESCE(log.activity_type, 'etc') AS activity_type,
            log.created_at
        FROM public.point_logs log
        JOIN active_roster roster ON roster.id = log.student_id
        WHERE log.class_id = p_class_id
          AND (log.created_at AT TIME ZONE 'Asia/Seoul')::DATE BETWEEN v_year_start AND v_year_end
        ORDER BY log.created_at DESC, log.id DESC
        LIMIT 100000
    ), year_comments AS MATERIALIZED (
        SELECT
            comment.student_id AS actor_student_id,
            post.student_id AS owner_student_id,
            comment.post_id,
            comment.created_at
        FROM public.post_comments comment
        JOIN active_roster actor ON actor.id = comment.student_id
        JOIN public.student_posts post
          ON post.id = comment.post_id
         AND post.class_id = comment.class_id
        JOIN active_roster owner ON owner.id = post.student_id
        WHERE comment.class_id = p_class_id
          AND post.class_id = p_class_id
          AND comment.student_id IS DISTINCT FROM post.student_id
          AND COALESCE(comment.status, 'approved') = 'approved'
          AND (comment.created_at AT TIME ZONE 'Asia/Seoul')::DATE BETWEEN v_year_start AND v_year_end
        ORDER BY comment.created_at DESC, comment.id
        LIMIT 100000
    ), year_reactions AS MATERIALIZED (
        SELECT
            reaction.student_id AS actor_student_id,
            post.student_id AS owner_student_id,
            reaction.post_id,
            reaction.created_at
        FROM public.post_reactions reaction
        JOIN active_roster actor ON actor.id = reaction.student_id
        JOIN public.student_posts post
          ON post.id = reaction.post_id
         AND post.class_id = reaction.class_id
        JOIN active_roster owner ON owner.id = post.student_id
        WHERE reaction.class_id = p_class_id
          AND post.class_id = p_class_id
          AND reaction.student_id IS DISTINCT FROM post.student_id
          AND (reaction.created_at AT TIME ZONE 'Asia/Seoul')::DATE BETWEEN v_year_start AND v_year_end
        ORDER BY reaction.created_at DESC, reaction.id
        LIMIT 100000
    ), year_events AS MATERIALIZED (
        SELECT event.student_id, event.event_type, event.post_id, event.occurred_at
        FROM public.writing_activity_events event
        JOIN active_roster roster ON roster.id = event.student_id
        WHERE event.class_id = p_class_id
          AND event.event_type IN ('post_revised', 'feedback_received')
          AND (event.occurred_at AT TIME ZONE 'Asia/Seoul')::DATE BETWEEN v_year_start AND v_year_end
        ORDER BY event.occurred_at DESC, event.id DESC
        LIMIT 100000
    ), post_by_student AS MATERIALIZED (
        SELECT
            post.student_id,
            count(*)::INTEGER AS posts,
            count(*) FILTER (WHERE post.post_type = 'assignment')::INTEGER AS assignment_posts,
            count(*) FILTER (WHERE post.post_type = 'reading_log')::INTEGER AS reading_logs,
            count(*) FILTER (WHERE post.post_type = 'diary')::INTEGER AS diaries,
            COALESCE(sum(post.char_count), 0)::BIGINT AS total_chars,
            COALESCE(round(avg(NULLIF(post.char_count, 0)))::INTEGER, 0) AS avg_chars,
            count(DISTINCT (post.completed_at AT TIME ZONE 'Asia/Seoul')::DATE)::INTEGER AS active_days,
            max(post.completed_at) AS last_post_at
        FROM year_posts post
        GROUP BY post.student_id
    ), writing_days AS MATERIALIZED (
        SELECT DISTINCT
            post.student_id,
            (post.completed_at AT TIME ZONE 'Asia/Seoul')::DATE AS active_date
        FROM year_posts post
    ), streak_groups AS MATERIALIZED (
        SELECT
            day.student_id,
            day.active_date,
            day.active_date - (row_number() OVER (
                PARTITION BY day.student_id ORDER BY day.active_date
            ))::INTEGER AS streak_group
        FROM writing_days day
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
        SELECT comment.actor_student_id AS student_id, count(*)::INTEGER AS comments_given
        FROM year_comments comment
        GROUP BY comment.actor_student_id
    ), comment_received_by_student AS MATERIALIZED (
        SELECT comment.owner_student_id AS student_id, count(*)::INTEGER AS comments_received
        FROM year_comments comment
        GROUP BY comment.owner_student_id
    ), reaction_by_student AS MATERIALIZED (
        SELECT reaction.actor_student_id AS student_id, count(*)::INTEGER AS reactions_given
        FROM year_reactions reaction
        GROUP BY reaction.actor_student_id
    ), reaction_received_by_student AS MATERIALIZED (
        SELECT reaction.owner_student_id AS student_id, count(*)::INTEGER AS reactions_received
        FROM year_reactions reaction
        GROUP BY reaction.owner_student_id
    ), event_by_student AS MATERIALIZED (
        SELECT
            event.student_id,
            count(DISTINCT (event.post_id, (event.occurred_at AT TIME ZONE 'Asia/Seoul')::DATE))
                FILTER (WHERE event.event_type = 'post_revised')::INTEGER AS revisions,
            count(*) FILTER (WHERE event.event_type = 'feedback_received')::INTEGER AS feedbacks_received
        FROM year_events event
        GROUP BY event.student_id
    ), point_by_student AS MATERIALIZED (
        SELECT
            point.student_id,
            COALESCE(sum(point.amount) FILTER (WHERE point.amount > 0), 0)::INTEGER AS points_earned,
            COALESCE(sum(point.amount) FILTER (
                WHERE point.amount > 0
                  AND point.activity_type NOT IN ('private_adjustment', 'starting_bonus')
            ), 0)::INTEGER AS activity_points_earned,
            COALESCE(sum(point.amount) FILTER (
                WHERE point.activity_type = 'private_adjustment'
            ), 0)::INTEGER AS teacher_adjustment_points,
            COALESCE(sum(point.amount) FILTER (
                WHERE point.amount > 0 AND point.activity_type = 'starting_bonus'
            ), 0)::INTEGER AS starting_bonus_points,
            COALESCE(-sum(point.amount) FILTER (
                WHERE point.amount < 0
                  AND point.activity_type NOT IN ('writing_reward', 'private_adjustment', 'starting_bonus')
            ), 0)::INTEGER AS points_used
        FROM year_points point
        GROUP BY point.student_id
    ), recent_raw AS MATERIALIZED (
        SELECT
            post.student_id,
            count(*) FILTER (
                WHERE (post.completed_at AT TIME ZONE 'Asia/Seoul')::DATE >= v_today - 29
            )::INTEGER AS recent_30_posts,
            round(avg(NULLIF(post.char_count, 0)) FILTER (
                WHERE (post.completed_at AT TIME ZONE 'Asia/Seoul')::DATE >= v_today - 29
            ))::INTEGER AS recent_30_avg_chars,
            round(avg(NULLIF(post.char_count, 0)) FILTER (
                WHERE (post.completed_at AT TIME ZONE 'Asia/Seoul')::DATE BETWEEN v_today - 59 AND v_today - 30
            ))::INTEGER AS previous_30_avg_chars
        FROM year_posts post
        GROUP BY post.student_id
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
            COALESCE(post.diaries, 0) AS diaries,
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
            COALESCE(point.activity_points_earned, 0) AS activity_points_earned,
            COALESCE(point.teacher_adjustment_points, 0) AS teacher_adjustment_points,
            COALESCE(point.starting_bonus_points, 0) AS starting_bonus_points,
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
            'assignment_posts', (SELECT count(*)::INTEGER FROM year_posts WHERE post_type = 'assignment'),
            'reading_logs', (SELECT count(*)::INTEGER FROM year_posts WHERE post_type = 'reading_log'),
            'diaries', (SELECT count(*)::INTEGER FROM year_posts WHERE post_type = 'diary'),
            'total_chars', COALESCE((SELECT sum(char_count) FROM year_posts), 0),
            'avg_posts_per_student', COALESCE((
                SELECT round(count(*)::NUMERIC / NULLIF((SELECT count(*) FROM active_roster), 0), 1)
                FROM year_posts
            ), 0),
            'avg_chars_per_post', COALESCE((
                SELECT round(avg(NULLIF(char_count, 0)))::INTEGER FROM year_posts
            ), 0),
            'active_days', COALESCE((
                SELECT count(DISTINCT (completed_at AT TIME ZONE 'Asia/Seoul')::DATE)::INTEGER
                FROM year_posts
            ), 0),
            'comments', (SELECT count(*)::INTEGER FROM year_comments),
            'reactions', (SELECT count(*)::INTEGER FROM year_reactions),
            'points_earned', COALESCE((SELECT sum(amount) FROM year_points WHERE amount > 0), 0),
            'activity_points_earned', COALESCE((
                SELECT sum(amount)
                FROM year_points
                WHERE amount > 0 AND activity_type NOT IN ('private_adjustment', 'starting_bonus')
            ), 0),
            'teacher_adjustment_points', COALESCE((
                SELECT sum(amount) FROM year_points WHERE activity_type = 'private_adjustment'
            ), 0),
            'starting_bonus_points', COALESCE((
                SELECT sum(amount)
                FROM year_points
                WHERE amount > 0 AND activity_type = 'starting_bonus'
            ), 0),
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
                SELECT
                    (completed_at AT TIME ZONE 'Asia/Seoul')::DATE AS day,
                    count(*)::INTEGER AS posts
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
                    to_char(completed_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') AS month_key,
                    count(*)::INTEGER AS posts,
                    COALESCE(round(avg(NULLIF(char_count, 0)))::INTEGER, 0) AS avg_chars,
                    count(DISTINCT student_id)::INTEGER AS active_students
                FROM year_posts
                GROUP BY 1
            ) monthly_rows
        ), '[]'::JSONB),
        'points_monthly', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object('m', month_key, 'earned', earned, 'spent', spent)
                ORDER BY month_key
            )
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
            SELECT jsonb_agg(
                jsonb_build_object('type', activity_type, 'total', total)
                ORDER BY total DESC
            )
            FROM (
                SELECT activity_type, sum(amount)::INTEGER AS total
                FROM year_points
                WHERE amount > 0
                  AND activity_type NOT IN ('private_adjustment', 'starting_bonus')
                GROUP BY activity_type
            ) earning_rows
        ), '[]'::JSONB),
        'spending_by_type', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object('type', activity_type, 'total', total)
                ORDER BY total DESC
            )
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
                'diaries', diaries,
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
                'activity_points_earned', activity_points_earned,
                'teacher_adjustment_points', teacher_adjustment_points,
                'starting_bonus_points', starting_bonus_points,
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

REVOKE ALL ON FUNCTION public.get_class_writing_footprint_dashboard_core_v1(UUID)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_class_writing_footprint_dashboard_core_v1(UUID)
TO service_role;

COMMENT ON FUNCTION public.get_class_writing_footprint_dashboard_core_v1(UUID) IS
    '담당 학급의 완료 시각 기반 글쓰기·친구 교류·포인트 발자국을 집계하는 비공개 코어 함수.';

CREATE OR REPLACE FUNCTION public.get_class_writing_footprint_dashboard(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_base JSONB;
    v_labels JSONB;
    v_students JSONB;
    v_year_start DATE;
    v_year_end DATE;
BEGIN
    v_base := public.get_class_writing_footprint_dashboard_core_v1(p_class_id);
    v_year_start := (v_base #>> '{school_year,start}')::DATE;
    v_year_end := (v_base #>> '{school_year,end}')::DATE;

    WITH student_rows AS MATERIALIZED (
        SELECT
            item.value AS student,
            item.ordinality AS sort_order,
            (item.value->>'student_id')::UUID AS student_id
        FROM jsonb_array_elements(COALESCE(v_base->'students', '[]'::JSONB))
            WITH ORDINALITY AS item(value, ordinality)
    ), rewrite_counts AS MATERIALIZED (
        SELECT event.student_id, count(*)::INTEGER AS total
        FROM public.student_notification_events event
        WHERE event.class_id = p_class_id
          AND event.event_type = 'writing.rewrite_requested'
          AND event.created_at >= v_year_start::TIMESTAMP AT TIME ZONE 'Asia/Seoul'
          AND event.created_at < (v_year_end + 1)::TIMESTAMP AT TIME ZONE 'Asia/Seoul'
          AND EXISTS (
              SELECT 1 FROM student_rows student
              WHERE student.student_id = event.student_id
          )
        GROUP BY event.student_id
    ), revision_submission_counts AS MATERIALIZED (
        SELECT event.student_id, count(*)::INTEGER AS total
        FROM public.writing_activity_events event
        WHERE event.class_id = p_class_id
          AND event.event_type = 'post_resubmitted'
          AND event.metadata->>'writing_context' = 'assignment'
          AND event.occurred_at >= v_year_start::TIMESTAMP AT TIME ZONE 'Asia/Seoul'
          AND event.occurred_at < (v_year_end + 1)::TIMESTAMP AT TIME ZONE 'Asia/Seoul'
          AND EXISTS (
              SELECT 1 FROM student_rows student
              WHERE student.student_id = event.student_id
          )
        GROUP BY event.student_id
    )
    SELECT COALESCE(jsonb_agg(
        student.student || jsonb_build_object(
            'rewrite_requests', COALESCE(rewrite.total, 0),
            'revision_submissions', COALESCE(submission.total, 0)
        ) ORDER BY student.sort_order
    ), '[]'::JSONB)
    INTO v_students
    FROM student_rows student
    LEFT JOIN rewrite_counts rewrite ON rewrite.student_id = student.student_id
    LEFT JOIN revision_submission_counts submission ON submission.student_id = student.student_id;

    v_base := jsonb_set(v_base, '{students}', v_students, TRUE);

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object('type', row.label, 'total', row.total)
        ORDER BY row.total DESC, row.label
    ), '[]'::JSONB)
    INTO v_labels
    FROM (
        SELECT max(stats.label) AS label, sum(stats.search_count)::INTEGER AS total
        FROM public.class_spelling_daily_stats stats
        WHERE stats.class_id = p_class_id
          AND stats.event_date >= CURRENT_DATE - 30
        GROUP BY stats.label
        ORDER BY total DESC, label
        LIMIT 10
    ) row;

    RETURN jsonb_set(v_base, '{spelling_labels}', v_labels, TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.get_class_writing_footprint_dashboard(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_class_writing_footprint_dashboard(UUID)
TO authenticated, service_role;

COMMENT ON FUNCTION public.get_class_writing_footprint_dashboard(UUID) IS
    '담당 학급의 완료 시각 기반 글쓰기·학습·맞춤법·친구 교류·포인트 발자국을 반환한다.';

NOTIFY pgrst, 'reload schema';

COMMIT;
