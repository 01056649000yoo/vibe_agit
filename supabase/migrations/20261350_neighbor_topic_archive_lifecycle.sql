-- 공동 주제 종료의 모든 경로(수동·기한·모임 해체·참여 감소)를 같은 보관 계약으로 묶는다.
-- 원글은 이동/복제/삭제하지 않는다. 학급 과제의 보관 상태와 날짜만 바꾼다.
BEGIN;

CREATE OR REPLACE FUNCTION public.archive_closed_neighbor_topic_v1()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE public.writing_missions mission
    SET is_archived = TRUE,
        archived_at = COALESCE(mission.archived_at, NEW.closed_at, NOW())
    FROM public.neighbor_activity_classes link
    WHERE link.activity_id = NEW.id AND link.class_id = mission.class_id
      AND link.mission_id = mission.id
      AND (mission.is_archived IS DISTINCT FROM TRUE OR mission.archived_at IS NULL);
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.archive_closed_neighbor_topic_v1() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS neighbor_topic_archive_on_close ON public.neighbor_activities;
CREATE TRIGGER neighbor_topic_archive_on_close
AFTER UPDATE OF status ON public.neighbor_activities FOR EACH ROW
WHEN (NEW.activity_type = 'topic' AND NEW.status = 'closed')
EXECUTE FUNCTION public.archive_closed_neighbor_topic_v1();

-- 참여 수 변화를 거치지 않는 모임 종료도 같은 경로로 처리한다.
CREATE OR REPLACE FUNCTION public.close_topics_with_neighbor_space_v1()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE public.neighbor_activities
    SET status = 'closed', closed_at = COALESCE(closed_at, NEW.closed_at, NOW())
    WHERE space_id = NEW.id AND activity_type = 'topic' AND status <> 'closed';
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.close_topics_with_neighbor_space_v1() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS neighbor_space_close_topics ON public.neighbor_spaces;
CREATE TRIGGER neighbor_space_close_topics
AFTER UPDATE OF status ON public.neighbor_spaces FOR EACH ROW
WHEN (NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed')
EXECUTE FUNCTION public.close_topics_with_neighbor_space_v1();

-- 주제 삭제로 연결이 사라질 때도 보관 날짜를 남긴다. 기존 RPC의 권한 검사는 유지한다.
-- 부모 주제가 사라진 AFTER 단계이므로 과제 보호 트리거와 충돌하지 않는다.
CREATE OR REPLACE FUNCTION public.archive_unlinked_neighbor_topic_mission_v1()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.neighbor_activities WHERE id = OLD.activity_id) THEN
        UPDATE public.writing_missions
        SET is_archived = TRUE, archived_at = COALESCE(archived_at, NOW())
        WHERE id = OLD.mission_id AND class_id = OLD.class_id;
    END IF;
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.archive_unlinked_neighbor_topic_mission_v1() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS neighbor_topic_unlink_archive ON public.neighbor_activity_classes;
CREATE TRIGGER neighbor_topic_unlink_archive
AFTER DELETE ON public.neighbor_activity_classes FOR EACH ROW
EXECUTE FUNCTION public.archive_unlinked_neighbor_topic_mission_v1();

-- 기존 종료 모임/주제의 누락만 보정. 승인 대기와 진행 중 과제는 건드리지 않는다.
UPDATE public.neighbor_activities activity
SET status = 'closed', closed_at = COALESCE(activity.closed_at, space.closed_at, NOW())
FROM public.neighbor_spaces space
WHERE activity.space_id = space.id AND space.status = 'closed'
  AND activity.activity_type = 'topic' AND activity.status <> 'closed';

UPDATE public.writing_missions mission
SET is_archived = TRUE, archived_at = COALESCE(mission.archived_at, activity.closed_at, NOW())
FROM public.neighbor_activity_classes link
JOIN public.neighbor_activities activity ON activity.id = link.activity_id
WHERE link.mission_id = mission.id AND link.class_id = mission.class_id
  AND activity.activity_type = 'topic' AND activity.status = 'closed'
  AND (mission.is_archived IS DISTINCT FROM TRUE OR mission.archived_at IS NULL);

COMMIT;
