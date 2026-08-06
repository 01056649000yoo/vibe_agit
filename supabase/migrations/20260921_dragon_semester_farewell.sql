-- 작가 수호룡을 학기 단위 성장으로 운영한다.
--
-- 상태: active(성장 중) -> closing(성장 동결·작별 편지) -> closed(보관)
-- 새 학기는 교사가 별도로 시작한다. 글·포인트·꾸미기 자산은 그대로 두고,
-- 수호룡의 학기 성장 상태만 초기화한다. 작별 편지는 일반 글쓰기/보상에 포함하지 않는다.

BEGIN;

ALTER TABLE public.dragon_growth_seasons
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS closing_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS farewell_deadline DATE;

UPDATE public.dragon_growth_seasons
SET status = CASE WHEN ended_at IS NULL THEN 'active' ELSE 'closed' END,
    closed_at = COALESCE(closed_at, ended_at)
WHERE status IS DISTINCT FROM CASE WHEN ended_at IS NULL THEN 'active' ELSE 'closed' END
   OR (ended_at IS NOT NULL AND closed_at IS NULL);

ALTER TABLE public.dragon_growth_seasons
    DROP CONSTRAINT IF EXISTS dragon_growth_seasons_status_check;
ALTER TABLE public.dragon_growth_seasons
    ADD CONSTRAINT dragon_growth_seasons_status_check
    CHECK (status IN ('active', 'closing', 'closed'));

DROP INDEX IF EXISTS public.idx_dragon_growth_seasons_one_active;
CREATE UNIQUE INDEX idx_dragon_growth_seasons_one_open
    ON public.dragon_growth_seasons (class_id)
    WHERE status IN ('active', 'closing');

CREATE TABLE IF NOT EXISTS public.dragon_season_students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_id UUID NOT NULL REFERENCES public.dragon_growth_seasons(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
    farewell_content TEXT NOT NULL DEFAULT '',
    farewell_status TEXT NOT NULL DEFAULT 'draft'
        CHECK (farewell_status IN ('draft', 'completed')),
    farewell_completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT dragon_season_students_unique UNIQUE (season_id, student_id),
    CONSTRAINT dragon_season_students_content_length CHECK (char_length(farewell_content) <= 1200)
);

CREATE INDEX IF NOT EXISTS idx_dragon_season_students_class_season
    ON public.dragon_season_students (class_id, season_id);
CREATE INDEX IF NOT EXISTS idx_dragon_season_students_student_created
    ON public.dragon_season_students (student_id, created_at DESC);

ALTER TABLE public.dragon_season_students ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dragon_season_students FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.dragon_season_students TO service_role;

COMMENT ON TABLE public.dragon_season_students IS
    '학기 종료 시 학생별 수호룡·칭호 동결 스냅샷과 작별 편지. SECURITY DEFINER RPC로만 접근한다.';

