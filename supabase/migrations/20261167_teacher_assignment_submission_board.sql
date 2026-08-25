BEGIN;

-- 과제 전광판은 과제 수와 무관하게 학급 단위 집계 한 번으로 읽는다.
CREATE INDEX IF NOT EXISTS idx_student_posts_class_mission_assignment_status
    ON public.student_posts (
        class_id, mission_id, student_id,
        updated_at DESC, created_at DESC, id DESC
    )
    INCLUDE (is_submitted, is_confirmed, is_returned)
    WHERE mission_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_writing_events_class_submission_time
    ON public.writing_activity_events (class_id, occurred_at DESC, id DESC)
    WHERE event_type IN ('post_submitted', 'post_resubmitted')
      AND post_id IS NOT NULL;

-- 첫 과제 개요와 12초 경량 폴링이 같은 상태 정의를 사용하도록 내부 스냅샷을 한 곳에 둔다.
CREATE OR REPLACE FUNCTION public.teacher_assignment_submission_board_snapshot_v1(
    p_class_id UUID,
    p_mission_limit INTEGER,
    p_recent_limit INTEGER
)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $$
WITH params AS (
    SELECT
        LEAST(GREATEST(COALESCE(p_mission_limit, 100), 1), 100) AS mission_limit,
        LEAST(GREATEST(COALESCE(p_recent_limit, 8), 1), 8) AS recent_limit
), active_roster AS MATERIALIZED (
    SELECT student.id, student.name
    FROM public.students student
    WHERE student.class_id = p_class_id
      AND student.is_active IS DISTINCT FROM false
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
), student_count AS (
    SELECT COUNT(*)::INTEGER AS total
    FROM active_roster
), mission_rows AS MATERIALIZED (
    SELECT mission.id, mission.title, mission.mission_type, mission.created_at
    FROM public.writing_missions mission
    CROSS JOIN params
    WHERE mission.class_id = p_class_id
      AND mission.is_archived IS FALSE
    ORDER BY mission.created_at DESC, mission.id DESC
    LIMIT (SELECT mission_limit FROM params)
), current_posts AS MATERIALIZED (
    -- 과거 재작성 이력이 여러 행으로 남은 학생도 현재 글 한 건만 집계한다.
    -- 학생 글쓰기 작업공간이 고르는 순서(updated_at 최신)와 같은 기준이다.
    SELECT DISTINCT ON (post.mission_id, post.student_id)
        post.mission_id,
        post.student_id,
        post.is_submitted,
        post.is_confirmed,
        post.is_returned
    FROM public.student_posts post
    JOIN mission_rows mission
      ON mission.id = post.mission_id
    JOIN active_roster roster
      ON roster.id = post.student_id
    WHERE post.class_id = p_class_id
    ORDER BY
        post.mission_id,
        post.student_id,
        post.updated_at DESC NULLS LAST,
        post.created_at DESC,
        post.id DESC
), mission_status_rows AS MATERIALIZED (
    SELECT
        mission.id AS mission_id,
        mission.mission_type,
        student_count.total AS total_students,
        COUNT(DISTINCT post.student_id) FILTER (
            WHERE post.is_submitted IS TRUE
        )::INTEGER AS submitted_count,
        COUNT(DISTINCT post.student_id) FILTER (
            WHERE post.is_confirmed IS TRUE
        )::INTEGER AS confirmed_count,
        CASE WHEN mission.mission_type = 'meeting' THEN 0 ELSE
            COUNT(DISTINCT post.student_id) FILTER (
                WHERE post.is_submitted IS TRUE
                  AND COALESCE(post.is_confirmed, FALSE) = FALSE
            )::INTEGER
        END AS pending_count,
        CASE WHEN mission.mission_type = 'meeting' THEN 0 ELSE
            COUNT(DISTINCT post.student_id) FILTER (
                WHERE post.is_returned IS TRUE
                  AND COALESCE(post.is_submitted, FALSE) = FALSE
                  AND COALESCE(post.is_confirmed, FALSE) = FALSE
            )::INTEGER
        END AS rewriting_count,
        GREATEST(
            student_count.total - COUNT(DISTINCT post.student_id) FILTER (
                WHERE (
                      post.is_submitted IS TRUE
                      OR post.is_returned IS TRUE
                      OR post.is_confirmed IS TRUE
                  )
            )::INTEGER,
            0
        ) AS not_submitted_count
    FROM mission_rows mission
    CROSS JOIN student_count
    LEFT JOIN current_posts post
      ON post.mission_id = mission.id
    GROUP BY mission.id, mission.mission_type, student_count.total
), normalized_status_rows AS (
    SELECT
        status.*,
        CASE
            WHEN status.mission_type = 'meeting' THEN status.submitted_count
            ELSE status.confirmed_count
        END AS completion_count
    FROM mission_status_rows status
), recent_rows AS MATERIALIZED (
    SELECT
        event.id,
        event.post_id,
        event.event_type,
        event.occurred_at,
        mission.id AS mission_id,
        mission.title AS mission_title,
        roster.name AS student_name
    FROM public.writing_activity_events event
    JOIN public.student_posts post
      ON post.id = event.post_id
     AND post.class_id = p_class_id
     AND post.student_id = event.student_id
    JOIN mission_rows mission
      ON mission.id = post.mission_id
    JOIN active_roster roster
      ON roster.id = event.student_id
    CROSS JOIN params
    WHERE event.class_id = p_class_id
      AND event.event_type IN ('post_submitted', 'post_resubmitted')
    ORDER BY event.occurred_at DESC, event.id DESC
    LIMIT (SELECT recent_limit FROM params)
)
SELECT jsonb_build_object(
    'version', 1,
    'generated_at', NOW(),
    'total_students', COALESCE((SELECT total FROM student_count), 0),
    'pending_total', COALESCE((SELECT SUM(pending_count)::INTEGER FROM normalized_status_rows), 0),
    'submitted_total', COALESCE((SELECT SUM(submitted_count)::INTEGER FROM normalized_status_rows), 0),
    'submission_counts', COALESCE((
        SELECT jsonb_object_agg(status.mission_id::TEXT, status.submitted_count)
        FROM normalized_status_rows status
    ), '{}'::JSONB),
    'completion_counts', COALESCE((
        SELECT jsonb_object_agg(status.mission_id::TEXT, status.completion_count)
        FROM normalized_status_rows status
    ), '{}'::JSONB),
    'mission_statuses', COALESCE((
        SELECT jsonb_object_agg(
            status.mission_id::TEXT,
            jsonb_build_object(
                'totalStudents', status.total_students,
                'submittedCount', status.submitted_count,
                'confirmedCount', status.confirmed_count,
                'pendingCount', status.pending_count,
                'rewritingCount', status.rewriting_count,
                'notSubmittedCount', status.not_submitted_count
            )
        )
        FROM normalized_status_rows status
    ), '{}'::JSONB),
    'recent_submissions', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'event_id', recent.id::TEXT,
            'post_id', recent.post_id,
            'mission_id', recent.mission_id,
            'mission_title', recent.mission_title,
            'student_name', recent.student_name,
            'event_type', recent.event_type,
            'occurred_at', recent.occurred_at
        ) ORDER BY recent.occurred_at DESC, recent.id DESC)
        FROM recent_rows recent
    ), '[]'::JSONB)
);
$$;

