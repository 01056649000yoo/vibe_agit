BEGIN;

-- 전체 현황과 선택 미션 현황을 같은 단일 폴링 RPC로 읽는다.
-- 선택 미션에서도 학생 최대 100명·최근 제출 최대 8건만 반환하며 글 본문은 싣지 않는다.
CREATE OR REPLACE FUNCTION public.teacher_assignment_submission_board_snapshot_v2(
    p_class_id UUID,
    p_mission_id UUID,
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
), scope_mission_rows AS MATERIALIZED (
    SELECT mission.*
    FROM mission_rows mission
    WHERE mission.mission_type IS DISTINCT FROM 'meeting'
      AND (p_mission_id IS NULL OR mission.id = p_mission_id)
), current_posts AS MATERIALIZED (
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
                WHERE post.is_submitted IS TRUE
                   OR post.is_returned IS TRUE
                   OR post.is_confirmed IS TRUE
            )::INTEGER,
            0
        ) AS not_submitted_count
    FROM mission_rows mission
    CROSS JOIN student_count
    LEFT JOIN current_posts post
      ON post.mission_id = mission.id
    GROUP BY mission.id, mission.mission_type, student_count.total
), normalized_status_rows AS MATERIALIZED (
    SELECT
        status.*,
        CASE
            WHEN status.mission_type = 'meeting' THEN status.submitted_count
            ELSE status.confirmed_count
        END AS completion_count
    FROM mission_status_rows status
), student_assignment_rows AS MATERIALIZED (
    SELECT
        roster.id AS student_id,
        roster.name AS student_name,
        CASE
            WHEN post.is_confirmed IS TRUE THEN 'confirmed'
            WHEN post.is_submitted IS TRUE THEN 'pending'
            WHEN post.is_returned IS TRUE THEN 'rewriting'
            ELSE 'not_submitted'
        END AS assignment_status
    FROM active_roster roster
    CROSS JOIN scope_mission_rows mission
    LEFT JOIN current_posts post
      ON post.mission_id = mission.id
     AND post.student_id = roster.id
), student_status_rows AS MATERIALIZED (
    SELECT
        row.student_id,
        row.student_name,
        COUNT(*)::INTEGER AS assignment_count,
        COUNT(*) FILTER (WHERE row.assignment_status = 'confirmed')::INTEGER AS confirmed_count,
        COUNT(*) FILTER (WHERE row.assignment_status = 'pending')::INTEGER AS pending_count,
        COUNT(*) FILTER (WHERE row.assignment_status = 'rewriting')::INTEGER AS rewriting_count,
        COUNT(*) FILTER (WHERE row.assignment_status = 'not_submitted')::INTEGER AS not_submitted_count,
        CASE WHEN p_mission_id IS NULL THEN NULL ELSE MIN(row.assignment_status) END AS status
    FROM student_assignment_rows row
    GROUP BY row.student_id, row.student_name
), scope_summary AS (
    SELECT
        COALESCE(SUM(status.confirmed_count), 0)::INTEGER AS confirmed_count,
        COALESCE(SUM(status.pending_count), 0)::INTEGER AS pending_count,
        COALESCE(SUM(status.rewriting_count), 0)::INTEGER AS rewriting_count,
        COALESCE(SUM(status.not_submitted_count), 0)::INTEGER AS not_submitted_count
    FROM student_status_rows status
), recent_base AS MATERIALIZED (
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
    JOIN scope_mission_rows mission
      ON mission.id = post.mission_id
    JOIN active_roster roster
      ON roster.id = event.student_id
    CROSS JOIN params
    WHERE event.class_id = p_class_id
      AND event.event_type IN ('post_submitted', 'post_resubmitted')
    ORDER BY event.occurred_at DESC, event.id DESC
    LIMIT (SELECT recent_limit FROM params)
), recent_rows AS MATERIALIZED (
    SELECT
        recent.*,
        COALESCE(NULLIF((
            SELECT COUNT(*)::INTEGER
            FROM public.writing_activity_events attempt
            WHERE attempt.object_id = recent.post_id
              AND attempt.event_type IN ('post_submitted', 'post_resubmitted')
              AND (attempt.occurred_at, attempt.id) <= (recent.occurred_at, recent.id)
        ), 0), CASE WHEN recent.event_type = 'post_resubmitted' THEN 2 ELSE 1 END) AS submission_number
    FROM recent_base recent
)
SELECT jsonb_build_object(
    'version', 2,
    'scope', CASE WHEN p_mission_id IS NULL THEN 'all' ELSE 'mission' END,
    'selected_mission_id', p_mission_id,
    'selected_mission_title', (
        SELECT mission.title FROM scope_mission_rows mission LIMIT 1
    ),
    'generated_at', NOW(),
    'total_students', COALESCE((SELECT total FROM student_count), 0),
    'pending_total', COALESCE((SELECT SUM(pending_count)::INTEGER FROM normalized_status_rows), 0),
    'submitted_total', COALESCE((SELECT SUM(submitted_count)::INTEGER FROM normalized_status_rows), 0),
    'scope_summary', jsonb_build_object(
        'total_students', COALESCE((SELECT total FROM student_count), 0),
        'confirmed_count', (SELECT confirmed_count FROM scope_summary),
        'pending_count', (SELECT pending_count FROM scope_summary),
        'rewriting_count', (SELECT rewriting_count FROM scope_summary),
        'not_submitted_count', (SELECT not_submitted_count FROM scope_summary)
    ),
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
    'student_statuses', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'student_id', status.student_id,
            'student_name', status.student_name,
            'assignment_count', status.assignment_count,
            'confirmed_count', status.confirmed_count,
            'pending_count', status.pending_count,
            'rewriting_count', status.rewriting_count,
            'not_submitted_count', status.not_submitted_count,
            'status', status.status
        ) ORDER BY status.student_name, status.student_id)
        FROM (
            SELECT student_status.*
            FROM student_status_rows student_status
            ORDER BY student_status.student_name, student_status.student_id
            LIMIT 100
        ) status
    ), '[]'::JSONB),
    'recent_submissions', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'event_id', recent.id::TEXT,
            'post_id', recent.post_id,
            'mission_id', recent.mission_id,
            'mission_title', recent.mission_title,
            'student_name', recent.student_name,
            'event_type', recent.event_type,
            'submission_number', recent.submission_number,
            'occurred_at', recent.occurred_at
        ) ORDER BY recent.occurred_at DESC, recent.id DESC)
        FROM recent_rows recent
    ), '[]'::JSONB)
);
$$;

REVOKE ALL ON FUNCTION public.teacher_assignment_submission_board_snapshot_v2(UUID, UUID, INTEGER, INTEGER)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_teacher_assignment_submission_board_v2(
    p_class_id UUID,
    p_mission_id UUID DEFAULT NULL,
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

    IF p_mission_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM (
            SELECT mission.id
            FROM public.writing_missions mission
            WHERE mission.class_id = p_class_id
              AND mission.is_archived IS FALSE
              AND mission.mission_type IS DISTINCT FROM 'meeting'
            ORDER BY mission.created_at DESC, mission.id DESC
            LIMIT 100
        ) available_mission
        WHERE available_mission.id = p_mission_id
    ) THEN
        RAISE EXCEPTION '선택한 활성 글 과제를 찾을 수 없습니다.' USING ERRCODE = '22023';
    END IF;

    RETURN public.teacher_assignment_submission_board_snapshot_v2(
        p_class_id,
        p_mission_id,
        100,
        v_recent_limit
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_assignment_submission_board_v2(UUID, UUID, INTEGER)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_assignment_submission_board_v2(UUID, UUID, INTEGER)
TO authenticated, service_role;

COMMIT;
