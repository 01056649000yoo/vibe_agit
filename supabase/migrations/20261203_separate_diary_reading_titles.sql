-- 일기·독서록을 작가 글자 수에서 분리하고 각각의 꾸준함 칭호로 센다.
-- 이번 시즌 처음부터 새 기준으로 다시 계산하므로 기존 작가 단계가 내려갈 수 있다.

BEGIN;

-- 한 학급의 칭호 원자료를 한 번에 계산한다. 외부 호출은 막고 공개 RPC들만 이 함수를 공유한다.
CREATE OR REPLACE FUNCTION public.get_class_writing_title_stats_v1(
    p_class_id UUID,
    p_started_at TIMESTAMPTZ,
    p_ended_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    student_id UUID,
    writer_total_chars BIGINT,
    writer_completed_posts INTEGER,
    diary_days INTEGER,
    reading_log_count INTEGER,
    reading_book_count INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH active_students AS MATERIALIZED (
        SELECT student.id
        FROM public.students student
        WHERE student.class_id = p_class_id
          AND student.is_active IS DISTINCT FROM FALSE
          AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
        ORDER BY student.id
        LIMIT 100
    ), completed_posts AS MATERIALIZED (
        SELECT
            post.id,
            post.student_id,
            post.mission_id,
            post.writing_context,
            post.self_writing_type,
            post.structured_content,
            COALESCE(post.char_count, 0)::INTEGER AS char_count,
            post.created_at,
            CASE
                WHEN COALESCE(post.writing_context, 'assignment') = 'self'
                    THEN COALESCE(post.published_at, post.updated_at, post.created_at)
                ELSE COALESCE(post.approved_at, post.updated_at, post.created_at)
            END AS completed_at
        FROM public.student_posts post
        JOIN active_students student ON student.id = post.student_id
        WHERE post.class_id = p_class_id
          AND public.writing_counts_as_completed(post.writing_context, post.is_confirmed, post.is_submitted)
          AND (
              CASE
                  WHEN COALESCE(post.writing_context, 'assignment') = 'self'
                      THEN COALESCE(post.published_at, post.updated_at, post.created_at)
                  ELSE COALESCE(post.approved_at, post.updated_at, post.created_at)
              END
          ) >= p_started_at
          AND (
              p_ended_at IS NULL
              OR (
                  CASE
                      WHEN COALESCE(post.writing_context, 'assignment') = 'self'
                          THEN COALESCE(post.published_at, post.updated_at, post.created_at)
                      ELSE COALESCE(post.approved_at, post.updated_at, post.created_at)
                  END
              ) <= p_ended_at
          )
        ORDER BY post.created_at DESC, post.id
        LIMIT 100000
    ), eligible_writer_posts AS MATERIALIZED (
        SELECT DISTINCT ON (
            post.student_id,
            COALESCE('mission:' || post.mission_id::TEXT, 'post:' || post.id::TEXT)
        )
            post.id,
            post.student_id,
            post.char_count,
            post.created_at
        FROM completed_posts post
        WHERE NOT (
            COALESCE(post.writing_context, 'assignment') = 'self'
            AND post.self_writing_type IN ('diary', 'reading_log')
        )
          AND post.completed_at >= p_started_at
          AND (p_ended_at IS NULL OR post.completed_at <= p_ended_at)
        ORDER BY
            post.student_id,
            COALESCE('mission:' || post.mission_id::TEXT, 'post:' || post.id::TEXT),
            post.created_at DESC,
            post.id
    ), writer_stats AS MATERIALIZED (
        SELECT post.student_id,
               COALESCE(SUM(post.char_count), 0)::BIGINT AS total_chars,
               COUNT(*)::INTEGER AS completed_posts
        FROM eligible_writer_posts post
        GROUP BY post.student_id
    ), checked_self_writing AS MATERIALIZED (
        SELECT
            post.id,
            post.student_id,
            post.self_writing_type,
            post.structured_content,
            post.completed_at
        FROM completed_posts post
        JOIN public.reading_log_teacher_reviews review
          ON review.post_id = post.id
         AND review.class_id = p_class_id
         AND review.student_id = post.student_id
         AND review.review_status = 'checked'
        WHERE post.writing_context = 'self'
          AND post.self_writing_type IN ('diary', 'reading_log')
          AND post.completed_at >= p_started_at
          AND (p_ended_at IS NULL OR post.completed_at <= p_ended_at)
    ), diary_stats AS MATERIALIZED (
        SELECT activity.student_id,
               COUNT(DISTINCT CASE
                   WHEN COALESCE(activity.structured_content ->> 'diaryDate', '') ~ '^\d{4}-\d{2}-\d{2}$'
                       THEN (activity.structured_content ->> 'diaryDate')::DATE
                   ELSE (activity.completed_at AT TIME ZONE 'Asia/Seoul')::DATE
               END)::INTEGER AS diary_days
        FROM checked_self_writing activity
        WHERE activity.self_writing_type = 'diary'
        GROUP BY activity.student_id
    ), reading_stats AS MATERIALIZED (
        SELECT
            activity.student_id,
            COUNT(DISTINCT activity.id)::INTEGER AS reading_log_count,
            COUNT(DISTINCT COALESCE(
                library.book_id::TEXT,
                NULLIF(activity.structured_content ->> 'bookId', ''),
                md5(
                    lower(btrim(COALESCE(activity.structured_content ->> 'bookTitle', '')))
                    || '|'
                    || lower(btrim(COALESCE(activity.structured_content ->> 'bookAuthor', '')))
                )
            ))::INTEGER AS reading_book_count
        FROM checked_self_writing activity
        LEFT JOIN public.reading_log_entries entry
          ON entry.post_id = activity.id
         AND entry.class_id = p_class_id
         AND entry.student_id = activity.student_id
        LEFT JOIN public.student_library_items library
          ON library.id = entry.library_item_id
         AND library.class_id = p_class_id
         AND library.student_id = activity.student_id
        WHERE activity.self_writing_type = 'reading_log'
        GROUP BY activity.student_id
    )
    SELECT
        student.id AS student_id,
        COALESCE(writer.total_chars, 0) AS writer_total_chars,
        COALESCE(writer.completed_posts, 0) AS writer_completed_posts,
        COALESCE(diary.diary_days, 0)::INTEGER AS diary_days,
        COALESCE(reading.reading_log_count, 0)::INTEGER AS reading_log_count,
        COALESCE(reading.reading_book_count, 0)::INTEGER AS reading_book_count
    FROM active_students student
    LEFT JOIN writer_stats writer ON writer.student_id = student.id
    LEFT JOIN diary_stats diary ON diary.student_id = student.id
    LEFT JOIN reading_stats reading ON reading.student_id = student.id
    ORDER BY student.id;
$$;

REVOKE ALL ON FUNCTION public.get_class_writing_title_stats_v1(UUID, TIMESTAMPTZ, TIMESTAMPTZ)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_class_writing_title_stats_v1(UUID, TIMESTAMPTZ, TIMESTAMPTZ)
    TO service_role;

COMMENT ON FUNCTION public.get_class_writing_title_stats_v1(UUID, TIMESTAMPTZ, TIMESTAMPTZ) IS
    '공개 칭호 RPC가 공유하는 학급 범위 내부 집계. 직접 브라우저 실행은 허용하지 않는다.';

CREATE OR REPLACE FUNCTION public.get_my_title_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID;
    v_class_started_at TIMESTAMPTZ;
    v_season public.dragon_growth_seasons%ROWTYPE;
    v_snapshot JSONB;
    v_writer_total_chars BIGINT := 0;
    v_writer_completed_posts INTEGER := 0;
    v_reader_score BIGINT := 0;
    v_reader_post_count INTEGER := 0;
    v_diary_days INTEGER := 0;
    v_reading_log_count INTEGER := 0;
    v_reading_book_count INTEGER := 0;
BEGIN
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT student.class_id, COALESCE(class_row.season_started_at, class_row.created_at)
    INTO v_class_id, v_class_started_at
    FROM public.students student
    JOIN public.classes class_row ON class_row.id = student.class_id
    WHERE student.id = v_student_id;

    SELECT season.* INTO v_season
    FROM public.dragon_growth_seasons season
    WHERE season.class_id = v_class_id
    ORDER BY (season.status IN ('active', 'closing')) DESC, season.season_number DESC
    LIMIT 1;

    IF v_season.id IS NOT NULL AND v_season.status IN ('closing', 'closed') THEN
        SELECT record.snapshot INTO v_snapshot
        FROM public.dragon_season_students record
        WHERE record.season_id = v_season.id
          AND record.class_id = v_class_id
          AND record.student_id = v_student_id;

        v_writer_total_chars := COALESCE((v_snapshot ->> 'writer_total_chars')::BIGINT, 0);
        v_writer_completed_posts := COALESCE((v_snapshot ->> 'writer_completed_posts')::INTEGER, 0);
        v_reader_score := COALESCE((v_snapshot ->> 'reader_score')::BIGINT, 0);
        v_reader_post_count := COALESCE((v_snapshot ->> 'reader_post_count')::INTEGER, 0);
        v_diary_days := COALESCE((v_snapshot ->> 'diary_days')::INTEGER, 0);
        v_reading_log_count := COALESCE((v_snapshot ->> 'reading_log_count')::INTEGER, 0);
        v_reading_book_count := COALESCE((v_snapshot ->> 'reading_book_count')::INTEGER, 0);
    ELSE
        SELECT
            stats.writer_total_chars,
            stats.writer_completed_posts,
            stats.diary_days,
            stats.reading_log_count,
            stats.reading_book_count
        INTO
            v_writer_total_chars,
            v_writer_completed_posts,
            v_diary_days,
            v_reading_log_count,
            v_reading_book_count
        FROM public.get_class_writing_title_stats_v1(
            v_class_id,
            COALESCE(v_season.started_at, v_class_started_at, NOW()),
            v_season.closing_started_at
        ) stats
        WHERE stats.student_id = v_student_id;

        WITH comment_activity AS (
            SELECT comment.post_id,
                   SUM(char_length(translate(
                       COALESCE(comment.content, ''),
                       chr(8203) || chr(8204) || chr(8205) || chr(8288) || chr(65279),
                       ''
                   )))::BIGINT AS comment_chars
            FROM public.post_comments comment
            JOIN public.student_posts post
              ON post.id = comment.post_id
             AND post.class_id = comment.class_id
            WHERE comment.class_id = v_class_id
              AND comment.student_id = v_student_id
              AND comment.status = 'approved'
              AND post.student_id <> comment.student_id
              AND comment.created_at >= COALESCE(v_season.started_at, v_class_started_at, NOW())
            GROUP BY comment.post_id
        ), reaction_activity AS (
            SELECT DISTINCT reaction.post_id
            FROM public.post_reactions reaction
            JOIN public.student_posts post
              ON post.id = reaction.post_id
             AND post.class_id = reaction.class_id
            WHERE reaction.class_id = v_class_id
              AND reaction.student_id = v_student_id
              AND post.student_id <> reaction.student_id
              AND reaction.created_at >= COALESCE(v_season.started_at, v_class_started_at, NOW())
        ), reader_per_post AS (
            SELECT COALESCE(comment.post_id, reaction.post_id) AS post_id,
                   COALESCE(comment.comment_chars, 0)::BIGINT AS comment_chars
            FROM comment_activity comment
            FULL OUTER JOIN reaction_activity reaction ON reaction.post_id = comment.post_id
        )
        SELECT
            COALESCE(SUM(1 + LEAST(comment_chars / 20, 3)), 0),
            COUNT(*)::INTEGER
        INTO v_reader_score, v_reader_post_count
        FROM reader_per_post;
    END IF;

    RETURN jsonb_build_object(
        'writer_total_chars', COALESCE(v_writer_total_chars, 0),
        'writer_completed_posts', COALESCE(v_writer_completed_posts, 0),
        'writer_level_override', NULL,
        'reader_score', COALESCE(v_reader_score, 0),
        'reader_post_count', COALESCE(v_reader_post_count, 0),
        'reader_level_override', NULL,
        'diary_days', COALESCE(v_diary_days, 0),
        'reading_log_count', COALESCE(v_reading_log_count, 0),
        'reading_book_count', COALESCE(v_reading_book_count, 0),
        'season', jsonb_build_object(
            'id', v_season.id,
            'number', COALESCE(v_season.season_number, 1),
            'name', COALESCE(v_season.name, '1번째 시즌'),
            'status', COALESCE(v_season.status, 'active'),
            'started_at', COALESCE(v_season.started_at, v_class_started_at),
            'closing_started_at', v_season.closing_started_at,
            'closed_at', v_season.closed_at
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_title_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_title_status() TO authenticated, service_role;

COMMENT ON FUNCTION public.get_my_title_status() IS
    '학생 본인의 작가·소통·기록가·독서가 학기 칭호 원자료. 일기·독서록은 작가 성장과 분리한다.';

-- 친구 아지트의 작가 칭호도 본인 화면과 같은 분리 기준을 사용한다.
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

    SELECT COALESCE(class_row.season_started_at, class_row.created_at) INTO v_class_started_at
    FROM public.classes class_row WHERE class_row.id = v_class_id;

    SELECT season.* INTO v_season FROM public.dragon_growth_seasons season
    WHERE season.class_id = v_class_id
    ORDER BY (season.status IN ('active', 'closing')) DESC, season.season_number DESC LIMIT 1;

    RETURN QUERY
    WITH active_classmates AS MATERIALIZED (
        SELECT student.id, student.class_id, student.name,
               COALESCE(student.pet_data, '{}'::JSONB) AS stored_pet_data
        FROM public.students student
        WHERE student.class_id = v_class_id
          AND student.id <> v_student_id
          AND student.is_active IS DISTINCT FROM FALSE
          AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
        ORDER BY student.name
        LIMIT 100
    ), title_stats AS MATERIALIZED (
        SELECT stats.*
        FROM public.get_class_writing_title_stats_v1(
            v_class_id,
            COALESCE(v_season.started_at, v_class_started_at, NOW()),
            v_season.closing_started_at
        ) stats
    ), comment_activity AS (
        SELECT comment.student_id, comment.post_id,
               SUM(char_length(translate(COALESCE(comment.content, ''),
                   chr(8203) || chr(8204) || chr(8205) || chr(8288) || chr(65279), '')))::BIGINT AS comment_chars
        FROM public.post_comments comment
        JOIN active_classmates classmate
          ON classmate.id = comment.student_id
         AND classmate.class_id = comment.class_id
        JOIN public.student_posts post
          ON post.id = comment.post_id
         AND post.class_id = comment.class_id
        WHERE comment.class_id = v_class_id
          AND comment.status = 'approved'
          AND post.student_id <> comment.student_id
          AND comment.created_at >= COALESCE(v_season.started_at, v_class_started_at, NOW())
          AND (v_season.closing_started_at IS NULL OR comment.created_at <= v_season.closing_started_at)
        GROUP BY comment.student_id, comment.post_id
    ), reaction_activity AS (
        SELECT DISTINCT reaction.student_id, reaction.post_id
        FROM public.post_reactions reaction
        JOIN active_classmates classmate
          ON classmate.id = reaction.student_id
         AND classmate.class_id = reaction.class_id
        JOIN public.student_posts post
          ON post.id = reaction.post_id
         AND post.class_id = reaction.class_id
        WHERE reaction.class_id = v_class_id
          AND post.student_id <> reaction.student_id
          AND reaction.created_at >= COALESCE(v_season.started_at, v_class_started_at, NOW())
          AND (v_season.closing_started_at IS NULL OR reaction.created_at <= v_season.closing_started_at)
    ), reader_per_post AS (
        SELECT COALESCE(comment.student_id, reaction.student_id) AS student_id,
               COALESCE(comment.post_id, reaction.post_id) AS post_id,
               COALESCE(comment.comment_chars, 0)::BIGINT AS comment_chars
        FROM comment_activity comment
        FULL OUTER JOIN reaction_activity reaction
          ON reaction.student_id = comment.student_id
         AND reaction.post_id = comment.post_id
    ), reader_stats AS (
        SELECT activity.student_id,
               SUM(1 + LEAST(activity.comment_chars / 20, 3))::BIGINT AS score
        FROM reader_per_post activity
        GROUP BY activity.student_id
    ), live_rows AS (
        SELECT classmate.id, classmate.name, classmate.stored_pet_data AS pet_data,
               COALESCE(title.writer_total_chars, 0)::BIGINT AS writer_total_chars,
               COALESCE(title.writer_completed_posts, 0)::BIGINT AS writer_completed_posts,
               COALESCE(reader.score, 0)::BIGINT AS reader_score
        FROM active_classmates classmate
        LEFT JOIN title_stats title ON title.student_id = classmate.id
        LEFT JOIN reader_stats reader ON reader.student_id = classmate.id
    ), frozen_rows AS (
        SELECT classmate.id, classmate.name,
               COALESCE(record.snapshot -> 'pet_data', classmate.stored_pet_data) AS pet_data,
               COALESCE((record.snapshot ->> 'writer_total_chars')::BIGINT, 0) AS writer_total_chars,
               COALESCE((record.snapshot ->> 'writer_completed_posts')::BIGINT, 0) AS writer_completed_posts,
               COALESCE((record.snapshot ->> 'reader_score')::BIGINT, 0) AS reader_score
        FROM active_classmates classmate
        LEFT JOIN public.dragon_season_students record
          ON record.class_id = classmate.class_id
         AND record.student_id = classmate.id
         AND record.season_id = v_season.id
    )
    SELECT live.id, live.name, live.pet_data,
           live.writer_total_chars, live.writer_completed_posts, live.reader_score
    FROM live_rows live WHERE COALESCE(v_season.status, 'active') = 'active'
    UNION ALL
    SELECT frozen.id, frozen.name, frozen.pet_data,
           frozen.writer_total_chars, frozen.writer_completed_posts, frozen.reader_score
    FROM frozen_rows frozen WHERE v_season.status IN ('closing', 'closed')
    ORDER BY 2;
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_hideout_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_hideout_directory() TO authenticated, service_role;

COMMENT ON FUNCTION public.get_student_hideout_directory() IS
    '같은 학급 친구의 실제 학기 작가·소통 칭호와 수호룡 목록. 일기·독서록은 작가 합계에서 제외한다.';

CREATE OR REPLACE FUNCTION public.get_teacher_dragon_growth_dashboard(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_class_created_at TIMESTAMPTZ;
    v_legacy_started_at TIMESTAMPTZ;
    v_season public.dragon_growth_seasons%ROWTYPE;
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT class_row.created_at, class_row.season_started_at
    INTO v_class_created_at, v_legacy_started_at
    FROM public.classes class_row
    WHERE class_row.id = p_class_id
      AND (public.auth_user_role() = 'ADMIN' OR class_row.teacher_id = auth.uid());

    IF NOT FOUND THEN
        RAISE EXCEPTION '이 학급의 수호룡 현황을 볼 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT season.* INTO v_season
    FROM public.dragon_growth_seasons season
    WHERE season.class_id = p_class_id
    ORDER BY (season.status IN ('active', 'closing')) DESC, season.season_number DESC
    LIMIT 1;

    WITH active_roster AS MATERIALIZED (
        SELECT student.id, student.class_id, student.name,
               COALESCE(student.pet_data, '{}'::JSONB) AS pet_data,
               title_override.writer_level AS writer_level_override,
               title_override.reader_level AS reader_level_override
        FROM public.students student
        LEFT JOIN public.student_title_test_overrides title_override
          ON title_override.student_id = student.id
         AND title_override.class_id = student.class_id
        WHERE student.class_id = p_class_id
          AND student.is_active IS DISTINCT FROM FALSE
          AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
        ORDER BY student.name, student.id
        LIMIT 100
    ), completed_posts AS MATERIALIZED (
        SELECT post.id, post.student_id, post.mission_id,
               COALESCE(post.char_count, 0)::INTEGER AS char_count,
               post.created_at,
               CASE WHEN COALESCE(post.writing_context, 'assignment') = 'self'
                    THEN COALESCE(post.published_at, post.updated_at, post.created_at)
                    ELSE COALESCE(post.approved_at, post.updated_at, post.created_at) END AS completed_at
        FROM public.student_posts post
        JOIN active_roster roster
          ON roster.id = post.student_id
         AND roster.class_id = post.class_id
        WHERE post.class_id = p_class_id
          AND public.writing_counts_as_completed(post.writing_context, post.is_confirmed, post.is_submitted)
        ORDER BY post.created_at DESC, post.id
        LIMIT 100000
    ), level_posts AS MATERIALIZED (
        SELECT DISTINCT ON (
            post.student_id,
            COALESCE('mission:' || post.mission_id::TEXT, 'post:' || post.id::TEXT)
        )
            post.id, post.student_id, post.char_count, post.completed_at, post.created_at
        FROM completed_posts post
        ORDER BY
            post.student_id,
            COALESCE('mission:' || post.mission_id::TEXT, 'post:' || post.id::TEXT),
            post.created_at DESC
    ), career_stats AS MATERIALIZED (
        SELECT post.student_id,
               COALESCE(SUM(post.char_count), 0)::BIGINT AS career_chars,
               COUNT(*)::BIGINT AS career_posts,
               MAX(post.completed_at) AS latest_completed_at
        FROM level_posts post
        GROUP BY post.student_id
    ), season_stats AS MATERIALIZED (
        SELECT post.student_id,
               COALESCE(SUM(post.char_count), 0)::BIGINT AS total_chars,
               COUNT(*)::BIGINT AS completed_posts
        FROM level_posts post
        WHERE post.completed_at >= COALESCE(v_season.started_at, v_legacy_started_at, v_class_created_at, NOW())
          AND (v_season.closing_started_at IS NULL OR post.completed_at <= v_season.closing_started_at)
        GROUP BY post.student_id
    ), title_stats AS MATERIALIZED (
        SELECT stats.*
        FROM public.get_class_writing_title_stats_v1(
            p_class_id,
            COALESCE(v_season.started_at, v_legacy_started_at, v_class_created_at, NOW()),
            v_season.closing_started_at
        ) stats
    ), comment_activity AS MATERIALIZED (
        SELECT comment.student_id, comment.post_id,
               SUM(char_length(translate(COALESCE(comment.content, ''),
                   chr(8203) || chr(8204) || chr(8205) || chr(8288) || chr(65279), '')))::BIGINT AS comment_chars
        FROM public.post_comments comment
        JOIN active_roster actor
          ON actor.id = comment.student_id
         AND actor.class_id = comment.class_id
        JOIN public.student_posts post
          ON post.id = comment.post_id
         AND post.class_id = comment.class_id
        WHERE comment.class_id = p_class_id
          AND comment.status = 'approved'
          AND post.student_id <> comment.student_id
          AND comment.created_at >= COALESCE(v_season.started_at, v_legacy_started_at, v_class_created_at, NOW())
          AND (v_season.closing_started_at IS NULL OR comment.created_at <= v_season.closing_started_at)
        GROUP BY comment.student_id, comment.post_id
    ), reaction_activity AS MATERIALIZED (
        SELECT DISTINCT reaction.student_id, reaction.post_id
        FROM public.post_reactions reaction
        JOIN active_roster actor
          ON actor.id = reaction.student_id
         AND actor.class_id = reaction.class_id
        JOIN public.student_posts post
          ON post.id = reaction.post_id
         AND post.class_id = reaction.class_id
        WHERE reaction.class_id = p_class_id
          AND post.student_id <> reaction.student_id
          AND reaction.created_at >= COALESCE(v_season.started_at, v_legacy_started_at, v_class_created_at, NOW())
          AND (v_season.closing_started_at IS NULL OR reaction.created_at <= v_season.closing_started_at)
    ), reader_per_post AS MATERIALIZED (
        SELECT COALESCE(comment.student_id, reaction.student_id) AS student_id,
               COALESCE(comment.post_id, reaction.post_id) AS post_id,
               COALESCE(comment.comment_chars, 0)::BIGINT AS comment_chars
        FROM comment_activity comment
        FULL OUTER JOIN reaction_activity reaction
          ON reaction.student_id = comment.student_id
         AND reaction.post_id = comment.post_id
    ), reader_stats AS MATERIALIZED (
        SELECT activity.student_id,
               COUNT(*)::INTEGER AS post_count,
               SUM(1 + LEAST(activity.comment_chars / 20, 3))::BIGINT AS score
        FROM reader_per_post activity
        GROUP BY activity.student_id
    ), live_rows AS MATERIALIZED (
        SELECT roster.id AS student_id, roster.name, roster.pet_data,
               roster.writer_level_override, roster.reader_level_override,
               COALESCE(title.writer_total_chars, 0)::BIGINT AS writer_total_chars,
               COALESCE(title.writer_completed_posts, 0)::BIGINT AS writer_completed_posts,
               COALESCE(reader.score, 0)::BIGINT AS reader_score,
               COALESCE(reader.post_count, 0)::INTEGER AS reader_post_count,
               COALESCE(title.diary_days, 0)::INTEGER AS diary_days,
               COALESCE(title.reading_log_count, 0)::INTEGER AS reading_log_count,
               COALESCE(title.reading_book_count, 0)::INTEGER AS reading_book_count,
               COALESCE(season.completed_posts, 0)::INTEGER AS season_posts,
               COALESCE(season.total_chars, 0)::BIGINT AS season_chars,
               COALESCE(career.career_posts, 0)::BIGINT AS career_posts,
               COALESCE(career.career_chars, 0)::BIGINT AS career_chars,
               career.latest_completed_at,
               'draft'::TEXT AS farewell_status
        FROM active_roster roster
        LEFT JOIN title_stats title ON title.student_id = roster.id
        LEFT JOIN season_stats season ON season.student_id = roster.id
        LEFT JOIN career_stats career ON career.student_id = roster.id
        LEFT JOIN reader_stats reader ON reader.student_id = roster.id
    ), frozen_rows AS MATERIALIZED (
        SELECT roster.id AS student_id, roster.name,
               COALESCE(record.snapshot -> 'pet_data', roster.pet_data) AS pet_data,
               NULLIF(record.snapshot ->> 'writer_level_override', '')::SMALLINT AS writer_level_override,
               NULLIF(record.snapshot ->> 'reader_level_override', '')::SMALLINT AS reader_level_override,
               COALESCE((record.snapshot ->> 'writer_total_chars')::BIGINT, 0) AS writer_total_chars,
               COALESCE((record.snapshot ->> 'writer_completed_posts')::BIGINT, 0) AS writer_completed_posts,
               COALESCE((record.snapshot ->> 'reader_score')::BIGINT, 0) AS reader_score,
               COALESCE((record.snapshot ->> 'reader_post_count')::INTEGER, 0) AS reader_post_count,
               COALESCE((record.snapshot ->> 'diary_days')::INTEGER, 0) AS diary_days,
               COALESCE((record.snapshot ->> 'reading_log_count')::INTEGER, 0) AS reading_log_count,
               COALESCE((record.snapshot ->> 'reading_book_count')::INTEGER, 0) AS reading_book_count,
               COALESCE((record.snapshot ->> 'season_posts')::INTEGER, 0) AS season_posts,
               COALESCE((record.snapshot ->> 'season_chars')::BIGINT, 0) AS season_chars,
               COALESCE((record.snapshot ->> 'career_posts')::BIGINT, 0) AS career_posts,
               COALESCE((record.snapshot ->> 'career_chars')::BIGINT, 0) AS career_chars,
               NULLIF(record.snapshot ->> 'latest_completed_at', '')::TIMESTAMPTZ AS latest_completed_at,
               COALESCE(record.farewell_status, 'draft') AS farewell_status
        FROM active_roster roster
        LEFT JOIN public.dragon_season_students record
          ON record.class_id = roster.class_id
         AND record.student_id = roster.id
         AND record.season_id = v_season.id
    ), student_rows AS MATERIALIZED (
        SELECT * FROM frozen_rows WHERE v_season.status IN ('closing', 'closed')
        UNION ALL
        SELECT * FROM live_rows WHERE COALESCE(v_season.status, 'active') = 'active'
    ), history_rows AS MATERIALIZED (
        SELECT season.id, season.season_number, season.name, season.started_at,
               season.ended_at, season.closed_at, season.status, season.snapshot
        FROM public.dragon_growth_seasons season
        WHERE season.class_id = p_class_id AND season.status = 'closed'
        ORDER BY season.season_number DESC
        LIMIT 20
    )
    SELECT jsonb_build_object(
        'generated_at', NOW(),
        'season', jsonb_build_object(
            'id', v_season.id,
            'number', COALESCE(v_season.season_number, 1),
            'name', COALESCE(v_season.name, '1번째 시즌'),
            'status', COALESCE(v_season.status, 'active'),
            'started_at', COALESCE(v_season.started_at, v_legacy_started_at, v_class_created_at),
            'closing_started_at', v_season.closing_started_at,
            'closed_at', v_season.closed_at,
            'farewell_deadline', v_season.farewell_deadline,
            'farewell_completed', (SELECT COUNT(*) FROM student_rows WHERE farewell_status = 'completed'),
            'farewell_total', (SELECT COUNT(*) FROM student_rows)
        ),
        'students', COALESCE((
            SELECT jsonb_agg(to_jsonb(student) ORDER BY student.name, student.student_id)
            FROM student_rows student
        ), '[]'::JSONB),
        'history', COALESCE((
            SELECT jsonb_agg(to_jsonb(history) ORDER BY history.season_number DESC)
            FROM history_rows history
        ), '[]'::JSONB)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_dragon_growth_dashboard(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_dragon_growth_dashboard(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.open_teacher_dragon_season_closing(
    p_class_id UUID,
    p_season_name TEXT DEFAULT NULL,
    p_farewell_deadline DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_now TIMESTAMPTZ := clock_timestamp();
    v_dashboard JSONB;
    v_season_id UUID;
    v_season_number INTEGER;
    v_season_name TEXT;
    v_started_at TIMESTAMPTZ;
    v_students JSONB;
BEGIN
    PERFORM 1 FROM public.classes class_row
    WHERE class_row.id = p_class_id
      AND auth.uid() IS NOT NULL
      AND (public.auth_user_role() = 'ADMIN' OR class_row.teacher_id = auth.uid())
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION '이 학급의 시즌을 관리할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    v_dashboard := public.get_teacher_dragon_growth_dashboard(p_class_id);
    IF COALESCE(v_dashboard #>> '{season,status}', 'active') <> 'active' THEN
        RAISE EXCEPTION '성장 중인 시즌만 작별 기간을 열 수 있습니다.' USING ERRCODE = '22023';
    END IF;

    v_season_id := NULLIF(v_dashboard #>> '{season,id}', '')::UUID;
    v_season_number := COALESCE((v_dashboard #>> '{season,number}')::INTEGER, 1);
    v_season_name := COALESCE(
        NULLIF(BTRIM(p_season_name), ''),
        v_dashboard #>> '{season,name}',
        v_season_number || '번째 시즌'
    );
    v_started_at := COALESCE((v_dashboard #>> '{season,started_at}')::TIMESTAMPTZ, v_now);
    IF char_length(v_season_name) NOT BETWEEN 1 AND 40 THEN
        RAISE EXCEPTION '시즌 이름은 1~40자로 입력해주세요.' USING ERRCODE = '22023';
    END IF;

    IF v_season_id IS NULL THEN
        INSERT INTO public.dragon_growth_seasons(
            class_id, season_number, name, started_at, status, created_by
        )
        VALUES (p_class_id, v_season_number, v_season_name, v_started_at, 'active', auth.uid())
        RETURNING id INTO v_season_id;
    END IF;

    SELECT COALESCE(jsonb_agg(
        student || jsonb_build_object(
            'writer_level', public.dragon_writer_level(
                (student ->> 'writer_total_chars')::BIGINT,
                (student ->> 'writer_completed_posts')::BIGINT,
                NULLIF(student ->> 'writer_level_override', '')::INTEGER
            ),
            'reader_level', public.dragon_reader_level(
                (student ->> 'reader_score')::BIGINT,
                NULLIF(student ->> 'reader_level_override', '')::INTEGER
            ),
            'diary_level', public.dragon_diary_level(
                COALESCE((student ->> 'diary_days')::BIGINT, 0)
            ),
            'reading_level', public.dragon_reading_level(
                COALESCE((student ->> 'reading_log_count')::BIGINT, 0),
                COALESCE((student ->> 'reading_book_count')::BIGINT, 0)
            ),
            'captured_at', v_now
        ) ORDER BY student ->> 'name'
    ), '[]'::JSONB)
    INTO v_students
    FROM jsonb_array_elements(COALESCE(v_dashboard -> 'students', '[]'::JSONB)) student;

    INSERT INTO public.dragon_season_students(season_id, class_id, student_id, snapshot)
    SELECT v_season_id, p_class_id, (student ->> 'student_id')::UUID, student
    FROM jsonb_array_elements(v_students) student
    ON CONFLICT (season_id, student_id) DO UPDATE
    SET snapshot = EXCLUDED.snapshot, updated_at = v_now;

    UPDATE public.dragon_growth_seasons
    SET name = v_season_name,
        status = 'closing',
        closing_started_at = v_now,
        farewell_deadline = p_farewell_deadline,
        snapshot = jsonb_build_object(
            'captured_at', v_now,
            'students', v_students,
            'totals', jsonb_build_object(
                'student_count', jsonb_array_length(v_students),
                'season_posts', COALESCE((
                    SELECT SUM((student ->> 'season_posts')::INTEGER)
                    FROM jsonb_array_elements(v_students) student
                ), 0),
                'season_chars', COALESCE((
                    SELECT SUM((student ->> 'season_chars')::BIGINT)
                    FROM jsonb_array_elements(v_students) student
                ), 0)
            )
        )
    WHERE id = v_season_id
      AND class_id = p_class_id
      AND status = 'active';

    RETURN jsonb_build_object(
        'season_id', v_season_id,
        'season_number', v_season_number,
        'season_name', v_season_name,
        'status', 'closing',
        'student_count', jsonb_array_length(v_students)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.open_teacher_dragon_season_closing(UUID, TEXT, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_teacher_dragon_season_closing(UUID, TEXT, DATE)
    TO authenticated, service_role;

COMMIT;
