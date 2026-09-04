BEGIN;

-- 글 나눔 공간은 담임이 자기 학급 제출 글을 직접 공개할 수 있다.
-- 글짝 교환 활동은 호스트의 수동 매칭안과 상대 학급 교사의 승인을 거친 뒤 학생에게 열린다.
ALTER TABLE public.neighbor_activities
    ADD COLUMN IF NOT EXISTS exchange_share_scope TEXT,
    ADD COLUMN IF NOT EXISTS match_proposed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS match_proposed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS match_review_class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS match_decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS match_decided_at TIMESTAMPTZ;

ALTER TABLE public.neighbor_space_events
    DROP CONSTRAINT IF EXISTS neighbor_space_events_event_type_check;
ALTER TABLE public.neighbor_space_events
    ADD CONSTRAINT neighbor_space_events_event_type_check CHECK (event_type IN (
        'space_created', 'invite_created', 'invite_cancelled', 'join_requested',
        'join_approved', 'join_rejected', 'class_left', 'host_transferred',
        'space_paused', 'space_resumed', 'space_closed', 'class_access_changed',
        'post_requested', 'post_published', 'post_returned', 'post_recalled', 'item_hidden',
        'item_restored', 'comment_changed', 'reaction_changed', 'save_changed',
        'rollout_changed', 'post_published_by_teacher', 'exchange_match_proposed',
        'exchange_match_approved', 'exchange_match_rejected'
    ));
ALTER TABLE public.neighbor_space_events
    DROP CONSTRAINT IF EXISTS neighbor_space_events_target_type_check;
ALTER TABLE public.neighbor_space_events
    ADD CONSTRAINT neighbor_space_events_target_type_check CHECK (
        target_type IS NULL OR target_type IN ('space', 'class', 'invite', 'post', 'comment', 'activity')
    );

UPDATE public.neighbor_activities
SET exchange_share_scope = 'partners'
WHERE activity_type = 'exchange' AND exchange_share_scope IS NULL;

ALTER TABLE public.neighbor_activities
    DROP CONSTRAINT IF EXISTS neighbor_activities_exchange_share_scope_check;
ALTER TABLE public.neighbor_activities
    ADD CONSTRAINT neighbor_activities_exchange_share_scope_check CHECK (
        (activity_type = 'exchange' AND exchange_share_scope IN ('partners', 'space'))
        OR (activity_type <> 'exchange' AND exchange_share_scope IS NULL)
    );

ALTER TABLE public.neighbor_activities
    DROP CONSTRAINT IF EXISTS neighbor_activities_status_check;
ALTER TABLE public.neighbor_activities
    ADD CONSTRAINT neighbor_activities_status_check
    CHECK (status IN ('pending_approval', 'open', 'matching_review', 'matched', 'closed'));

ALTER TABLE public.neighbor_activities
    DROP CONSTRAINT IF EXISTS neighbor_activities_check1;
ALTER TABLE public.neighbor_activities
    ADD CONSTRAINT neighbor_activities_check1 CHECK (
        (status = 'pending_approval' AND matched_at IS NULL AND closed_at IS NULL)
        OR (status = 'open' AND matched_at IS NULL AND closed_at IS NULL)
        OR (status = 'matching_review' AND activity_type = 'exchange'
            AND matched_at IS NULL AND closed_at IS NULL
            AND match_proposed_by IS NOT NULL AND match_proposed_at IS NOT NULL
            AND match_review_class_id IS NOT NULL)
        OR (status = 'matched' AND activity_type = 'exchange'
            AND matched_at IS NOT NULL AND closed_at IS NULL)
        OR (status = 'closed' AND closed_at IS NOT NULL)
    );

DROP INDEX IF EXISTS public.idx_neighbor_activities_one_live_type;
CREATE UNIQUE INDEX idx_neighbor_activities_one_live_type
    ON public.neighbor_activities (space_id, activity_type)
    WHERE status IN ('pending_approval', 'open', 'matching_review', 'matched');

-- 예전 자동 매칭 완료 활동은 이미 합의된 것으로 보존한다. 아직 매칭 전인 글짝 과제는 새 승인 전까지 숨긴다.
UPDATE public.neighbor_activities activity
SET match_proposed_by = COALESCE(activity.match_proposed_by, activity.created_by),
    match_proposed_at = COALESCE(activity.match_proposed_at, activity.matched_at),
    match_decided_by = COALESCE(activity.match_decided_by, activity.created_by),
    match_decided_at = COALESCE(activity.match_decided_at, activity.matched_at),
    match_review_class_id = COALESCE(activity.match_review_class_id, (
        SELECT link.class_id
        FROM public.neighbor_activity_classes link
        JOIN public.neighbor_spaces space ON space.id = link.space_id
        WHERE link.activity_id = activity.id AND link.class_id <> space.host_class_id
        ORDER BY link.class_id
        LIMIT 1
    ))
WHERE activity.activity_type = 'exchange' AND activity.status = 'matched';

ALTER TABLE public.neighbor_activities
    DROP CONSTRAINT IF EXISTS neighbor_activities_match_approval_check;
ALTER TABLE public.neighbor_activities
    ADD CONSTRAINT neighbor_activities_match_approval_check CHECK (
        (status <> 'matching_review' OR (
            activity_type = 'exchange'
            AND match_proposed_by IS NOT NULL
            AND match_proposed_at IS NOT NULL
            AND match_review_class_id IS NOT NULL
            AND match_decided_by IS NULL
            AND match_decided_at IS NULL
        ))
        AND (status <> 'matched' OR (
            activity_type = 'exchange'
            AND match_proposed_by IS NOT NULL
            AND match_proposed_at IS NOT NULL
            AND match_review_class_id IS NOT NULL
            AND match_decided_by IS NOT NULL
            AND match_decided_at IS NOT NULL
        ))
        AND (activity_type <> 'topic' OR (
            match_proposed_by IS NULL
            AND match_proposed_at IS NULL
            AND match_review_class_id IS NULL
            AND match_decided_by IS NULL
            AND match_decided_at IS NULL
        ))
    );

UPDATE public.writing_missions mission
SET is_archived = TRUE
FROM public.neighbor_activity_classes link
JOIN public.neighbor_activities activity ON activity.id = link.activity_id
WHERE mission.id = link.mission_id
  AND activity.activity_type = 'exchange'
  AND activity.status IN ('pending_approval', 'open', 'matching_review');

