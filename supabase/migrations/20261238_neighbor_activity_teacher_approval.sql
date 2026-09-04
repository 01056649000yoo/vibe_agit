BEGIN;

-- 공동 활동은 한 학급 교사가 제안하고, 참여하는 다른 모든 학급 교사가 승인한 뒤에만
-- 학생 과제로 공개한다. 이미 열린 활동은 승인 완료 상태로 보정한다.
ALTER TABLE public.neighbor_activities
    DROP CONSTRAINT IF EXISTS neighbor_activities_status_check;
ALTER TABLE public.neighbor_activities
    ADD CONSTRAINT neighbor_activities_status_check
    CHECK (status IN ('pending_approval', 'open', 'matched', 'closed'));

ALTER TABLE public.neighbor_activities
    DROP CONSTRAINT IF EXISTS neighbor_activities_check1;
ALTER TABLE public.neighbor_activities
    ADD CONSTRAINT neighbor_activities_check1 CHECK (
        (status = 'pending_approval' AND matched_at IS NULL AND closed_at IS NULL)
        OR (status = 'open' AND matched_at IS NULL AND closed_at IS NULL)
        OR (status = 'matched' AND matched_at IS NOT NULL AND closed_at IS NULL)
        OR (status = 'closed' AND closed_at IS NOT NULL)
    );

DROP INDEX IF EXISTS public.idx_neighbor_activities_one_live_type;
CREATE UNIQUE INDEX idx_neighbor_activities_one_live_type
    ON public.neighbor_activities (space_id, activity_type)
    WHERE status IN ('pending_approval', 'open', 'matched');

