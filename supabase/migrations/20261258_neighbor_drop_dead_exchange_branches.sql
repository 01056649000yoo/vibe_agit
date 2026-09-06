-- 정리(2026-09-07): 글짝 교환을 뺀 뒤(61254) 남아 있던 죽은 분기를 걷어낸다.
-- `run_neighbor_teacher_action_v1` 이 `propose_neighbor_exchange_matches_v1`·
-- `review_neighbor_exchange_matches_v1` 을 계속 부르고 있었는데 그 함수들은 이미 없다.
-- 호출하면 undefined_function 으로 죽었다(닫히는 쪽이라 위험하진 않았지만 뜻이 통하지 않는 오류였다).
-- 활동 만들기에 넘기던 교환 인자도 뺀다 — 생성 함수는 61254 부터 'topic' 만 받는다.
BEGIN;

CREATE OR REPLACE FUNCTION public.run_neighbor_teacher_action_v1(p_class_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_result JSONB;
    v_source public.student_posts%ROWTYPE;
    v_space_id UUID := NULLIF(p_payload->>'space_id', '')::UUID;
BEGIN
    PERFORM public.assert_neighbor_teacher_class_v1(p_class_id);
    IF p_action IN ('publish_gallery_post', 'review_post') THEN
        PERFORM public.assert_neighbor_participating_teacher_v1(v_space_id, p_class_id);
        -- 원글 -> 공유 행 순서로 잠가 전문 확인 이후 수정과 공개를 직렬화한다.
        SELECT post.* INTO v_source FROM public.student_posts post
        WHERE post.class_id = p_class_id AND (
            (p_action = 'publish_gallery_post' AND post.id = NULLIF(p_payload->>'post_id', '')::UUID)
            OR (p_action = 'review_post' AND EXISTS (
                SELECT 1 FROM public.neighbor_shared_posts shared WHERE shared.post_id = post.id
                  AND shared.class_id = p_class_id AND shared.space_id = v_space_id
                  AND shared.id = NULLIF(p_payload->>'shared_post_id', '')::UUID
            ))
        ) FOR UPDATE;
        IF v_source.id IS NULL OR public.neighbor_source_is_shareable_v1(v_source) IS NOT TRUE THEN
            RAISE EXCEPTION '공유할 수 있는 우리 학급 제출 글이 아닙니다.' USING ERRCODE = '42501';
        END IF;
        IF p_payload->>'source_revision' IS DISTINCT FROM public.neighbor_source_revision_v1(v_source) THEN
            RAISE EXCEPTION '글이 변경되었습니다. 전문을 다시 열어 확인해 주세요.' USING ERRCODE = 'PT409';
        END IF;
        IF p_action = 'review_post' AND p_payload->>'decision' = 'return'
          AND char_length(btrim(COALESCE(p_payload->>'review_note', ''))) NOT BETWEEN 1 AND 240 THEN
            RAISE EXCEPTION '돌려보내는 이유를 1~240자로 적어 주세요.' USING ERRCODE = '22023';
        END IF;
    END IF;
    IF p_action = 'create_activity' THEN
        v_result := public.create_neighbor_activity_v1(
            v_space_id, p_class_id, p_payload->>'type', p_payload->>'title', p_payload->>'prompt'
        );
    ELSIF p_action = 'review_activity' THEN
        v_result := public.review_neighbor_activity_v1(
            v_space_id, p_class_id,
            NULLIF(p_payload->>'activity_id', '')::UUID,
            COALESCE((p_payload->>'approve')::BOOLEAN, FALSE)
        );
    ELSIF p_action = 'publish_gallery_post' THEN
        v_result := public.publish_neighbor_class_post_v1(
            v_space_id, p_class_id, NULLIF(p_payload->>'post_id', '')::UUID
        );
    ELSIF p_action = 'review_post' THEN
        v_result := public.review_neighbor_shared_post_v1(v_space_id,
            NULLIF(p_payload->>'shared_post_id', '')::UUID, p_payload->>'decision',
            COALESCE(p_payload->>'review_note', ''));
    ELSIF p_action IN ('propose_exchange_matches', 'review_exchange_matches', 'match_exchange') THEN
        -- 글짝 교환 활동은 61254 에서 제품에서 뺐다. 이 분기들은 이미 지운 함수를 부르고 있어
        -- 호출하면 undefined_function 으로 죽었다. 뜻이 통하는 거절로 바꿔 둔다.
        RAISE EXCEPTION '글짝 교환 활동은 더 이상 제공하지 않습니다.' USING ERRCODE = '22023';
    ELSE
        RETURN public.run_neighbor_teacher_action_core_20261238(p_class_id, p_action, p_payload);
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'action_result', v_result,
        'workspace', public.get_neighbor_teacher_workspace_v1(p_class_id)
    );
END;
$function$;

NOTIFY pgrst,'reload schema';
COMMIT;
