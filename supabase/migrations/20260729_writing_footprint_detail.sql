-- ============================================================================
-- 글쓰기 발자국 상세 — 그래프용 집계
--
-- 학생이 "내가 얼마나 오래·자주·많이 썼는지"를 한 화면에서 보게 한다.
-- 기존 get_my_writing_footprint 는 일별 스냅샷 한 건만 읽는데, 그 원천인
-- writing_activity_events 는 최근 도입이라 아직 몇 건뿐이라 시계열을 못 그린다.
-- 그래서 실제로 쌓여 있는 두 곳에서 뽑는다 — student_posts(2,473건),
-- point_logs(17,519건).
--
-- WORKLOG "학급 글 조회 기준" 준수: 학급을 직접 걸고, 학생 인증은 auth_student_id().
--
-- 반환:
--   totals            숫자 카드 (홈에서 옮겨 온 3개 포함)
--   daily             최근 180일 [{d, posts}]           → 글쓰기 달력(히트맵)
--   monthly           최근 12개월 [{m, posts, avg_chars}] → 월별 막대 + 글 길이 추이
--   points_monthly    최근 12개월 [{m, earned, spent}]   → 포인트 누적 곡선(클라이언트에서 누적)
--   points_by_type    활동별 획득 합계                    → 포인트 출처 막대
-- ============================================================================

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
    v_year_start DATE;   -- 학년도 시작 (3월 1일)
    v_result JSONB;
