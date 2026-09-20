-- 모두의 아지트 활동 상태 일관성 정리(2026-09-20).
--
-- 배경: 학급이 공간을 나가거나(leave, status='left') 삭제(DELETE, cascade)될 때, 또 활동 과제 하나가
--   삭제되어 그 학급이 한 활동에서만 빠질 때, 활동/공간 상태가 어정쩡하게 남았다.
--   - leave RPC 는 학생 공개 OFF 까지만 했고(활동 종료·승인 재판정 안 함),
--     학급 DELETE(cascade) 경로는 그것조차 안 했다.
--
-- 트리거 두 개로 두 경로(나가기·삭제)를 한곳에서 정리한다. topic 활동만 남아 상태는
-- pending_approval/open/closed 만 다루면 된다(matched_at 은 늘 NULL).

BEGIN;

-- 1) 공간 참여 학급이 2 미만으로 떨어지면: 남은 학급 학생 공개 OFF + 진행 중/승인 대기 활동 종료.
CREATE OR REPLACE FUNCTION public.guard_neighbor_space_collapse_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_space_id UUID := COALESCE(NEW.space_id, OLD.space_id);
    v_active INTEGER;
BEGIN
    -- 상태가 실제로 바뀐 삭제/이탈에만 반응한다(신규 승인 등은 건드리지 않음).
    IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NULL;
    END IF;

    SELECT count(*)::INTEGER INTO v_active
    FROM public.neighbor_space_classes
    WHERE space_id = v_space_id AND status = 'active';

    IF v_active < 2 THEN
        UPDATE public.neighbor_space_classes
        SET student_access_enabled = FALSE
        WHERE space_id = v_space_id AND student_access_enabled IS TRUE;

        UPDATE public.neighbor_activities
        SET status = 'closed', closed_at = NOW()
        WHERE space_id = v_space_id AND status IN ('open', 'pending_approval');
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_neighbor_space_collapse ON public.neighbor_space_classes;
CREATE TRIGGER trg_neighbor_space_collapse
    AFTER UPDATE OF status OR DELETE ON public.neighbor_space_classes
    FOR EACH ROW EXECUTE FUNCTION public.guard_neighbor_space_collapse_v1();

-- 2) 한 활동에서 학급 하나가 빠지면(과제 삭제 등): 남은 학급으로 활동 상태를 다시 맞춘다.
--    - 남은 참여 학급이 2 미만이면 활동 종료.
--    - 승인 대기(pending_approval)인데 남은 학급이 모두 승인했으면 open 으로 연다(재판정 누락 방지).
CREATE OR REPLACE FUNCTION public.reevaluate_neighbor_activity_after_class_drop_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_status TEXT;
    v_remaining INTEGER;
    v_has_unapproved BOOLEAN;
BEGIN
    -- 활동 자체가 사라지는 중이면(공간 삭제 cascade 등) 건드리지 않는다.
    SELECT status INTO v_status FROM public.neighbor_activities WHERE id = OLD.activity_id;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT count(*)::INTEGER INTO v_remaining
    FROM public.neighbor_activity_classes WHERE activity_id = OLD.activity_id;

    IF v_remaining < 2 THEN
        IF v_status IN ('open', 'pending_approval') THEN
            UPDATE public.neighbor_activities
            SET status = 'closed', closed_at = NOW()
            WHERE id = OLD.activity_id AND status IN ('open', 'pending_approval');
        END IF;
        RETURN NULL;
    END IF;

    IF v_status = 'pending_approval' THEN
        SELECT EXISTS (
            SELECT 1 FROM public.neighbor_activity_approvals
            WHERE activity_id = OLD.activity_id AND status <> 'approved'
        ) INTO v_has_unapproved;
        IF NOT v_has_unapproved THEN
            UPDATE public.neighbor_activities
            SET status = 'open'
            WHERE id = OLD.activity_id AND status = 'pending_approval';
        END IF;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_neighbor_activity_class_drop ON public.neighbor_activity_classes;
CREATE TRIGGER trg_neighbor_activity_class_drop
    AFTER DELETE ON public.neighbor_activity_classes
    FOR EACH ROW EXECUTE FUNCTION public.reevaluate_neighbor_activity_after_class_drop_v1();

COMMIT;
