-- ──────────────────────────────────────────────────────────────────
-- [수정] reward_for_idea_submission
--
-- 아이디어 마켓 제출 보상 사유에서 MissionID 대신 제목(Title)을 사용하도록 개선
-- ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reward_for_idea_submission(
    p_mission_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_auth_id UUID;
    v_student RECORD;
    v_mission RECORD;
    v_reward_amount INTEGER;
    v_reward_reason TEXT;
    v_already_rewarded BOOLEAN;
BEGIN
    v_auth_id := auth.uid();

    IF v_auth_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', '인증되지 않은 요청입니다.');
    END IF;

    -- 학생 정보 조회
    SELECT s.id, s.class_id INTO v_student
    FROM public.students s
    WHERE s.auth_id = v_auth_id AND s.deleted_at IS NULL
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', '학생 정보를 찾을 수 없습니다.');
    END IF;

    -- 미션 정보 조회, 학급 소속 확인
    SELECT m.id, m.base_reward, m.title INTO v_mission
    FROM public.writing_missions m
    WHERE m.id = p_mission_id
      AND m.class_id = v_student.class_id
      AND m.is_archived = false;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', '해당 미션을 찾을 수 없거나 학급이 일치하지 않습니다.');
    END IF;

    v_reward_amount := COALESCE(v_mission.base_reward, 30);
    -- [수정] MissionID 대신 v_mission.title 사용
    v_reward_reason := format('아이디어 마켓에 제안을 제출했어요! 🏛️💡 (%s)', v_mission.title);

    -- 중복 보상 체크
    SELECT EXISTS (
        SELECT 1 FROM public.point_logs
        WHERE student_id = v_student.id
          AND reason = v_reward_reason
    ) INTO v_already_rewarded;

    IF v_already_rewarded THEN
        RETURN json_build_object('success', false, 'already_rewarded', true, 'message', '이미 이 미션에서 제출 보상을 받았습니다.');
    END IF;

    -- 트리거 우회
    PERFORM set_config('app.bypass_student_trigger', 'true', true);

    UPDATE public.students
    SET total_points = COALESCE(total_points, 0) + v_reward_amount
    WHERE id = v_student.id;

    INSERT INTO public.point_logs (student_id, reason, amount)
    VALUES (v_student.id, v_reward_reason, v_reward_amount);

    PERFORM set_config('app.bypass_student_trigger', 'false', true);

    RETURN json_build_object('success', true, 'points_awarded', v_reward_amount);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'auth';

NOTIFY pgrst, 'reload schema';