-- 공개 범위까지 다른 학급 교사가 활동 제안 단계에서 확인하도록 새 인자를 같은 함수에 붙인다.
DROP FUNCTION IF EXISTS public.create_neighbor_activity_v1(UUID, UUID, TEXT, TEXT, TEXT, UUID[]);

CREATE FUNCTION public.create_neighbor_activity_v1(
    p_space_id UUID,
    p_actor_class_id UUID,
    p_activity_type TEXT,
    p_title TEXT,
    p_prompt TEXT,
    p_exchange_class_ids UUID[] DEFAULT NULL,
    p_exchange_share_scope TEXT DEFAULT 'partners'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_activity public.neighbor_activities%ROWTYPE;
    v_class_id UUID;
    v_mission_id UUID;
    v_class_ids UUID[];
BEGIN
    PERFORM public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);
    IF NOT EXISTS (
        SELECT 1 FROM public.neighbor_spaces space
        WHERE space.id = p_space_id AND space.status = 'active'
    ) THEN
        RAISE EXCEPTION '현재 활동을 제안할 수 있는 이웃 공간이 아닙니다.' USING ERRCODE = '55000';
    END IF;
    IF p_activity_type NOT IN ('topic', 'exchange') THEN
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
        IF cardinality(p_exchange_class_ids) <> 2
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
        IF cardinality(v_class_ids) <> 2 THEN
            RAISE EXCEPTION '현재 참여 중인 두 학급만 글짝 교환 활동에 넣을 수 있습니다.' USING ERRCODE = '42501';
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
$$;

CREATE OR REPLACE FUNCTION public.review_neighbor_activity_v1(
    p_space_id UUID,
    p_actor_class_id UUID,
    p_activity_id UUID,
    p_approve BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_activity public.neighbor_activities%ROWTYPE;
    v_approval public.neighbor_activity_approvals%ROWTYPE;
    v_next_status TEXT;
BEGIN
    PERFORM public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);
    SELECT activity.* INTO v_activity
    FROM public.neighbor_activities activity
    WHERE activity.id = p_activity_id AND activity.space_id = p_space_id
    FOR UPDATE;
    IF v_activity.id IS NULL OR v_activity.status <> 'pending_approval' THEN
        RAISE EXCEPTION '현재 교사 승인을 기다리는 활동이 아닙니다.' USING ERRCODE = '55000';
    END IF;

    SELECT approval.* INTO v_approval
    FROM public.neighbor_activity_approvals approval
    WHERE approval.activity_id = p_activity_id
      AND approval.class_id = p_actor_class_id
    FOR UPDATE;
    IF v_approval.activity_id IS NULL OR v_approval.status <> 'pending' THEN
        RAISE EXCEPTION '이 학급에서 확인할 활동 제안이 없습니다.' USING ERRCODE = '42501';
    END IF;

    IF p_approve THEN
        UPDATE public.neighbor_activity_approvals
        SET status = 'approved', decided_by = v_user_id, decided_at = NOW()
        WHERE activity_id = p_activity_id AND class_id = p_actor_class_id;

        IF NOT EXISTS (
            SELECT 1 FROM public.neighbor_activity_approvals approval
            WHERE approval.activity_id = p_activity_id AND approval.status = 'pending'
        ) THEN
            UPDATE public.neighbor_activities SET status = 'open'
            WHERE id = p_activity_id;
            IF v_activity.activity_type = 'topic' THEN
                UPDATE public.writing_missions mission
                SET is_archived = FALSE
                FROM public.neighbor_activity_classes link
                WHERE link.activity_id = p_activity_id AND mission.id = link.mission_id;
            END IF;
            v_next_status := 'open';
        ELSE
            v_next_status := 'pending_approval';
        END IF;
    ELSE
        UPDATE public.neighbor_activity_approvals
        SET status = 'rejected', decided_by = v_user_id, decided_at = NOW()
        WHERE activity_id = p_activity_id AND class_id = p_actor_class_id;
        UPDATE public.neighbor_activity_approvals
        SET status = 'cancelled'
        WHERE activity_id = p_activity_id AND status = 'pending';
        UPDATE public.neighbor_activities
        SET status = 'closed', closed_at = NOW()
        WHERE id = p_activity_id;
        v_next_status := 'closed';
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE, 'activity_id', p_activity_id,
        'approved', p_approve, 'status', v_next_status
    );
END;
$$;

-- 담임에게는 자기 학급의 최근 제출 글만 최대 100편 제공한다. 활동 과제 글은 섞지 않는다.
CREATE OR REPLACE FUNCTION public.get_neighbor_teacher_share_candidates_v1(
    p_space_id UUID,
    p_actor_class_id UUID,
    p_limit INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 100);
    v_items JSONB := '[]'::JSONB;
