-- 모두의 아지트: 교사 메뉴 배지용 가벼운 카운트 RPC (2026-09-17)
--
-- 교사가 화면에 들어가기 전에도 "처리할 것"을 메뉴 배지로 알 수 있게, 워크스페이스 전체를
-- 읽지 않고 처리 필요 건수만 싸게 센다. 처리 필요만 센다(공개 대기·내 승인 필요·참여 신청) —
-- 새 글/새 댓글 같은 단순 알림은 메뉴까지 올리지 않아 과하지 않게 한다.
-- 자격 없는 학급(미공개·비담임)에는 0 을 돌려주고 예외를 던지지 않는다(대시보드가 아무 학급에나 부른다).

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
BEGIN
    -- 담임 또는 ADMIN 이 아니면 조용히 0.
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

    IF v_role = 'host' THEN
        SELECT count(*)::INTEGER INTO v_joins
        FROM public.neighbor_space_classes membership
        WHERE membership.space_id = v_space_id AND membership.status = 'pending';
    END IF;

    RETURN jsonb_build_object('count', v_reviews + v_approvals + v_joins);
END;
$$;

REVOKE ALL ON FUNCTION public.get_neighbor_teacher_badge_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_neighbor_teacher_badge_v1(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
