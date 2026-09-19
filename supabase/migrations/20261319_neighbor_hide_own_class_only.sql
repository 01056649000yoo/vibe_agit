-- 글 비공개(숨김)도 "자기 학급이 공개한 글"만 되도록 좁힌다(2026-09-19, 선생님 결정).
--
-- 지금까지 moderate_neighbor_item_v1 의 글 '긴급 숨김'은 참여 교사면 다른 학급의 공개 글도
-- 숨길 수 있었다. 그런데 한 교사가 학급을 여러 개 운영하면, 한 학급에서 다른 학급의 글까지
-- 비공개로 돌릴 수 있어 혼란스러웠다. 공개·복원이 이미 자기 학급으로 제한돼 있으므로,
-- 숨김도 같은 원칙(자기 학급 글만)으로 맞춘다. 댓글 숨김/복원 규칙은 그대로 둔다.

BEGIN;

CREATE OR REPLACE FUNCTION public.moderate_neighbor_item_v1(
    p_space_id UUID,
    p_actor_class_id UUID,
    p_item_type TEXT,
    p_item_id UUID,
    p_action TEXT,
    p_reason TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_actor TEXT;
    v_shared public.neighbor_shared_posts%ROWTYPE;
    v_comment public.neighbor_comments%ROWTYPE;
    v_status TEXT;
BEGIN
    IF p_item_type NOT IN ('post', 'comment')
       OR p_action NOT IN ('hide', 'restore')
       OR char_length(COALESCE(p_reason, '')) > 240 THEN
        RAISE EXCEPTION '숨김 대상 또는 사유가 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;

    v_actor := public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);

    IF p_item_type = 'post' THEN
        SELECT shared.* INTO v_shared
        FROM public.neighbor_shared_posts shared
        WHERE shared.id = p_item_id AND shared.space_id = p_space_id
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION '관리할 이웃 글이 없습니다.' USING ERRCODE = '22023';
        END IF;

        IF p_action = 'hide' THEN
            IF v_shared.status <> 'published' THEN
                RAISE EXCEPTION '공개 중인 글만 비공개로 돌릴 수 있습니다.' USING ERRCODE = '55000';
            END IF;
            -- 자기 학급이 공개한 글만 비공개로 돌린다(공개·복원과 같은 원칙).
            IF v_shared.class_id <> p_actor_class_id THEN
                RAISE EXCEPTION '자기 학급이 공개한 글만 비공개로 돌릴 수 있습니다.' USING ERRCODE = '42501';
            END IF;
            UPDATE public.neighbor_shared_posts
            SET status = 'hidden',
                hidden_at = NOW(),
                hidden_by = v_user_id,
                hidden_by_class_id = p_actor_class_id,
                hidden_reason = COALESCE(p_reason, '')
            WHERE id = p_item_id;
            v_status := 'hidden';
        ELSE
            IF v_shared.status <> 'hidden' OR v_shared.class_id <> p_actor_class_id THEN
                RAISE EXCEPTION '원래 학급 교사만 숨긴 글을 복원할 수 있습니다.' USING ERRCODE = '42501';
            END IF;
            UPDATE public.neighbor_shared_posts
            SET status = 'published',
                hidden_at = NULL,
                hidden_by = NULL,
                hidden_by_class_id = NULL,
                hidden_reason = ''
            WHERE id = p_item_id;
            v_status := 'published';
        END IF;
    ELSE
        SELECT comment.* INTO v_comment
        FROM public.neighbor_comments comment
        JOIN public.neighbor_shared_posts shared
          ON shared.id = comment.shared_post_id
         AND shared.space_id = comment.space_id
        WHERE comment.id = p_item_id
          AND comment.space_id = p_space_id
          AND shared.status IN ('published', 'hidden')
        FOR UPDATE OF comment;
        IF NOT FOUND THEN
            RAISE EXCEPTION '관리할 이웃 댓글이 없습니다.' USING ERRCODE = '22023';
        END IF;

        IF p_action = 'hide' THEN
            IF v_comment.status <> 'visible' THEN
                RAISE EXCEPTION '보이는 댓글만 긴급 숨김할 수 있습니다.' USING ERRCODE = '55000';
            END IF;
            UPDATE public.neighbor_comments
            SET status = 'hidden',
                hidden_at = NOW(),
                hidden_by = v_user_id,
                hidden_by_class_id = p_actor_class_id,
                hidden_reason = COALESCE(p_reason, '')
            WHERE id = p_item_id;
            v_status := 'hidden';
        ELSE
            IF v_comment.status <> 'hidden' OR v_comment.class_id <> p_actor_class_id THEN
                RAISE EXCEPTION '댓글 작성 학급 교사만 숨긴 댓글을 복원할 수 있습니다.' USING ERRCODE = '42501';
            END IF;
            UPDATE public.neighbor_comments
            SET status = 'visible',
                hidden_at = NULL,
                hidden_by = NULL,
                hidden_by_class_id = NULL,
                hidden_reason = ''
            WHERE id = p_item_id;
            v_status := 'visible';
        END IF;
    END IF;

    INSERT INTO public.neighbor_space_events (
        space_id, class_id, actor_user_id, actor_role, event_type, target_type, target_id
    ) VALUES (
        p_space_id, p_actor_class_id, v_user_id, v_actor,
        CASE WHEN p_action = 'hide' THEN 'item_hidden' ELSE 'item_restored' END,
        p_item_type, p_item_id
    );
    RETURN jsonb_build_object(
        'success', TRUE,
        'status', v_status
    );
END;
$$;

COMMIT;
