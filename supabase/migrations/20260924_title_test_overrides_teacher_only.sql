-- QA용 칭호 고정값을 학생 일반 조회 경로에서 제거한다.
-- 교사는 get_teacher_dragon_growth_dashboard()의 권한 검증 경로에서만 고정값을 확인한다.

BEGIN;

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
    END IF;

    RETURN jsonb_build_object(
        'writer_total_chars', v_writer_total_chars,
        'writer_completed_posts', v_writer_completed_posts,
        'writer_level_override', NULL,
        'reader_score', v_reader_score,
        'reader_post_count', v_reader_post_count,
        'reader_level_override', NULL,
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
    '학생 본인의 실제 학기 활동 기반 칭호 상태. QA 오버라이드는 교사 수호룡 대시보드에서만 적용한다.';

COMMIT;