CREATE OR REPLACE FUNCTION public.dragon_writer_level(
    p_chars BIGINT,
    p_posts BIGINT,
    p_override INTEGER DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT CASE
        WHEN p_override BETWEEN 1 AND 10 THEN p_override
        WHEN COALESCE(p_chars, 0) >= 26000 THEN 10
        WHEN COALESCE(p_chars, 0) >= 15600 THEN 9
        WHEN COALESCE(p_chars, 0) >= 10920 THEN 8
        WHEN COALESCE(p_chars, 0) >= 5460 THEN 7
        WHEN COALESCE(p_chars, 0) >= 3250 THEN 6
        WHEN COALESCE(p_chars, 0) >= 1820 THEN 5
        WHEN COALESCE(p_chars, 0) >= 910 THEN 4
        WHEN COALESCE(p_chars, 0) >= 390 THEN 3
        WHEN COALESCE(p_posts, 0) >= 1 THEN 2
        ELSE 1
    END;
$$;

CREATE OR REPLACE FUNCTION public.dragon_reader_level(
    p_score BIGINT,
    p_override INTEGER DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT CASE
        WHEN p_override BETWEEN 1 AND 7 THEN p_override
        WHEN COALESCE(p_score, 0) >= 300 THEN 7
        WHEN COALESCE(p_score, 0) >= 200 THEN 6
        WHEN COALESCE(p_score, 0) >= 120 THEN 5
        WHEN COALESCE(p_score, 0) >= 50 THEN 4
        WHEN COALESCE(p_score, 0) >= 20 THEN 3
        WHEN COALESCE(p_score, 0) >= 1 THEN 2
        ELSE 1
    END;
$$;

-- 학생 본인 칭호의 단일 경로. 현재 학기만 성장시키고 closing 이후에는 동결값을 쓴다.
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
    v_writer_level_override SMALLINT;
    v_reader_level_override SMALLINT;
BEGIN
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT s.class_id, COALESCE(c.season_started_at, c.created_at)
    INTO v_class_id, v_class_started_at
    FROM public.students s
    JOIN public.classes c ON c.id = s.class_id
    WHERE s.id = v_student_id;

    SELECT season.* INTO v_season
    FROM public.dragon_growth_seasons season
    WHERE season.class_id = v_class_id
    ORDER BY (season.status IN ('active', 'closing')) DESC,
             season.season_number DESC
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
        v_writer_level_override := NULLIF(v_snapshot ->> 'writer_level_override', '')::SMALLINT;
        v_reader_level_override := NULLIF(v_snapshot ->> 'reader_level_override', '')::SMALLINT;
    ELSE
        WITH my_posts AS MATERIALIZED (
            SELECT
                p.id,
                p.mission_id,
                COALESCE(p.char_count, 0)::INTEGER AS char_count,
                p.created_at,
                CASE
                    WHEN COALESCE(p.writing_context, 'assignment') = 'self'
                        THEN COALESCE(p.published_at, p.updated_at, p.created_at)
                    ELSE COALESCE(p.approved_at, p.updated_at, p.created_at)
                END AS completed_at
            FROM public.student_posts p
            WHERE p.class_id = v_class_id
              AND p.student_id = v_student_id
              AND public.writing_counts_as_completed(p.writing_context, p.is_confirmed, p.is_submitted)
            ORDER BY p.created_at DESC
            LIMIT 1000
        ), level_posts AS (
            SELECT DISTINCT ON (COALESCE('mission:' || mission_id::TEXT, 'post:' || id::TEXT))
                   id, mission_id, char_count, created_at
            FROM my_posts
            WHERE completed_at >= COALESCE(v_season.started_at, v_class_started_at, NOW())
            ORDER BY COALESCE('mission:' || mission_id::TEXT, 'post:' || id::TEXT), created_at DESC
        ), comment_activity AS (
            SELECT c.post_id,
                   SUM(char_length(translate(
                       COALESCE(c.content, ''),
                       chr(8203) || chr(8204) || chr(8205) || chr(8288) || chr(65279),
                       ''
                   )))::BIGINT AS comment_chars
            FROM public.post_comments c
            JOIN public.student_posts post
              ON post.id = c.post_id
             AND post.class_id = c.class_id
            WHERE c.class_id = v_class_id
              AND c.student_id = v_student_id
              AND c.status = 'approved'
              AND post.student_id <> c.student_id
              AND c.created_at >= COALESCE(v_season.started_at, v_class_started_at, NOW())
            GROUP BY c.post_id
        ), reaction_activity AS (
            SELECT DISTINCT r.post_id
            FROM public.post_reactions r
            JOIN public.student_posts post
              ON post.id = r.post_id
             AND post.class_id = r.class_id
            WHERE r.class_id = v_class_id
              AND r.student_id = v_student_id
              AND post.student_id <> r.student_id
              AND r.created_at >= COALESCE(v_season.started_at, v_class_started_at, NOW())
        ), reader_per_post AS (
            SELECT COALESCE(comment.post_id, reaction.post_id) AS post_id,
                   COALESCE(comment.comment_chars, 0)::BIGINT AS comment_chars
            FROM comment_activity comment
            FULL OUTER JOIN reaction_activity reaction ON reaction.post_id = comment.post_id
        )
        SELECT
            COALESCE((SELECT SUM(char_count) FROM level_posts), 0),
            COALESCE((SELECT COUNT(*) FROM level_posts), 0)::INTEGER,
            COALESCE((SELECT SUM(1 + LEAST(comment_chars / 20, 3)) FROM reader_per_post), 0),
            COALESCE((SELECT COUNT(*) FROM reader_per_post), 0)::INTEGER
        INTO v_writer_total_chars, v_writer_completed_posts, v_reader_score, v_reader_post_count;

        SELECT override.writer_level, override.reader_level
        INTO v_writer_level_override, v_reader_level_override
        FROM public.student_title_test_overrides override
        WHERE override.student_id = v_student_id
          AND override.class_id = v_class_id;
    END IF;

    RETURN jsonb_build_object(
        'writer_total_chars', v_writer_total_chars,
        'writer_completed_posts', v_writer_completed_posts,
        'writer_level_override', v_writer_level_override,
        'reader_score', v_reader_score,
        'reader_post_count', v_reader_post_count,
        'reader_level_override', v_reader_level_override,
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

-- 친구 아지트도 본인·교사 화면과 같은 학기 수치를 쓴다.
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
    SELECT COALESCE(c.season_started_at, c.created_at) INTO v_class_started_at
    FROM public.classes c WHERE c.id = v_class_id;
    SELECT season.* INTO v_season FROM public.dragon_growth_seasons season
    WHERE season.class_id = v_class_id
    ORDER BY (season.status IN ('active', 'closing')) DESC, season.season_number DESC LIMIT 1;

    RETURN QUERY
    WITH active_classmates AS MATERIALIZED (
        SELECT s.id, s.class_id, s.name, COALESCE(s.pet_data, '{}'::JSONB) AS stored_pet_data,
               title_override.writer_level AS writer_level_override,
               title_override.reader_level AS reader_level_override
        FROM public.students s
        LEFT JOIN public.student_title_test_overrides title_override
          ON title_override.student_id = s.id AND title_override.class_id = s.class_id
        WHERE s.class_id = v_class_id AND s.id <> v_student_id
          AND s.is_active IS DISTINCT FROM false
          AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
        ORDER BY s.name LIMIT 100
    ), completed_posts AS MATERIALIZED (
        SELECT p.id, p.student_id, p.mission_id, COALESCE(p.char_count, 0)::INTEGER AS char_count,
               p.created_at,
               CASE WHEN COALESCE(p.writing_context, 'assignment') = 'self'
                    THEN COALESCE(p.published_at, p.updated_at, p.created_at)
                    ELSE COALESCE(p.approved_at, p.updated_at, p.created_at) END AS completed_at
        FROM public.student_posts p
        JOIN active_classmates classmate ON classmate.id = p.student_id AND classmate.class_id = p.class_id
        WHERE p.class_id = v_class_id
          AND public.writing_counts_as_completed(p.writing_context, p.is_confirmed, p.is_submitted)
    ), level_posts AS (
        SELECT DISTINCT ON (p.student_id, COALESCE('mission:' || p.mission_id::TEXT, 'post:' || p.id::TEXT))
               p.student_id, p.char_count
        FROM completed_posts p
        WHERE p.completed_at >= COALESCE(v_season.started_at, v_class_started_at, NOW())
          AND (v_season.closing_started_at IS NULL OR p.completed_at <= v_season.closing_started_at)
        ORDER BY p.student_id, COALESCE('mission:' || p.mission_id::TEXT, 'post:' || p.id::TEXT), p.created_at DESC
    ), writer_stats AS (
        SELECT p.student_id, COALESCE(SUM(p.char_count), 0)::BIGINT AS total_chars, COUNT(*)::BIGINT AS completed_posts
        FROM level_posts p GROUP BY p.student_id
    ), comment_activity AS (
        SELECT c.student_id, c.post_id,
               SUM(char_length(translate(COALESCE(c.content, ''),
                   chr(8203) || chr(8204) || chr(8205) || chr(8288) || chr(65279), '')))::BIGINT AS comment_chars
        FROM public.post_comments c
        JOIN active_classmates classmate ON classmate.id = c.student_id AND classmate.class_id = c.class_id
        JOIN public.student_posts post ON post.id = c.post_id AND post.class_id = c.class_id
        WHERE c.class_id = v_class_id AND c.status = 'approved' AND post.student_id <> c.student_id
          AND c.created_at >= COALESCE(v_season.started_at, v_class_started_at, NOW())
          AND (v_season.closing_started_at IS NULL OR c.created_at <= v_season.closing_started_at)
        GROUP BY c.student_id, c.post_id
    ), reaction_activity AS (
        SELECT DISTINCT r.student_id, r.post_id
        FROM public.post_reactions r
        JOIN active_classmates classmate ON classmate.id = r.student_id AND classmate.class_id = r.class_id
        JOIN public.student_posts post ON post.id = r.post_id AND post.class_id = r.class_id
        WHERE r.class_id = v_class_id AND post.student_id <> r.student_id
          AND r.created_at >= COALESCE(v_season.started_at, v_class_started_at, NOW())
          AND (v_season.closing_started_at IS NULL OR r.created_at <= v_season.closing_started_at)
    ), reader_per_post AS (
        SELECT COALESCE(comment.student_id, reaction.student_id) AS student_id,
               COALESCE(comment.post_id, reaction.post_id) AS post_id,
               COALESCE(comment.comment_chars, 0)::BIGINT AS comment_chars
        FROM comment_activity comment
        FULL OUTER JOIN reaction_activity reaction
          ON reaction.student_id = comment.student_id AND reaction.post_id = comment.post_id
    ), reader_stats AS (
        SELECT activity.student_id, SUM(1 + LEAST(activity.comment_chars / 20, 3))::BIGINT AS score
        FROM reader_per_post activity GROUP BY activity.student_id
    ), live_rows AS (
        SELECT classmate.id, classmate.name,
               classmate.stored_pet_data || jsonb_strip_nulls(jsonb_build_object(
                   '_testWriterLevel', classmate.writer_level_override,
                   '_testReaderLevel', classmate.reader_level_override)) AS pet_data,
               COALESCE(writer.total_chars, 0)::BIGINT AS writer_total_chars,
               COALESCE(writer.completed_posts, 0)::BIGINT AS writer_completed_posts,
               COALESCE(reader.score, 0)::BIGINT AS reader_score
        FROM active_classmates classmate
        LEFT JOIN writer_stats writer ON writer.student_id = classmate.id
        LEFT JOIN reader_stats reader ON reader.student_id = classmate.id
    ), frozen_rows AS (
        SELECT classmate.id, classmate.name,
               COALESCE(record.snapshot -> 'pet_data', classmate.stored_pet_data)
                   || jsonb_strip_nulls(jsonb_build_object(
                       '_testWriterLevel', NULLIF(record.snapshot ->> 'writer_level_override', '')::INTEGER,
                       '_testReaderLevel', NULLIF(record.snapshot ->> 'reader_level_override', '')::INTEGER)) AS pet_data,
               COALESCE((record.snapshot ->> 'writer_total_chars')::BIGINT, 0) AS writer_total_chars,
               COALESCE((record.snapshot ->> 'writer_completed_posts')::BIGINT, 0) AS writer_completed_posts,
               COALESCE((record.snapshot ->> 'reader_score')::BIGINT, 0) AS reader_score
        FROM active_classmates classmate
        LEFT JOIN public.dragon_season_students record
          ON record.class_id = classmate.class_id AND record.student_id = classmate.id AND record.season_id = v_season.id
    )
    SELECT live.id, live.name, live.pet_data, live.writer_total_chars, live.writer_completed_posts, live.reader_score
    FROM live_rows live WHERE COALESCE(v_season.status, 'active') = 'active'
    UNION ALL
    SELECT frozen.id, frozen.name, frozen.pet_data, frozen.writer_total_chars, frozen.writer_completed_posts, frozen.reader_score
    FROM frozen_rows frozen WHERE v_season.status IN ('closing', 'closed')
    ORDER BY 2;
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_hideout_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_hideout_directory() TO authenticated, service_role;

-- 교사용 현재 학기 현황. active는 실시간 집계하고 closing/closed는 학생 스냅샷을 사용한다.
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

    SELECT c.created_at, c.season_started_at
    INTO v_class_created_at, v_legacy_started_at
    FROM public.classes c
    WHERE c.id = p_class_id
      AND (public.auth_user_role() = 'ADMIN' OR c.teacher_id = auth.uid());

    IF NOT FOUND THEN
        RAISE EXCEPTION '이 학급의 수호룡 현황을 볼 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT season.* INTO v_season
    FROM public.dragon_growth_seasons season
    WHERE season.class_id = p_class_id
    ORDER BY (season.status IN ('active', 'closing')) DESC, season.season_number DESC
    LIMIT 1;

    WITH active_roster AS MATERIALIZED (
        SELECT s.id, s.class_id, s.name, COALESCE(s.pet_data, '{}'::JSONB) AS pet_data,
               title_override.writer_level AS writer_level_override,
               title_override.reader_level AS reader_level_override
        FROM public.students s
        LEFT JOIN public.student_title_test_overrides title_override
          ON title_override.student_id = s.id AND title_override.class_id = s.class_id
        WHERE s.class_id = p_class_id
          AND s.is_active IS DISTINCT FROM false
          AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
        ORDER BY s.name, s.id
        LIMIT 100
    ), completed_posts AS MATERIALIZED (
        SELECT p.id, p.student_id, p.mission_id, COALESCE(p.char_count, 0)::INTEGER AS char_count,
               p.created_at,
               CASE WHEN COALESCE(p.writing_context, 'assignment') = 'self'
                    THEN COALESCE(p.published_at, p.updated_at, p.created_at)
                    ELSE COALESCE(p.approved_at, p.updated_at, p.created_at) END AS completed_at
        FROM public.student_posts p
        JOIN active_roster roster ON roster.id = p.student_id AND roster.class_id = p.class_id
        WHERE p.class_id = p_class_id
          AND public.writing_counts_as_completed(p.writing_context, p.is_confirmed, p.is_submitted)
        ORDER BY p.created_at DESC, p.id
        LIMIT 100000
    ), level_posts AS MATERIALIZED (
        SELECT DISTINCT ON (p.student_id, COALESCE('mission:' || p.mission_id::TEXT, 'post:' || p.id::TEXT))
               p.id, p.student_id, p.char_count, p.completed_at, p.created_at
        FROM completed_posts p
        ORDER BY p.student_id, COALESCE('mission:' || p.mission_id::TEXT, 'post:' || p.id::TEXT), p.created_at DESC
    ), career_stats AS MATERIALIZED (
        SELECT p.student_id, COALESCE(SUM(p.char_count), 0)::BIGINT AS career_chars,
               COUNT(*)::BIGINT AS career_posts, MAX(p.completed_at) AS latest_completed_at
        FROM level_posts p GROUP BY p.student_id
    ), writer_stats AS MATERIALIZED (
        SELECT p.student_id, COALESCE(SUM(p.char_count), 0)::BIGINT AS total_chars,
               COUNT(*)::BIGINT AS completed_posts
        FROM level_posts p
        WHERE p.completed_at >= COALESCE(v_season.started_at, v_legacy_started_at, v_class_created_at, NOW())
          AND (v_season.closing_started_at IS NULL OR p.completed_at <= v_season.closing_started_at)
        GROUP BY p.student_id
    ), comment_activity AS MATERIALIZED (
        SELECT c.student_id, c.post_id,
               SUM(char_length(translate(COALESCE(c.content, ''),
                   chr(8203) || chr(8204) || chr(8205) || chr(8288) || chr(65279), '')))::BIGINT AS comment_chars
        FROM public.post_comments c
        JOIN active_roster actor ON actor.id = c.student_id AND actor.class_id = c.class_id
        JOIN public.student_posts post ON post.id = c.post_id AND post.class_id = c.class_id
        WHERE c.class_id = p_class_id AND c.status = 'approved' AND post.student_id <> c.student_id
          AND c.created_at >= COALESCE(v_season.started_at, v_legacy_started_at, v_class_created_at, NOW())
          AND (v_season.closing_started_at IS NULL OR c.created_at <= v_season.closing_started_at)
        GROUP BY c.student_id, c.post_id
    ), reaction_activity AS MATERIALIZED (
        SELECT DISTINCT r.student_id, r.post_id
        FROM public.post_reactions r
        JOIN active_roster actor ON actor.id = r.student_id AND actor.class_id = r.class_id
        JOIN public.student_posts post ON post.id = r.post_id AND post.class_id = r.class_id
        WHERE r.class_id = p_class_id AND post.student_id <> r.student_id
          AND r.created_at >= COALESCE(v_season.started_at, v_legacy_started_at, v_class_created_at, NOW())
          AND (v_season.closing_started_at IS NULL OR r.created_at <= v_season.closing_started_at)
    ), reader_per_post AS MATERIALIZED (
        SELECT COALESCE(comment.student_id, reaction.student_id) AS student_id,
               COALESCE(comment.post_id, reaction.post_id) AS post_id,
               COALESCE(comment.comment_chars, 0)::BIGINT AS comment_chars
        FROM comment_activity comment
        FULL OUTER JOIN reaction_activity reaction
          ON reaction.student_id = comment.student_id AND reaction.post_id = comment.post_id
    ), reader_stats AS MATERIALIZED (
        SELECT activity.student_id, COUNT(*)::INTEGER AS post_count,
               SUM(1 + LEAST(activity.comment_chars / 20, 3))::BIGINT AS score
        FROM reader_per_post activity GROUP BY activity.student_id
    ), live_rows AS MATERIALIZED (
        SELECT roster.id AS student_id, roster.name, roster.pet_data,
               roster.writer_level_override, roster.reader_level_override,
               COALESCE(writer.total_chars, 0)::BIGINT AS writer_total_chars,
               COALESCE(writer.completed_posts, 0)::BIGINT AS writer_completed_posts,
               COALESCE(reader.score, 0)::BIGINT AS reader_score,
               COALESCE(reader.post_count, 0)::INTEGER AS reader_post_count,
               COALESCE(writer.completed_posts, 0)::INTEGER AS season_posts,
               COALESCE(writer.total_chars, 0)::BIGINT AS season_chars,
               COALESCE(career.career_posts, 0)::BIGINT AS career_posts,
               COALESCE(career.career_chars, 0)::BIGINT AS career_chars,
               career.latest_completed_at,
               'draft'::TEXT AS farewell_status
        FROM active_roster roster
        LEFT JOIN writer_stats writer ON writer.student_id = roster.id
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
               COALESCE((record.snapshot ->> 'writer_completed_posts')::INTEGER, 0) AS season_posts,
               COALESCE((record.snapshot ->> 'writer_total_chars')::BIGINT, 0) AS season_chars,
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
        ORDER BY season.season_number DESC LIMIT 20
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
        'students', COALESCE((SELECT jsonb_agg(to_jsonb(student) ORDER BY student.name, student.student_id) FROM student_rows student), '[]'::JSONB),
        'history', COALESCE((SELECT jsonb_agg(to_jsonb(history) ORDER BY history.season_number DESC) FROM history_rows history), '[]'::JSONB)
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
    PERFORM 1 FROM public.classes c
    WHERE c.id = p_class_id
      AND auth.uid() IS NOT NULL
      AND (public.auth_user_role() = 'ADMIN' OR c.teacher_id = auth.uid())
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION '이 학급의 시즌을 관리할 권한이 없습니다.' USING ERRCODE = '42501'; END IF;

    v_dashboard := public.get_teacher_dragon_growth_dashboard(p_class_id);
    IF COALESCE(v_dashboard #>> '{season,status}', 'active') <> 'active' THEN
        RAISE EXCEPTION '성장 중인 시즌만 작별 기간을 열 수 있습니다.' USING ERRCODE = '22023';
    END IF;

    v_season_id := NULLIF(v_dashboard #>> '{season,id}', '')::UUID;
    v_season_number := COALESCE((v_dashboard #>> '{season,number}')::INTEGER, 1);
    v_season_name := COALESCE(NULLIF(BTRIM(p_season_name), ''), v_dashboard #>> '{season,name}', v_season_number || '번째 시즌');
    v_started_at := COALESCE((v_dashboard #>> '{season,started_at}')::TIMESTAMPTZ, v_now);
    IF char_length(v_season_name) NOT BETWEEN 1 AND 40 THEN
        RAISE EXCEPTION '시즌 이름은 1~40자로 입력해주세요.' USING ERRCODE = '22023';
    END IF;

    IF v_season_id IS NULL THEN
        INSERT INTO public.dragon_growth_seasons(class_id, season_number, name, started_at, status, created_by)
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
    SET name = v_season_name, status = 'closing', closing_started_at = v_now,
        farewell_deadline = p_farewell_deadline,
        snapshot = jsonb_build_object(
            'captured_at', v_now,
            'students', v_students,
            'totals', jsonb_build_object(
                'student_count', jsonb_array_length(v_students),
                'season_posts', COALESCE((SELECT SUM((student ->> 'season_posts')::INTEGER) FROM jsonb_array_elements(v_students) student), 0),
                'season_chars', COALESCE((SELECT SUM((student ->> 'season_chars')::BIGINT) FROM jsonb_array_elements(v_students) student), 0)
            )
        )
    WHERE id = v_season_id AND class_id = p_class_id AND status = 'active';

    RETURN jsonb_build_object('season_id', v_season_id, 'season_number', v_season_number,
        'season_name', v_season_name, 'status', 'closing', 'student_count', jsonb_array_length(v_students));
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_teacher_dragon_season(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_now TIMESTAMPTZ := clock_timestamp();
    v_season public.dragon_growth_seasons%ROWTYPE;
    v_completed INTEGER;
    v_total INTEGER;
BEGIN
    PERFORM 1 FROM public.classes c
    WHERE c.id = p_class_id AND auth.uid() IS NOT NULL
      AND (public.auth_user_role() = 'ADMIN' OR c.teacher_id = auth.uid())
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION '이 학급의 시즌을 관리할 권한이 없습니다.' USING ERRCODE = '42501'; END IF;

    SELECT season.* INTO v_season FROM public.dragon_growth_seasons season
    WHERE season.class_id = p_class_id AND season.status = 'closing'
    ORDER BY season.season_number DESC LIMIT 1 FOR UPDATE;
    IF v_season.id IS NULL THEN RAISE EXCEPTION '작별 기간인 시즌이 없습니다.' USING ERRCODE = '22023'; END IF;

    SELECT COUNT(*) FILTER (WHERE farewell_status = 'completed'), COUNT(*)
    INTO v_completed, v_total
    FROM public.dragon_season_students record
    WHERE record.class_id = p_class_id AND record.season_id = v_season.id;

    UPDATE public.dragon_growth_seasons
    SET status = 'closed', ended_at = v_now, closed_at = v_now,
        snapshot = snapshot || jsonb_build_object('farewell_completed', v_completed, 'farewell_total', v_total)
    WHERE id = v_season.id;

    RETURN jsonb_build_object('season_id', v_season.id, 'season_number', v_season.season_number,
        'season_name', v_season.name, 'status', 'closed', 'farewell_completed', v_completed, 'farewell_total', v_total);
END;
$$;

CREATE OR REPLACE FUNCTION public.start_teacher_dragon_season(
    p_class_id UUID,
    p_season_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_now TIMESTAMPTZ := clock_timestamp();
    v_number INTEGER;
    v_name TEXT;
    v_id UUID;
BEGIN
    PERFORM 1 FROM public.classes c
    WHERE c.id = p_class_id AND auth.uid() IS NOT NULL
      AND (public.auth_user_role() = 'ADMIN' OR c.teacher_id = auth.uid())
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION '이 학급의 시즌을 관리할 권한이 없습니다.' USING ERRCODE = '42501'; END IF;

    IF EXISTS (SELECT 1 FROM public.dragon_growth_seasons season
               WHERE season.class_id = p_class_id AND season.status IN ('active', 'closing')) THEN
        RAISE EXCEPTION '먼저 현재 시즌을 종료해주세요.' USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(MAX(season_number), 0) + 1 INTO v_number
    FROM public.dragon_growth_seasons WHERE class_id = p_class_id;
    v_name := COALESCE(NULLIF(BTRIM(p_season_name), ''), v_number || '번째 시즌');
    IF char_length(v_name) NOT BETWEEN 1 AND 40 THEN
        RAISE EXCEPTION '시즌 이름은 1~40자로 입력해주세요.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.dragon_growth_seasons(class_id, season_number, name, started_at, status, created_by)
    VALUES (p_class_id, v_number, v_name, v_now, 'active', auth.uid()) RETURNING id INTO v_id;

    -- 구입·장착 소품과 포인트는 그대로 둔다. 학기 안에서만 의미 있는 용 종류·교감·성장 확인만 비운다.
    UPDATE public.students s
    SET pet_data = (COALESCE(s.pet_data, '{}'::JSONB)
        - 'species' - 'speciesReselectedAt' - 'lastFed' - 'bondCount'
        - 'lastCelebratedWriterLevel' - 'lastCelebratedTestWriterLevel')
        || jsonb_build_object('name', '나의 드래곤')
    WHERE s.class_id = p_class_id
      AND s.is_active IS DISTINCT FROM false
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW());

    UPDATE public.classes SET season_started_at = v_now WHERE id = p_class_id;

    RETURN jsonb_build_object('season_id', v_id, 'season_number', v_number,
        'season_name', v_name, 'status', 'active', 'started_at', v_now);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_dragon_season_farewell()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID;
    v_result JSONB;
BEGIN
    IF v_student_id IS NULL THEN RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501'; END IF;
    SELECT s.class_id INTO v_class_id FROM public.students s WHERE s.id = v_student_id;

    SELECT jsonb_build_object(
        'current', (
            SELECT jsonb_build_object(
                'season', jsonb_build_object('id', season.id, 'number', season.season_number,
                    'name', season.name, 'status', season.status, 'started_at', season.started_at,
                    'closing_started_at', season.closing_started_at, 'closed_at', season.closed_at,
                    'farewell_deadline', season.farewell_deadline),
                'snapshot', record.snapshot,
                'farewell_content', record.farewell_content,
                'farewell_status', record.farewell_status,
                'farewell_completed_at', record.farewell_completed_at
            )
            FROM public.dragon_growth_seasons season
            JOIN public.dragon_season_students record
              ON record.season_id = season.id AND record.class_id = season.class_id
            WHERE season.class_id = v_class_id AND record.student_id = v_student_id
              AND season.status = 'closing'
            ORDER BY season.season_number DESC LIMIT 1
        ),
        'history', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'season', jsonb_build_object('id', season.id, 'number', season.season_number,
                    'name', season.name, 'status', season.status, 'started_at', season.started_at,
                    'closed_at', season.closed_at),
                'snapshot', record.snapshot,
                'farewell_content', record.farewell_content,
                'farewell_status', record.farewell_status,
                'farewell_completed_at', record.farewell_completed_at
            ) ORDER BY season.season_number DESC)
            FROM public.dragon_growth_seasons season
            JOIN public.dragon_season_students record
              ON record.season_id = season.id AND record.class_id = season.class_id
            WHERE season.class_id = v_class_id AND record.student_id = v_student_id
              AND season.status = 'closed'
        ), '[]'::JSONB)
    ) INTO v_result;
    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_my_dragon_farewell(
    p_content TEXT,
    p_complete BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID;
    v_season_id UUID;
    v_content TEXT := COALESCE(p_content, '');
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    IF v_student_id IS NULL THEN RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501'; END IF;
    IF char_length(v_content) > 1200 THEN RAISE EXCEPTION '작별 편지는 1,200자까지 쓸 수 있어요.' USING ERRCODE = '22023'; END IF;
    IF p_complete AND char_length(BTRIM(v_content)) < 50 THEN
        RAISE EXCEPTION '작별 편지는 50자 이상 써주세요.' USING ERRCODE = '22023';
    END IF;

    SELECT s.class_id INTO v_class_id FROM public.students s WHERE s.id = v_student_id;
    SELECT season.id INTO v_season_id FROM public.dragon_growth_seasons season
    WHERE season.class_id = v_class_id AND season.status = 'closing'
    ORDER BY season.season_number DESC LIMIT 1;
    IF v_season_id IS NULL THEN RAISE EXCEPTION '지금은 작별 편지를 쓰는 기간이 아닙니다.' USING ERRCODE = '22023'; END IF;

    UPDATE public.dragon_season_students record
    SET farewell_content = v_content,
        farewell_status = CASE WHEN p_complete THEN 'completed' ELSE 'draft' END,
        farewell_completed_at = CASE WHEN p_complete THEN COALESCE(record.farewell_completed_at, v_now) ELSE NULL END,
        updated_at = v_now
    WHERE record.season_id = v_season_id AND record.class_id = v_class_id AND record.student_id = v_student_id;
    IF NOT FOUND THEN RAISE EXCEPTION '수호룡 학기 기록을 찾지 못했습니다.' USING ERRCODE = 'P0002'; END IF;

    RETURN jsonb_build_object('success', true, 'season_id', v_season_id,
        'farewell_content', v_content, 'farewell_status', CASE WHEN p_complete THEN 'completed' ELSE 'draft' END,
        'farewell_completed_at', CASE WHEN p_complete THEN v_now ELSE NULL END);
END;
$$;

-- 예전 한 번짜리 전환 함수는 새 상태 흐름을 건너뛰지 못하게 막는다.
-- 기존 함수와 인자 이름·기본값을 그대로 둔다 — 이름을 빼면 CREATE OR REPLACE 가 거부되고,
-- 기본값을 빼면 옛 배포 화면이 p_class_id 만 넘길 때 함수를 못 찾는다.
CREATE OR REPLACE FUNCTION public.close_teacher_dragon_growth_season(p_class_id UUID, p_season_name TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RAISE EXCEPTION '작별 기간 열기 → 시즌 종료 → 새 시즌 시작 순서로 진행해주세요.' USING ERRCODE = '0A000';
END;
$$;

REVOKE ALL ON FUNCTION public.open_teacher_dragon_season_closing(UUID, TEXT, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finalize_teacher_dragon_season(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.start_teacher_dragon_season(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_dragon_season_farewell() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_my_dragon_farewell(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_teacher_dragon_season_closing(UUID, TEXT, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_teacher_dragon_season(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_teacher_dragon_season(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_dragon_season_farewell() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_my_dragon_farewell(TEXT, BOOLEAN) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
