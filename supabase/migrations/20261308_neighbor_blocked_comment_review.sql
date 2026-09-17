-- 모두의 아지트: AI가 막은 우리 반 댓글을 교사 검토함에서 확인·처리 (2026-09-17)
--
-- 문제: 이웃 댓글도 우리 반 댓글과 같은 AI 검사를 지나 막히면 status='blocked' 가 되는데,
-- 학급 "학생 댓글" 관리는 post_comments 만 보고, 이웃 교사 화면도 blocked 를 안 보여 줘
-- 막힌 이웃 댓글을 교사가 검토·복원할 경로가 아예 없었다(학급 댓글과 어긋난 공백).
--
-- 해결:
--   1) 워크스페이스 응답에 우리 반 blocked 이웃 댓글 목록·카운트를 실어 검토함에서 보이게 한다.
--   2) restore/delete RPC 로 그 댓글을 담임이 되살리거나(→visible) 삭제(→deleted)한다.

BEGIN;

-- 1) 차단 댓글 처리 RPC (그 댓글을 쓴 학생의 담임만)
CREATE OR REPLACE FUNCTION public.review_neighbor_blocked_comment_v1(
    p_space_id UUID,
    p_actor_class_id UUID,
    p_comment_id UUID,
    p_action TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_comment public.neighbor_comments%ROWTYPE;
    v_status TEXT;
BEGIN
    IF p_action NOT IN ('restore', 'delete') THEN
        RAISE EXCEPTION '지원하지 않는 작업입니다.' USING ERRCODE = '22023';
    END IF;
    PERFORM public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);

    SELECT comment.* INTO v_comment
    FROM public.neighbor_comments comment
    WHERE comment.id = p_comment_id AND comment.space_id = p_space_id
    FOR UPDATE;
    IF NOT FOUND OR v_comment.class_id <> p_actor_class_id THEN
        RAISE EXCEPTION '우리 학급 댓글만 처리할 수 있습니다.' USING ERRCODE = '42501';
    END IF;
    IF v_comment.status <> 'blocked' THEN
        RAISE EXCEPTION 'AI가 막은 댓글이 아닙니다.' USING ERRCODE = '22023';
    END IF;

    v_status := CASE WHEN p_action = 'restore' THEN 'visible' ELSE 'deleted' END;
    UPDATE public.neighbor_comments
    SET status = v_status,
        content = CASE WHEN p_action = 'delete' THEN '' ELSE content END,
        moderation_reason = NULL,
        moderated_at = NOW(),
        moderated_by = auth.uid()
    WHERE id = p_comment_id;

    RETURN jsonb_build_object('success', TRUE, 'comment_id', p_comment_id, 'status', v_status);
END;
$$;

REVOKE ALL ON FUNCTION public.review_neighbor_blocked_comment_v1(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_neighbor_blocked_comment_v1(UUID, UUID, UUID, TEXT) TO authenticated;

-- 2) 워크스페이스 응답에 우리 반 차단 댓글 목록·카운트 추가 (20261306 판을 이어서 확장)
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
        SELECT COALESCE(jsonb_agg(item.row ORDER BY item.created_at DESC), '[]'::JSONB), count(*)::INTEGER
        INTO v_blocked, v_blocked_count
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
