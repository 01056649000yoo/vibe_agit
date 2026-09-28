-- 친구가 반응을 취소하면 그 반응 알림도 지운다 — 20261262 에서 빠진 것을 되돌린다(2026-09-28 스모크 전수 점검).
--
-- 20261116 의 `emit_feedback_reaction_notification_v1` 은 첫머리에 `IF TG_OP = 'DELETE'` 로 알림을 지웠다.
-- 20261262(알림에 보낸 학생 ID 더하기)가 이 함수를 다시 쓰면서 그 분기를 빠뜨렸다. 같은 파일의 댓글 알림 함수는
-- 분기를 그대로 두었다. 그 뒤로 반응을 눌렀다 취소하면 받은 학생에게 "친구가 반응했어요" 알림이 남았다.
-- 점검 때 운영에 없는 반응을 가리키는 알림이 724건(그중 20261262 적용 뒤 629건, 안 읽은 것 468건) 있었다.
-- 20261116 스모크 ②가 이것을 잡았는데, 스모크를 아무도 돌리지 않아 드러나지 않았다.
--
-- 1) 함수: 20261262 의 운영 정의 그대로 + 첫머리 DELETE 분기(20261116 과 같은 조건). 권한(내부 전용)은 바뀌지 않는다.
-- 2) 이미 남은 알림: 가리키는 반응이 없는 반응 알림만 지운다. 원래 취소 때 지워졌어야 할 행이다.
BEGIN;

CREATE OR REPLACE FUNCTION public.emit_feedback_reaction_notification_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_owner_id UUID;
    v_post_title TEXT;
    v_actor_name TEXT;
BEGIN
    -- 반응을 취소하면 그 반응 알림도 사라진다(20261116 과 같다).
    IF TG_OP = 'DELETE' THEN
        DELETE FROM public.student_notification_events
        WHERE module_id = 'feedback'
          AND event_key = format('reaction:%s', OLD.id);
        RETURN OLD;
    END IF;
    SELECT post.student_id, left(COALESCE(post.title, ''), 80)
    INTO v_owner_id, v_post_title
    FROM public.student_posts post
    WHERE post.id = NEW.post_id;
    IF v_owner_id IS NULL OR v_owner_id = NEW.student_id THEN
        RETURN NEW;
    END IF;
    -- notification_emit_v1은 비활성 학생·삭제 학급에서 예외를 던진다. 트리거 안에서
    -- 예외가 나면 반응 저장 자체가 막히므로 같은 조건을 미리 걸러 조용히 건너뛴다.
    IF NOT EXISTS (
        SELECT 1
        FROM public.students student
        JOIN public.classes class ON class.id = student.class_id
        WHERE student.id = v_owner_id
          AND student.is_active IS DISTINCT FROM FALSE
          AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
          AND class.deleted_at IS NULL
    ) THEN
        RETURN NEW;
    END IF;
    SELECT student.name INTO v_actor_name
    FROM public.students student
    WHERE student.id = NEW.student_id;
    PERFORM public.notification_emit_v1(
        v_owner_id, 'feedback', 'feedback.reaction_received', 'student_post', NEW.post_id,
        jsonb_build_object(
            'post_id', NEW.post_id,
            'post_title', v_post_title,
            'actor_name', COALESCE(v_actor_name, '친구'),
            'reaction_type', NEW.reaction_type
        ),
        format('reaction:%s', NEW.id),
        1::SMALLINT,
        NEW.student_id
    );
    RETURN NEW;
END;
$function$;

-- 취소됐는데 남은 반응 알림 정리. event_key 는 'reaction:<반응 UUID>' 형식이다.
DELETE FROM public.student_notification_events e
WHERE e.module_id = 'feedback'
  AND e.event_key LIKE 'reaction:%'
  AND NOT EXISTS (
      SELECT 1 FROM public.post_reactions r WHERE r.id::TEXT = substr(e.event_key, length('reaction:') + 1)
  );

COMMIT;