BEGIN
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT class_id INTO v_class_id FROM public.students WHERE id = v_student_id;

    -- 달력은 학년도(3월 ~ 다음 해 1월) 단위로 본다. 최근 N일로 자르면
    -- 학년 후반에 3~5월이 잘려 "1학기에 쓴 기록"이 사라진다.
    v_today := (NOW() AT TIME ZONE 'Asia/Seoul')::date;
    v_year_start := make_date(
        CASE WHEN extract(month FROM v_today) >= 3
             THEN extract(year FROM v_today)::int
             ELSE extract(year FROM v_today)::int - 1 END,
        3, 1);

    WITH my_posts AS (
        SELECT p.id, p.mission_id, p.char_count, p.created_at
        FROM public.student_posts p
        WHERE p.class_id = v_class_id
          AND p.student_id = v_student_id
          AND p.is_confirmed = true
    ), my_points AS (
        SELECT l.amount, l.activity_type, l.created_at
        FROM public.point_logs l
        WHERE l.class_id = v_class_id
          AND l.student_id = v_student_id
    ), my_sharing AS (
        -- 친구와 나눈 기록. 스냅샷(writing_activity_events 기반)은 기능 도입 이후만 세므로
        -- 1학기를 통째로 쓴 학생도 0으로 보였다. 실제 테이블에서 직접 센다.
        SELECT
            (SELECT count(*) FROM public.post_comments c
              JOIN public.student_posts p2 ON p2.id = c.post_id
             WHERE c.class_id = v_class_id AND p2.student_id = v_student_id
               AND c.student_id IS DISTINCT FROM v_student_id)::INTEGER AS comments_received,
            (SELECT count(*) FROM public.post_comments c
             WHERE c.class_id = v_class_id AND c.student_id = v_student_id)::INTEGER AS comments_given,
            (SELECT count(*) FROM public.post_reactions r
              JOIN public.student_posts p2 ON p2.id = r.post_id
             WHERE r.class_id = v_class_id AND p2.student_id = v_student_id
               AND r.student_id IS DISTINCT FROM v_student_id)::INTEGER AS reactions_received,
            (SELECT count(*) FROM public.post_reactions r
             WHERE r.class_id = v_class_id AND r.student_id = v_student_id)::INTEGER AS reactions_given,
            (SELECT count(*) FROM public.post_comments c
              JOIN public.student_posts p2 ON p2.id = c.post_id
             WHERE c.class_id = v_class_id AND p2.student_id = v_student_id
               AND c.teacher_id IS NOT NULL)::INTEGER AS teacher_comments
    ), active_days AS (
        -- 글을 쓴 날. 연속 기록(streak)을 세기 위해 날짜만 남긴다.
        SELECT DISTINCT (created_at AT TIME ZONE 'Asia/Seoul')::date AS d FROM my_posts
    ), streak_groups AS (
        SELECT d, d - (row_number() OVER (ORDER BY d))::int AS grp FROM active_days
    ), streaks AS (
        SELECT grp, count(*)::INTEGER AS len, max(d) AS last_day
        FROM streak_groups GROUP BY grp
    )
    SELECT jsonb_build_object(
        'totals', jsonb_build_object(
            'total_chars', COALESCE((SELECT sum(char_count) FROM my_posts), 0),
            'completed_missions', COALESCE((SELECT count(DISTINCT mission_id) FROM my_posts WHERE mission_id IS NOT NULL), 0),
            'monthly_posts', COALESCE((
                SELECT count(*) FROM my_posts
                WHERE created_at >= date_trunc('month', NOW())
            ), 0),
            'longest_post_chars', COALESCE((SELECT max(char_count) FROM my_posts), 0),
            'active_days', COALESCE((SELECT count(*) FROM active_days), 0),
            'best_streak', COALESCE((SELECT max(len) FROM streaks), 0),
            'current_streak', COALESCE((
                SELECT len FROM streaks
                WHERE last_day >= ((NOW() AT TIME ZONE 'Asia/Seoul')::date - 1)
                ORDER BY last_day DESC LIMIT 1
            ), 0),
            'total_points', COALESCE((SELECT sum(amount) FROM my_points), 0),
            'points_earned', COALESCE((SELECT sum(amount) FROM my_points WHERE amount > 0), 0),
            'points_spent', COALESCE((SELECT -sum(amount) FROM my_points WHERE amount < 0), 0)
        ),
        'school_year', jsonb_build_object(
            'start', v_year_start,
            'end', (v_year_start + INTERVAL '11 months' - INTERVAL '1 day')::date  -- 다음 해 1월 말
        ),
        'sharing', (
            SELECT jsonb_build_object(
                'comments_received', comments_received,
                'comments_given', comments_given,
                'reactions_received', reactions_received,
                'reactions_given', reactions_given,
                'teacher_comments', teacher_comments
            ) FROM my_sharing
        ),
        'daily', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('d', d, 'posts', c) ORDER BY d)
            FROM (
                SELECT (created_at AT TIME ZONE 'Asia/Seoul')::date AS d, count(*)::INTEGER AS c
                FROM my_posts
                WHERE (created_at AT TIME ZONE 'Asia/Seoul')::date >= v_year_start
                GROUP BY 1
            ) q
        ), '[]'::JSONB),
        'monthly', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('m', m, 'posts', c, 'avg_chars', a) ORDER BY m)
            FROM (
                SELECT to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') AS m,
                       count(*)::INTEGER AS c,
                       COALESCE(round(avg(NULLIF(char_count, 0)))::INTEGER, 0) AS a
                FROM my_posts
                WHERE (created_at AT TIME ZONE 'Asia/Seoul')::date >= v_year_start
                GROUP BY 1
            ) q
        ), '[]'::JSONB),
        'points_monthly', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('m', m, 'earned', e, 'spent', s) ORDER BY m)
            FROM (
                SELECT to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') AS m,
                       COALESCE(sum(amount) FILTER (WHERE amount > 0), 0)::INTEGER AS e,
                       COALESCE(-sum(amount) FILTER (WHERE amount < 0), 0)::INTEGER AS s
                FROM my_points
                WHERE (created_at AT TIME ZONE 'Asia/Seoul')::date >= v_year_start
                GROUP BY 1
            ) q
        ), '[]'::JSONB),
        'points_by_type', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('type', t, 'total', v) ORDER BY v DESC)
            FROM (
                SELECT COALESCE(activity_type, 'etc') AS t, sum(amount)::INTEGER AS v
                FROM my_points
                WHERE amount > 0
                GROUP BY 1
            ) q
        ), '[]'::JSONB)
    )
    INTO v_result;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_writing_footprint_detail() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_writing_footprint_detail() TO authenticated, service_role;

COMMIT;