REVOKE ALL ON FUNCTION public.teacher_assignment_submission_board_snapshot_v1(UUID, INTEGER, INTEGER)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_teacher_assignment_submission_board_v1(
    p_class_id UUID,
    p_recent_limit INTEGER DEFAULT 8
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_recent_limit INTEGER := LEAST(GREATEST(COALESCE(p_recent_limit, 8), 1), 8);
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.classes class
        WHERE class.id = p_class_id
          AND class.deleted_at IS NULL
          AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN')
    ) THEN
        RAISE EXCEPTION '학급 과제 제출 현황 조회 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    RETURN public.teacher_assignment_submission_board_snapshot_v1(
        p_class_id,
        100,
        v_recent_limit
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_assignment_submission_board_v1(UUID, INTEGER)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_assignment_submission_board_v1(UUID, INTEGER)
TO authenticated, service_role;

-- 교사 첫 화면 요청 예산을 늘리지 않고 최초 전광판 스냅샷을 과제 개요에 함께 싣는다.
CREATE OR REPLACE FUNCTION public.get_teacher_mission_overview_v1(
    p_class_id UUID,
    p_limit INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 100);
    v_submission_board JSONB;
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.classes class
        WHERE class.id = p_class_id
          AND class.deleted_at IS NULL
          AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN')
    ) THEN
        RAISE EXCEPTION '학급 과제 조회 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    v_submission_board := public.teacher_assignment_submission_board_snapshot_v1(
        p_class_id,
        v_limit,
        8
    );

    WITH mission_rows AS MATERIALIZED (
        SELECT
            mission.id, mission.title, mission.guide, mission.genre,
            mission.mission_type, mission.input_template, mission.template_config,
            mission.min_chars, mission.min_paragraphs, mission.guide_questions,
            mission.is_archived, mission.created_at, mission.base_reward,
            mission.bonus_threshold, mission.bonus_reward, mission.allow_comments,
            mission.tags, mission.evaluation_rubric
        FROM public.writing_missions mission
        WHERE mission.class_id = p_class_id
          AND mission.is_archived IS FALSE
        ORDER BY mission.created_at DESC, mission.id DESC
        LIMIT v_limit
    )
    SELECT jsonb_build_object(
        'version', 1,
        'missions', COALESCE((
            SELECT jsonb_agg(to_jsonb(mission) ORDER BY mission.created_at DESC, mission.id DESC)
            FROM mission_rows mission
        ), '[]'::JSONB),
        'total_students', COALESCE((v_submission_board->>'total_students')::INTEGER, 0),
        'submission_counts', COALESCE(v_submission_board->'submission_counts', '{}'::JSONB),
        'submission_board', v_submission_board
    )
    INTO v_result;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_mission_overview_v1(UUID, INTEGER)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_mission_overview_v1(UUID, INTEGER)
TO authenticated, service_role;

COMMIT;
