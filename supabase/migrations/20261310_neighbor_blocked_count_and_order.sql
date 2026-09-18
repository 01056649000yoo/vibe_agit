-- 모두의 아지트: 막힌 댓글 배지 수와 목록 순서 바로잡기 (2026-09-18)
--
-- 두 가지가 어긋나 있었다(20261308 판).
--
--   1. **배지 수가 두 곳에서 달랐다.** 메뉴 배지(get_neighbor_teacher_badge_v1)는 막힌 댓글을
--      전부 세는데, 검토함 배지(notifications.blocked_comments)는 LIMIT 100 안에서 셌다.
--      100건을 넘기면 메뉴에는 숫자가 떠 있는데 검토함에서는 그만큼 처리할 수 없어,
--      **교사가 지울 수 없는 배지**가 생긴다.
--
--   2. **어떤 100건이 보일지 정해져 있지 않았다.** 자르기 전에 순서를 정하지 않고 100건을 가져온 뒤
--      정렬해서, 최신 100건이 아니라 아무 100건이 보일 수 있었다.
--
-- 고침: 수는 자르기 전 전체를 세고, 목록은 **최신순으로 정렬한 뒤** 100건을 자른다.
-- 100건을 넘으면 화면이 "N건 중 최신 100건" 이라고 알리고, 처리하면 다음 것이 이어진다.

BEGIN;

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
    v_blocked JSONB := '[]'::JSONB;
    v_blocked_count INTEGER := 0;
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
        ), NOW());

        SELECT count(*)::INTEGER INTO v_new_posts
        FROM public.neighbor_shared_posts shared
        WHERE shared.space_id = v_space_id AND shared.class_id <> p_class_id
          AND shared.status = 'published' AND shared.published_at > v_last_seen;

        SELECT count(*)::INTEGER INTO v_new_comments
        FROM public.neighbor_comments comment
        WHERE comment.space_id = v_space_id AND comment.class_id <> p_class_id
          AND comment.status = 'visible' AND comment.created_at > v_last_seen;

        SELECT count(*)::INTEGER INTO v_pending_approvals
        FROM public.neighbor_activity_approvals approval
        WHERE approval.space_id = v_space_id AND approval.class_id = p_class_id
          AND approval.status = 'pending';

        IF v_my_role = 'host' THEN
            SELECT count(*)::INTEGER INTO v_pending_joins
            FROM public.neighbor_space_classes membership
            WHERE membership.space_id = v_space_id AND membership.status = 'pending';
        END IF;

        -- 우리 반 학생이 쓴, AI가 막은 이웃 댓글(교사가 검토함에서 되살리거나 지운다).
        -- 배지에 쓰는 수는 **자르기 전 전체**를 센다. 예전에는 아래 LIMIT 100 안에서 세어
        -- 메뉴 배지(전체)와 검토함 배지(100까지)가 어긋났다(2026-09-18).
        SELECT count(*)::INTEGER INTO v_blocked_count
        FROM public.neighbor_comments comment
        WHERE comment.space_id = v_space_id AND comment.class_id = p_class_id
          AND comment.status = 'blocked';

        SELECT COALESCE(jsonb_agg(item.row ORDER BY item.created_at DESC), '[]'::JSONB)
        INTO v_blocked
        FROM (
            SELECT comment.created_at,
                jsonb_build_object(
                    'comment_id', comment.id,
                    'content', comment.content,
                    'created_at', comment.created_at,
                    'student_name', left(btrim(student.name), 30),
                    'shared_post_id', comment.shared_post_id,
                    'post_title', post.title,
                    'reason', comment.moderation_reason
                ) AS row
            FROM public.neighbor_comments comment
            JOIN public.students student
              ON student.id = comment.student_id AND student.class_id = comment.class_id
            JOIN public.neighbor_shared_posts shared ON shared.id = comment.shared_post_id
            JOIN public.student_posts post ON post.id = shared.post_id
            WHERE comment.space_id = v_space_id
              AND comment.class_id = p_class_id
              AND comment.status = 'blocked'
            ORDER BY comment.created_at DESC
            LIMIT 100
        ) item;
    END IF;

    v_notifications := jsonb_build_object(
        'pending_reviews', COALESCE((v_base->>'review_total')::INTEGER, 0),
        'pending_approvals', v_pending_approvals,
        'pending_joins', v_pending_joins,
        'new_posts', v_new_posts,
        'new_comments', v_new_comments,
        'blocked_comments', v_blocked_count
    );

    RETURN v_base || jsonb_build_object(
        'activities', CASE WHEN v_space_id IS NULL THEN '[]'::JSONB
            ELSE public.get_neighbor_teacher_activities_v1(v_space_id, p_class_id) END,
        'blocked_comments', v_blocked,
        'notifications', v_notifications
    );
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
