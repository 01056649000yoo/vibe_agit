-- 학생이 작성 완료한 자율 글(독서록·일기)을 발자국과 작가 칭호에 포함한다.
--
-- 지금까지 완료 글 판정이 `is_confirmed = true` 하나였다. 그런데 자율 글은 교사 승인 개념이 없어
-- 이 값이 **항상 false** 다. 그래서 코드 주석에는 `자율글은 각 글을 한 편` 이라고 의도가 적혀 있는데도
-- 실제로는 독서록이 발자국·작가 칭호에서 통째로 빠져 있었다(운영 자율 글 2편 모두 is_confirmed=false).
--
-- 판정을 한 곳(`writing_counts_as_completed`)으로 모은다. 같은 규칙을 여러 함수가 각자 적어 두면
-- 화면마다 다른 칭호가 보인다 — 예전에 실제로 겪은 문제다.
--   * 과제  — 교사가 승인해야 완료
--   * 자율 글 — 학생이 작성 완료하면 완료 (독서록·일기)
--
-- 영향: 적용 시점 운영의 자율 글은 2편뿐이라 기존 학생 칭호가 흔들리지 않는다. 앞으로가 달라진다.

BEGIN;

CREATE OR REPLACE FUNCTION public.writing_counts_as_completed(
    p_writing_context TEXT,
    p_is_confirmed BOOLEAN,
    p_is_submitted BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT CASE
        WHEN COALESCE(p_writing_context, 'assignment') = 'self'
            THEN COALESCE(p_is_submitted, false)
        ELSE COALESCE(p_is_confirmed, false)
    END;
$$;

COMMENT ON FUNCTION public.writing_counts_as_completed(TEXT, BOOLEAN, BOOLEAN) IS
    '발자국·작가 칭호가 완료로 세는 글인지. 과제는 교사 승인, 자율 글은 학생 작성 완료 기준.';

CREATE OR REPLACE FUNCTION public.get_my_title_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID;
    v_reader JSONB;
    v_writer_total_chars BIGINT := 0;
    v_writer_completed_posts INTEGER := 0;
    v_writer_level_override SMALLINT;
    v_reader_level_override SMALLINT;
BEGIN
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT s.class_id
    INTO v_class_id
    FROM public.students s
    WHERE s.id = v_student_id;

    WITH my_posts AS (
        SELECT p.id, p.mission_id, p.char_count, p.created_at
        FROM public.student_posts p
        WHERE p.class_id = v_class_id
          AND p.student_id = v_student_id
          AND public.writing_counts_as_completed(p.writing_context, p.is_confirmed, p.is_submitted)
        ORDER BY p.created_at DESC
        LIMIT 1000
    ), level_posts AS (
        SELECT DISTINCT ON (COALESCE('mission:' || mission_id::text, 'post:' || id::text))
               id, mission_id, char_count, created_at
        FROM my_posts
        ORDER BY COALESCE('mission:' || mission_id::text, 'post:' || id::text), created_at DESC
    )
    SELECT COALESCE(sum(char_count), 0), count(*)::INTEGER
    INTO v_writer_total_chars, v_writer_completed_posts
    FROM level_posts;

    SELECT override.writer_level, override.reader_level
    INTO v_writer_level_override, v_reader_level_override
    FROM public.student_title_test_overrides override
    WHERE override.student_id = v_student_id
      AND override.class_id = v_class_id;

    v_reader := public.get_my_reader_title();

    RETURN jsonb_build_object(
        'writer_total_chars', v_writer_total_chars,
        'writer_completed_posts', v_writer_completed_posts,
        'writer_level_override', v_writer_level_override,
        'reader_score', COALESCE((v_reader ->> 'score')::INTEGER, 0),
        'reader_post_count', COALESCE((v_reader ->> 'post_count')::INTEGER, 0),
        'reader_level_override', v_reader_level_override
    );
END;
$function$

;

CREATE OR REPLACE FUNCTION public.get_my_writing_footprint_detail()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
          AND public.writing_counts_as_completed(p.writing_context, p.is_confirmed, p.is_submitted)
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
$function$

;

CREATE OR REPLACE FUNCTION public.get_student_hideout_directory()
 RETURNS TABLE(id uuid, name text, pet_data jsonb, writer_total_chars bigint, writer_completed_posts bigint, reader_score bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_class_id UUID := public.auth_user_class_id();
    v_student_id UUID := public.auth_student_id();
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_class_id IS NULL OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH active_classmates AS MATERIALIZED (
        SELECT
            s.id,
            s.name,
            CASE
                WHEN title_override.writer_level IS NULL AND title_override.reader_level IS NULL THEN s.pet_data
                ELSE COALESCE(s.pet_data, '{}'::JSONB)
                    || jsonb_strip_nulls(jsonb_build_object(
                        '_testWriterLevel', title_override.writer_level,
                        '_testReaderLevel', title_override.reader_level
                    ))
            END AS pet_data
        FROM public.students s
        LEFT JOIN public.student_title_test_overrides title_override
          ON title_override.student_id = s.id
         AND title_override.class_id = s.class_id
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
          AND public.writing_counts_as_completed(p.writing_context, p.is_confirmed, p.is_submitted)
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
$function$

;

CREATE OR REPLACE FUNCTION public.get_friend_writing_footprint(p_student_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_viewer_id UUID := public.auth_student_id();
    v_viewer_class_id UUID;
    v_target_name TEXT;
    v_result JSONB;
BEGIN
    IF v_viewer_id IS NULL OR p_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT class_id INTO v_viewer_class_id
    FROM public.students
    WHERE id = v_viewer_id
      AND auth_id = auth.uid()
      AND is_active IS DISTINCT FROM false
      AND (deleted_at IS NULL OR deleted_at > NOW());

    SELECT name INTO v_target_name
    FROM public.students
    WHERE id = p_student_id
      AND class_id = v_viewer_class_id
      AND is_active IS DISTINCT FROM false
      AND (deleted_at IS NULL OR deleted_at > NOW());

    IF v_viewer_class_id IS NULL OR v_target_name IS NULL THEN
        RAISE EXCEPTION '같은 반 친구의 발자국만 볼 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    -- 아래 집계는 `get_my_writing_footprint_detail` 과 같은 원천·같은 기준을 쓴다.
    -- 학급을 직접 걸어 학급 인덱스를 탄다 (WORKLOG '학급 글 조회 기준').
    WITH target_posts AS (
        SELECT p.id, p.mission_id, p.created_at
        FROM public.student_posts p
        WHERE p.class_id = v_viewer_class_id
          AND p.student_id = p_student_id
          AND public.writing_counts_as_completed(p.writing_context, p.is_confirmed, p.is_submitted)
    ), level_posts AS (
        -- 완성한 글: 과제글은 미션별 가장 최근 한 편, 자율글은 각 글을 한 편.
        -- 클라이언트 짝: src/constants/writerLevels.js 의 collectWriterPosts().
        SELECT DISTINCT ON (COALESCE('mission:' || mission_id::text, 'post:' || id::text))
               id
        FROM target_posts
        ORDER BY COALESCE('mission:' || mission_id::text, 'post:' || id::text),
                 created_at DESC
    )
    SELECT jsonb_build_object(
        'student_name', v_target_name,
        -- 실시간 계산이므로 기준일은 오늘이다. 화면은 이 값을 "N월 N일 기준" 으로 보여 준다.
        'snapshot_date', (NOW() AT TIME ZONE 'Asia/Seoul')::date,
        'tracking_started_at', NULL,
        'posts_written_count', (SELECT count(*) FROM level_posts)::INTEGER,
        'active_days_count', (
            SELECT count(DISTINCT (created_at AT TIME ZONE 'Asia/Seoul')::date)
            FROM target_posts
        )::INTEGER,
        'comments_given_count', (
            SELECT count(*) FROM public.post_comments c
            WHERE c.class_id = v_viewer_class_id
              AND c.student_id = p_student_id
        )::INTEGER,
        'comments_received_count', (
            SELECT count(*) FROM public.post_comments c
            JOIN public.student_posts p2
              ON p2.id = c.post_id
             AND p2.class_id = c.class_id
            WHERE c.class_id = v_viewer_class_id
              AND p2.student_id = p_student_id
              AND c.student_id IS DISTINCT FROM p_student_id
        )::INTEGER,
        'reactions_received_count', (
            SELECT count(*) FROM public.post_reactions r
            JOIN public.student_posts p2
              ON p2.id = r.post_id
             AND p2.class_id = r.class_id
            WHERE r.class_id = v_viewer_class_id
              AND p2.student_id = p_student_id
              AND r.student_id IS DISTINCT FROM p_student_id
        )::INTEGER
    )
    INTO v_result;

    RETURN v_result;
END;
$function$

;

NOTIFY pgrst, 'reload schema';

COMMIT;
