-- 작가 수호룡 교사 대시보드와 전용 시즌 기록.
--
-- 예전 드래곤 관리 화면은 `agit_season_history`를 아지트 온 클래스와 함께 사용했고,
-- pet_data의 옛 먹이 레벨을 초기화하는 방식이었다. 현재 수호룡은 작가 칭호 10단계와
-- 독자 효과 7단계를 합성하므로 시즌은 "성장을 지우는 리셋"이 아니라 학급 운영 기록 구간이다.
-- 시즌을 바꿔도 작가·독자 성장, 선택한 수호룡, 구입·장착한 꾸미기 아이템은 그대로 보존한다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.dragon_growth_seasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    season_number INTEGER NOT NULL CHECK (season_number > 0),
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT dragon_growth_seasons_class_number_unique UNIQUE (class_id, season_number),
    CONSTRAINT dragon_growth_seasons_time_order CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dragon_growth_seasons_one_active
    ON public.dragon_growth_seasons (class_id)
    WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_dragon_growth_seasons_class_ended
    ON public.dragon_growth_seasons (class_id, ended_at DESC);

ALTER TABLE public.dragon_growth_seasons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dragon_growth_seasons FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.dragon_growth_seasons TO service_role;

COMMENT ON TABLE public.dragon_growth_seasons IS
    '작가 수호룡 전용 시즌 기록. 시즌 전환은 성장·소품을 초기화하지 않고 학급 스냅샷만 보관한다.';

