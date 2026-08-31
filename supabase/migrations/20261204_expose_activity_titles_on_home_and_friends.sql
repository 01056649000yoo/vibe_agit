BEGIN;

-- 반환 열이 늘어나므로 기존 무인자 함수를 같은 이름으로 다시 만든다.
-- 호출자는 친구 명단 훅 한 곳이며, 새 RPC를 추가하지 않고 기존 한 번의 응답을 확장한다.
DROP FUNCTION IF EXISTS public.get_student_hideout_directory();

CREATE FUNCTION public.get_student_hideout_directory()
RETURNS TABLE(
    id UUID,
    name TEXT,
    pet_data JSONB,
    writer_total_chars BIGINT,
    writer_completed_posts BIGINT,
    reader_score BIGINT,
    diary_days INTEGER,
    reading_log_count INTEGER,
    reading_book_count INTEGER
)
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
               COALESCE(reader.score, 0)::BIGINT AS reader_score,
               COALESCE(title.diary_days, 0)::INTEGER AS diary_days,
               COALESCE(title.reading_log_count, 0)::INTEGER AS reading_log_count,
               COALESCE(title.reading_book_count, 0)::INTEGER AS reading_book_count
        FROM active_classmates classmate
        LEFT JOIN title_stats title ON title.student_id = classmate.id
        LEFT JOIN reader_stats reader ON reader.student_id = classmate.id
    ), frozen_rows AS (
        SELECT classmate.id, classmate.name,
               COALESCE(record.snapshot -> 'pet_data', classmate.stored_pet_data) AS pet_data,
               COALESCE((record.snapshot ->> 'writer_total_chars')::BIGINT, 0) AS writer_total_chars,
               COALESCE((record.snapshot ->> 'writer_completed_posts')::BIGINT, 0) AS writer_completed_posts,
               COALESCE((record.snapshot ->> 'reader_score')::BIGINT, 0) AS reader_score,
               COALESCE((record.snapshot ->> 'diary_days')::INTEGER, 0) AS diary_days,
               COALESCE((record.snapshot ->> 'reading_log_count')::INTEGER, 0) AS reading_log_count,
               COALESCE((record.snapshot ->> 'reading_book_count')::INTEGER, 0) AS reading_book_count
        FROM active_classmates classmate
        LEFT JOIN public.dragon_season_students record
          ON record.class_id = classmate.class_id
         AND record.student_id = classmate.id
         AND record.season_id = v_season.id
    )
    SELECT live.id, live.name, live.pet_data,
           live.writer_total_chars, live.writer_completed_posts, live.reader_score,
           live.diary_days, live.reading_log_count, live.reading_book_count
    FROM live_rows live WHERE COALESCE(v_season.status, 'active') = 'active'
    UNION ALL
    SELECT frozen.id, frozen.name, frozen.pet_data,
           frozen.writer_total_chars, frozen.writer_completed_posts, frozen.reader_score,
           frozen.diary_days, frozen.reading_log_count, frozen.reading_book_count
    FROM frozen_rows frozen WHERE v_season.status IN ('closing', 'closed')
    ORDER BY 2;
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_hideout_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_hideout_directory() TO authenticated, service_role;

COMMENT ON FUNCTION public.get_student_hideout_directory() IS
    '같은 학급 친구의 실제 학기 작가·소통·기록가·독서가 칭호 원자료와 수호룡 목록. 최대 100명.';

NOTIFY pgrst, 'reload schema';

COMMIT;