CREATE TABLE IF NOT EXISTS public.neighbor_activity_approvals (
    activity_id UUID NOT NULL,
    space_id UUID NOT NULL,
    class_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    is_proposer BOOLEAN NOT NULL DEFAULT FALSE,
    decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (activity_id, class_id),
    CONSTRAINT neighbor_activity_approvals_activity_class_fkey
        FOREIGN KEY (activity_id, class_id)
        REFERENCES public.neighbor_activity_classes(activity_id, class_id) ON DELETE CASCADE,
    CONSTRAINT neighbor_activity_approvals_membership_fkey
        FOREIGN KEY (space_id, class_id)
        REFERENCES public.neighbor_space_classes(space_id, class_id) ON DELETE CASCADE,
    CHECK ((status = 'pending' OR status = 'cancelled') = (decided_at IS NULL AND decided_by IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_neighbor_activity_approvals_one_proposer
    ON public.neighbor_activity_approvals (activity_id)
    WHERE is_proposer;
CREATE INDEX IF NOT EXISTS idx_neighbor_activity_approvals_class_pending
    ON public.neighbor_activity_approvals (class_id, created_at DESC, activity_id)
    WHERE status = 'pending';

ALTER TABLE public.neighbor_activity_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.neighbor_activity_approvals FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO public.neighbor_activity_approvals (
    activity_id, space_id, class_id, status, decided_by, decided_at
)
SELECT link.activity_id, link.space_id, link.class_id, 'approved', activity.created_by, activity.created_at
FROM public.neighbor_activity_classes link
JOIN public.neighbor_activities activity ON activity.id = link.activity_id
ON CONFLICT (activity_id, class_id) DO NOTHING;

UPDATE public.neighbor_activity_approvals approval
SET is_proposer = TRUE
FROM (
    SELECT activity.id AS activity_id,
        COALESCE(
            (
                SELECT link.class_id
                FROM public.neighbor_activity_classes link
                JOIN public.classes class ON class.id = link.class_id
                WHERE link.activity_id = activity.id AND class.teacher_id = activity.created_by
                ORDER BY link.class_id
                LIMIT 1
            ),
            (
                SELECT link.class_id
                FROM public.neighbor_activity_classes link
                WHERE link.activity_id = activity.id
                ORDER BY link.class_id
                LIMIT 1
            )
        ) AS class_id
    FROM public.neighbor_activities activity
) source
WHERE approval.activity_id = source.activity_id
  AND approval.class_id = source.class_id
  AND NOT EXISTS (
      SELECT 1 FROM public.neighbor_activity_approvals existing
      WHERE existing.activity_id = approval.activity_id AND existing.is_proposer
  );

CREATE OR REPLACE FUNCTION public.create_neighbor_activity_v1(
    p_space_id UUID,
    p_actor_class_id UUID,
    p_activity_type TEXT,
    p_title TEXT,
    p_prompt TEXT,
    p_exchange_class_ids UUID[] DEFAULT NULL
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
        IF cardinality(p_exchange_class_ids) <> 2
           OR p_exchange_class_ids[1] = p_exchange_class_ids[2]
           OR NOT (p_actor_class_id = ANY(p_exchange_class_ids)) THEN
            RAISE EXCEPTION '글짝 교환은 우리 학급을 포함한 서로 다른 두 학급을 골라야 합니다.' USING ERRCODE = '22023';
        END IF;
        SELECT array_agg(membership.class_id ORDER BY membership.class_id)
        INTO v_class_ids
        FROM public.neighbor_space_classes membership
        WHERE membership.space_id = p_space_id
          AND membership.status = 'active'
          AND membership.class_id = ANY(p_exchange_class_ids);
        IF cardinality(v_class_ids) <> 2 THEN
            RAISE EXCEPTION '현재 참여 중인 두 학급만 글짝 교환에 넣을 수 있습니다.' USING ERRCODE = '42501';
        END IF;
    ELSE
        SELECT array_agg(membership.class_id ORDER BY membership.class_id)
        INTO v_class_ids
        FROM public.neighbor_space_classes membership
        WHERE membership.space_id = p_space_id AND membership.status = 'active';
        IF COALESCE(cardinality(v_class_ids), 0) < 2 THEN
            RAISE EXCEPTION '두 학급 이상 참여한 뒤 공동 주제를 제안할 수 있습니다.' USING ERRCODE = '55000';
        END IF;
    END IF;

    INSERT INTO public.neighbor_activities (
        space_id, activity_type, title, prompt, status, created_by
    ) VALUES (
        p_space_id, p_activity_type, btrim(p_title), btrim(p_prompt), 'pending_approval', v_user_id
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
            jsonb_build_array('이웃 아지트', CASE WHEN p_activity_type = 'topic' THEN '같이 쓰는 주제' ELSE '글짝 교환' END),
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
            UPDATE public.writing_missions mission
            SET is_archived = FALSE
            FROM public.neighbor_activity_classes link
            WHERE link.activity_id = p_activity_id AND mission.id = link.mission_id;
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

-- 교사용 기존 집계에 학급별 승인 상태와 현재 교사가 할 수 있는 동작을 더한다.
DO $$
BEGIN
    IF to_regprocedure('public.get_neighbor_teacher_activities_core_20261238(uuid,uuid)') IS NULL THEN
        ALTER FUNCTION public.get_neighbor_teacher_activities_v1(UUID, UUID)
            RENAME TO get_neighbor_teacher_activities_core_20261238;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_neighbor_teacher_activities_core_20261238(UUID, UUID)
FROM PUBLIC, anon, authenticated, service_role;

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
                WHERE approval.activity_id = (base.item->>'id')::UUID
            ), '[]'::JSONB),
            'my_approval_status', (
                SELECT approval.status
                FROM public.neighbor_activity_approvals approval
                WHERE approval.activity_id = (base.item->>'id')::UUID
                  AND approval.class_id = p_actor_class_id
            ),
            'can_review', EXISTS (
                SELECT 1 FROM public.neighbor_activity_approvals approval
                WHERE approval.activity_id = (base.item->>'id')::UUID
                  AND approval.class_id = p_actor_class_id
                  AND approval.status = 'pending'
            ),
            'can_manage', EXISTS (
                SELECT 1
                FROM public.neighbor_space_classes membership
                WHERE membership.space_id = p_space_id
                  AND membership.class_id = p_actor_class_id
                  AND membership.role = 'host'
            )
        )
        ORDER BY base.ordinality
    ), '[]'::JSONB)
    FROM jsonb_array_elements(
        public.get_neighbor_teacher_activities_core_20261238(p_space_id, p_actor_class_id)
    ) WITH ORDINALITY AS base(item, ordinality);
$$;