CREATE OR REPLACE FUNCTION public.get_teacher_dragon_growth_dashboard(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_class_created_at TIMESTAMPTZ;
    v_legacy_started_at TIMESTAMPTZ;
    v_season_id UUID;
    v_season_number INTEGER;
    v_season_name TEXT;
    v_season_started_at TIMESTAMPTZ;
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT c.created_at, c.season_started_at
    INTO v_class_created_at, v_legacy_started_at
    FROM public.classes c
    WHERE c.id = p_class_id
      AND (
          public.auth_user_role() = 'ADMIN'
          OR c.teacher_id = auth.uid()
      );

    IF NOT FOUND THEN
        RAISE EXCEPTION '이 학급의 수호룡 현황을 볼 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT season.id, season.season_number, season.name, season.started_at
    INTO v_season_id, v_season_number, v_season_name, v_season_started_at
    FROM public.dragon_growth_seasons season
    WHERE season.class_id = p_class_id
      AND season.ended_at IS NULL
    ORDER BY season.started_at DESC
    LIMIT 1;

    IF v_season_id IS NULL THEN
        SELECT COALESCE(MAX(season.season_number), 0) + 1
        INTO v_season_number
        FROM public.dragon_growth_seasons season
        WHERE season.class_id = p_class_id;

        v_season_name := v_season_number::TEXT || '번째 시즌';
        v_season_started_at := COALESCE(v_legacy_started_at, v_class_created_at, NOW());
    END IF;

    WITH active_roster AS MATERIALIZED (
        SELECT
            s.id,
            s.name,
            COALESCE(s.pet_data, '{}'::JSONB) AS pet_data,
            title_override.writer_level AS writer_level_override,
            title_override.reader_level AS reader_level_override
        FROM public.students s
        LEFT JOIN public.student_title_test_overrides title_override
          ON title_override.student_id = s.id
         AND title_override.class_id = s.class_id
        WHERE s.class_id = p_class_id
          AND s.is_active IS DISTINCT FROM false
          AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
        ORDER BY s.name, s.id
        LIMIT 100
    ), completed_posts AS MATERIALIZED (
        SELECT
            p.id,
            p.student_id,
            p.mission_id,
            COALESCE(p.char_count, 0)::INTEGER AS char_count,
            p.created_at,
            CASE
                WHEN COALESCE(p.writing_context, 'assignment') = 'self'
                    THEN COALESCE(p.published_at, p.updated_at, p.created_at)
                ELSE COALESCE(p.approved_at, p.updated_at, p.created_at)
            END AS completed_at
        FROM public.student_posts p
        JOIN active_roster roster ON roster.id = p.student_id
        WHERE p.class_id = p_class_id
          AND public.writing_counts_as_completed(p.writing_context, p.is_confirmed, p.is_submitted)
        ORDER BY p.created_at DESC, p.id
        LIMIT 100000
    ), level_posts AS MATERIALIZED (
        -- 작가 칭호와 똑같이 과제는 미션별 최신 한 편, 자율 글은 각 글을 센다.
        SELECT DISTINCT ON (
            p.student_id,
            COALESCE('mission:' || p.mission_id::TEXT, 'post:' || p.id::TEXT)
        )
            p.id,
            p.student_id,
            p.char_count,
            p.completed_at,
            p.created_at
        FROM completed_posts p
        ORDER BY
            p.student_id,
            COALESCE('mission:' || p.mission_id::TEXT, 'post:' || p.id::TEXT),
            p.created_at DESC
    ), writer_stats AS MATERIALIZED (
        SELECT
            p.student_id,
            COALESCE(SUM(p.char_count), 0)::BIGINT AS total_chars,
            COUNT(*)::BIGINT AS completed_posts,
            MAX(p.completed_at) AS latest_completed_at
        FROM level_posts p
        GROUP BY p.student_id
    ), season_stats AS MATERIALIZED (
        SELECT
            p.student_id,
            COUNT(*)::INTEGER AS season_posts,
            COALESCE(SUM(p.char_count), 0)::BIGINT AS season_chars
        FROM level_posts p
        WHERE p.completed_at >= v_season_started_at
        GROUP BY p.student_id
    ), comment_rows AS MATERIALIZED (
        SELECT c.student_id, c.post_id, c.content
        FROM public.post_comments c
        JOIN active_roster actor ON actor.id = c.student_id
        JOIN public.student_posts post
          ON post.id = c.post_id
         AND post.class_id = c.class_id
        WHERE c.class_id = p_class_id
          AND c.status = 'approved'
          AND post.student_id <> c.student_id
        ORDER BY c.created_at DESC, c.id
        LIMIT 100000
    ), comment_activity AS MATERIALIZED (
        SELECT
            c.student_id,
            c.post_id,
            SUM(char_length(translate(
                COALESCE(c.content, ''),
                chr(8203) || chr(8204) || chr(8205) || chr(8288) || chr(65279),
                ''
            )))::BIGINT AS comment_chars
        FROM comment_rows c
        GROUP BY c.student_id, c.post_id
    ), reaction_activity AS MATERIALIZED (
        SELECT DISTINCT reaction.student_id, reaction.post_id
        FROM (
            SELECT r.student_id, r.post_id
            FROM public.post_reactions r
            JOIN active_roster actor ON actor.id = r.student_id
            JOIN public.student_posts post
              ON post.id = r.post_id
             AND post.class_id = r.class_id
            WHERE r.class_id = p_class_id
              AND post.student_id <> r.student_id
            ORDER BY r.created_at DESC, r.id
            LIMIT 100000
        ) reaction
    ), reader_per_post AS MATERIALIZED (
        SELECT
            COALESCE(comment.student_id, reaction.student_id) AS student_id,
            COALESCE(comment.post_id, reaction.post_id) AS post_id,
            COALESCE(comment.comment_chars, 0)::BIGINT AS comment_chars
        FROM comment_activity comment
        FULL OUTER JOIN reaction_activity reaction
          ON reaction.student_id = comment.student_id
         AND reaction.post_id = comment.post_id
    ), reader_stats AS MATERIALIZED (
        SELECT
            activity.student_id,
            COUNT(*)::INTEGER AS post_count,
            SUM(1 + LEAST(activity.comment_chars / 20, 3))::BIGINT AS score
        FROM reader_per_post activity
        GROUP BY activity.student_id
    ), student_rows AS MATERIALIZED (
        SELECT
            roster.id AS student_id,
            roster.name,
            roster.pet_data,
            roster.writer_level_override,
            roster.reader_level_override,
            COALESCE(writer.total_chars, 0)::BIGINT AS writer_total_chars,
            COALESCE(writer.completed_posts, 0)::BIGINT AS writer_completed_posts,
            COALESCE(reader.score, 0)::BIGINT AS reader_score,
            COALESCE(reader.post_count, 0)::INTEGER AS reader_post_count,
            COALESCE(current_season.season_posts, 0)::INTEGER AS season_posts,
            COALESCE(current_season.season_chars, 0)::BIGINT AS season_chars,
            writer.latest_completed_at
        FROM active_roster roster
        LEFT JOIN writer_stats writer ON writer.student_id = roster.id
        LEFT JOIN reader_stats reader ON reader.student_id = roster.id
        LEFT JOIN season_stats current_season ON current_season.student_id = roster.id
        ORDER BY roster.name, roster.id
    ), history_rows AS MATERIALIZED (
        SELECT season.id, season.season_number, season.name, season.started_at,
               season.ended_at, season.snapshot
        FROM public.dragon_growth_seasons season
        WHERE season.class_id = p_class_id
          AND season.ended_at IS NOT NULL
        ORDER BY season.ended_at DESC
        LIMIT 20
    )
    SELECT jsonb_build_object(
        'generated_at', NOW(),
        'season', jsonb_build_object(
            'id', v_season_id,
            'number', v_season_number,
            'name', v_season_name,
            'started_at', v_season_started_at
        ),
        'students', COALESCE((
            SELECT jsonb_agg(to_jsonb(student) ORDER BY student.name, student.student_id)
            FROM student_rows student
        ), '[]'::JSONB),
        'history', COALESCE((
            SELECT jsonb_agg(to_jsonb(history) ORDER BY history.ended_at DESC)
            FROM history_rows history
        ), '[]'::JSONB)
    )
    INTO v_result;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_dragon_growth_dashboard(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_dragon_growth_dashboard(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.close_teacher_dragon_growth_season(
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
    v_dashboard JSONB;
    v_current_id UUID;
    v_current_number INTEGER;
    v_current_name TEXT;
    v_current_started_at TIMESTAMPTZ;
    v_snapshot_students JSONB;
    v_snapshot JSONB;
    v_next_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    -- 동시에 두 번 눌러 중복 시즌이 생기지 않게 학급 행을 잠근다.
    PERFORM 1
    FROM public.classes c
    WHERE c.id = p_class_id
      AND (
          public.auth_user_role() = 'ADMIN'
          OR c.teacher_id = auth.uid()
      )
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION '이 학급의 수호룡 시즌을 관리할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    IF p_season_name IS NOT NULL
       AND (char_length(BTRIM(p_season_name)) < 1 OR char_length(BTRIM(p_season_name)) > 40) THEN
        RAISE EXCEPTION '시즌 이름은 1~40자로 입력해주세요.' USING ERRCODE = '22023';
    END IF;

    v_dashboard := public.get_teacher_dragon_growth_dashboard(p_class_id);
    v_current_id := NULLIF(v_dashboard #>> '{season,id}', '')::UUID;
    v_current_number := COALESCE((v_dashboard #>> '{season,number}')::INTEGER, 1);
    v_current_name := COALESCE(NULLIF(BTRIM(p_season_name), ''), v_dashboard #>> '{season,name}', v_current_number::TEXT || '번째 시즌');
    v_current_started_at := COALESCE((v_dashboard #>> '{season,started_at}')::TIMESTAMPTZ, v_now);

    SELECT COALESCE(jsonb_agg(
        student
        || jsonb_build_object(
            'writer_level', CASE
                WHEN NULLIF(student ->> 'writer_level_override', '')::INTEGER BETWEEN 1 AND 10
                    THEN (student ->> 'writer_level_override')::INTEGER
                WHEN COALESCE((student ->> 'writer_total_chars')::BIGINT, 0) >= 26000 THEN 10
                WHEN COALESCE((student ->> 'writer_total_chars')::BIGINT, 0) >= 15600 THEN 9
                WHEN COALESCE((student ->> 'writer_total_chars')::BIGINT, 0) >= 10920 THEN 8
                WHEN COALESCE((student ->> 'writer_total_chars')::BIGINT, 0) >= 5460 THEN 7
                WHEN COALESCE((student ->> 'writer_total_chars')::BIGINT, 0) >= 3250 THEN 6
                WHEN COALESCE((student ->> 'writer_total_chars')::BIGINT, 0) >= 1820 THEN 5
                WHEN COALESCE((student ->> 'writer_total_chars')::BIGINT, 0) >= 910 THEN 4
                WHEN COALESCE((student ->> 'writer_total_chars')::BIGINT, 0) >= 390 THEN 3
                WHEN COALESCE((student ->> 'writer_completed_posts')::BIGINT, 0) >= 1 THEN 2
                ELSE 1
            END,
            'reader_level', CASE
                WHEN NULLIF(student ->> 'reader_level_override', '')::INTEGER BETWEEN 1 AND 7
                    THEN (student ->> 'reader_level_override')::INTEGER
                WHEN COALESCE((student ->> 'reader_score')::BIGINT, 0) >= 300 THEN 7
                WHEN COALESCE((student ->> 'reader_score')::BIGINT, 0) >= 200 THEN 6
                WHEN COALESCE((student ->> 'reader_score')::BIGINT, 0) >= 120 THEN 5
                WHEN COALESCE((student ->> 'reader_score')::BIGINT, 0) >= 50 THEN 4
                WHEN COALESCE((student ->> 'reader_score')::BIGINT, 0) >= 20 THEN 3
                WHEN COALESCE((student ->> 'reader_score')::BIGINT, 0) >= 1 THEN 2
                ELSE 1
            END
        )
        ORDER BY student ->> 'name'
    ), '[]'::JSONB)
    INTO v_snapshot_students
    FROM jsonb_array_elements(COALESCE(v_dashboard -> 'students', '[]'::JSONB)) student;

    v_snapshot := jsonb_build_object(
        'captured_at', v_now,
        'students', v_snapshot_students,
        'totals', jsonb_build_object(
            'student_count', jsonb_array_length(v_snapshot_students),
            'season_posts', COALESCE((
                SELECT SUM((student ->> 'season_posts')::INTEGER)
                FROM jsonb_array_elements(v_snapshot_students) student
            ), 0),
            'season_chars', COALESCE((
                SELECT SUM((student ->> 'season_chars')::BIGINT)
                FROM jsonb_array_elements(v_snapshot_students) student
            ), 0)
        )
    );

    IF v_current_id IS NULL THEN
        INSERT INTO public.dragon_growth_seasons (
            class_id, season_number, name, started_at, ended_at, snapshot, created_by
        ) VALUES (
            p_class_id, v_current_number, v_current_name, v_current_started_at, v_now, v_snapshot, auth.uid()
        );
    ELSE
        UPDATE public.dragon_growth_seasons
        SET name = v_current_name,
            ended_at = v_now,
            snapshot = v_snapshot
        WHERE id = v_current_id
          AND class_id = p_class_id
          AND ended_at IS NULL;
    END IF;

    INSERT INTO public.dragon_growth_seasons (
        class_id, season_number, name, started_at, created_by
    ) VALUES (
        p_class_id,
        v_current_number + 1,
        (v_current_number + 1)::TEXT || '번째 시즌',
        v_now,
        auth.uid()
    )
    RETURNING id INTO v_next_id;

    -- 옛 화면을 다시 열어도 시작 시점만은 새 시즌과 맞춘다. 학생 데이터는 건드리지 않는다.
    UPDATE public.classes
    SET season_started_at = v_now
    WHERE id = p_class_id;

    RETURN jsonb_build_object(
        'closed_season_number', v_current_number,
        'closed_season_name', v_current_name,
        'next_season_id', v_next_id,
        'next_season_number', v_current_number + 1,
        'next_started_at', v_now
    );
END;
$$;

REVOKE ALL ON FUNCTION public.close_teacher_dragon_growth_season(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_teacher_dragon_growth_season(UUID, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
