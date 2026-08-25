BEGIN;

-- 12초 전광판은 최신 8건만 유지한다. 더 긴 기록은 교사가 명시적으로
-- 모아보기를 열었을 때만 별도 RPC 한 번으로 최대 100건을 읽는다.
CREATE OR REPLACE FUNCTION public.get_teacher_assignment_submission_history_v1(
    p_class_id UUID,
    p_limit INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 100);
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.classes class
        WHERE class.id = p_class_id
          AND class.deleted_at IS NULL
          AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN')
    ) THEN
        RAISE EXCEPTION '학급 과제 제출 기록 조회 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    WITH recent_rows AS MATERIALIZED (
        SELECT
            event.id,
            event.post_id,
            event.event_type,
            event.occurred_at,
            post.mission_id,
            student.name AS student_name
        FROM public.writing_activity_events event
        JOIN public.student_posts post
          ON post.id = event.post_id
         AND post.class_id = p_class_id
         AND post.student_id = event.student_id
        JOIN public.writing_missions mission
          ON mission.id = post.mission_id
         AND mission.class_id = p_class_id
         AND mission.is_archived IS FALSE
        JOIN public.students student
          ON student.id = event.student_id
         AND student.class_id = p_class_id
         AND student.is_active IS DISTINCT FROM FALSE
         AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
        WHERE event.class_id = p_class_id
          AND event.event_type IN ('post_submitted', 'post_resubmitted')
          AND event.post_id IS NOT NULL
        ORDER BY event.occurred_at DESC, event.id DESC
        LIMIT v_limit + 1
    ), limited_rows AS (
        SELECT recent.*
        FROM recent_rows recent
        ORDER BY recent.occurred_at DESC, recent.id DESC
        LIMIT v_limit
    )
    SELECT jsonb_build_object(
        'version', 1,
        'generated_at', NOW(),
        'has_more', (SELECT COUNT(*) > v_limit FROM recent_rows),
        'submissions', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'event_id', recent.id::TEXT,
                'post_id', recent.post_id,
                'mission_id', recent.mission_id,
                'student_name', recent.student_name,
                'event_type', recent.event_type,
                'occurred_at', recent.occurred_at
            ) ORDER BY recent.occurred_at DESC, recent.id DESC)
            FROM limited_rows recent
        ), '[]'::JSONB)
    )
    INTO v_result;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_assignment_submission_history_v1(UUID, INTEGER)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_assignment_submission_history_v1(UUID, INTEGER)
TO authenticated, service_role;

COMMIT;
