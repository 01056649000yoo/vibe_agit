-- 칭호 기준 동기화 — **손으로 고치지 마세요.**
-- `src/constants/writerLevels.js` 를 고친 뒤
-- `node scripts/sync-title-levels.mjs --write` 로 다시 만듭니다.
--
-- 화면과 DB 가 같은 기준을 봐야 하는 이유: DB 쪽은 학기 마감 때 그 시점의 칭호를
-- 스냅샷에 얼려 두는 데 쓰인다. 어긋나면 작별 편지의 칭호가 화면과 달라진다.

BEGIN;

-- 현재 시즌에서 이미 얻은 독서가 단계는 기준 변경 때문에 내려가지 않게 별도 보존한다.
CREATE TABLE IF NOT EXISTS public.student_reading_title_level_floors (
    season_id UUID NOT NULL REFERENCES public.dragon_growth_seasons(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    minimum_level SMALLINT NOT NULL CHECK (minimum_level BETWEEN 1 AND 7),
    criteria_version INTEGER NOT NULL DEFAULT 1,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (season_id, student_id)
);

ALTER TABLE public.student_reading_title_level_floors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.student_reading_title_level_floors FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.student_reading_title_level_floors TO service_role;

COMMENT ON TABLE public.student_reading_title_level_floors IS
    '독서가 편수 단일 기준 전환 시 이미 달성한 현재·마감 시즌 단계의 하한. 새 시즌에는 행을 만들지 않는다.';

INSERT INTO public.student_reading_title_level_floors (season_id, class_id, student_id, minimum_level)
SELECT record.season_id, record.class_id, record.student_id,
       GREATEST(
           COALESCE((record.snapshot ->> 'reading_level')::SMALLINT, 1),
           public.dragon_reading_level(
               COALESCE((record.snapshot ->> 'reading_log_count')::BIGINT, 0),
               COALESCE((record.snapshot ->> 'reading_book_count')::BIGINT, 0)
           )
       )::SMALLINT
FROM public.dragon_season_students record
WHERE GREATEST(
    COALESCE((record.snapshot ->> 'reading_level')::SMALLINT, 1),
    public.dragon_reading_level(
        COALESCE((record.snapshot ->> 'reading_log_count')::BIGINT, 0),
        COALESCE((record.snapshot ->> 'reading_book_count')::BIGINT, 0)
    )
) > 1
ON CONFLICT (season_id, student_id) DO UPDATE
SET minimum_level = GREATEST(public.student_reading_title_level_floors.minimum_level, EXCLUDED.minimum_level);

INSERT INTO public.student_reading_title_level_floors (season_id, class_id, student_id, minimum_level)
SELECT season.id, season.class_id, stats.student_id,
       public.dragon_reading_level(stats.reading_log_count, stats.reading_book_count)::SMALLINT
FROM public.dragon_growth_seasons season
JOIN public.classes class_row ON class_row.id = season.class_id
CROSS JOIN LATERAL public.get_class_writing_title_stats_v1(
    season.class_id,
    COALESCE(season.started_at, class_row.season_started_at, class_row.created_at, NOW()),
    season.closing_started_at
) stats
WHERE season.status IN ('active', 'closing')
  AND public.dragon_reading_level(stats.reading_log_count, stats.reading_book_count) > 1
ON CONFLICT (season_id, student_id) DO UPDATE
SET minimum_level = GREATEST(public.student_reading_title_level_floors.minimum_level, EXCLUDED.minimum_level);

CREATE OR REPLACE FUNCTION public.dragon_writer_level(
    p_chars BIGINT,
    p_posts BIGINT,
    p_override INTEGER DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
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

CREATE OR REPLACE FUNCTION public.dragon_diary_level(p_days BIGINT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT CASE
        WHEN COALESCE(p_days, 0) >= 40 THEN 7
        WHEN COALESCE(p_days, 0) >= 30 THEN 6
        WHEN COALESCE(p_days, 0) >= 21 THEN 5
        WHEN COALESCE(p_days, 0) >= 14 THEN 4
        WHEN COALESCE(p_days, 0) >= 7 THEN 3
        WHEN COALESCE(p_days, 0) >= 3 THEN 2
        ELSE 1
    END;
$$;

CREATE OR REPLACE FUNCTION public.dragon_reading_level(p_logs BIGINT, p_books BIGINT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT CASE
        WHEN COALESCE(p_logs, 0) >= 30 THEN 7
        WHEN COALESCE(p_logs, 0) >= 22 THEN 6
        WHEN COALESCE(p_logs, 0) >= 15 THEN 5
        WHEN COALESCE(p_logs, 0) >= 10 THEN 4
        WHEN COALESCE(p_logs, 0) >= 6 THEN 3
        WHEN COALESCE(p_logs, 0) >= 3 THEN 2
        ELSE 1
    END;
$$;

COMMENT ON FUNCTION public.dragon_reading_level(BIGINT, BIGINT) IS
    '독서가 칭호는 교사가 확인한 독서록 편수로만 계산한다. p_books는 기존 호출 호환을 위해만 유지한다.';

REVOKE ALL ON FUNCTION public.dragon_diary_level(BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dragon_reading_level(BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dragon_diary_level(BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.dragon_reading_level(BIGINT, BIGINT) TO service_role;

-- 공개 상태·보상 판정은 새 편수 기준과 현재 시즌 보존 하한을 같은 경로로 사용한다.
CREATE OR REPLACE FUNCTION public.get_title_activity_test_state_v1(
    p_student_id UUID,
    p_class_id UUID,
    p_progress JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_diary_override SMALLINT;
    v_reading_override SMALLINT;
    v_reading_floor SMALLINT := 1;
BEGIN
    SELECT override.diary_level, override.reading_level
    INTO v_diary_override, v_reading_override
    FROM public.student_title_test_overrides override
    WHERE override.student_id = p_student_id
      AND override.class_id = p_class_id;

    SELECT COALESCE(floor.minimum_level, 1)
    INTO v_reading_floor
    FROM public.dragon_growth_seasons season
    LEFT JOIN public.student_reading_title_level_floors floor
      ON floor.season_id = season.id
     AND floor.class_id = p_class_id
     AND floor.student_id = p_student_id
    WHERE season.class_id = p_class_id
    ORDER BY (season.status IN ('active', 'closing')) DESC, season.season_number DESC
    LIMIT 1;

    RETURN jsonb_build_object(
        'diary_level_override', v_diary_override,
        'reading_level_override', v_reading_override,
        'reading_level_floor', COALESCE(v_reading_floor, 1),
        'diary_level', COALESCE(
            v_diary_override,
            public.dragon_diary_level(COALESCE((p_progress ->> 'diary_days')::BIGINT, 0))
        ),
        'reading_level', COALESCE(
            v_reading_override,
            GREATEST(
                public.dragon_reading_level(
                    COALESCE((p_progress ->> 'reading_log_count')::BIGINT, 0),
                    COALESCE((p_progress ->> 'reading_book_count')::BIGINT, 0)
                ),
                COALESCE(v_reading_floor, 1)
            )
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_title_activity_test_state_v1(UUID, UUID, JSONB)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_title_activity_test_state_v1(UUID, UUID, JSONB) TO service_role;

COMMENT ON FUNCTION public.get_title_activity_test_state_v1(UUID, UUID, JSONB) IS
    '기록가·독서가의 실제 단계와 비공개 시험 덮어쓰기를 한 곳에서 조합한다.';

CREATE OR REPLACE FUNCTION public.get_my_title_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID;
    v_progress JSONB;
    v_context JSONB;
    v_policy JSONB;
    v_activity_levels JSONB;
    v_season_id UUID;
    v_season_status TEXT;
    v_claiming_enabled BOOLEAN := false;
    v_diary JSONB;
    v_reading JSONB;
BEGIN
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT student.class_id INTO v_class_id
    FROM public.students student
    WHERE student.id = v_student_id
      AND student.deleted_at IS NULL
      AND student.is_active IS DISTINCT FROM false;
    IF v_class_id IS NULL THEN
        RAISE EXCEPTION '활성 학생 정보를 찾을 수 없습니다.' USING ERRCODE = 'P0002';
    END IF;

    v_progress := public.get_my_title_progress_v1();
    v_context := public.get_title_season_context_v1(v_class_id);
    v_activity_levels := public.get_title_activity_test_state_v1(
        v_student_id, v_class_id, v_progress
    );
    v_policy := COALESCE(v_context -> 'reward_policy',
        '{"version":1,"tracks":{"diary":[0,200,400,600,800,1200,1800],"reading":[0,200,400,600,800,1200,1800]}}'::JSONB);
    v_season_id := NULLIF(v_context ->> 'id', '')::UUID;
    v_season_status := COALESCE(v_context ->> 'status', 'active');
    v_claiming_enabled := COALESCE((v_context ->> 'rewards_enabled')::BOOLEAN, false)
        AND v_season_status IN ('active', 'closing')
        AND v_season_id IS NOT NULL;

    v_diary := public.build_title_reward_track_state_v1(
        v_student_id, v_season_id, 'diary',
        COALESCE((v_activity_levels ->> 'diary_level')::INTEGER, 1),
        v_policy, v_claiming_enabled
    );
    v_reading := public.build_title_reward_track_state_v1(
        v_student_id, v_season_id, 'reading',
        COALESCE((v_activity_levels ->> 'reading_level')::INTEGER, 1),
        v_policy, v_claiming_enabled
    );

    RETURN v_progress || jsonb_build_object(
        'diary_level_override', NULLIF(v_activity_levels ->> 'diary_level_override', '')::INTEGER,
        'reading_level_override', NULLIF(v_activity_levels ->> 'reading_level_override', '')::INTEGER,
        'reading_level_floor', COALESCE((v_activity_levels ->> 'reading_level_floor')::INTEGER, 1),
        'season', COALESCE(v_progress -> 'season', '{}'::JSONB) || jsonb_build_object(
            'rewards_enabled', v_claiming_enabled,
            'reward_policy_version', COALESCE((v_policy ->> 'version')::INTEGER, 1)
        ),
        'title_rewards', jsonb_build_object(
            'enabled', v_claiming_enabled,
            'policy_version', COALESCE((v_policy ->> 'version')::INTEGER, 1),
            'season_id', v_season_id,
            'season_status', v_season_status,
            'claimable_total', COALESCE((v_diary ->> 'claimable_total')::INTEGER, 0)
                + COALESCE((v_reading ->> 'claimable_total')::INTEGER, 0),
            'claimed_total', COALESCE((v_diary ->> 'claimed_total')::INTEGER, 0)
                + COALESCE((v_reading ->> 'claimed_total')::INTEGER, 0),
            'tracks', jsonb_build_object('diary', v_diary, 'reading', v_reading)
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_title_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_title_status() TO authenticated, service_role;

COMMENT ON FUNCTION public.get_my_title_status() IS
    '학생 본인의 네 칭호 원자료와 현재 시즌 보상 상태. 비공개 시험 학생은 기록가·독서가 단계 덮어쓰기를 함께 반환한다.';



-- 교사 현황과 친구 아지트도 같은 보존 하한을 기존 RPC 응답에 포함한다.
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
               title_override.reader_level AS reader_level_override,
               title_override.reading_level AS reading_level_override,
               COALESCE(reading_floor.minimum_level, 1)::SMALLINT AS reading_level_floor
        FROM public.students student
        LEFT JOIN public.student_title_test_overrides title_override
          ON title_override.student_id = student.id
         AND title_override.class_id = student.class_id
        LEFT JOIN public.student_reading_title_level_floors reading_floor
          ON reading_floor.season_id = v_season.id
         AND reading_floor.class_id = student.class_id
         AND reading_floor.student_id = student.id
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
               roster.reading_level_override, roster.reading_level_floor,
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
               NULLIF(record.snapshot ->> 'reading_level_override', '')::SMALLINT AS reading_level_override,
               GREATEST(COALESCE((record.snapshot ->> 'reading_level')::SMALLINT, 1), roster.reading_level_floor)::SMALLINT AS reading_level_floor,
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
    reading_book_count INTEGER,
    reading_level_floor SMALLINT
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
               COALESCE(title.reading_book_count, 0)::INTEGER AS reading_book_count,
               COALESCE(reading_floor.minimum_level, 1)::SMALLINT AS reading_level_floor
        FROM active_classmates classmate
        LEFT JOIN title_stats title ON title.student_id = classmate.id
        LEFT JOIN reader_stats reader ON reader.student_id = classmate.id
        LEFT JOIN public.student_reading_title_level_floors reading_floor
          ON reading_floor.season_id = v_season.id
         AND reading_floor.class_id = classmate.class_id
         AND reading_floor.student_id = classmate.id
    ), frozen_rows AS (
        SELECT classmate.id, classmate.name,
               COALESCE(record.snapshot -> 'pet_data', classmate.stored_pet_data) AS pet_data,
               COALESCE((record.snapshot ->> 'writer_total_chars')::BIGINT, 0) AS writer_total_chars,
               COALESCE((record.snapshot ->> 'writer_completed_posts')::BIGINT, 0) AS writer_completed_posts,
               COALESCE((record.snapshot ->> 'reader_score')::BIGINT, 0) AS reader_score,
               COALESCE((record.snapshot ->> 'diary_days')::INTEGER, 0) AS diary_days,
               COALESCE((record.snapshot ->> 'reading_log_count')::INTEGER, 0) AS reading_log_count,
               COALESCE((record.snapshot ->> 'reading_book_count')::INTEGER, 0) AS reading_book_count,
               GREATEST(COALESCE((record.snapshot ->> 'reading_level')::SMALLINT, 1), COALESCE(reading_floor.minimum_level, 1))::SMALLINT AS reading_level_floor
        FROM active_classmates classmate
        LEFT JOIN public.dragon_season_students record
          ON record.class_id = classmate.class_id
         AND record.student_id = classmate.id
         AND record.season_id = v_season.id
        LEFT JOIN public.student_reading_title_level_floors reading_floor
          ON reading_floor.season_id = v_season.id
         AND reading_floor.class_id = classmate.class_id
         AND reading_floor.student_id = classmate.id
    )
    SELECT live.id, live.name, live.pet_data,
           live.writer_total_chars, live.writer_completed_posts, live.reader_score,
           live.diary_days, live.reading_log_count, live.reading_book_count, live.reading_level_floor
    FROM live_rows live WHERE COALESCE(v_season.status, 'active') = 'active'
    UNION ALL
    SELECT frozen.id, frozen.name, frozen.pet_data,
           frozen.writer_total_chars, frozen.writer_completed_posts, frozen.reader_score,
           frozen.diary_days, frozen.reading_log_count, frozen.reading_book_count, frozen.reading_level_floor
    FROM frozen_rows frozen WHERE v_season.status IN ('closing', 'closed')
    ORDER BY 2;
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_hideout_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_hideout_directory() TO authenticated, service_role;

COMMENT ON FUNCTION public.get_student_hideout_directory() IS
    '같은 학급 친구의 실제 학기 작가·소통·기록가·독서가 칭호 원자료와 수호룡 목록. 최대 100명.';

-- 시즌 마감 스냅샷에는 시험 덮어쓰기 또는 전환 하한까지 반영한 최종 단계를 고정한다.
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
            'reading_level', COALESCE(
                NULLIF(student ->> 'reading_level_override', '')::INTEGER,
                GREATEST(
                    public.dragon_reading_level(
                        COALESCE((student ->> 'reading_log_count')::BIGINT, 0),
                        COALESCE((student ->> 'reading_book_count')::BIGINT, 0)
                    ),
                    COALESCE((student ->> 'reading_level_floor')::INTEGER, 1)
                )
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

NOTIFY pgrst, 'reload schema';

COMMIT;
