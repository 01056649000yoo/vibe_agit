-- 함께 쓰는 주제도 학급 과제와 같은 포인트를 받고 우리 반 댓글을 연다(2026-09-07, 선생님 결정).
--
-- 확인해 보니 이웃 활동 과제는 `base_reward=0`·`allow_comments=FALSE` 로 **박혀** 있었다.
--   - 아이가 이웃 주제로 글을 써도 포인트가 없었다. 같은 노력인데 학급 과제만 포인트가 붙었다.
--   - 이웃 학급에서는 댓글이 되는데 정작 **같은 반 친구는 그 글에 댓글을 못 달았다.**
-- 선생님이 정한 포인트를 그대로 쓰고, 댓글은 학급 과제처럼 연다(표 기본값도 `allow_comments=true` 다).
--
-- `is_archived=TRUE` 는 그대로 둔다 — 이건 실수가 아니라 **승인 전에 학생이 미리 쓰지 못하게** 하는 장치다.
-- 모든 학급 교사가 승인하면 `review_neighbor_activity_v1` 이 풀어 준다(운영 자료로 확인).
BEGIN;

DROP FUNCTION IF EXISTS public.create_neighbor_activity_v1(UUID, UUID, TEXT, TEXT, TEXT, UUID[], TEXT, TEXT, JSONB, INTEGER, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION public.create_neighbor_activity_v1(p_space_id uuid, p_actor_class_id uuid, p_activity_type text, p_title text, p_prompt text, p_exchange_class_ids uuid[] DEFAULT NULL::uuid[], p_exchange_share_scope text DEFAULT 'partners'::text, p_genre text DEFAULT NULL::text, p_guide_questions jsonb DEFAULT NULL::jsonb, p_min_chars integer DEFAULT NULL::integer, p_min_paragraphs integer DEFAULT NULL::integer, p_mission_type_id TEXT DEFAULT NULL,
    p_base_reward INTEGER DEFAULT NULL, p_bonus_threshold INTEGER DEFAULT NULL,
    p_bonus_reward INTEGER DEFAULT NULL)
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
    -- 포인트는 학급 과제와 같은 기준으로 받는다(2026-09-07 선생님 결정).
    -- 예전에는 0 으로 박혀 있어 이웃 주제로 쓴 글만 포인트가 없었다.
    v_base_reward INTEGER := COALESCE(p_base_reward, 0);
    v_bonus_threshold INTEGER := COALESCE(p_bonus_threshold, 0);
    v_bonus_reward INTEGER := COALESCE(p_bonus_reward, 0);
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
    IF v_base_reward NOT BETWEEN 0 AND 1000 OR v_bonus_reward NOT BETWEEN 0 AND 1000
       OR v_bonus_threshold NOT BETWEEN 0 AND 5000 THEN
        RAISE EXCEPTION '포인트는 0~1,000P, 추가 분량 기준은 0~5,000자로 정해 주세요.' USING ERRCODE = '22023';
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
            v_min_chars, v_min_paragraphs,
            v_base_reward, v_bonus_threshold, v_bonus_reward,
            -- 우리 반 친구도 댓글을 달 수 있게 한다. 예전에는 꺼져 있어 이웃 학급만 댓글이 됐다.
            TRUE, v_questions,
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
