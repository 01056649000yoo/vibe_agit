-- 학생 연구소 활동 목록 — 종료된 개요짜기도 친구 개요 모음이 열려 있는 동안 보이게 (2026-10-11, 선생님 결정).
--
-- 지금은 진행 중인 방만 보인다. 선생님이 종료한 개요짜기에서 `친구 개요 모음 켜기` 를 누르면
-- 학생 목록에 다시 나타나고(👀 친구 개요 모음 · ~까지), 공유 기간이 지나거나 선생님이 끄면 저절로 사라진다.
-- 열린 판의 원본은 샘링크 링크 하나다(20261391): 끄지 않았고, 링크가 살아 있고, 기간이 남았을 때.
-- 돌려주는 칸이 둘 늘어 RETURNS TABLE 이 바뀌므로 같은 이름으로 지우고 다시 만든다(부르는 곳은 아지트 api.js 하나).
--   room_is_active   — 진행 중인 방인지(종료된 방은 보기 전용)
--   peer_board_until — 열린 친구 개요 모음의 마감(없으면 NULL)

BEGIN;

DROP FUNCTION IF EXISTS public.get_my_lab_activities_v1(INTEGER, TIMESTAMPTZ, UUID);

CREATE FUNCTION public.get_my_lab_activities_v1(
    p_limit INTEGER DEFAULT 20,
    p_before_created_at TIMESTAMPTZ DEFAULT NULL,
    p_before_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    activity_type TEXT,
    title TEXT,
    topic TEXT,
    created_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    session_id UUID,
    participation_status TEXT,
    has_more BOOLEAN,
    room_is_active BOOLEAN,
    peer_board_until TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, writing_helper
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID;
    v_teacher_id UUID;
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
BEGIN
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION 'student authentication required' USING ERRCODE = '42501';
    END IF;

    IF (p_before_created_at IS NULL) <> (p_before_id IS NULL) THEN
        RAISE EXCEPTION 'both cursor values are required' USING ERRCODE = '22023';
    END IF;

    SELECT student.class_id, class.teacher_id
      INTO v_class_id, v_teacher_id
    FROM public.students student
    JOIN public.classes class ON class.id = student.class_id
    WHERE student.id = v_student_id
      AND student.is_active IS DISTINCT FROM FALSE
      AND student.deleted_at IS NULL;

    IF v_class_id IS NULL OR v_teacher_id IS NULL THEN
        RAISE EXCEPTION 'active student class required' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH page AS (
        SELECT
            room.id,
            COALESCE(NULLIF(room.activity_type, ''), 'outline_builder') AS activity_type,
            room.title,
            room.topic,
            room.created_at,
            room.expires_at,
            session.id AS session_id,
            CASE
                WHEN session.status = 'done' THEN 'done'
                WHEN session.id IS NULL THEN 'not_started'
                ELSE 'in_progress'
            END AS participation_status,
            (room.is_active IS TRUE AND (room.expires_at IS NULL OR room.expires_at > NOW())) AS room_is_active,
            board.until AS peer_board_until
        FROM writing_helper.rooms room
        LEFT JOIN writing_helper.student_sessions session
          ON session.room_id = room.id
         AND session.agit_student_id = v_student_id
        -- 열린 친구 개요 모음(방마다 하나, outline_boards_one_open_per_room). 샘링크 링크가 마감의 원본이다.
        LEFT JOIN LATERAL (
            SELECT COALESCE(link.expires_at, 'infinity'::TIMESTAMPTZ) AS until
            FROM writing_helper.outline_boards b
            JOIN samlink.short_links link ON link.slug = b.samlink_slug
            WHERE b.room_id = room.id
              AND b.revoked_at IS NULL
              AND link.is_active
              AND (link.expires_at IS NULL OR link.expires_at > NOW())
            LIMIT 1
        ) board ON TRUE
        WHERE room.agit_class_id = v_class_id
          AND room.teacher_id = v_teacher_id
          AND (
              (room.is_active IS TRUE AND (room.expires_at IS NULL OR room.expires_at > NOW()))
              OR board.until IS NOT NULL
          )
          AND COALESCE(NULLIF(room.activity_type, ''), 'outline_builder') = ANY(ARRAY[
              'outline_builder',
              'question_generator',
              'question_voting',
              'one_line_share',
              'hanja_writing'
          ]::TEXT[])
          AND (
              p_before_created_at IS NULL
              OR (room.created_at, room.id) < (p_before_created_at, p_before_id)
          )
        ORDER BY room.created_at DESC, room.id DESC
        LIMIT v_limit + 1
    ), page_meta AS (
        SELECT COUNT(*) > v_limit AS has_more
        FROM page
    )
    SELECT
        page.id,
        page.activity_type,
        page.title,
        page.topic,
        page.created_at,
        page.expires_at,
        page.session_id,
        page.participation_status,
        page_meta.has_more,
        page.room_is_active,
        NULLIF(page.peer_board_until, 'infinity'::TIMESTAMPTZ)
    FROM page
    CROSS JOIN page_meta
    ORDER BY page.created_at DESC, page.id DESC
    LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_lab_activities_v1(INTEGER, TIMESTAMPTZ, UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_lab_activities_v1(INTEGER, TIMESTAMPTZ, UUID)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
