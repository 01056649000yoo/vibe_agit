-- 모두의 아지트 한 공간의 참여 학급 상한을 4 → 10으로 올린다(2026-09-19, 선생님 결정).
--
-- 20261199 의 guard_neighbor_space_class_v1 트리거가 활성 학급 4개에서 막았다.
-- 더 많은 반이 함께하도록 10개까지 허용한다(호스트 포함). 다른 검증(닫힌 공간·호스트 이전)은 그대로.

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_neighbor_space_class_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_space public.neighbor_spaces%ROWTYPE;
    v_active_count INTEGER;
BEGIN
    SELECT space.* INTO v_space
    FROM public.neighbor_spaces space
    WHERE space.id = NEW.space_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Neighbor space not found' USING ERRCODE = '23503';
    END IF;
    IF v_space.status = 'closed' AND NEW.status = 'active'
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
        RAISE EXCEPTION 'Closed neighbor space cannot accept an active class' USING ERRCODE = '23514';
    END IF;

    IF NEW.status = 'active' THEN
        SELECT count(*)::INTEGER INTO v_active_count
        FROM public.neighbor_space_classes membership
        WHERE membership.space_id = NEW.space_id
          AND membership.status = 'active'
          AND membership.id <> NEW.id;
        IF v_active_count >= 10 THEN
            RAISE EXCEPTION 'Neighbor space supports at most ten active classes' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

COMMIT;
