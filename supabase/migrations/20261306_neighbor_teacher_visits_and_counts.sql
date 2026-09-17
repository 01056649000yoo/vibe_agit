-- 모두의 아지트: 교사 방문 기록 + 알림 카운트 (2026-09-17)
--
-- 목적(탭 이동 최소화): 교사가 화면에 들어가지 않아도 "처리할 것/새 것"을 배지로 알 수 있게,
-- 워크스페이스 RPC 응답에 notifications 카운트를 더한다. "새 글/새 댓글"은 교사별 마지막 확인
-- 시각과 비교해 센다(학생용 neighbor_feed_visits 와 같은 방식의 교사판).
--
-- 성격:
--   · 처리 필요(방문과 무관, 절대값): pending_reviews(공개 대기)·pending_approvals(내 승인 필요한
--     주제 제안)·pending_joins(호스트, 참여 신청).
--   · 알림(마지막 확인 이후): new_posts·new_comments (다른 반 것만).

BEGIN;

-- 1) 교사별(=학급별) 마지막 확인 시각. 서버 함수만 읽고 쓴다.
CREATE TABLE IF NOT EXISTS public.neighbor_space_teacher_visits (
    space_id UUID NOT NULL,
    class_id UUID NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (space_id, class_id),
    CONSTRAINT neighbor_teacher_visits_membership_fkey
        FOREIGN KEY (space_id, class_id)
        REFERENCES public.neighbor_space_classes(space_id, class_id) ON DELETE CASCADE
);
ALTER TABLE public.neighbor_space_teacher_visits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.neighbor_space_teacher_visits FROM PUBLIC, anon, authenticated;
-- 정책 없음 → 클라이언트 직접 접근 불가. 아래 SECURITY DEFINER 함수만 접근한다.

-- 2) "지금까지 봤음" 표시 — 교사가 화면/검토함을 열면 부른다. 카운트 기준선을 갱신한다.
CREATE OR REPLACE FUNCTION public.mark_neighbor_teacher_seen_v1(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_space_id UUID;
BEGIN
    PERFORM public.assert_neighbor_teacher_class_v1(p_class_id);
    SELECT membership.space_id INTO v_space_id
    FROM public.neighbor_space_classes membership
    JOIN public.neighbor_spaces space ON space.id = membership.space_id
    WHERE membership.class_id = p_class_id
      AND membership.status = 'active'
      AND space.status = 'active'
    LIMIT 1;
    IF v_space_id IS NULL THEN
        RETURN jsonb_build_object('success', TRUE, 'space_id', NULL);
    END IF;

    INSERT INTO public.neighbor_space_teacher_visits (space_id, class_id, last_seen_at)
    VALUES (v_space_id, p_class_id, NOW())
    ON CONFLICT (space_id, class_id) DO UPDATE SET last_seen_at = NOW();

    RETURN jsonb_build_object('success', TRUE, 'space_id', v_space_id, 'last_seen_at', NOW());
END;
$$;

REVOKE ALL ON FUNCTION public.mark_neighbor_teacher_seen_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_neighbor_teacher_seen_v1(UUID) TO authenticated;

-- 3) 워크스페이스 RPC 에 notifications 카운트를 더한다(기존 동작 유지 + 덧붙임).
CREATE OR REPLACE FUNCTION public.get_neighbor_teacher_workspace_v1(p_class_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_base JSONB;
    v_space_id UUID;
    v_my_role TEXT;
    v_last_seen TIMESTAMPTZ;
    v_new_posts INTEGER := 0;
    v_new_comments INTEGER := 0;
    v_pending_approvals INTEGER := 0;
    v_pending_joins INTEGER := 0;
    v_notifications JSONB;
BEGIN
    PERFORM public.assert_neighbor_teacher_class_v1(p_class_id);
    v_base := public.get_neighbor_teacher_workspace_core_20261237(p_class_id);
    v_space_id := CASE WHEN v_base #>> '{space,my_status}' = 'active'
        THEN NULLIF(v_base #>> '{space,id}', '')::UUID ELSE NULL END;
    v_my_role := v_base #>> '{space,my_role}';

    IF v_space_id IS NOT NULL THEN
        v_last_seen := COALESCE((
            SELECT visit.last_seen_at FROM public.neighbor_space_teacher_visits visit
            WHERE visit.space_id = v_space_id AND visit.class_id = p_class_id
        ), NOW());  -- 처음이면 새 것 0(피드는 어차피 보인다). 이후엔 마지막 확인 이후로 센다.

        SELECT count(*)::INTEGER INTO v_new_posts
        FROM public.neighbor_shared_posts shared
        WHERE shared.space_id = v_space_id
          AND shared.class_id <> p_class_id
          AND shared.status = 'published'
          AND shared.published_at > v_last_seen;

        SELECT count(*)::INTEGER INTO v_new_comments
        FROM public.neighbor_comments comment
        WHERE comment.space_id = v_space_id
          AND comment.class_id <> p_class_id
          AND comment.status = 'visible'
          AND comment.created_at > v_last_seen;

        SELECT count(*)::INTEGER INTO v_pending_approvals
        FROM public.neighbor_activity_approvals approval
        WHERE approval.space_id = v_space_id
          AND approval.class_id = p_class_id
          AND approval.status = 'pending';

        IF v_my_role = 'host' THEN
            SELECT count(*)::INTEGER INTO v_pending_joins
            FROM public.neighbor_space_classes membership
            WHERE membership.space_id = v_space_id
              AND membership.status = 'pending';
        END IF;
    END IF;

    v_notifications := jsonb_build_object(
        'pending_reviews', COALESCE((v_base->>'review_total')::INTEGER, 0),
        'pending_approvals', v_pending_approvals,
        'pending_joins', v_pending_joins,
        'new_posts', v_new_posts,
        'new_comments', v_new_comments
    );

    RETURN v_base || jsonb_build_object(
        'activities', CASE WHEN v_space_id IS NULL THEN '[]'::JSONB
            ELSE public.get_neighbor_teacher_activities_v1(v_space_id, p_class_id) END,
        'notifications', v_notifications
    );
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
