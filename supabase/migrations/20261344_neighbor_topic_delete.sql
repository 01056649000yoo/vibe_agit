-- 같이 쓰기 광장 주제 삭제 (2026-09-25, 선생님 요청: 주제를 만든 뒤 지울 곳이 없다)
--
-- 누가: 주제를 제안한 반의 교사 또는 공간 호스트 교사(관리자 포함). 승인 대기 중인 제안도 제안한 반이 거둘 수 있다.
-- 무엇이 사라지나(모두의 아지트 안): 주제, 그 주제로 공개된 글, 그 글의 댓글·공감·간직하기, 승인 기록.
--   외래키 ON DELETE CASCADE 로 함께 지워지고, 댓글 알림은 댓글 삭제 트리거가 거둔다.
--   반 연결 줄이 지워질 때 도는 reevaluate_neighbor_activity_after_class_drop_v1 은 활동이 이미 없으면 아무것도 안 한다.
-- 무엇이 남나: **각 반의 과제와 학생 원글**. 과제는 보관함으로 옮기고 이웃 태그를 뗀다(그 반의 일반 과제가 된다).
--   과제 보호 트리거(guard_neighbor_activity_mission_v1)는 연결이 있을 때만 막으므로, 주제를 먼저 지운 뒤 과제를 고친다.

BEGIN;

CREATE OR REPLACE FUNCTION public.delete_neighbor_activity_v1(p_space_id UUID, p_actor_class_id UUID, p_activity_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_activity public.neighbor_activities%ROWTYPE;
    v_missions UUID[];
    v_posts INTEGER;
    v_comments INTEGER;
BEGIN
    PERFORM public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);

    SELECT activity.* INTO v_activity
    FROM public.neighbor_activities activity
    WHERE activity.id = p_activity_id AND activity.space_id = p_space_id
    FOR UPDATE;
    IF NOT FOUND OR v_activity.activity_type <> 'topic' THEN
        RAISE EXCEPTION '지울 수 있는 주제가 없습니다.' USING ERRCODE = '22023';
    END IF;

    IF NOT (
        EXISTS (SELECT 1 FROM public.neighbor_spaces space
                WHERE space.id = p_space_id AND space.host_class_id = p_actor_class_id)
        OR EXISTS (SELECT 1 FROM public.neighbor_activity_approvals approval
                   WHERE approval.activity_id = p_activity_id AND approval.class_id = p_actor_class_id
                     AND approval.is_proposer)
        OR public.auth_user_role() = 'ADMIN'
    ) THEN
        RAISE EXCEPTION '주제를 제안한 반 선생님이나 호스트 선생님만 지울 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(array_agg(link.mission_id), '{}') INTO v_missions
    FROM public.neighbor_activity_classes link
    WHERE link.activity_id = p_activity_id;
    SELECT count(*)::INTEGER INTO v_posts
    FROM public.neighbor_shared_posts shared
    WHERE shared.activity_id = p_activity_id AND shared.space_id = p_space_id;
    SELECT count(*)::INTEGER INTO v_comments
    FROM public.neighbor_comments comment
    JOIN public.neighbor_shared_posts shared ON shared.id = comment.shared_post_id
    WHERE shared.activity_id = p_activity_id AND shared.space_id = p_space_id;

    DELETE FROM public.neighbor_activities WHERE id = p_activity_id AND space_id = p_space_id;

    -- 각 반 과제는 남기되 학생 화면에서 치우고(보관함), 이웃 과제 표시를 뗀다.
    UPDATE public.writing_missions mission
    SET is_archived = TRUE,
        tags = CASE WHEN jsonb_typeof(mission.tags) = 'array' THEN COALESCE((
            SELECT jsonb_agg(tag.value ORDER BY tag.ordinality)
            FROM jsonb_array_elements(mission.tags) WITH ORDINALITY tag
            WHERE tag.value NOT IN ('"이웃 아지트"'::JSONB, '"같이 쓰기 광장"'::JSONB)
        ), '[]'::JSONB) ELSE mission.tags END
    WHERE mission.id = ANY(v_missions);

    RETURN jsonb_build_object('success', TRUE, 'activity_id', p_activity_id,
        'removed_posts', v_posts, 'removed_comments', v_comments, 'kept_missions', COALESCE(array_length(v_missions, 1), 0));
END;
$$;
REVOKE ALL ON FUNCTION public.delete_neighbor_activity_v1(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_neighbor_activity_v1(UUID, UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
