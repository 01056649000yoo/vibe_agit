-- 모두의 아지트 메뉴 배지에 AI 차단 댓글 수도 포함 (2026-09-17)
--
-- 검토함에서 막힌 댓글을 처리하도록 했으니, 메뉴 배지(처리할 일 수)에도 그 수를 더해
-- 교사가 들어가기 전에 알 수 있게 한다. 20261307 판을 이어서 확장한다.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_neighbor_teacher_badge_v1(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_space_id UUID;
    v_role TEXT;
    v_reviews INTEGER := 0;
    v_approvals INTEGER := 0;
    v_joins INTEGER := 0;
    v_blocked INTEGER := 0;
BEGIN
    IF auth.uid() IS NULL
       OR NOT (public.auth_user_role() = 'ADMIN'
               OR EXISTS (SELECT 1 FROM public.classes c WHERE c.id = p_class_id AND c.teacher_id = auth.uid())) THEN
        RETURN jsonb_build_object('count', 0);
    END IF;

    SELECT membership.space_id, membership.role INTO v_space_id, v_role
    FROM public.neighbor_space_classes membership
    JOIN public.neighbor_spaces space ON space.id = membership.space_id
    WHERE membership.class_id = p_class_id
      AND membership.status = 'active'
      AND space.status = 'active'
    LIMIT 1;
    IF v_space_id IS NULL THEN
        RETURN jsonb_build_object('count', 0);
    END IF;

    SELECT count(*)::INTEGER INTO v_reviews
    FROM public.neighbor_shared_posts shared
    WHERE shared.space_id = v_space_id AND shared.class_id = p_class_id AND shared.status = 'pending';

    SELECT count(*)::INTEGER INTO v_approvals
    FROM public.neighbor_activity_approvals approval
    WHERE approval.space_id = v_space_id AND approval.class_id = p_class_id AND approval.status = 'pending';

    SELECT count(*)::INTEGER INTO v_blocked
    FROM public.neighbor_comments comment
    WHERE comment.space_id = v_space_id AND comment.class_id = p_class_id AND comment.status = 'blocked';

    IF v_role = 'host' THEN
        SELECT count(*)::INTEGER INTO v_joins
        FROM public.neighbor_space_classes membership
        WHERE membership.space_id = v_space_id AND membership.status = 'pending';
    END IF;

    RETURN jsonb_build_object('count', v_reviews + v_approvals + v_joins + v_blocked);
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