BEGIN
    PERFORM public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);
    SELECT COALESCE(jsonb_agg(row_data.item ORDER BY row_data.updated_at DESC, row_data.post_id DESC), '[]'::JSONB)
    INTO v_items
    FROM (
        SELECT post.id AS post_id, post.updated_at,
            jsonb_build_object(
                'post_id', post.id,
                'student_name', left(btrim(student.name), 30),
                'title', post.title,
                'excerpt', left(regexp_replace(COALESCE(post.content, ''), E'[\\s\\n\\r]+', ' ', 'g'), 180),
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
          AND post.is_submitted IS TRUE
          AND post.recalled_at IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM public.neighbor_activity_classes link WHERE link.mission_id = post.mission_id
          )
        ORDER BY post.updated_at DESC, post.id DESC
        LIMIT v_limit
    ) row_data;
    RETURN jsonb_build_object('version', 1, 'max_rows', 100, 'items', v_items);
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_neighbor_class_post_v1(
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
    v_shared public.neighbor_shared_posts%ROWTYPE;
BEGIN
    v_actor := public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);
    SELECT post.student_id, left(btrim(student.name), 30)
    INTO v_student_id, v_student_name
    FROM public.student_posts post
    JOIN public.students student
      ON student.id = post.student_id AND student.class_id = post.class_id
     AND student.is_active IS DISTINCT FROM FALSE AND student.deleted_at IS NULL
    WHERE post.id = p_post_id
      AND post.class_id = p_actor_class_id
      AND post.is_submitted IS TRUE
      AND post.recalled_at IS NULL
      AND NOT EXISTS (
          SELECT 1 FROM public.neighbor_activity_classes link WHERE link.mission_id = post.mission_id
      );
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION '글 나눔 공간에 올릴 수 있는 자기 학급 제출 글이 아닙니다.' USING ERRCODE = '42501';
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
        SET activity_id = NULL, public_author_name = v_student_name, status = 'published',
            requested_at = NOW(), reviewed_at = NOW(), reviewed_by = v_user_id,
            review_note = '', published_at = NOW(), hidden_at = NULL, hidden_by = NULL,
            hidden_by_class_id = NULL, hidden_reason = ''
        WHERE id = v_shared.id RETURNING * INTO v_shared;
    ELSE
        INSERT INTO public.neighbor_shared_posts (
            space_id, class_id, post_id, student_id, public_author_name, activity_id,
            status, reviewed_at, reviewed_by, published_at
        ) VALUES (
            p_space_id, p_actor_class_id, p_post_id, v_student_id, v_student_name, NULL,
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

-- 호스트가 두 학급 이름을 보며 매칭하되 브라우저에는 실제 student_id를 내보내지 않는다.
CREATE OR REPLACE FUNCTION public.get_neighbor_exchange_roster_v1(
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
    v_activity public.neighbor_activities%ROWTYPE;
    v_classes JSONB := '[]'::JSONB;
BEGIN
    PERFORM public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);
    IF NOT EXISTS (
        SELECT 1 FROM public.neighbor_spaces space
        WHERE space.id = p_space_id AND space.host_class_id = p_actor_class_id
    ) AND public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION '호스트 교사만 두 학급 학생을 불러올 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT activity.* INTO v_activity
    FROM public.neighbor_activities activity
    WHERE activity.id = p_activity_id AND activity.space_id = p_space_id
      AND activity.activity_type = 'exchange'
      AND activity.status IN ('open', 'matching_review', 'matched');
    IF v_activity.id IS NULL THEN
        RAISE EXCEPTION '학생을 불러올 수 있는 글짝 교환 활동이 아닙니다.' USING ERRCODE = '55000';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM public.neighbor_activity_classes link
        WHERE link.activity_id = p_activity_id
          AND (SELECT count(*) FROM public.students student
               WHERE student.class_id = link.class_id
                 AND student.auth_id IS NOT NULL
                 AND student.is_active IS DISTINCT FROM FALSE
                 AND student.deleted_at IS NULL) > 100
    ) THEN
        RAISE EXCEPTION '한 학급의 매칭 가능 학생은 최대 100명입니다.' USING ERRCODE = '54000';
    END IF;

    SELECT COALESCE(jsonb_agg(class_row.item ORDER BY class_row.is_host DESC, class_row.class_name, class_row.class_id), '[]'::JSONB)
    INTO v_classes
    FROM (
        SELECT link.class_id, membership.public_class_name AS class_name,
            membership.role = 'host' AS is_host,
            jsonb_build_object(
                'class_id', link.class_id,
                'class_name', membership.public_class_name,
                'is_host', membership.role = 'host',
                'students', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                        'student_key', encode(extensions.digest(
                            convert_to(p_activity_id::TEXT || ':' || student.id::TEXT, 'UTF8'), 'sha256'
                        ), 'hex'),
                        'name', left(btrim(student.name), 30)
                    ) ORDER BY student.name, student.id)
                    FROM public.students student
                    WHERE student.class_id = link.class_id
                      AND student.auth_id IS NOT NULL
                      AND student.is_active IS DISTINCT FROM FALSE
                      AND student.deleted_at IS NULL
                ), '[]'::JSONB)
            ) AS item
        FROM public.neighbor_activity_classes link
        JOIN public.neighbor_space_classes membership
          ON membership.space_id = link.space_id AND membership.class_id = link.class_id
         AND membership.status = 'active'
        WHERE link.activity_id = p_activity_id AND link.space_id = p_space_id
    ) class_row;

    RETURN jsonb_build_object(
        'version', 1,
        'activity_id', p_activity_id,
        'status', v_activity.status,
        'exchange_share_scope', v_activity.exchange_share_scope,
        'classes', v_classes,
        'max_students_per_class', 100,
        'max_partners_per_student', 2
    );
END;
$$;

