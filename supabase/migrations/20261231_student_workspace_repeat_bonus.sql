-- 학생 글쓰기 창이 구간별 반복 보너스를 안내하지 못하던 것을 고친다.
--
-- 교사가 반복 보너스를 켜도 학생 작업공간 RPC가 과제의 네 열을 돌려주지 않아,
-- 화면 계산기는 늘 꺼짐으로 보고 "다음 200자를 쓰면 +10P" 안내를 그리지 않았다.
-- 반환 목록에 네 열만 더한다. 권한·범위·나머지 반환값은 그대로다.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_student_assignment_workspace_v1(p_mission_id uuid, p_post_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
            mission.bonus_reward,
            mission.repeat_bonus_enabled, mission.repeat_bonus_threshold,
            mission.repeat_bonus_reward, mission.repeat_bonus_max_count
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
$function$;

COMMIT;
