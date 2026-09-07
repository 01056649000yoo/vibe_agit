-- 함께 쓰는 주제도 과제 만들기처럼 글 종류·양식을 불러온다(2026-09-07, 선생님 요청).
--
-- 지금까지 이웃 활동은 제목·안내문만 받아 `글쓰기` 한 종류로만 과제를 만들었다(최소 50자·1문단 고정).
-- 학급 과제는 `genreCatalog` 에서 글 종류를 고르면 안내문·길잡이 질문·분량이 함께 채워지는데,
-- 이웃 활동만 그 모듈을 안 쓰고 있었다.
--
-- 화면이 고른 글 종류와 그 양식(길잡이 질문·최소 글자·문단 수)을 그대로 받아 두 학급 과제에 넣는다.
-- 글 종류 **목록의 정본은 화면의 `genreCatalog.js` 하나**다. 서버는 목록을 따로 두지 않고 길이만 확인한다
-- (목록을 두 곳에 두면 새 글 종류를 넣을 때 한쪽만 고쳐 갈라진다).
-- 값을 안 보내면 예전과 똑같이 동작한다.
BEGIN;

-- 인자를 늘리면 옛 판이 남아 **같은 이름 두 개**가 된다. 7개로 부르면 어느 쪽인지 못 정해 오류가 난다.
-- 그래서 옛 판을 먼저 지운다(호출하는 곳은 디스패처 하나뿐이며 아래에서 함께 고친다).
DROP FUNCTION IF EXISTS public.create_neighbor_activity_v1(UUID, UUID, TEXT, TEXT, TEXT, UUID[], TEXT);
DROP FUNCTION IF EXISTS public.create_neighbor_activity_v1(UUID, UUID, TEXT, TEXT, TEXT, UUID[], TEXT, TEXT, JSONB, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.create_neighbor_activity_v1(
    p_space_id UUID, p_actor_class_id UUID, p_activity_type TEXT, p_title TEXT, p_prompt TEXT,
    p_exchange_class_ids UUID[] DEFAULT NULL, p_exchange_share_scope TEXT DEFAULT 'partners',
    p_genre TEXT DEFAULT NULL, p_guide_questions JSONB DEFAULT NULL,
    p_min_chars INTEGER DEFAULT NULL, p_min_paragraphs INTEGER DEFAULT NULL,
    p_mission_type_id TEXT DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_activity public.neighbor_activities%ROWTYPE;
    v_class_id UUID;
    v_mission_id UUID;
    v_class_ids UUID[];
    v_min_students INTEGER;
    v_max_students INTEGER;
    -- 과제 만들기와 같은 값을 받는다. 안 보내면 예전처럼 기본값으로 만든다.
    v_genre TEXT := NULLIF(btrim(COALESCE(p_genre, '')), '');
    v_questions JSONB := CASE WHEN jsonb_typeof(p_guide_questions) = 'array'
        THEN p_guide_questions ELSE '[]'::JSONB END;
    v_min_chars INTEGER := COALESCE(p_min_chars, 50);
    v_min_paragraphs INTEGER := COALESCE(p_min_paragraphs, 1);
    -- 전용 틀이 있는 글 종류(시·편지·보고서·회의)는 `mission_type`·`input_template` 에 그 틀 id 가 들어간다.
    -- 자유 글쓰기는 둘 다 글 종류 이름과 `freeform` 이다(운영 자료에서 확인한 모양 그대로).
    v_type_id TEXT := NULLIF(btrim(COALESCE(p_mission_type_id, '')), '');
BEGIN
    PERFORM public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);
    IF NOT EXISTS (
        SELECT 1 FROM public.neighbor_spaces space
        WHERE space.id = p_space_id AND space.status = 'active'
    ) THEN
        RAISE EXCEPTION '현재 활동을 제안할 수 있는 이웃 공간이 아닙니다.' USING ERRCODE = '55000';
    END IF;
    -- 2026-09-06: 글짝 교환 활동을 제품에서 뺐다. 아래 exchange 분기는 도달하지 않는다.
    IF p_activity_type <> 'topic' THEN
        RAISE EXCEPTION '지원하지 않는 이웃 활동입니다.' USING ERRCODE = '22023';
    END IF;
    IF char_length(btrim(COALESCE(p_title, ''))) NOT BETWEEN 1 AND 80
       OR char_length(btrim(COALESCE(p_prompt, ''))) NOT BETWEEN 1 AND 1000 THEN
        RAISE EXCEPTION '활동 제목과 글쓰기 안내를 확인해 주세요.' USING ERRCODE = '22023';
    END IF;
    -- 글 종류는 학급 과제와 같은 칸에 들어가므로 길이만 확인한다(목록의 정본은 화면의 genreCatalog).
    IF v_genre IS NOT NULL AND char_length(v_genre) > 30 THEN
        RAISE EXCEPTION '글 종류가 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;
    IF v_type_id IS NOT NULL AND v_type_id !~ '^[a-z][a-z0-9_-]{1,29}$' THEN
        RAISE EXCEPTION '글쓰기 양식이 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(v_questions) > 10 THEN
        RAISE EXCEPTION '길잡이 질문은 10개까지 넣을 수 있습니다.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_questions) q
                WHERE char_length(btrim(q)) NOT BETWEEN 1 AND 200) THEN
        RAISE EXCEPTION '길잡이 질문은 1~200자로 적어 주세요.' USING ERRCODE = '22023';
    END IF;
    IF v_min_chars NOT BETWEEN 1 AND 5000 OR v_min_paragraphs NOT BETWEEN 1 AND 20 THEN
        RAISE EXCEPTION '최소 글자 수는 1~5,000자, 문단 수는 1~20개로 정해 주세요.' USING ERRCODE = '22023';
    END IF;

    IF p_activity_type = 'exchange' THEN
        IF p_exchange_share_scope NOT IN ('partners', 'space') THEN
            RAISE EXCEPTION '글짝 글 공개 범위를 확인해 주세요.' USING ERRCODE = '22023';
        END IF;
        IF COALESCE(cardinality(p_exchange_class_ids), 0) <> 2
           OR array_position(p_exchange_class_ids, NULL) IS NOT NULL
           OR p_exchange_class_ids[1] = p_exchange_class_ids[2]
           OR NOT (p_actor_class_id = ANY(p_exchange_class_ids)) THEN
            RAISE EXCEPTION '글짝 교환 활동은 우리 학급을 포함한 서로 다른 두 학급을 골라야 합니다.' USING ERRCODE = '22023';
        END IF;
        SELECT array_agg(membership.class_id ORDER BY membership.class_id)
        INTO v_class_ids
        FROM public.neighbor_space_classes membership
        WHERE membership.space_id = p_space_id
          AND membership.status = 'active'
          AND membership.class_id = ANY(p_exchange_class_ids);
        IF COALESCE(cardinality(v_class_ids), 0) <> 2 THEN
            RAISE EXCEPTION '현재 참여 중인 두 학급만 글짝 교환 활동에 넣을 수 있습니다.' USING ERRCODE = '42501';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.neighbor_spaces space
            WHERE space.id = p_space_id AND space.host_class_id = ANY(v_class_ids)) THEN
            RAISE EXCEPTION '글짝 교환 활동에는 호스트 학급이 포함되어야 합니다.' USING ERRCODE = '22023';
        END IF;
        SELECT min(student_count), max(student_count) INTO v_min_students, v_max_students
        FROM (SELECT count(student.id)::INTEGER student_count FROM unnest(v_class_ids) selected(class_id)
            LEFT JOIN public.students student ON student.class_id = selected.class_id
              AND student.auth_id IS NOT NULL AND student.is_active IS DISTINCT FROM FALSE AND student.deleted_at IS NULL
            GROUP BY selected.class_id) counts;
        IF v_min_students < 1 OR v_max_students > 100 OR v_max_students > v_min_students * 2 THEN
            RAISE EXCEPTION '두 학급 모두 로그인 가능한 학생이 1~100명이고 인원 차이가 두 배 이내여야 합니다.' USING ERRCODE = '22023';
        END IF;
    ELSE
        p_exchange_share_scope := NULL;
        SELECT array_agg(membership.class_id ORDER BY membership.class_id)
        INTO v_class_ids
        FROM public.neighbor_space_classes membership
        WHERE membership.space_id = p_space_id AND membership.status = 'active';
        IF COALESCE(cardinality(v_class_ids), 0) < 2 THEN
            RAISE EXCEPTION '두 학급 이상 참여한 뒤 함께 쓰는 주제를 제안할 수 있습니다.' USING ERRCODE = '55000';
        END IF;
    END IF;

    INSERT INTO public.neighbor_activities (
        space_id, activity_type, title, prompt, status, created_by, exchange_share_scope
    ) VALUES (
        p_space_id, p_activity_type, btrim(p_title), btrim(p_prompt),
        'pending_approval', v_user_id, p_exchange_share_scope
    ) RETURNING * INTO v_activity;

    FOREACH v_class_id IN ARRAY v_class_ids LOOP
        INSERT INTO public.writing_missions (
            class_id, teacher_id, title, guide, genre, mission_type, input_template,
            min_chars, min_paragraphs, base_reward, bonus_threshold,
            bonus_reward, allow_comments, guide_questions, tags, is_archived
        )
        SELECT
            class.id, class.teacher_id, btrim(p_title), btrim(p_prompt),
            COALESCE(v_genre, '글쓰기'),
            COALESCE(v_type_id, v_genre, '글쓰기'),
            COALESCE(v_type_id, 'freeform'),
            v_min_chars, v_min_paragraphs, 0, 0, 0, FALSE, v_questions,
            jsonb_build_array('이웃 아지트', CASE WHEN p_activity_type = 'topic' THEN '함께 쓰는 주제' ELSE '글짝 교환 활동' END),
            TRUE
        FROM public.classes class
        WHERE class.id = v_class_id AND class.deleted_at IS NULL
        RETURNING id INTO v_mission_id;

        IF v_mission_id IS NULL THEN
            RAISE EXCEPTION '참여 학급 글쓰기 과제를 만들 수 없습니다.' USING ERRCODE = '55000';
        END IF;
        INSERT INTO public.neighbor_activity_classes (activity_id, space_id, class_id, mission_id)
        VALUES (v_activity.id, p_space_id, v_class_id, v_mission_id);
        INSERT INTO public.neighbor_activity_approvals (
            activity_id, space_id, class_id, status, is_proposer, decided_by, decided_at
        ) VALUES (
            v_activity.id, p_space_id, v_class_id,
            CASE WHEN v_class_id = p_actor_class_id THEN 'approved' ELSE 'pending' END,
            v_class_id = p_actor_class_id,
            CASE WHEN v_class_id = p_actor_class_id THEN v_user_id ELSE NULL END,
            CASE WHEN v_class_id = p_actor_class_id THEN NOW() ELSE NULL END
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE, 'activity_id', v_activity.id,
        'activity_type', v_activity.activity_type, 'status', v_activity.status,
        'exchange_share_scope', v_activity.exchange_share_scope,
        'class_count', cardinality(v_class_ids),
        'pending_approval_count', cardinality(v_class_ids) - 1
    );
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION '같은 종류의 제안 또는 진행 중인 활동을 먼저 마쳐 주세요.' USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION public.run_neighbor_teacher_action_core_20261238(p_class_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_result JSONB;
    v_space_id UUID := NULLIF(p_payload->>'space_id', '')::UUID;
BEGIN
    PERFORM public.assert_neighbor_teacher_class_v1(p_class_id);
    IF p_action = 'create_space' THEN
        v_result := public.create_neighbor_space_v1(
            p_class_id, p_payload->>'name', p_payload->>'public_class_name',
            COALESCE(p_payload->>'description', '')
        );
    ELSIF p_action = 'join_space' THEN
        v_result := public.request_neighbor_join_v1(
            p_payload->>'invite_key', p_class_id, p_payload->>'public_class_name'
        );
    ELSIF p_action = 'create_invite' THEN
        v_result := public.create_neighbor_invite_v1(v_space_id);
    ELSIF p_action = 'review_join' THEN
        v_result := public.review_neighbor_join_v1(
            v_space_id, NULLIF(p_payload->>'target_class_id', '')::UUID,
            COALESCE((p_payload->>'approve')::BOOLEAN, FALSE)
        );
    ELSIF p_action = 'set_access' THEN
        v_result := public.set_neighbor_class_access_v1(
            v_space_id, p_class_id, COALESCE((p_payload->>'enabled')::BOOLEAN, FALSE)
        );
    ELSIF p_action = 'review_post' THEN
        v_result := public.review_neighbor_shared_post_v1(
            v_space_id, NULLIF(p_payload->>'shared_post_id', '')::UUID,
            p_payload->>'decision', COALESCE(p_payload->>'review_note', '')
        );
    ELSIF p_action = 'create_activity' THEN
        v_result := public.create_neighbor_activity_v1(
            v_space_id, p_class_id, p_payload->>'type', p_payload->>'title', p_payload->>'prompt',
            CASE WHEN jsonb_typeof(p_payload->'exchange_class_ids') = 'array' THEN
                ARRAY(SELECT jsonb_array_elements_text(p_payload->'exchange_class_ids')::UUID)
            ELSE NULL END,
            'partners',
            -- 화면이 고른 글 종류와 그 양식을 그대로 넘긴다. 없으면 예전 기본값으로 만들어진다.
            p_payload->>'genre',
            CASE WHEN jsonb_typeof(p_payload->'guide_questions') = 'array'
                 THEN p_payload->'guide_questions' ELSE NULL END,
            NULLIF(p_payload->>'min_chars', '')::INTEGER,
            NULLIF(p_payload->>'min_paragraphs', '')::INTEGER,
            p_payload->>'mission_type_id'
        );
    ELSIF p_action = 'match_exchange' THEN
        v_result := public.match_neighbor_exchange_v1(
            v_space_id, p_class_id, NULLIF(p_payload->>'activity_id', '')::UUID
        );
    ELSIF p_action = 'close_activity' THEN
        v_result := public.close_neighbor_activity_v1(
            v_space_id, p_class_id, NULLIF(p_payload->>'activity_id', '')::UUID
        );
    ELSIF p_action IN ('hide_post', 'restore_post', 'hide_comment', 'restore_comment') THEN
        v_result := public.moderate_neighbor_item_v1(
            v_space_id, p_class_id,
            CASE WHEN p_action LIKE '%post' THEN 'post' ELSE 'comment' END,
            NULLIF(p_payload->>'item_id', '')::UUID,
            CASE WHEN p_action LIKE 'hide%' THEN 'hide' ELSE 'restore' END,
            COALESCE(p_payload->>'reason', '')
        );
    ELSIF p_action = 'leave_space' THEN
        v_result := public.leave_neighbor_space_v1(v_space_id, p_class_id);
    ELSIF p_action = 'transfer_host' THEN
        v_result := public.transfer_neighbor_host_v1(
            v_space_id, NULLIF(p_payload->>'target_class_id', '')::UUID
        );
    ELSIF p_action = 'close_space' THEN
        v_result := public.close_neighbor_space_v1(v_space_id);
    ELSE
        RAISE EXCEPTION '지원하지 않는 이웃 아지트 교사 동작입니다.' USING ERRCODE = '22023';
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE, 'action_result', v_result,
        'workspace', public.get_neighbor_teacher_workspace_v1(p_class_id)
    );
END;
$$;

-- 실제로 쓰이는 길은 이 래퍼다. 아래 `core_20261238` 은 다른 동작들의 갈래이며,
-- `create_activity` 는 여기서 처리하고 끝나 core 까지 가지 않는다(고칠 때 둘 다 봐야 한다).
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
            p_payload->>'mission_type_id'
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
$$;

COMMIT;
