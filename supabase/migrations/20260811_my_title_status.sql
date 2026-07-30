-- ============================================================================
-- 나의 작가·독자 칭호 공용 상태
--
-- 나의 아지트와 글쓰기 발자국이 서로 다른 조회·계산 경로를 쓰지 않도록
-- 칭호 원자료를 한 RPC에서 반환한다. 단계명과 경계는 프론트 공용 상수에서 해석한다.
-- ============================================================================

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
    v_reader JSONB;
    v_writer_total_chars BIGINT := 0;
    v_writer_completed_posts INTEGER := 0;
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
        -- 과제는 미션별 최신 한 편, 자율글은 각 글을 한 편으로 센다.
        SELECT DISTINCT ON (COALESCE('mission:' || mission_id::text, 'post:' || id::text))
               id, mission_id, char_count, created_at
        FROM my_posts
        ORDER BY COALESCE('mission:' || mission_id::text, 'post:' || id::text), created_at DESC
    )
    SELECT COALESCE(sum(char_count), 0), count(*)::INTEGER
    INTO v_writer_total_chars, v_writer_completed_posts
    FROM level_posts;

    -- 독자 점수 공식도 기존 확정 RPC 한 곳만 사용한다.
    v_reader := public.get_my_reader_title();

    RETURN jsonb_build_object(
        'writer_total_chars', v_writer_total_chars,
        'writer_completed_posts', v_writer_completed_posts,
        'reader_score', COALESCE((v_reader ->> 'score')::INTEGER, 0),
        'reader_post_count', COALESCE((v_reader ->> 'post_count')::INTEGER, 0)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_title_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_title_status() TO authenticated, service_role;

COMMIT;
