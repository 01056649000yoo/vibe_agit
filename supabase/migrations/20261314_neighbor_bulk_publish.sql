-- 글 나눔 공간의 "일괄 공개"·"일괄 비공개" 지원(2026-09-18, 선생님 결정).
--
-- 지금까지 글 나눔 공간 공개는 글을 한 편씩 열어 전문을 확인한 뒤 공개하는 길뿐이었다.
-- 이미 학급에서 다 살펴본 뒤 "공개만" 하려는 선생님은, 주제별·학생별로 묶인 글을
-- 한 명 한 명 눌러야 해서 번거로웠다. 되돌리기(비공개)도 마찬가지로 한 편씩이라 번거로웠다.
--
-- publish_gallery_posts_bulk: 묶음 안 post_id 목록을 공개한다(아래 상세).
-- hide_gallery_posts_bulk: 묶음 안 shared_post_id 목록을 비공개(숨김)로 돌린다.
--   숨김은 기존 moderate_neighbor_item_v1 를 그대로 반복 호출한다(로직은 한 곳에만).
--
-- 그래서 새 동작 publish_gallery_posts_bulk 를 둔다. 화면이 묶음(주제/학생) 안의
-- 공개 대상 post_id 목록을 그대로 넘기면, 서버가 기존 단건 공개 함수
-- publish_neighbor_class_post_v1 를 그 목록만큼 반복 호출한다.
--   - 공개 로직은 그대로 한 곳(publish_neighbor_class_post_v1)에만 둔다.
--   - 이미 공개된 글은 그 함수가 그대로 success 를 돌려주므로 건너뛴 것으로 센다.
--   - 숨김 글 등 공개할 수 없는 글은 한 편이 막혀도 나머지가 멈추지 않게
--     각 글을 하위 블록에서 처리하고, 막힌 편수만 따로 센다.
--   - 전문 재확인(source_revision) 가드는 단건 검토 공개에만 있는 것이라 일괄에는 없다.
--     선생님이 "이미 점검했다"고 보고 묶음 전체를 공개하는 흐름이므로 의도에 맞다.

BEGIN;

CREATE OR REPLACE FUNCTION public.run_neighbor_teacher_action_v1(p_class_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_result JSONB;
    v_source public.student_posts%ROWTYPE;
    v_space_id UUID := NULLIF(p_payload->>'space_id', '')::UUID;
    v_post_id UUID;
    v_published INTEGER := 0;
    v_skipped INTEGER := 0;
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
            v_space_id, p_class_id, p_payload->>'type', p_payload->>'title', p_payload->>'prompt',
            NULL, 'partners',
            -- 화면이 고른 글 종류와 그 양식을 그대로 넘긴다. 없으면 예전 기본값으로 만들어진다.
            p_payload->>'genre',
            CASE WHEN jsonb_typeof(p_payload->'guide_questions') = 'array'
                 THEN p_payload->'guide_questions' ELSE NULL END,
            NULLIF(p_payload->>'min_chars', '')::INTEGER,
            NULLIF(p_payload->>'min_paragraphs', '')::INTEGER,
            p_payload->>'mission_type_id',
            NULLIF(p_payload->>'base_reward', '')::INTEGER,
            NULLIF(p_payload->>'bonus_threshold', '')::INTEGER,
            NULLIF(p_payload->>'bonus_reward', '')::INTEGER
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
    ELSIF p_action = 'publish_gallery_posts_bulk' THEN
        -- 화면이 넘긴 묶음(주제/학생) 안의 공개 대상 글을 순서대로 공개한다.
        PERFORM public.assert_neighbor_participating_teacher_v1(v_space_id, p_class_id);
        IF jsonb_typeof(p_payload->'post_ids') <> 'array'
           OR jsonb_array_length(p_payload->'post_ids') NOT BETWEEN 1 AND 100 THEN
            RAISE EXCEPTION '한 번에 공개할 글을 1~100편으로 골라 주세요.' USING ERRCODE = '22023';
        END IF;
        FOR v_post_id IN
            SELECT DISTINCT NULLIF(value, '')::UUID
            FROM jsonb_array_elements_text(p_payload->'post_ids') AS value
            WHERE NULLIF(value, '') IS NOT NULL
        LOOP
            BEGIN
                PERFORM public.publish_neighbor_class_post_v1(v_space_id, p_class_id, v_post_id);
                v_published := v_published + 1;
            EXCEPTION WHEN OTHERS THEN
                -- 숨김 글 등 지금 공개할 수 없는 한 편은 건너뛰고 나머지를 계속 공개한다.
                v_skipped := v_skipped + 1;
            END;
        END LOOP;
        v_result := jsonb_build_object('success', TRUE, 'published', v_published, 'skipped', v_skipped);
    ELSIF p_action = 'hide_gallery_posts_bulk' THEN
        -- 공개 글 관리에서 묶음(주제/학생) 안의 공개 중인 글을 한 번에 비공개(숨김)로 돌린다.
        PERFORM public.assert_neighbor_participating_teacher_v1(v_space_id, p_class_id);
        IF jsonb_typeof(p_payload->'shared_post_ids') <> 'array'
           OR jsonb_array_length(p_payload->'shared_post_ids') NOT BETWEEN 1 AND 100 THEN
            RAISE EXCEPTION '한 번에 비공개할 글을 1~100편으로 골라 주세요.' USING ERRCODE = '22023';
        END IF;
        FOR v_post_id IN
            SELECT DISTINCT NULLIF(value, '')::UUID
            FROM jsonb_array_elements_text(p_payload->'shared_post_ids') AS value
            WHERE NULLIF(value, '') IS NOT NULL
        LOOP
            BEGIN
                -- v_post_id 는 여기서는 공유 글 id(shared_post_id) 다(moderate 의 item_id).
                PERFORM public.moderate_neighbor_item_v1(v_space_id, p_class_id, 'post', v_post_id, 'hide',
                    COALESCE(NULLIF(p_payload->>'reason', ''), '교사 확인'));
                v_published := v_published + 1;
            EXCEPTION WHEN OTHERS THEN
                v_skipped := v_skipped + 1;
            END;
        END LOOP;
        v_result := jsonb_build_object('success', TRUE, 'hidden', v_published, 'skipped', v_skipped);
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
$$;

COMMIT;
