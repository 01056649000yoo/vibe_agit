-- 교사가 과제 글을 학생에게 되돌려 실제 상태가 `다시쓰기 중`이 되는 모든 전환은
-- 같은 writing.rewrite_requested 알림을 남긴다.
--
-- 기존 함수는 OLD.recalled_at IS NULL을 요구해, 강제 회수한 글을 다시 학생에게
-- 넘길 때(OLD.recalled_at IS NOT NULL -> NEW.recalled_at IS NULL)만 알림을 빠뜨렸다.
-- 이미 다시쓰기 중인 행을 재저장하는 경우는 계속 중복 알림을 만들지 않는다.

BEGIN;

CREATE OR REPLACE FUNCTION public.emit_assignment_status_notification_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_mission public.writing_missions%ROWTYPE;
    v_cycle INTEGER;
    v_points INTEGER := 0;
BEGIN
    IF NEW.writing_context <> 'assignment' OR NEW.mission_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT mission.* INTO v_mission
    FROM public.writing_missions mission
    WHERE mission.id = NEW.mission_id
      AND mission.class_id = NEW.class_id;
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    -- 바뀐 뒤 실제로 학생이 다시 쓸 수 있는 상태라면 이전 경로와 관계없이 알린다.
    -- 단, 이미 같은 상태였던 행의 재저장은 새 되돌려주기가 아니므로 제외한다.
    IF NEW.is_returned IS TRUE
      AND NEW.is_submitted IS FALSE
      AND NEW.is_confirmed IS FALSE
      AND NEW.recalled_at IS NULL
      AND (
          OLD.is_returned IS DISTINCT FROM TRUE
          OR OLD.is_submitted IS DISTINCT FROM FALSE
          OR OLD.is_confirmed IS DISTINCT FROM FALSE
          OR OLD.recalled_at IS NOT NULL
      ) THEN
        SELECT count(*)::INTEGER + 1 INTO v_cycle
        FROM public.student_notification_events event
        WHERE event.student_id = NEW.student_id
          AND event.entity_id = NEW.id
          AND event.event_type = 'writing.rewrite_requested';
        PERFORM public.notification_emit_v1(
            NEW.student_id, 'writing', 'writing.rewrite_requested', 'student_post', NEW.id,
            jsonb_build_object(
                'post_id', NEW.id, 'mission_id', NEW.mission_id,
                'post_title', NEW.title, 'mission_title', v_mission.title,
                'feedback', NEW.ai_feedback
            ),
            format('writing:%s:rewrite:%s', NEW.id, v_cycle)
        );
    END IF;

    IF NEW.is_confirmed IS TRUE AND OLD.is_confirmed IS DISTINCT FROM TRUE THEN
        v_points := GREATEST(0, COALESCE(NEW.awarded_base_reward, v_mission.base_reward, 0))
            + CASE
                WHEN GREATEST(0, COALESCE(NEW.awarded_bonus_threshold, v_mission.bonus_threshold, 0)) > 0
                 AND GREATEST(0, COALESCE(NEW.awarded_bonus_reward, v_mission.bonus_reward, 0)) > 0
                 AND COALESCE(NEW.char_count, 0) >= GREATEST(0, COALESCE(v_mission.min_chars, 0))
                    + GREATEST(0, COALESCE(NEW.awarded_bonus_threshold, v_mission.bonus_threshold, 0))
                THEN GREATEST(0, COALESCE(NEW.awarded_bonus_reward, v_mission.bonus_reward, 0))
                ELSE 0
              END;
        SELECT count(*)::INTEGER + 1 INTO v_cycle
        FROM public.point_logs log
        WHERE log.student_id = NEW.student_id
          AND log.post_id = NEW.id
          AND log.amount > 0
          AND log.reason ILIKE '%승인%';
        PERFORM public.notification_emit_v1(
            NEW.student_id, 'writing', 'writing.approved', 'student_post', NEW.id,
            jsonb_build_object(
                'post_id', NEW.id, 'mission_id', NEW.mission_id,
                'post_title', NEW.title, 'mission_title', v_mission.title,
                'point_delta', v_points
            ),
            format('writing:%s:approved:%s', NEW.id, v_cycle)
        );
    END IF;

    IF NEW.is_confirmed IS FALSE AND OLD.is_confirmed IS TRUE THEN
        SELECT GREATEST(0, COALESCE(sum(log.amount), 0))::INTEGER
        INTO v_points
        FROM public.point_logs log
        WHERE log.student_id = NEW.student_id
          AND log.post_id = NEW.id
          AND log.mission_id = NEW.mission_id
          AND log.activity_type = 'writing_reward'
          AND log.reason ILIKE '%승인%';
        -- 회수할 포인트가 있으면 뒤이어 삽입되는 point_logs 트리거가 실제 금액으로
        -- 복합 알림 한 건을 만든다. 0점 승인만 여기서 바로 알린다.
        IF v_points = 0 THEN
            SELECT count(*)::INTEGER + 1 INTO v_cycle
            FROM public.student_notification_events event
            WHERE event.student_id = NEW.student_id
              AND event.entity_id = NEW.id
              AND event.event_type = 'writing.approval_recovered';
            PERFORM public.notification_emit_v1(
                NEW.student_id, 'writing', 'writing.approval_recovered', 'student_post', NEW.id,
                jsonb_build_object(
                    'post_id', NEW.id, 'mission_id', NEW.mission_id,
                    'post_title', NEW.title, 'mission_title', v_mission.title,
                    'point_delta', 0
                ),
                format('writing:%s:recovered:%s', NEW.id, v_cycle)
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.emit_assignment_status_notification_v1()
    FROM PUBLIC, anon, authenticated, service_role;

-- recalled_at만 바꾸는 후속 경로가 생겨도 상태 전환 검사가 빠지지 않게 감시 열에 포함한다.
DROP TRIGGER IF EXISTS trg_assignment_status_notification_v1 ON public.student_posts;
CREATE TRIGGER trg_assignment_status_notification_v1
AFTER UPDATE OF is_returned, is_submitted, is_confirmed, recalled_at ON public.student_posts
FOR EACH ROW EXECUTE FUNCTION public.emit_assignment_status_notification_v1();

NOTIFY pgrst, 'reload schema';

COMMIT;
