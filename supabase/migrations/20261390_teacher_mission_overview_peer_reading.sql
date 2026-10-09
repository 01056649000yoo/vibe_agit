-- 선생님 미션 목록에 "선생님만 읽기"·"친구들에게 연 시각"을 더한다(2026-10-09).
-- 미션 카드의 `🔒 선생님만 읽는 중`·`🔓 친구들에게 글 열기`(v1.26.8)가 이 값으로 그려지는데,
-- 목록 함수가 돌려주지 않아 단추가 나오지 않았다(배포 뒤 선생님 질문으로 찾음).
-- 함수 본문은 운영 정의(pg_get_functiondef) 그대로이고 두 칸만 더했다.
CREATE OR REPLACE FUNCTION public.get_teacher_mission_overview_v1(p_class_id uuid, p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
            mission.bonus_threshold, mission.bonus_reward, mission.allow_comments, mission.peer_reading_enabled, mission.peer_reading_opened_at,
            mission.tags, mission.evaluation_rubric, mission.open_at
        FROM public.writing_missions mission
        WHERE mission.class_id = p_class_id
          AND (mission.is_archived IS FALSE OR mission.open_at IS NOT NULL)
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
$function$

;
