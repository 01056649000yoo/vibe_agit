-- 실제 글·포인트 통계를 바꾸지 않고 지정 학생의 작가 칭호/수호룡 단계를 시험한다.
-- 이 표는 운영 UI에서 쓰지 않으며 DB 관리자가 넣은 행만 공용 칭호 RPC가 읽는다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.student_title_test_overrides (
    student_id UUID PRIMARY KEY REFERENCES public.students(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    writer_level SMALLINT NOT NULL CHECK (writer_level BETWEEN 1 AND 10),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_title_test_overrides_class
    ON public.student_title_test_overrides (class_id, writer_level);

REVOKE ALL ON TABLE public.student_title_test_overrides FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.student_title_test_overrides TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_title_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID;
    v_reader JSONB;
    v_writer_total_chars BIGINT := 0;
    v_writer_completed_posts INTEGER := 0;
    v_writer_level_override SMALLINT;
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
          AND p.is_confirmed = true
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

    SELECT override.writer_level
    INTO v_writer_level_override
    FROM public.student_title_test_overrides override
    WHERE override.student_id = v_student_id
      AND override.class_id = v_class_id;

    v_reader := public.get_my_reader_title();

    RETURN jsonb_build_object(
        'writer_total_chars', v_writer_total_chars,
        'writer_completed_posts', v_writer_completed_posts,
        'writer_level_override', v_writer_level_override,
        'reader_score', COALESCE((v_reader ->> 'score')::INTEGER, 0),
        'reader_post_count', COALESCE((v_reader ->> 'post_count')::INTEGER, 0)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_title_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_title_status() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_student_hideout_directory()
RETURNS TABLE (
    id UUID,
    name TEXT,
    pet_data JSONB,
    writer_total_chars BIGINT,
    writer_completed_posts BIGINT,
    reader_score BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
                WHEN title_override.writer_level IS NULL THEN s.pet_data
                ELSE COALESCE(s.pet_data, '{}'::JSONB)
                    || jsonb_build_object('_testWriterLevel', title_override.writer_level)
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
          AND p.is_confirmed = true
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
$$;

REVOKE ALL ON FUNCTION public.get_student_hideout_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_hideout_directory() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
