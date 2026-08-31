-- 학생 글쓰기 발자국을 학생이 이해할 수 있는 성장 기록으로 보완한다.
--   1) 과제는 생성일이 아니라 승인일을 완료 시각으로 사용한다.
--   2) 과제·독서록·일기·그 밖의 자율 글 편수를 분리한다.
--   3) 이번 학년도 다시쓰기 요청·수정 제출·교사 피드백과 최근 30일 변화를 함께 반환한다.
--   4) 활동 포인트와 시작 보너스·교사 조정을 분리한다.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_writing_footprint_detail()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID;
    v_today DATE;
    v_year_start DATE;
    v_year_end DATE;
    v_result JSONB;
BEGIN
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT student.class_id
    INTO v_class_id
    FROM public.students student
    WHERE student.id = v_student_id
      AND student.auth_id = auth.uid()
      AND student.is_active IS DISTINCT FROM FALSE
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW());

    IF v_class_id IS NULL THEN
        RAISE EXCEPTION '활성 학생 계정을 확인할 수 없습니다.' USING ERRCODE = '42501';
    END IF;

    v_today := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
    v_year_start := make_date(
        CASE WHEN extract(month FROM v_today) >= 3
             THEN extract(year FROM v_today)::INTEGER
             ELSE extract(year FROM v_today)::INTEGER - 1 END,
        3, 1
    );
    v_year_end := (v_year_start + INTERVAL '11 months' - INTERVAL '1 day')::DATE;

    WITH my_posts AS MATERIALIZED (
        SELECT
            post.id,
            post.mission_id,
            post.char_count,
            COALESCE(post.writing_context, 'assignment') AS writing_context,
            post.self_writing_type,
            CASE
                WHEN COALESCE(post.writing_context, 'assignment') = 'assignment'
                    THEN COALESCE(post.approved_at, post.updated_at, post.created_at)
                ELSE post.created_at
            END AS completed_at
        FROM public.student_posts post
        WHERE post.class_id = v_class_id
          AND post.student_id = v_student_id
          AND public.writing_counts_as_completed(
              post.writing_context, post.is_confirmed, post.is_submitted
          )
    ), level_posts AS MATERIALIZED (
        -- 작가 칭호와 같은 기준: 과제는 미션별 최신 한 편, 자율 글은 각 글 한 편.
        SELECT DISTINCT ON (
            COALESCE('mission:' || mission_id::TEXT, 'post:' || id::TEXT)
        )
            id,
            mission_id,
            char_count,
            writing_context,
            self_writing_type,
            completed_at
        FROM my_posts
        ORDER BY
            COALESCE('mission:' || mission_id::TEXT, 'post:' || id::TEXT),
            completed_at DESC,
            id DESC
    ), my_points AS MATERIALIZED (
        SELECT log.amount, COALESCE(log.activity_type, 'etc') AS activity_type, log.created_at
        FROM public.point_logs log
        WHERE log.class_id = v_class_id
          AND log.student_id = v_student_id
    ), my_sharing AS MATERIALIZED (
        SELECT
            (SELECT count(*)
             FROM public.post_comments comment
             JOIN public.student_posts post
               ON post.id = comment.post_id
              AND post.class_id = comment.class_id
             WHERE comment.class_id = v_class_id
               AND post.student_id = v_student_id
               AND comment.student_id IS DISTINCT FROM v_student_id
               AND COALESCE(comment.status, 'approved') = 'approved')::INTEGER AS comments_received,
            (SELECT count(*)
             FROM public.post_comments comment
             JOIN public.student_posts post
               ON post.id = comment.post_id
              AND post.class_id = comment.class_id
             WHERE comment.class_id = v_class_id
               AND comment.student_id = v_student_id
               AND post.student_id IS DISTINCT FROM v_student_id
               AND COALESCE(comment.status, 'approved') = 'approved')::INTEGER AS comments_given,
            (SELECT count(*)
             FROM public.post_reactions reaction
             JOIN public.student_posts post
               ON post.id = reaction.post_id
              AND post.class_id = reaction.class_id
             WHERE reaction.class_id = v_class_id
               AND post.student_id = v_student_id
               AND reaction.student_id IS DISTINCT FROM v_student_id)::INTEGER AS reactions_received,
            (SELECT count(*)
             FROM public.post_reactions reaction
             JOIN public.student_posts post
               ON post.id = reaction.post_id
              AND post.class_id = reaction.class_id
             WHERE reaction.class_id = v_class_id
               AND reaction.student_id = v_student_id
               AND post.student_id IS DISTINCT FROM v_student_id)::INTEGER AS reactions_given
    ), active_days AS MATERIALIZED (
        SELECT DISTINCT (completed_at AT TIME ZONE 'Asia/Seoul')::DATE AS day
        FROM level_posts
    ), streak_groups AS MATERIALIZED (
        SELECT day, day - (row_number() OVER (ORDER BY day))::INTEGER AS streak_group
        FROM active_days
    ), streaks AS MATERIALIZED (
        SELECT streak_group, count(*)::INTEGER AS length, max(day) AS last_day
        FROM streak_groups
        GROUP BY streak_group
    ), learning AS MATERIALIZED (
        SELECT
            (SELECT count(*)::INTEGER
             FROM public.student_notification_events event
             WHERE event.class_id = v_class_id
               AND event.student_id = v_student_id
               AND event.event_type = 'writing.rewrite_requested'
               AND event.created_at >= v_year_start::TIMESTAMP AT TIME ZONE 'Asia/Seoul'
               AND event.created_at < (v_year_end + 1)::TIMESTAMP AT TIME ZONE 'Asia/Seoul') AS rewrite_requests,
            (SELECT count(*)::INTEGER
             FROM public.writing_activity_events event
             WHERE event.class_id = v_class_id
               AND event.student_id = v_student_id
               AND event.event_type = 'post_resubmitted'
               AND event.metadata->>'writing_context' = 'assignment'
               AND event.occurred_at >= v_year_start::TIMESTAMP AT TIME ZONE 'Asia/Seoul'
               AND event.occurred_at < (v_year_end + 1)::TIMESTAMP AT TIME ZONE 'Asia/Seoul') AS revision_submissions,
            (SELECT count(*)::INTEGER
             FROM public.writing_activity_events event
             WHERE event.class_id = v_class_id
               AND event.student_id = v_student_id
               AND event.event_type = 'feedback_received'
               AND event.occurred_at >= v_year_start::TIMESTAMP AT TIME ZONE 'Asia/Seoul'
               AND event.occurred_at < (v_year_end + 1)::TIMESTAMP AT TIME ZONE 'Asia/Seoul') AS feedbacks_received
    ), recent AS MATERIALIZED (
        SELECT
            count(*) FILTER (
                WHERE (completed_at AT TIME ZONE 'Asia/Seoul')::DATE >= v_today - 29
            )::INTEGER AS recent_30_posts,
            COALESCE(round(avg(NULLIF(char_count, 0)) FILTER (
                WHERE (completed_at AT TIME ZONE 'Asia/Seoul')::DATE >= v_today - 29
            ))::INTEGER, 0) AS recent_30_avg_chars,
            round(avg(NULLIF(char_count, 0)) FILTER (
                WHERE (completed_at AT TIME ZONE 'Asia/Seoul')::DATE BETWEEN v_today - 59 AND v_today - 30
            ))::INTEGER AS previous_30_avg_chars
        FROM level_posts
    )
    SELECT jsonb_build_object(
        'totals', jsonb_build_object(
            'total_chars', COALESCE((SELECT sum(char_count) FROM level_posts), 0),
            'completed_posts', COALESCE((SELECT count(*) FROM level_posts), 0),
            'completed_missions', COALESCE((
                SELECT count(DISTINCT mission_id) FROM level_posts WHERE mission_id IS NOT NULL
            ), 0),
            'monthly_posts', COALESCE((
                SELECT count(*) FROM level_posts
                WHERE (completed_at AT TIME ZONE 'Asia/Seoul')::DATE
                    >= date_trunc('month', v_today)::DATE
            ), 0),
            'longest_post_chars', COALESCE((SELECT max(char_count) FROM level_posts), 0),
            'active_days', COALESCE((SELECT count(*) FROM active_days), 0),
            'best_streak', COALESCE((SELECT max(length) FROM streaks), 0),
            'current_streak', COALESCE((
                SELECT length FROM streaks
                WHERE last_day >= v_today - 1
                ORDER BY last_day DESC
                LIMIT 1
            ), 0),
            'total_points', COALESCE((SELECT sum(amount) FROM my_points), 0),
            'points_earned', COALESCE((SELECT sum(amount) FROM my_points WHERE amount > 0), 0),
            'points_spent', COALESCE((SELECT -sum(amount) FROM my_points WHERE amount < 0), 0),
            'activity_points_earned', COALESCE((
                SELECT sum(amount) FROM my_points
                WHERE amount > 0 AND activity_type NOT IN ('private_adjustment', 'starting_bonus')
            ), 0),
            'teacher_adjustment_points', COALESCE((
                SELECT sum(amount) FROM my_points WHERE activity_type = 'private_adjustment'
            ), 0),
            'starting_bonus_points', COALESCE((
                SELECT sum(amount) FROM my_points
                WHERE amount > 0 AND activity_type = 'starting_bonus'
            ), 0)
        ),
        'writing_types', jsonb_build_object(
            'assignment_posts', COALESCE((
                SELECT count(*) FROM level_posts WHERE writing_context = 'assignment'
            ), 0),
            'reading_logs', COALESCE((
                SELECT count(*) FROM level_posts
                WHERE writing_context = 'self' AND self_writing_type = 'reading_log'
            ), 0),
            'diaries', COALESCE((
                SELECT count(*) FROM level_posts
                WHERE writing_context = 'self' AND self_writing_type = 'diary'
            ), 0),
            'other_self_posts', COALESCE((
                SELECT count(*) FROM level_posts
                WHERE writing_context = 'self'
                  AND COALESCE(self_writing_type, '') NOT IN ('reading_log', 'diary')
            ), 0)
        ),
        'learning', (
            SELECT jsonb_build_object(
                'rewrite_requests', rewrite_requests,
                'revision_submissions', revision_submissions,
                'feedbacks_received', feedbacks_received
            ) FROM learning
        ),
        'recent', (
            SELECT jsonb_build_object(
                'posts', recent_30_posts,
                'avg_chars', recent_30_avg_chars,
                'avg_chars_change', CASE
                    WHEN previous_30_avg_chars IS NULL OR recent_30_posts = 0 THEN NULL
                    ELSE recent_30_avg_chars - previous_30_avg_chars
                END
            ) FROM recent
        ),
        'school_year', jsonb_build_object('start', v_year_start, 'end', v_year_end),
        'sharing', (
            SELECT jsonb_build_object(
                'comments_received', comments_received,
                'comments_given', comments_given,
                'reactions_received', reactions_received,
                'reactions_given', reactions_given
            ) FROM my_sharing
        ),
        'daily', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('d', day, 'posts', posts) ORDER BY day)
            FROM (
                SELECT
                    (completed_at AT TIME ZONE 'Asia/Seoul')::DATE AS day,
                    count(*)::INTEGER AS posts
                FROM level_posts
                WHERE (completed_at AT TIME ZONE 'Asia/Seoul')::DATE BETWEEN v_year_start AND v_year_end
                GROUP BY 1
            ) rows
        ), '[]'::JSONB),
        'monthly', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object('m', month_key, 'posts', posts, 'avg_chars', avg_chars)
                ORDER BY month_key
            )
            FROM (
                SELECT
                    to_char(completed_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') AS month_key,
                    count(*)::INTEGER AS posts,
                    COALESCE(round(avg(NULLIF(char_count, 0)))::INTEGER, 0) AS avg_chars
                FROM level_posts
                WHERE (completed_at AT TIME ZONE 'Asia/Seoul')::DATE BETWEEN v_year_start AND v_year_end
                GROUP BY 1
            ) rows
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
                FROM my_points
                WHERE (created_at AT TIME ZONE 'Asia/Seoul')::DATE BETWEEN v_year_start AND v_year_end
                GROUP BY 1
            ) rows
        ), '[]'::JSONB),
        'points_by_type', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('type', type, 'total', total) ORDER BY total DESC)
            FROM (
                SELECT activity_type AS type, sum(amount)::INTEGER AS total
                FROM my_points
                WHERE amount > 0
                GROUP BY activity_type
            ) rows
        ), '[]'::JSONB)
    )
    INTO v_result;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_writing_footprint_detail() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_writing_footprint_detail() TO authenticated, service_role;

COMMENT ON FUNCTION public.get_my_writing_footprint_detail() IS
    '학생 본인의 완료 글·꾸준함·글 유형·학습 수정·교류·포인트·최근 30일 성장을 반환한다.';

NOTIFY pgrst, 'reload schema';

COMMIT;
