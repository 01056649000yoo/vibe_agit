-- 독서록/일기 같은 자율 글 완주 보상(writing_reward)도 학생 활동 알림으로 연결한다.
-- 기존에는 assignment_recovery에서만 writing_reward 알림이 발생해 자율 글 포인트가 빠졌고,
-- 자율 글은 과제 승인 회수 흐름(writing.approval_recovered)과 분리해 포인트 알림으로 표시한다.

BEGIN;

CREATE OR REPLACE FUNCTION public.emit_point_notification_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_post public.student_posts%ROWTYPE;
    v_mission_title TEXT;
    v_cycle INTEGER;
BEGIN
    IF NEW.activity_type = 'writing_reward'
      AND NEW.post_id IS NOT NULL
      AND EXISTS (
          SELECT 1
          FROM public.student_posts post
          WHERE post.id = NEW.post_id
            AND post.student_id = NEW.student_id
            AND post.writing_context = 'self'
      ) THEN
        PERFORM public.notification_emit_v1(
            NEW.student_id, 'points', 'points.adjusted', 'point_log', NEW.id,
            jsonb_build_object(
                'point_log_id', NEW.id, 'point_delta', NEW.amount, 'reason', NEW.reason,
                'post_id', NEW.post_id
            ),
            COALESCE(
                NEW.event_key,
                format('point-log:%s', NEW.id)
            )
        );
    ELSIF NEW.activity_type = 'writing_reward'
      AND NEW.metadata->>'source' = 'assignment_recovery'
      AND NEW.post_id IS NOT NULL THEN
        SELECT post.* INTO v_post
        FROM public.student_posts post
        WHERE post.id = NEW.post_id
          AND post.student_id = NEW.student_id;
        IF FOUND THEN
            SELECT mission.title INTO v_mission_title
            FROM public.writing_missions mission
            WHERE mission.id = v_post.mission_id
              AND mission.class_id = v_post.class_id;
            v_cycle := GREATEST(1, COALESCE((NEW.metadata->>'cycle')::INTEGER, 1));
            PERFORM public.notification_emit_v1(
                NEW.student_id, 'writing', 'writing.approval_recovered', 'student_post', v_post.id,
                jsonb_build_object(
                    'post_id', v_post.id, 'mission_id', v_post.mission_id,
                    'post_title', v_post.title, 'mission_title', v_mission_title,
                    'point_delta', NEW.amount
                ),
                format('writing:%s:recovered:%s', v_post.id, v_cycle)
            );
        END IF;
    ELSIF NEW.activity_type = 'private_adjustment'
      AND NEW.metadata->>'source' = 'teacher_adjustment' THEN
        PERFORM public.notification_emit_v1(
            NEW.student_id, 'points', 'points.adjusted', 'point_log', NEW.id,
            jsonb_build_object(
                'point_log_id', NEW.id, 'point_delta', NEW.amount, 'reason', NEW.reason
            ),
            COALESCE(NEW.event_key, format('point-log:%s', NEW.id))
        );
    END IF;
    RETURN NEW;
END;
$$;

COMMIT;