DROP FUNCTION IF EXISTS public.match_neighbor_exchange_v1(UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION public.propose_neighbor_exchange_matches_v1(
    p_space_id UUID,
    p_actor_class_id UUID,
    p_activity_id UUID,
    p_pairs JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_activity public.neighbor_activities%ROWTYPE;
    v_host_class_id UUID;
    v_review_class_id UUID;
    v_class_ids UUID[];
    v_first_count INTEGER;
    v_second_count INTEGER;
    v_pair JSONB;
    v_left_id UUID;
    v_left_class_id UUID;
    v_right_id UUID;
    v_right_class_id UUID;
    v_pair_count INTEGER;
BEGIN
    PERFORM public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);
    SELECT space.host_class_id INTO v_host_class_id
    FROM public.neighbor_spaces space
    WHERE space.id = p_space_id AND space.status = 'active';
    IF v_host_class_id IS NULL
       OR (v_host_class_id <> p_actor_class_id AND public.auth_user_role() <> 'ADMIN') THEN
        RAISE EXCEPTION '호스트 교사만 글짝 매칭안을 만들 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT activity.* INTO v_activity
    FROM public.neighbor_activities activity
    WHERE activity.id = p_activity_id AND activity.space_id = p_space_id
      AND activity.activity_type = 'exchange'
    FOR UPDATE;
    IF v_activity.id IS NULL OR v_activity.status <> 'open' THEN
        RAISE EXCEPTION '지금 매칭안을 만들 수 있는 글짝 교환 활동이 아닙니다.' USING ERRCODE = '55000';
    END IF;

    SELECT array_agg(link.class_id ORDER BY link.class_id)
    INTO v_class_ids
    FROM public.neighbor_activity_classes link
    WHERE link.activity_id = p_activity_id AND link.space_id = p_space_id;
    IF cardinality(v_class_ids) <> 2 OR NOT (v_host_class_id = ANY(v_class_ids)) THEN
        RAISE EXCEPTION '글짝 교환 참여 학급 구성이 올바르지 않습니다.' USING ERRCODE = '55000';
    END IF;
    SELECT selected.class_id INTO v_review_class_id
    FROM unnest(v_class_ids) AS selected(class_id)
    WHERE selected.class_id <> v_host_class_id;

    SELECT count(*)::INTEGER INTO v_first_count
    FROM public.students student
    WHERE student.class_id = v_class_ids[1]
      AND student.auth_id IS NOT NULL
      AND student.is_active IS DISTINCT FROM FALSE
      AND student.deleted_at IS NULL;
    SELECT count(*)::INTEGER INTO v_second_count
    FROM public.students student
    WHERE student.class_id = v_class_ids[2]
      AND student.auth_id IS NOT NULL
      AND student.is_active IS DISTINCT FROM FALSE
      AND student.deleted_at IS NULL;
    IF v_first_count = 0 OR v_second_count = 0 THEN
        RAISE EXCEPTION '두 학급 모두 로그인 가능한 학생이 한 명 이상 있어야 합니다.' USING ERRCODE = '55000';
    END IF;
    IF v_first_count > 100 OR v_second_count > 100 THEN
        RAISE EXCEPTION '한 학급의 매칭 가능 학생은 최대 100명입니다.' USING ERRCODE = '54000';
    END IF;
    IF GREATEST(v_first_count, v_second_count) > LEAST(v_first_count, v_second_count) * 2 THEN
        RAISE EXCEPTION '현재 학생 수 차이로는 한 학생당 최대 두 명 규칙을 지킬 수 없습니다.' USING ERRCODE = '55000';
    END IF;
    IF jsonb_typeof(p_pairs) <> 'array'
       OR jsonb_array_length(p_pairs) <> GREATEST(v_first_count, v_second_count)
       OR jsonb_array_length(p_pairs) > 100 THEN
        RAISE EXCEPTION '모든 학생이 빠짐없이 연결되도록 매칭안을 확인해 주세요.' USING ERRCODE = '22023';
    END IF;

    DELETE FROM public.neighbor_exchange_matches WHERE activity_id = p_activity_id;
    FOR v_pair IN SELECT value FROM jsonb_array_elements(p_pairs) LOOP
        IF jsonb_typeof(v_pair) <> 'object'
           OR COALESCE(v_pair->>'student_key', '') !~ '^[a-f0-9]{64}$'
           OR COALESCE(v_pair->>'partner_key', '') !~ '^[a-f0-9]{64}$' THEN
            RAISE EXCEPTION '매칭 학생 식별값이 올바르지 않습니다.' USING ERRCODE = '22023';
        END IF;

        SELECT student.id, student.class_id INTO v_left_id, v_left_class_id
        FROM public.students student
        JOIN public.neighbor_activity_classes link
          ON link.activity_id = p_activity_id AND link.class_id = student.class_id
        WHERE student.auth_id IS NOT NULL
          AND student.is_active IS DISTINCT FROM FALSE
          AND student.deleted_at IS NULL
          AND encode(extensions.digest(
              convert_to(p_activity_id::TEXT || ':' || student.id::TEXT, 'UTF8'), 'sha256'
          ), 'hex') = v_pair->>'student_key';
        SELECT student.id, student.class_id INTO v_right_id, v_right_class_id
        FROM public.students student
        JOIN public.neighbor_activity_classes link
          ON link.activity_id = p_activity_id AND link.class_id = student.class_id
        WHERE student.auth_id IS NOT NULL
          AND student.is_active IS DISTINCT FROM FALSE
          AND student.deleted_at IS NULL
          AND encode(extensions.digest(
              convert_to(p_activity_id::TEXT || ':' || student.id::TEXT, 'UTF8'), 'sha256'
          ), 'hex') = v_pair->>'partner_key';

        IF v_left_id IS NULL OR v_right_id IS NULL OR v_left_class_id = v_right_class_id THEN
            RAISE EXCEPTION '서로 다른 참여 학급의 현재 학생끼리만 연결할 수 있습니다.' USING ERRCODE = '42501';
        END IF;
        IF EXISTS (
            SELECT 1 FROM public.neighbor_exchange_matches match
            WHERE match.activity_id = p_activity_id
              AND ((match.student_id = v_left_id AND match.partner_student_id = v_right_id)
                OR (match.student_id = v_right_id AND match.partner_student_id = v_left_id))
        ) THEN
            RAISE EXCEPTION '같은 글짝 연결을 두 번 넣을 수 없습니다.' USING ERRCODE = '22023';
        END IF;

        INSERT INTO public.neighbor_exchange_matches (
            activity_id, space_id, student_id, class_id, partner_student_id, partner_class_id
        ) VALUES
            (p_activity_id, p_space_id, v_left_id, v_left_class_id, v_right_id, v_right_class_id),
            (p_activity_id, p_space_id, v_right_id, v_right_class_id, v_left_id, v_left_class_id);
    END LOOP;

    IF EXISTS (
        SELECT 1
        FROM public.students student
        JOIN public.neighbor_activity_classes link
          ON link.activity_id = p_activity_id AND link.class_id = student.class_id
        LEFT JOIN LATERAL (
            SELECT count(*)::INTEGER AS partner_count
            FROM public.neighbor_exchange_matches match
            WHERE match.activity_id = p_activity_id AND match.student_id = student.id
        ) degree ON TRUE
        WHERE student.auth_id IS NOT NULL
          AND student.is_active IS DISTINCT FROM FALSE
          AND student.deleted_at IS NULL
          AND COALESCE(degree.partner_count, 0) NOT BETWEEN 1 AND 2
    ) THEN
        RAISE EXCEPTION '학생마다 한 명 또는 두 명의 글짝이 있어야 합니다.' USING ERRCODE = '22023';
    END IF;

    SELECT count(*)::INTEGER / 2 INTO v_pair_count
    FROM public.neighbor_exchange_matches match
    WHERE match.activity_id = p_activity_id;
    IF v_pair_count <> GREATEST(v_first_count, v_second_count) THEN
        RAISE EXCEPTION '학생 수에 맞는 글짝 연결 수를 확인해 주세요.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.neighbor_activities
    SET status = 'matching_review',
        match_proposed_by = v_user_id,
        match_proposed_at = NOW(),
        match_review_class_id = v_review_class_id,
        match_decided_by = NULL,
        match_decided_at = NULL,
        matched_at = NULL
    WHERE id = p_activity_id;

    INSERT INTO public.neighbor_space_events (
        space_id, class_id, actor_user_id, actor_role, event_type, target_type, target_id
    ) VALUES (
        p_space_id, p_actor_class_id, v_user_id, 'host',
        'exchange_match_proposed', 'activity', p_activity_id
    );
    RETURN jsonb_build_object(
        'success', TRUE, 'activity_id', p_activity_id,
        'status', 'matching_review', 'pair_count', v_pair_count,
        'review_class_id', v_review_class_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.review_neighbor_exchange_matches_v1(
    p_space_id UUID,
    p_actor_class_id UUID,
    p_activity_id UUID,
    p_approve BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_actor TEXT;
    v_activity public.neighbor_activities%ROWTYPE;
    v_next_status TEXT;
BEGIN
    v_actor := public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);
    SELECT activity.* INTO v_activity
    FROM public.neighbor_activities activity
    WHERE activity.id = p_activity_id AND activity.space_id = p_space_id
      AND activity.activity_type = 'exchange'
    FOR UPDATE;
    IF v_activity.id IS NULL OR v_activity.status <> 'matching_review'
       OR v_activity.match_review_class_id <> p_actor_class_id THEN
        RAISE EXCEPTION '이 학급에서 확인할 글짝 매칭안이 없습니다.' USING ERRCODE = '42501';
    END IF;

    IF p_approve THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.neighbor_exchange_matches match
            WHERE match.activity_id = p_activity_id
        ) THEN
            RAISE EXCEPTION '승인할 글짝 연결이 없습니다.' USING ERRCODE = '55000';
        END IF;
        IF EXISTS (
            SELECT 1
            FROM public.neighbor_exchange_matches match
            JOIN public.students student
              ON student.id = match.student_id AND student.class_id = match.class_id
            WHERE match.activity_id = p_activity_id
              AND (student.auth_id IS NULL
                OR student.is_active IS FALSE
                OR student.deleted_at IS NOT NULL)
        ) OR EXISTS (
            SELECT 1
            FROM public.students student
            JOIN public.neighbor_activity_classes link
              ON link.activity_id = p_activity_id AND link.class_id = student.class_id
            LEFT JOIN LATERAL (
                SELECT count(*)::INTEGER AS partner_count
                FROM public.neighbor_exchange_matches match
                WHERE match.activity_id = p_activity_id AND match.student_id = student.id
            ) degree ON TRUE
            WHERE student.auth_id IS NOT NULL
              AND student.is_active IS DISTINCT FROM FALSE
              AND student.deleted_at IS NULL
              AND COALESCE(degree.partner_count, 0) NOT BETWEEN 1 AND 2
        ) THEN
            RAISE EXCEPTION '학생 명단이 바뀌었습니다. 호스트 교사에게 새 매칭안을 요청해 주세요.' USING ERRCODE = '55000';
        END IF;
        UPDATE public.neighbor_activities
        SET status = 'matched', matched_at = NOW(),
            match_decided_by = v_user_id, match_decided_at = NOW()
        WHERE id = p_activity_id;
        UPDATE public.writing_missions mission
        SET is_archived = FALSE
        FROM public.neighbor_activity_classes link
        WHERE link.activity_id = p_activity_id AND mission.id = link.mission_id;
        v_next_status := 'matched';
    ELSE
        DELETE FROM public.neighbor_exchange_matches WHERE activity_id = p_activity_id;
        UPDATE public.neighbor_activities
        SET status = 'open', match_proposed_by = NULL, match_proposed_at = NULL,
            match_review_class_id = NULL, match_decided_by = NULL, match_decided_at = NULL,
            matched_at = NULL
        WHERE id = p_activity_id;
        v_next_status := 'open';
    END IF;

    INSERT INTO public.neighbor_space_events (
        space_id, class_id, actor_user_id, actor_role, event_type, target_type, target_id
    ) VALUES (
        p_space_id, p_actor_class_id, v_user_id, v_actor,
        CASE WHEN p_approve THEN 'exchange_match_approved' ELSE 'exchange_match_rejected' END,
        'activity', p_activity_id
    );
    RETURN jsonb_build_object(
        'success', TRUE, 'activity_id', p_activity_id,
        'approved', p_approve, 'status', v_next_status
    );
END;
$$;

-- 함께 쓰는 주제와 승인된 글짝 활동 모두 학생이 제출 뒤 담임 검토를 요청한다.
CREATE OR REPLACE FUNCTION public.request_neighbor_activity_post_v1(
    p_space_id UUID,
    p_activity_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_student_id UUID;
    v_class_id UUID;
    v_post_id UUID;
    v_student_name TEXT;
    v_activity_type TEXT;
    v_shared public.neighbor_shared_posts%ROWTYPE;
BEGIN
    SELECT access.student_id, access.class_id INTO v_student_id, v_class_id
    FROM public.assert_neighbor_student_access_v1(p_space_id) access;

    SELECT post.id, left(btrim(student.name), 30), activity.activity_type
    INTO v_post_id, v_student_name, v_activity_type
    FROM public.neighbor_activities activity
    JOIN public.neighbor_activity_classes link
      ON link.activity_id = activity.id AND link.class_id = v_class_id
    JOIN public.student_posts post
      ON post.mission_id = link.mission_id
     AND post.class_id = link.class_id
     AND post.student_id = v_student_id
     AND post.is_submitted IS TRUE
     AND post.recalled_at IS NULL
    JOIN public.students student ON student.id = post.student_id AND student.class_id = post.class_id
    WHERE activity.id = p_activity_id
      AND activity.space_id = p_space_id
      AND (
          (activity.activity_type = 'topic' AND activity.status = 'open')
          OR (activity.activity_type = 'exchange' AND activity.status = 'matched'
              AND EXISTS (
                  SELECT 1 FROM public.neighbor_exchange_matches match
                  WHERE match.activity_id = activity.id AND match.student_id = v_student_id
              ))
      );
    IF v_post_id IS NULL THEN
        RAISE EXCEPTION '공개 가능한 활동 글을 먼저 제출해 주세요.' USING ERRCODE = '55000';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.neighbor_shared_posts shared
        WHERE shared.space_id = p_space_id AND shared.post_id = v_post_id AND shared.status = 'hidden'
    ) THEN
        RAISE EXCEPTION '숨김 처리된 글은 교사 확인 전 다시 신청할 수 없습니다.' USING ERRCODE = '55000';
    END IF;

    INSERT INTO public.neighbor_shared_posts (
        space_id, class_id, post_id, student_id, public_author_name, activity_id
    ) VALUES (
        p_space_id, v_class_id, v_post_id, v_student_id, v_student_name, p_activity_id
    )
    ON CONFLICT (space_id, post_id) DO UPDATE
    SET activity_id = EXCLUDED.activity_id,
        public_author_name = EXCLUDED.public_author_name,
        status = CASE WHEN neighbor_shared_posts.status IN ('pending', 'published')
            THEN neighbor_shared_posts.status ELSE 'pending' END,
        requested_at = CASE WHEN neighbor_shared_posts.status IN ('pending', 'published')
            THEN neighbor_shared_posts.requested_at ELSE NOW() END,
        reviewed_at = CASE WHEN neighbor_shared_posts.status = 'published'
            THEN neighbor_shared_posts.reviewed_at ELSE NULL END,
        reviewed_by = CASE WHEN neighbor_shared_posts.status = 'published'
            THEN neighbor_shared_posts.reviewed_by ELSE NULL END,
        review_note = CASE WHEN neighbor_shared_posts.status = 'published'
            THEN neighbor_shared_posts.review_note ELSE '' END,
        published_at = CASE WHEN neighbor_shared_posts.status = 'published'
            THEN neighbor_shared_posts.published_at ELSE NULL END,
        hidden_at = NULL, hidden_by = NULL, hidden_by_class_id = NULL, hidden_reason = ''
    RETURNING * INTO v_shared;

    INSERT INTO public.neighbor_space_events (
        space_id, class_id, actor_user_id, actor_role, event_type, target_type, target_id
    ) VALUES (
        p_space_id, v_class_id, v_user_id, 'student', 'post_requested', 'post', v_shared.id
    );
    RETURN jsonb_build_object(
        'success', TRUE, 'activity_id', p_activity_id,
        'activity_type', v_activity_type,
        'shared_post_id', v_shared.id, 'status', v_shared.status
    );
END;
$$;

-- 교사 화면은 활동 승인·매칭 승인과 공개 범위를 한 응답에서 본다.
CREATE OR REPLACE FUNCTION public.get_neighbor_teacher_activities_v1(
    p_space_id UUID,
    p_actor_class_id UUID
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(jsonb_agg(
        base.item || jsonb_build_object(
            'exchange_share_scope', activity.exchange_share_scope,
            'match_review_class_id', activity.match_review_class_id,
            'match_proposed_at', activity.match_proposed_at,
            'approvals', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'class_id', approval.class_id,
                    'class_name', membership.public_class_name,
                    'status', approval.status,
                    'is_proposer', approval.is_proposer,
                    'decided_at', approval.decided_at
                ) ORDER BY approval.is_proposer DESC, membership.public_class_name, approval.class_id)
                FROM public.neighbor_activity_approvals approval
                JOIN public.neighbor_space_classes membership
                  ON membership.space_id = approval.space_id
                 AND membership.class_id = approval.class_id
                WHERE approval.activity_id = activity.id
            ), '[]'::JSONB),
            'my_approval_status', (
                SELECT approval.status
                FROM public.neighbor_activity_approvals approval
                WHERE approval.activity_id = activity.id
                  AND approval.class_id = p_actor_class_id
            ),
            'can_review', EXISTS (
                SELECT 1 FROM public.neighbor_activity_approvals approval
                WHERE approval.activity_id = activity.id
                  AND approval.class_id = p_actor_class_id
                  AND approval.status = 'pending'
            ),
            'can_manage', EXISTS (
                SELECT 1 FROM public.neighbor_space_classes membership
                WHERE membership.space_id = p_space_id
                  AND membership.class_id = p_actor_class_id
                  AND membership.role = 'host'
            ),
            'can_propose_match', activity.activity_type = 'exchange'
                AND activity.status = 'open'
                AND EXISTS (
                    SELECT 1 FROM public.neighbor_space_classes membership
                    WHERE membership.space_id = p_space_id
                      AND membership.class_id = p_actor_class_id
                      AND membership.role = 'host'
                ),
            'can_review_match', activity.activity_type = 'exchange'
                AND activity.status = 'matching_review'
                AND activity.match_review_class_id = p_actor_class_id,
            'match_pairs', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'student_name', left(btrim(student.name), 30),
                    'student_class_name', student_membership.public_class_name,
                    'partner_name', left(btrim(partner.name), 30),
                    'partner_class_name', partner_membership.public_class_name
                ) ORDER BY student_membership.public_class_name, student.name,
                    partner_membership.public_class_name, partner.name)
                FROM public.neighbor_exchange_matches match
                JOIN public.students student
                  ON student.id = match.student_id AND student.class_id = match.class_id
                JOIN public.students partner
                  ON partner.id = match.partner_student_id AND partner.class_id = match.partner_class_id
                JOIN public.neighbor_space_classes student_membership
                  ON student_membership.space_id = match.space_id
                 AND student_membership.class_id = match.class_id
                JOIN public.neighbor_space_classes partner_membership
                  ON partner_membership.space_id = match.space_id
                 AND partner_membership.class_id = match.partner_class_id
                WHERE match.activity_id = activity.id
                  AND match.student_id < match.partner_student_id
                  AND EXISTS (
                      SELECT 1 FROM public.neighbor_activity_classes viewer_link
                      WHERE viewer_link.activity_id = activity.id
                        AND viewer_link.class_id = p_actor_class_id
                  )
            ), '[]'::JSONB)
        )
        ORDER BY base.ordinality
    ), '[]'::JSONB)
    FROM jsonb_array_elements(
        public.get_neighbor_teacher_activities_core_20261238(p_space_id, p_actor_class_id)
    ) WITH ORDINALITY AS base(item, ordinality)
    JOIN public.neighbor_activities activity
      ON activity.id = (base.item->>'id')::UUID AND activity.space_id = p_space_id;
