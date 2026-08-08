BEGIN;

CREATE INDEX IF NOT EXISTS idx_writing_missions_class_active_created
    ON public.writing_missions (class_id, created_at DESC)
    WHERE is_archived IS FALSE;

CREATE OR REPLACE FUNCTION public.get_student_mission_list_v1(
    p_limit INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student public.students%ROWTYPE;
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 100);
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'STUDENT' THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT student.*
    INTO v_student
    FROM public.students student
    WHERE student.auth_id = auth.uid()
      AND student.is_active IS DISTINCT FROM false
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
    LIMIT 1;

    IF v_student.id IS NULL THEN
        RAISE EXCEPTION '현재 로그인과 연결된 학생을 찾을 수 없습니다.' USING ERRCODE = '42501';
    END IF;

    WITH mission_rows AS MATERIALIZED (
        SELECT
            mission.id, mission.title, mission.genre, mission.created_at,
            mission.mission_type, mission.input_template, mission.evaluation_rubric,
            mission.guide, mission.tags, mission.base_reward
        FROM public.writing_missions mission
        WHERE mission.class_id = v_student.class_id
          AND mission.is_archived IS FALSE
        ORDER BY mission.created_at DESC
        LIMIT v_limit
    ), post_rows AS (
        SELECT
            post.id, post.mission_id, post.is_confirmed, post.is_submitted,
            post.is_returned, post.recalled_at, post.char_count, post.created_at
        FROM public.student_posts post
        JOIN mission_rows mission ON mission.id = post.mission_id
        WHERE post.class_id = v_student.class_id
          AND post.student_id = v_student.id
        ORDER BY post.created_at DESC
    )
    SELECT jsonb_build_object(
        'version', 1,
        'missions', COALESCE((
            SELECT jsonb_agg(to_jsonb(mission) ORDER BY mission.created_at DESC)
            FROM mission_rows mission
        ), '[]'::JSONB),
        'posts', COALESCE((
            SELECT jsonb_agg(to_jsonb(post) ORDER BY post.created_at DESC)
            FROM post_rows post
        ), '[]'::JSONB)
    )
    INTO v_result;

    RETURN v_result;
END;
$$;

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
        ORDER BY mission.created_at DESC
        LIMIT v_limit
    ), mission_counts AS (
        SELECT
            mission.id AS mission_id,
            COUNT(DISTINCT post.student_id) FILTER (
                WHERE student.id IS NOT NULL
                  AND CASE
                      WHEN mission.mission_type = 'meeting' THEN post.is_submitted IS TRUE
                      ELSE post.is_confirmed IS TRUE
                  END
            )::INTEGER AS completed_count
        FROM mission_rows mission
        LEFT JOIN public.student_posts post
          ON post.class_id = p_class_id
         AND post.mission_id = mission.id
        LEFT JOIN public.students student
          ON student.id = post.student_id
         AND student.class_id = p_class_id
         AND student.deleted_at IS NULL
        GROUP BY mission.id, mission.mission_type
    )
    SELECT jsonb_build_object(
        'version', 1,
        'missions', COALESCE((
            SELECT jsonb_agg(to_jsonb(mission) ORDER BY mission.created_at DESC)
            FROM mission_rows mission
        ), '[]'::JSONB),
        'total_students', (
            SELECT COUNT(*)::INTEGER
            FROM public.students student
            WHERE student.class_id = p_class_id
              AND student.deleted_at IS NULL
        ),
        'submission_counts', COALESCE((
            SELECT jsonb_object_agg(counts.mission_id::TEXT, counts.completed_count)
            FROM mission_counts counts
        ), '{}'::JSONB)
    )
    INTO v_result;

    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_student_assignment_workspace_v1(
    p_mission_id UUID,
    p_post_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student public.students%ROWTYPE;
    v_mission JSONB;
    v_post JSONB;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'STUDENT' THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT student.*
    INTO v_student
    FROM public.students student
    WHERE student.auth_id = auth.uid()
      AND student.is_active IS DISTINCT FROM false
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
    LIMIT 1;

    IF v_student.id IS NULL THEN
        RAISE EXCEPTION '현재 로그인과 연결된 학생을 찾을 수 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT to_jsonb(mission_row)
    INTO v_mission
    FROM (
        SELECT
            mission.id, mission.title, mission.guide, mission.genre,
            mission.mission_type, mission.input_template, mission.template_config,
            mission.min_chars, mission.min_paragraphs, mission.guide_questions,
            mission.is_archived, mission.base_reward, mission.bonus_threshold,
            mission.bonus_reward
        FROM public.writing_missions mission
        WHERE mission.id = p_mission_id
          AND mission.class_id = v_student.class_id
        LIMIT 1
    ) mission_row;

    IF v_mission IS NULL THEN
        RAISE EXCEPTION '이 학급의 과제를 찾을 수 없습니다.' USING ERRCODE = 'P0002';
    END IF;

    SELECT to_jsonb(post_row)
    INTO v_post
    FROM (
        SELECT
            post.id, post.title, post.content, post.structured_content,
            post.is_returned, post.is_confirmed, post.is_submitted, post.ai_feedback,
            post.original_title, post.original_content, post.show_original,
            post.teacher_edited_title, post.teacher_edited_content,
            post.teacher_edited_at, post.is_teacher_edited, post.student_answers,
            post.student_id, post.mission_id, post.updated_at
        FROM public.student_posts post
        WHERE post.class_id = v_student.class_id
          AND post.student_id = v_student.id
          AND post.mission_id = p_mission_id
          AND (p_post_id IS NULL OR post.id = p_post_id)
        ORDER BY post.updated_at DESC
        LIMIT 1
    ) post_row;

    RETURN jsonb_build_object(
        'version', 1,
        'mission', v_mission,
        'post', v_post
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_mission_list_v1(INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_teacher_mission_overview_v1(UUID, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_student_assignment_workspace_v1(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_mission_list_v1(INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_teacher_mission_overview_v1(UUID, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_student_assignment_workspace_v1(UUID, UUID) TO authenticated, service_role;

COMMIT;
