-- 이웃 아지트의 글짝 교환 활동을 제품에서 뺀다(사용자 결정).
-- 남는 두 활동은 글 나눔 공간과 함께 쓰는 주제다. `activity_type` 은 이제 'topic' 하나뿐이다.
--
-- 여기서 지우는 것: 진행 중이던 교환 활동 자료, 교환 전용 RPC 3개, 새 교환 활동을 만들 길.
-- 여기서 남기는 것: 빈 `neighbor_exchange_matches` 표와 읽기 함수 6개 안의 교환 하위 질의.
--   그 표를 드롭하면 학생·교사 활동 읽기 함수 여섯 개를 모두 다시 써야 하고, 그것은 지금 운영 중인
--   주제 활동 읽기 경로를 통째로 건드리는 일이다. 표는 영원히 비어 있고 CHECK 로 교환 행이 생길 수 없으므로
--   기능상 도달할 수 없는 잔재다. 정리하려면 읽기 함수 재작성만 따로 하는 편이 안전하다.
BEGIN;

-- 1) 진행 중이던 교환 활동을 정리한다(운영에 1건, 테스트 공간).
DELETE FROM public.neighbor_exchange_matches m
 WHERE EXISTS(SELECT 1 FROM public.neighbor_activities a WHERE a.id=m.activity_id AND a.activity_type='exchange');
DELETE FROM public.neighbor_activities WHERE activity_type='exchange';

-- 2) 교환 행이 다시 생길 수 없게 못박는다. 나머지 CHECK 들은 topic 가지만 남아 스스로 성립한다.
ALTER TABLE public.neighbor_activities DROP CONSTRAINT IF EXISTS neighbor_activities_activity_type_check;
ALTER TABLE public.neighbor_activities ADD CONSTRAINT neighbor_activities_activity_type_check
    CHECK (activity_type = 'topic');

-- 3) 교환 전용 RPC 를 없앤다. 다른 함수가 부르지 않는 것을 확인했다.
DROP FUNCTION IF EXISTS public.get_neighbor_exchange_roster_v1(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS public.propose_neighbor_exchange_matches_v1(UUID, UUID, UUID, JSONB);
DROP FUNCTION IF EXISTS public.review_neighbor_exchange_matches_v1(UUID, UUID, UUID, BOOLEAN);

-- 4) 새 활동 만들기에서 교환을 거부한다.
CREATE OR REPLACE FUNCTION public.create_neighbor_activity_v1(p_space_id uuid, p_actor_class_id uuid, p_activity_type text, p_title text, p_prompt text, p_exchange_class_ids uuid[] DEFAULT NULL::uuid[], p_exchange_share_scope text DEFAULT 'partners'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_activity public.neighbor_activities%ROWTYPE;
    v_class_id UUID;
    v_mission_id UUID;
    v_class_ids UUID[];
    v_min_students INTEGER;
    v_max_students INTEGER;
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
            class_id, teacher_id, title, guide, genre, mission_type,
            min_chars, min_paragraphs, base_reward, bonus_threshold,
            bonus_reward, allow_comments, guide_questions, tags, is_archived
        )
        SELECT
            class.id, class.teacher_id, btrim(p_title), btrim(p_prompt), '글쓰기', '글쓰기',
            50, 1, 0, 0, 0, FALSE, '[]'::JSONB,
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
$function$;

NOTIFY pgrst,'reload schema';
COMMIT;
