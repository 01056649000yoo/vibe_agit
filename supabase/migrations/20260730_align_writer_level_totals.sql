-- ============================================================================
-- 작가 칭호 집계 기준 통일 — 발자국의 누적 글자 수를 나의 아지트와 같게 맞춘다
--
-- 문제: 같은 학생이 화면마다 다른 작가 칭호를 봤다.
--   · 나의 아지트: 과제글을 미션별 한 편으로 줄인 뒤 char_count 합산
--   · 발자국(이 함수): 승인 글 전부를 그냥 sum(char_count)
--   student_posts 에 (student_id, mission_id) 유니크 제약이 없어 재작성이 쌓이면
--   발자국 쪽 글자 수가 더 크게 나오고, 레벨 경계를 넘으면 칭호가 갈렸다.
--
-- 해결: 레벨이 세는 글 묶음을 `level_posts` CTE 로 명시한다.
--   과제글은 미션별 가장 최근 한 편, 자율글(mission_id IS NULL)은 각 글을 한 편.
--   클라이언트 짝은 src/constants/writerLevels.js 의 collectWriterPosts() 다.
--   한쪽만 고치면 다시 갈라지므로 둘을 같이 본다.
--
-- 활동 통계(달력·연속 기록·이달의 활동·가장 길게)는 계속 `my_posts` 를 쓴다.
-- 재작성한 날도 "글을 쓴 날"이고, 가장 길게 쓴 글은 나중에 줄여 낸 글에 가려지면 안 된다.
--
-- 추가: totals 에 `completed_posts` 를 넣는다. 발자국 화면이 레벨을 구할 때
--   승인 글 수 자리에 `completed_missions`(미션 수)를 넘기고 있었다 — 자율글만 쓴
--   학생은 0편으로 계산된다. 카드에 보여 주는 "완료 미션" 숫자는 그대로 둔다.
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
    ), level_posts AS (
        -- 작가 칭호가 세는 글. 과제글은 미션별 가장 최근 한 편, 자율글은 각 글을 한 편.
        -- 클라이언트 짝: src/constants/writerLevels.js 의 collectWriterPosts().
        SELECT DISTINCT ON (COALESCE('mission:' || mission_id::text, 'post:' || id::text))
               id, mission_id, char_count, created_at
        FROM my_posts
        ORDER BY COALESCE('mission:' || mission_id::text, 'post:' || id::text),
                 created_at DESC
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
            -- 칭호용 두 값은 level_posts 에서만 뽑는다.
            'total_chars', COALESCE((SELECT sum(char_count) FROM level_posts), 0),
            'completed_posts', COALESCE((SELECT count(*) FROM level_posts), 0),
            'completed_missions', COALESCE((SELECT count(DISTINCT mission_id) FROM level_posts WHERE mission_id IS NOT NULL), 0),
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