-- 학생은 모든 참여 교사의 승인이 끝난 활동만 받는다.
DO $$
BEGIN
    IF to_regprocedure('public.get_neighbor_student_activities_core_20261238(uuid,uuid,uuid)') IS NULL THEN
        ALTER FUNCTION public.get_neighbor_student_activities_v1(UUID, UUID, UUID)
            RENAME TO get_neighbor_student_activities_core_20261238;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_neighbor_student_activities_core_20261238(UUID, UUID, UUID)
FROM PUBLIC, anon, authenticated, service_role;

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
    SELECT COALESCE(jsonb_agg(base.item ORDER BY base.ordinality), '[]'::JSONB)
    FROM jsonb_array_elements(
        public.get_neighbor_student_activities_core_20261238(p_space_id, p_student_id, p_class_id)
    ) WITH ORDINALITY AS base(item, ordinality)
    WHERE NOT EXISTS (
        SELECT 1 FROM public.neighbor_activity_approvals approval
        WHERE approval.activity_id = (base.item->>'id')::UUID
          AND approval.status <> 'approved'
    );
$$;

-- 활동 ID를 추측해 직접 호출해도 승인 대기 중에는 학생 피드를 열 수 없다.
DO $$
BEGIN
    IF to_regprocedure('public.get_neighbor_activity_feed_core_20261238(uuid,uuid,integer,timestamp with time zone,uuid)') IS NULL THEN
        ALTER FUNCTION public.get_neighbor_activity_feed_v1(UUID, UUID, INTEGER, TIMESTAMPTZ, UUID)
            RENAME TO get_neighbor_activity_feed_core_20261238;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_neighbor_activity_feed_core_20261238(UUID, UUID, INTEGER, TIMESTAMPTZ, UUID)
FROM PUBLIC, anon, authenticated, service_role;

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
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.neighbor_activities activity
        JOIN public.neighbor_activity_approvals approval ON approval.activity_id = activity.id
        WHERE activity.id = p_activity_id
          AND activity.space_id = p_space_id
          AND approval.status <> 'approved'
    ) THEN
        RAISE EXCEPTION '교사 승인이 끝난 뒤 학생에게 공개됩니다.' USING ERRCODE = '42501';
    END IF;
    RETURN public.get_neighbor_activity_feed_core_20261238(
        p_space_id, p_activity_id, p_limit, p_cursor_at, p_cursor_id
    );
END;
$$;

-- 기존 교사 행동 RPC의 왕복 수를 늘리지 않고 승인 동작을 한 갈래로 추가한다.
DO $$
BEGIN
    IF to_regprocedure('public.run_neighbor_teacher_action_core_20261238(uuid,text,jsonb)') IS NULL THEN
        ALTER FUNCTION public.run_neighbor_teacher_action_v1(UUID, TEXT, JSONB)
            RENAME TO run_neighbor_teacher_action_core_20261238;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.run_neighbor_teacher_action_core_20261238(UUID, TEXT, JSONB)
FROM PUBLIC, anon, authenticated, service_role;

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
BEGIN
    IF p_action = 'review_activity' THEN
        v_result := public.review_neighbor_activity_v1(
            NULLIF(p_payload->>'space_id', '')::UUID,
            p_class_id,
            NULLIF(p_payload->>'activity_id', '')::UUID,
            COALESCE((p_payload->>'approve')::BOOLEAN, FALSE)
        );
        RETURN jsonb_build_object(
            'success', TRUE, 'action_result', v_result,
            'workspace', public.get_neighbor_teacher_workspace_v1(p_class_id)
        );
    END IF;
    RETURN public.run_neighbor_teacher_action_core_20261238(p_class_id, p_action, p_payload);
END;
$$;

REVOKE ALL ON FUNCTION public.create_neighbor_activity_v1(UUID, UUID, TEXT, TEXT, TEXT, UUID[])
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.review_neighbor_activity_v1(UUID, UUID, UUID, BOOLEAN)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_neighbor_teacher_activities_v1(UUID, UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_neighbor_student_activities_v1(UUID, UUID, UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_neighbor_activity_feed_v1(UUID, UUID, INTEGER, TIMESTAMPTZ, UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.run_neighbor_teacher_action_v1(UUID, TEXT, JSONB)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_neighbor_activity_feed_v1(UUID, UUID, INTEGER, TIMESTAMPTZ, UUID)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_neighbor_teacher_action_v1(UUID, TEXT, JSONB)
TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
