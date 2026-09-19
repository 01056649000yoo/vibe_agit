-- 모두의 아지트: 글 공개는 오직 교사의 판단으로 한다(2026-09-19, 선생님 결정).
--
-- 지금까지는 학생이 "내 글을 공개해 주세요"라고 요청(pending)하면 교사가 검토해 공개하는 길이 있었다.
-- 이 요청 시스템을 없앤다. 대신 교사가 학급 제출 글을 직접 골라 공개한다.
--   - 글 나눔(갤러리)은 이미 publish_neighbor_class_post_v1 로 교사가 직접 공개하고 있었다.
--   - 함께 쓰는 주제(활동)는 학생 요청→교사 검토로만 공개됐으므로, 교사가 활동 글을 직접
--     고르고 공개하는 경로(후보 조회 + 직접 공개)를 새로 둔다.
--
-- 학생 요청·회수·요청 후보 함수는 더 이상 제공하지 않으므로 거절로 바꾼다(권한/서명은 유지해
-- 남아 있을 수 있는 호출이 조용히 오작동하지 않고 분명히 막히게 한다).

BEGIN;

-- 1) 학생 공개 요청 계열을 비활성화한다.
CREATE OR REPLACE FUNCTION public.request_neighbor_post_share_v1(p_space_id UUID, p_post_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    RAISE EXCEPTION '글 공개는 이제 선생님이 직접 골라서 합니다.' USING ERRCODE = '42501';
END; $$;

CREATE OR REPLACE FUNCTION public.request_neighbor_activity_post_v1(p_space_id UUID, p_activity_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    RAISE EXCEPTION '활동 글 공개는 이제 선생님이 직접 골라서 합니다.' USING ERRCODE = '42501';
END; $$;

CREATE OR REPLACE FUNCTION public.recall_my_neighbor_shared_post_v1(p_space_id UUID, p_shared_post_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    RAISE EXCEPTION '학생 공개 요청·회수는 더 이상 제공하지 않습니다.' USING ERRCODE = '42501';
END; $$;

CREATE OR REPLACE FUNCTION public.get_neighbor_my_share_candidates_v1(p_space_id UUID, p_limit INTEGER DEFAULT 50)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    RAISE EXCEPTION '학생 공개 요청은 더 이상 제공하지 않습니다.' USING ERRCODE = '42501';
END; $$;

-- 2) 교사가 한 활동(주제)의 우리 학급 제출 글을 골라 공개하도록 후보를 돌려준다.
--    글 나눔 후보와 같은 모양(post_id·student_name·title·excerpt·share_status)이되, 그 활동의
--    우리 반 미션에 한정한다.
CREATE OR REPLACE FUNCTION public.get_neighbor_teacher_activity_candidates_v1(
    p_space_id UUID,
    p_actor_class_id UUID,
    p_activity_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_mission_id UUID;
    v_items JSONB := '[]'::JSONB;
BEGIN
    PERFORM public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);
    SELECT link.mission_id INTO v_mission_id
    FROM public.neighbor_activity_classes link
    WHERE link.activity_id = p_activity_id AND link.class_id = p_actor_class_id AND link.space_id = p_space_id;
    IF v_mission_id IS NULL THEN
        RETURN jsonb_build_object('version', 1, 'activity_id', p_activity_id, 'items', '[]'::JSONB);
    END IF;
    SELECT COALESCE(jsonb_agg(row_data.item ORDER BY row_data.updated_at DESC, row_data.post_id DESC), '[]'::JSONB)
    INTO v_items
    FROM (
        SELECT post.id AS post_id, post.updated_at,
            jsonb_build_object(
                'post_id', post.id,
                'student_name', left(btrim(student.name), 30),
                'title', post.title,
                'excerpt', left(regexp_replace(COALESCE(post.content, ''), E'[\s\n\r]+', ' ', 'g'), 180),
                'updated_at', post.updated_at,
                'shared_post_id', shared.id,
                'share_status', shared.status,
                'review_note', shared.review_note
            ) AS item
        FROM public.student_posts post
        JOIN public.students student
          ON student.id = post.student_id AND student.class_id = post.class_id
         AND student.is_active IS DISTINCT FROM FALSE AND student.deleted_at IS NULL
        LEFT JOIN public.neighbor_shared_posts shared
          ON shared.space_id = p_space_id AND shared.post_id = post.id
         AND shared.class_id = post.class_id AND shared.student_id = post.student_id
        WHERE post.class_id = p_actor_class_id
          AND post.mission_id = v_mission_id
          AND public.neighbor_source_is_shareable_v1(post)
        ORDER BY post.updated_at DESC, post.id DESC
        LIMIT 500
    ) row_data;
    RETURN jsonb_build_object('version', 1, 'activity_id', p_activity_id, 'max_rows', 500, 'items', v_items);
END;
$$;

-- 3) 교사가 활동 글을 직접 공개한다(활동 id 를 공유 행에 심는다 — 학생 화면의 활동 구획으로 간다).
CREATE OR REPLACE FUNCTION public.publish_neighbor_activity_post_v1(
    p_space_id UUID,
    p_actor_class_id UUID,
    p_post_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_actor TEXT;
    v_student_id UUID;
    v_student_name TEXT;
    v_activity_id UUID;
    v_shared public.neighbor_shared_posts%ROWTYPE;
BEGIN
    v_actor := public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);
    -- 이 글이 우리 반의 어떤 활동 미션에 속하는지 확인한다(활동 글만 이 경로로 공개한다).
    SELECT post.student_id, left(btrim(student.name), 30), link.activity_id
    INTO v_student_id, v_student_name, v_activity_id
    FROM public.student_posts post
    JOIN public.students student
      ON student.id = post.student_id AND student.class_id = post.class_id
     AND student.is_active IS DISTINCT FROM FALSE AND student.deleted_at IS NULL
    JOIN public.neighbor_activity_classes link
      ON link.mission_id = post.mission_id AND link.class_id = post.class_id AND link.space_id = p_space_id
    WHERE post.id = p_post_id
      AND post.class_id = p_actor_class_id
      AND public.neighbor_source_is_shareable_v1(post);
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION '공개할 수 있는 우리 학급의 활동 제출 글이 아닙니다.' USING ERRCODE = '42501';
    END IF;

    SELECT shared.* INTO v_shared
    FROM public.neighbor_shared_posts shared
    WHERE shared.space_id = p_space_id AND shared.post_id = p_post_id
    FOR UPDATE;
    IF FOUND AND v_shared.status = 'hidden' THEN
        RAISE EXCEPTION '숨김 처리된 글은 복원한 뒤 다시 공유할 수 있습니다.' USING ERRCODE = '55000';
    ELSIF FOUND AND v_shared.status = 'published' THEN
        RETURN jsonb_build_object('success', TRUE, 'shared_post_id', v_shared.id, 'status', v_shared.status);
    ELSIF FOUND THEN
        UPDATE public.neighbor_shared_posts
        SET activity_id = v_activity_id, public_author_name = v_student_name, status = 'published',
            requested_at = NOW(), reviewed_at = NOW(), reviewed_by = v_user_id,
            review_note = '', published_at = NOW(), hidden_at = NULL, hidden_by = NULL,
            hidden_by_class_id = NULL, hidden_reason = ''
        WHERE id = v_shared.id RETURNING * INTO v_shared;
    ELSE
        INSERT INTO public.neighbor_shared_posts (
            space_id, class_id, post_id, student_id, public_author_name, activity_id,
            status, reviewed_at, reviewed_by, published_at
        ) VALUES (
            p_space_id, p_actor_class_id, p_post_id, v_student_id, v_student_name, v_activity_id,
            'published', NOW(), v_user_id, NOW()
        ) RETURNING * INTO v_shared;
    END IF;

    INSERT INTO public.neighbor_space_events (
        space_id, class_id, actor_user_id, actor_role, event_type, target_type, target_id
    ) VALUES (
        p_space_id, p_actor_class_id, v_user_id, v_actor,
        'post_published_by_teacher', 'post', v_shared.id
    );
    RETURN jsonb_build_object('success', TRUE, 'shared_post_id', v_shared.id, 'status', v_shared.status);
END;
$$;

REVOKE ALL ON FUNCTION public.get_neighbor_teacher_activity_candidates_v1(UUID, UUID, UUID)
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.publish_neighbor_activity_post_v1(UUID, UUID, UUID)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_neighbor_teacher_activity_candidates_v1(UUID, UUID, UUID) TO authenticated;
-- publish 는 화면이 run_neighbor_teacher_action_v1 을 거쳐 호출하므로 직접 실행 권한은 주지 않는다.

-- 4) 디스패처에 활동 글 직접 공개 분기를 더한다(20261314 사본 + publish_activity_post* 두 분기).
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
    ELSIF p_action = 'publish_activity_post' THEN
        v_result := public.publish_neighbor_activity_post_v1(
            v_space_id, p_class_id, NULLIF(p_payload->>'post_id', '')::UUID
        );
    ELSIF p_action IN ('publish_gallery_posts_bulk', 'publish_activity_posts_bulk') THEN
        -- 묶음(주제/학생) 안의 공개 대상 글을 순서대로 공개한다. 활동 글이면 활동 공개 함수를 쓴다.
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
                IF p_action = 'publish_activity_posts_bulk' THEN
                    PERFORM public.publish_neighbor_activity_post_v1(v_space_id, p_class_id, v_post_id);
                ELSE
                    PERFORM public.publish_neighbor_class_post_v1(v_space_id, p_class_id, v_post_id);
                END IF;
                v_published := v_published + 1;
            EXCEPTION WHEN OTHERS THEN
                v_skipped := v_skipped + 1;
            END;
        END LOOP;
        v_result := jsonb_build_object('success', TRUE, 'published', v_published, 'skipped', v_skipped);
    ELSIF p_action = 'hide_gallery_posts_bulk' THEN
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

NOTIFY pgrst, 'reload schema';

COMMIT;