$$;

-- 글짝 매칭 승인이 끝난 학생만 활동을 받고, 공개 범위에 맞는 글 수를 본다.
CREATE OR REPLACE FUNCTION public.get_neighbor_student_activities_v1(
    p_space_id UUID,
    p_student_id UUID,
    p_class_id UUID
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(jsonb_agg(
        base.item || jsonb_build_object(
            'exchange_share_scope', activity.exchange_share_scope,
            'published_count', (
                SELECT count(*)::INTEGER
                FROM public.neighbor_shared_posts published
                WHERE published.activity_id = activity.id
                  AND published.status = 'published'
                  AND (
                      activity.activity_type = 'topic'
                      OR activity.exchange_share_scope = 'space'
                      OR published.student_id = p_student_id
                      OR EXISTS (
                          SELECT 1 FROM public.neighbor_exchange_matches match
                          WHERE match.activity_id = activity.id
                            AND match.student_id = p_student_id
                            AND match.partner_student_id = published.student_id
                      )
                  )
            )
        ) ORDER BY base.ordinality
    ), '[]'::JSONB)
    FROM jsonb_array_elements(
        public.get_neighbor_student_activities_core_20261238(p_space_id, p_student_id, p_class_id)
    ) WITH ORDINALITY AS base(item, ordinality)
    JOIN public.neighbor_activities activity
      ON activity.id = (base.item->>'id')::UUID AND activity.space_id = p_space_id
    WHERE NOT EXISTS (
        SELECT 1 FROM public.neighbor_activity_approvals approval
        WHERE approval.activity_id = activity.id AND approval.status <> 'approved'
    )
      AND (
          activity.activity_type <> 'exchange'
          OR (
              activity.status IN ('matched', 'closed')
              AND activity.matched_at IS NOT NULL
              AND EXISTS (
                  SELECT 1 FROM public.neighbor_exchange_matches match
                  WHERE match.activity_id = activity.id AND match.student_id = p_student_id
              )
          )
      );
$$;

CREATE OR REPLACE FUNCTION public.assert_neighbor_student_post_access_v1(
    p_space_id UUID,
    p_shared_post_id UUID
)
RETURNS TABLE(requester_student_id UUID, requester_class_id UUID, owner_student_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID;
    v_class_id UUID;
    v_shared public.neighbor_shared_posts%ROWTYPE;
    v_activity_type TEXT;
    v_share_scope TEXT;
BEGIN
    SELECT access.student_id, access.class_id INTO v_student_id, v_class_id
    FROM public.assert_neighbor_student_access_v1(p_space_id) access;

    SELECT shared.* INTO v_shared
    FROM public.neighbor_shared_posts shared
    JOIN public.student_posts post
      ON post.id = shared.post_id
     AND post.class_id = shared.class_id
     AND post.student_id = shared.student_id
     AND post.is_submitted IS TRUE
     AND post.recalled_at IS NULL
    WHERE shared.id = p_shared_post_id
      AND shared.space_id = p_space_id
      AND shared.status = 'published';
    IF v_shared.id IS NULL THEN
        RAISE EXCEPTION '현재 공개 중인 이웃 글이 아닙니다.' USING ERRCODE = '42501';
    END IF;

    SELECT activity.activity_type, activity.exchange_share_scope
    INTO v_activity_type, v_share_scope
    FROM public.neighbor_activities activity
    WHERE activity.id = v_shared.activity_id AND activity.space_id = p_space_id;

    IF v_shared.activity_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.neighbor_activity_classes link
        WHERE link.activity_id = v_shared.activity_id AND link.class_id = v_class_id
    ) THEN
        RAISE EXCEPTION '이 활동에 참여한 학급의 글이 아닙니다.' USING ERRCODE = '42501';
    ELSIF v_shared.activity_id IS NOT NULL AND v_activity_type = 'exchange'
      AND (
          NOT EXISTS (
              SELECT 1 FROM public.neighbor_activities activity
              WHERE activity.id = v_shared.activity_id
                AND activity.status IN ('matched', 'closed')
                AND activity.matched_at IS NOT NULL
          )
          OR (
              v_share_scope <> 'space'
              AND v_shared.student_id <> v_student_id
              AND NOT EXISTS (
                  SELECT 1 FROM public.neighbor_exchange_matches match
                  WHERE match.activity_id = v_shared.activity_id
                    AND match.student_id = v_student_id
                    AND match.partner_student_id = v_shared.student_id
              )
          )
      ) THEN
        RAISE EXCEPTION '승인된 글짝 활동에서 볼 수 있는 글이 아닙니다.' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY SELECT v_student_id, v_class_id, v_shared.student_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_neighbor_activity_feed_v1(
    p_space_id UUID,
    p_activity_id UUID,
    p_limit INTEGER DEFAULT 20,
    p_cursor_at TIMESTAMPTZ DEFAULT NULL,
    p_cursor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID;
    v_class_id UUID;
    v_activity public.neighbor_activities%ROWTYPE;
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
    v_items JSONB := '[]'::JSONB;
    v_has_more BOOLEAN := FALSE;
    v_next_at TIMESTAMPTZ;
    v_next_id UUID;
BEGIN
    IF (p_cursor_at IS NULL) IS DISTINCT FROM (p_cursor_id IS NULL) THEN
        RAISE EXCEPTION '페이지 커서는 시각과 글 ID를 함께 보내야 합니다.' USING ERRCODE = '22023';
    END IF;
    SELECT access.student_id, access.class_id INTO v_student_id, v_class_id
    FROM public.assert_neighbor_student_access_v1(p_space_id) access;
    SELECT activity.* INTO v_activity
    FROM public.neighbor_activities activity
    JOIN public.neighbor_activity_classes link
      ON link.activity_id = activity.id AND link.class_id = v_class_id
    WHERE activity.id = p_activity_id AND activity.space_id = p_space_id;
    IF v_activity.id IS NULL THEN
        RAISE EXCEPTION '참여 중인 이웃 활동이 아닙니다.' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.neighbor_activity_approvals approval
        WHERE approval.activity_id = p_activity_id AND approval.status <> 'approved'
    ) THEN
        RAISE EXCEPTION '교사 승인이 끝난 뒤 학생에게 공개됩니다.' USING ERRCODE = '42501';
    END IF;
    IF v_activity.activity_type = 'exchange'
       AND (v_activity.status NOT IN ('matched', 'closed')
         OR v_activity.matched_at IS NULL
         OR NOT EXISTS (
           SELECT 1 FROM public.neighbor_exchange_matches match
           WHERE match.activity_id = p_activity_id AND match.student_id = v_student_id
       )) THEN
        RAISE EXCEPTION '글짝 매칭 승인이 끝난 뒤 학생에게 공개됩니다.' USING ERRCODE = '42501';
    END IF;

    WITH candidates AS MATERIALIZED (
        SELECT shared.id, shared.published_at, shared.public_author_name,
            membership.public_class_name, post.title,
            left(regexp_replace(COALESCE(post.content, ''), E'[\\s\\n\\r]+', ' ', 'g'), 180) AS excerpt,
            post.writing_context, post.self_writing_type,
            shared.student_id = v_student_id AS is_mine,
            (SELECT count(*)::INTEGER FROM public.neighbor_comments comment
                WHERE comment.shared_post_id = shared.id AND comment.status = 'visible') AS comment_count,
            (SELECT count(*)::INTEGER FROM public.neighbor_reactions reaction
                WHERE reaction.shared_post_id = shared.id) AS reaction_count,
            EXISTS (SELECT 1 FROM public.neighbor_reactions mine
                WHERE mine.shared_post_id = shared.id AND mine.student_id = v_student_id) AS my_reaction,
            EXISTS (SELECT 1 FROM public.neighbor_saves saved
                WHERE saved.shared_post_id = shared.id AND saved.student_id = v_student_id) AS my_saved
        FROM public.neighbor_shared_posts shared
        JOIN public.neighbor_space_classes membership
          ON membership.space_id = shared.space_id AND membership.class_id = shared.class_id
         AND membership.status = 'active'
        JOIN public.student_posts post
          ON post.id = shared.post_id AND post.class_id = shared.class_id
         AND post.student_id = shared.student_id AND post.is_submitted IS TRUE
         AND post.recalled_at IS NULL
        WHERE shared.space_id = p_space_id
          AND shared.activity_id = p_activity_id
          AND shared.status = 'published'
          AND (
              v_activity.activity_type = 'topic'
              OR v_activity.exchange_share_scope = 'space'
              OR shared.student_id = v_student_id
              OR EXISTS (
                  SELECT 1 FROM public.neighbor_exchange_matches match
                  WHERE match.activity_id = p_activity_id
                    AND match.student_id = v_student_id
                    AND match.partner_student_id = shared.student_id
              )
          )
          AND (p_cursor_at IS NULL OR (shared.published_at, shared.id) < (p_cursor_at, p_cursor_id))
        ORDER BY shared.published_at DESC, shared.id DESC
        LIMIT v_limit + 1
    ), page AS (
        SELECT * FROM candidates ORDER BY published_at DESC, id DESC LIMIT v_limit
    ), serialized AS (
        SELECT page.published_at, page.id, jsonb_build_object(
            'shared_post_id', page.id, 'activity_id', p_activity_id,
            'title', page.title, 'excerpt', page.excerpt,
            'author_name', page.public_author_name, 'class_name', page.public_class_name,
            'published_at', page.published_at, 'writing_context', page.writing_context,
            'self_writing_type', page.self_writing_type, 'is_mine', page.is_mine,
            'comment_count', page.comment_count, 'reaction_count', page.reaction_count,
            'my_reaction', page.my_reaction, 'my_saved', page.my_saved
        ) AS item FROM page
    )
    SELECT COALESCE(jsonb_agg(serialized.item ORDER BY serialized.published_at DESC, serialized.id DESC), '[]'::JSONB),
        (SELECT count(*) > v_limit FROM candidates),
        (SELECT page.published_at FROM page ORDER BY page.published_at, page.id LIMIT 1),
        (SELECT page.id FROM page ORDER BY page.published_at, page.id LIMIT 1)
    INTO v_items, v_has_more, v_next_at, v_next_id FROM serialized;

    RETURN jsonb_build_object(
        'version', 1,
        'activity', jsonb_build_object(
            'id', v_activity.id, 'type', v_activity.activity_type,
            'title', v_activity.title, 'prompt', v_activity.prompt,
            'status', v_activity.status, 'exchange_share_scope', v_activity.exchange_share_scope
        ),
        'items', v_items, 'has_more', COALESCE(v_has_more, FALSE),
        'next_cursor_at', CASE WHEN v_has_more THEN v_next_at ELSE NULL END,
        'next_cursor_id', CASE WHEN v_has_more THEN v_next_id ELSE NULL END,
        'max_rows', 50
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.run_neighbor_teacher_action_v1(
    p_class_id UUID,
    p_action TEXT,
    p_payload JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
    v_space_id UUID := NULLIF(p_payload->>'space_id', '')::UUID;
BEGIN
    PERFORM public.assert_neighbor_teacher_class_v1(p_class_id);
    IF p_action = 'create_activity' THEN
        v_result := public.create_neighbor_activity_v1(
            v_space_id, p_class_id, p_payload->>'type', p_payload->>'title', p_payload->>'prompt',
            CASE WHEN jsonb_typeof(p_payload->'exchange_class_ids') = 'array' THEN
                ARRAY(SELECT jsonb_array_elements_text(p_payload->'exchange_class_ids')::UUID)
            ELSE NULL END,
            CASE WHEN p_payload->>'type' = 'exchange'
                THEN COALESCE(NULLIF(p_payload->>'exchange_share_scope', ''), 'partners')
                ELSE NULL END
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
    ELSIF p_action = 'propose_exchange_matches' THEN
        v_result := public.propose_neighbor_exchange_matches_v1(
            v_space_id, p_class_id, NULLIF(p_payload->>'activity_id', '')::UUID,
            COALESCE(p_payload->'pairs', '[]'::JSONB)
        );
    ELSIF p_action = 'review_exchange_matches' THEN
        v_result := public.review_neighbor_exchange_matches_v1(
            v_space_id, p_class_id, NULLIF(p_payload->>'activity_id', '')::UUID,
            COALESCE((p_payload->>'approve')::BOOLEAN, FALSE)
        );
    ELSIF p_action = 'match_exchange' THEN
        RAISE EXCEPTION '학생별 매칭안을 만든 뒤 상대 교사의 승인을 받아 주세요.' USING ERRCODE = '55000';
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

REVOKE ALL ON FUNCTION public.create_neighbor_activity_v1(UUID, UUID, TEXT, TEXT, TEXT, UUID[], TEXT)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.review_neighbor_activity_v1(UUID, UUID, UUID, BOOLEAN)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_neighbor_teacher_share_candidates_v1(UUID, UUID, INTEGER)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.publish_neighbor_class_post_v1(UUID, UUID, UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_neighbor_exchange_roster_v1(UUID, UUID, UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.propose_neighbor_exchange_matches_v1(UUID, UUID, UUID, JSONB)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.review_neighbor_exchange_matches_v1(UUID, UUID, UUID, BOOLEAN)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_neighbor_teacher_activities_v1(UUID, UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_neighbor_student_activities_v1(UUID, UUID, UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assert_neighbor_student_post_access_v1(UUID, UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_neighbor_activity_feed_v1(UUID, UUID, INTEGER, TIMESTAMPTZ, UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.request_neighbor_activity_post_v1(UUID, UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.run_neighbor_teacher_action_v1(UUID, TEXT, JSONB)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_neighbor_teacher_share_candidates_v1(UUID, UUID, INTEGER)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_neighbor_exchange_roster_v1(UUID, UUID, UUID)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_neighbor_activity_feed_v1(UUID, UUID, INTEGER, TIMESTAMPTZ, UUID)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_neighbor_activity_post_v1(UUID, UUID)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_neighbor_teacher_action_v1(UUID, TEXT, JSONB)
TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
