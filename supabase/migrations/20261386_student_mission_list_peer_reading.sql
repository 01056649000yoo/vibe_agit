-- 학생 과제 목록에 "선생님만 읽기" 여부를 더한다(2026-10-08, 20261385 과제 설정).
-- 학생 화면은 이 값을 보고 `친구 글 보기` 단추 대신 `🔒 선생님만 읽어요` 를 보여 준다.
-- 함수 본문은 운영 정의(pg_get_functiondef) 그대로이고 mission_rows 에 peer_reading_enabled 한 칸만 더했다.
CREATE OR REPLACE FUNCTION public.get_student_mission_list_v1(p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
            mission.guide, mission.tags, mission.base_reward, mission.peer_reading_enabled
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
$function$

;
