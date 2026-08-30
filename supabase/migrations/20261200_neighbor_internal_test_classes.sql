BEGIN;

CREATE TABLE IF NOT EXISTS public.neighbor_internal_test_classes (
    class_id UUID PRIMARY KEY REFERENCES public.classes(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.neighbor_internal_test_classes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.neighbor_internal_test_classes FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_neighbor_admin_dashboard_v1(
    p_space_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rollout public.neighbor_rollout_state%ROWTYPE;
    v_summary JSONB;
    v_classes JSONB := '[]'::JSONB;
    v_spaces JSONB := '[]'::JSONB;
    v_preview_feed JSONB := '[]'::JSONB;
    v_preview_space_id UUID := p_space_id;
BEGIN
    PERFORM public.assert_neighbor_admin_v1();
    SELECT rollout.* INTO v_rollout
    FROM public.neighbor_rollout_state rollout
    WHERE rollout.singleton IS TRUE;

    SELECT jsonb_build_object(
        'space_count', count(*)::INTEGER,
        'active_space_count', count(*) FILTER (WHERE space.status = 'active')::INTEGER,
        'paused_space_count', count(*) FILTER (WHERE space.status = 'paused')::INTEGER,
        'closed_space_count', count(*) FILTER (WHERE space.status = 'closed')::INTEGER,
        'active_class_count', (SELECT count(*)::INTEGER FROM public.neighbor_space_classes membership WHERE membership.status = 'active'),
        'published_post_count', (SELECT count(*)::INTEGER FROM public.neighbor_shared_posts shared WHERE shared.status = 'published'),
        'visible_comment_count', (SELECT count(*)::INTEGER FROM public.neighbor_comments comment WHERE comment.status = 'visible'),
        'hidden_comment_count', (SELECT count(*)::INTEGER FROM public.neighbor_comments comment WHERE comment.status = 'hidden'),
        'reaction_count', (SELECT count(*)::INTEGER FROM public.neighbor_reactions),
        'save_count', (SELECT count(*)::INTEGER FROM public.neighbor_saves)
    ) INTO v_summary
    FROM public.neighbor_spaces space;

    SELECT COALESCE(jsonb_agg(class_row.item ORDER BY class_row.created_at DESC, class_row.class_id), '[]'::JSONB)
    INTO v_classes
    FROM (
        SELECT
            class.id AS class_id,
            class.created_at,
            jsonb_build_object(
                'class_id', class.id,
                'class_name', class.name,
                'teacher_name', COALESCE(NULLIF(teacher.name, ''), NULLIF(profile.full_name, ''), '선생님'),
                'available', NOT EXISTS (
                    SELECT 1 FROM public.neighbor_space_classes membership
                    WHERE membership.class_id = class.id AND membership.status IN ('pending', 'active')
                )
            ) AS item
        FROM public.classes class
        JOIN public.neighbor_internal_test_classes test_class
          ON test_class.class_id = class.id
        JOIN public.profiles profile
          ON profile.id = class.teacher_id
         AND profile.role = 'TEACHER'
         AND profile.is_approved IS TRUE
         AND profile.approval_revoked_at IS NULL
        LEFT JOIN public.teachers teacher ON teacher.id = profile.id
        WHERE class.deleted_at IS NULL
        ORDER BY class.created_at DESC, class.id
        LIMIT 100
    ) class_row;

    SELECT COALESCE(jsonb_agg(space_row.item ORDER BY space_row.updated_at DESC, space_row.space_id), '[]'::JSONB)
    INTO v_spaces
    FROM (
        SELECT
            space.id AS space_id,
            space.updated_at,
            jsonb_build_object(
                'space_id', space.id,
                'name', space.name,
                'description', space.public_description,
                'status', space.status,
                'host_class_id', space.host_class_id,
                'created_at', space.created_at,
                'updated_at', space.updated_at,
                'memberships', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                        'class_id', membership.class_id,
                        'class_name', membership.public_class_name,
                        'role', membership.role,
                        'status', membership.status,
                        'student_access_enabled', membership.student_access_enabled
                    ) ORDER BY membership.role, membership.joined_at, membership.class_id)
                    FROM public.neighbor_space_classes membership
                    WHERE membership.space_id = space.id
                ), '[]'::JSONB),
                'published_post_count', (
                    SELECT count(*)::INTEGER FROM public.neighbor_shared_posts shared
                    WHERE shared.space_id = space.id AND shared.status = 'published'
                ),
                'pending_post_count', (
                    SELECT count(*)::INTEGER FROM public.neighbor_shared_posts shared
                    WHERE shared.space_id = space.id AND shared.status = 'pending'
                ),
                'visible_comment_count', (
                    SELECT count(*)::INTEGER FROM public.neighbor_comments comment
                    WHERE comment.space_id = space.id AND comment.status = 'visible'
                ),
                'hidden_comment_count', (
                    SELECT count(*)::INTEGER FROM public.neighbor_comments comment
                    WHERE comment.space_id = space.id AND comment.status = 'hidden'
                ),
                'reaction_count', (
                    SELECT count(*)::INTEGER FROM public.neighbor_reactions reaction
                    WHERE reaction.space_id = space.id
                ),
                'save_count', (
                    SELECT count(*)::INTEGER FROM public.neighbor_saves saved
                    WHERE saved.space_id = space.id
                )
            ) AS item
        FROM public.neighbor_spaces space
        ORDER BY space.updated_at DESC, space.id
        LIMIT 20
    ) space_row;

    IF v_preview_space_id IS NULL THEN
        SELECT space.id INTO v_preview_space_id
        FROM public.neighbor_spaces space
        ORDER BY (space.status = 'active') DESC, space.updated_at DESC, space.id
        LIMIT 1;
    END IF;

    IF v_preview_space_id IS NOT NULL THEN
        SELECT COALESCE(jsonb_agg(feed_row.item ORDER BY feed_row.published_at DESC, feed_row.shared_post_id DESC), '[]'::JSONB)
        INTO v_preview_feed
        FROM (
            SELECT
                shared.id AS shared_post_id,
                shared.published_at,
                jsonb_build_object(
                    'shared_post_id', shared.id,
                    'title', post.title,
                    'excerpt', left(regexp_replace(COALESCE(post.content, ''), '[[:space:]]+', ' ', 'g'), 180),
                    'author_name', public.neighbor_public_author_name_v1(shared.space_id, shared.student_id),
                    'class_name', membership.public_class_name,
                    'published_at', shared.published_at,
                    'comment_count', (
                        SELECT count(*)::INTEGER FROM public.neighbor_comments comment
                        WHERE comment.shared_post_id = shared.id AND comment.status = 'visible'
                    ),
                    'reaction_count', (
                        SELECT count(*)::INTEGER FROM public.neighbor_reactions reaction
                        WHERE reaction.shared_post_id = shared.id
                    )
                ) AS item
            FROM public.neighbor_shared_posts shared
            JOIN public.neighbor_space_classes membership
              ON membership.space_id = shared.space_id
             AND membership.class_id = shared.class_id
             AND membership.status = 'active'
            JOIN public.student_posts post
              ON post.id = shared.post_id
             AND post.class_id = shared.class_id
             AND post.student_id = shared.student_id
             AND post.is_submitted IS TRUE
             AND post.recalled_at IS NULL
            WHERE shared.space_id = v_preview_space_id AND shared.status = 'published'
            ORDER BY shared.published_at DESC, shared.id DESC
            LIMIT 20
        ) feed_row;
    END IF;

    RETURN jsonb_build_object(
        'version', 1,
        'rollout', jsonb_build_object(
            'mode', v_rollout.mode,
            'updated_at', v_rollout.updated_at,
            'acceptance_checks', v_rollout.acceptance_checks,
            'ready_for_public_beta', public.neighbor_acceptance_ready_v1(v_rollout.acceptance_checks),
            'required_check_count', 6
        ),
        'summary', v_summary,
        'eligible_classes', v_classes,
        'spaces', v_spaces,
        'preview_space_id', v_preview_space_id,
        'preview_feed', v_preview_feed
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_neighbor_internal_trial_v1(
    p_name TEXT,
    p_class_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_mode TEXT;
    v_name TEXT := btrim(COALESCE(p_name, ''));
    v_class_count INTEGER := COALESCE(cardinality(p_class_ids), 0);
    v_space_id UUID;
BEGIN
    v_user_id := public.assert_neighbor_admin_v1();
    SELECT rollout.mode INTO v_mode FROM public.neighbor_rollout_state rollout WHERE rollout.singleton;
    IF v_mode <> 'internal' THEN
        RAISE EXCEPTION '내부 시험 공간은 관리자 내부 단계에서만 만들 수 있습니다.' USING ERRCODE = '55000';
    END IF;
    IF char_length(v_name) NOT BETWEEN 1 AND 60 OR v_class_count NOT BETWEEN 2 AND 4 THEN
        RAISE EXCEPTION '공간명과 2~4개 시험 학급을 확인해 주세요.' USING ERRCODE = '22023';
    END IF;
    IF (SELECT count(DISTINCT class_id) FROM unnest(p_class_ids) class_id) <> v_class_count THEN
        RAISE EXCEPTION '시험 학급은 중복해서 선택할 수 없습니다.' USING ERRCODE = '22023';
    END IF;
    IF (SELECT count(*)
        FROM public.classes class
        JOIN public.neighbor_internal_test_classes test_class
          ON test_class.class_id = class.id
        JOIN public.profiles profile
          ON profile.id = class.teacher_id
         AND profile.role = 'TEACHER'
         AND profile.is_approved IS TRUE
         AND profile.approval_revoked_at IS NULL
        WHERE class.id = ANY(p_class_ids) AND class.deleted_at IS NULL) <> v_class_count THEN
        RAISE EXCEPTION '승인 교사의 사용 가능한 학급만 선택할 수 있습니다.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.neighbor_space_classes membership
        WHERE membership.class_id = ANY(p_class_ids) AND membership.status IN ('pending', 'active')
    ) THEN
        RAISE EXCEPTION '선택한 학급 중 이미 참여 중이거나 신청 중인 학급이 있습니다.' USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.neighbor_spaces (host_class_id, created_by, name, public_description, status)
    VALUES (p_class_ids[1], v_user_id, v_name, '관리자 내부 시험 공간', 'draft')
    RETURNING id INTO v_space_id;

    INSERT INTO public.neighbor_space_classes (
        space_id, class_id, role, status, public_class_name,
        student_access_enabled, requested_at, reviewed_at, reviewed_by, joined_at
    )
    SELECT
        v_space_id,
        class.id,
        CASE WHEN selected.position = 1 THEN 'host' ELSE 'guest' END,
        'active',
        left(COALESCE(NULLIF(btrim(class.name), ''), '시험 학급 ' || selected.position), 40),
        FALSE,
        NOW(), NOW(), v_user_id, NOW()
    FROM unnest(p_class_ids) WITH ORDINALITY selected(class_id, position)
    JOIN public.classes class ON class.id = selected.class_id;

    UPDATE public.neighbor_spaces SET status = 'active' WHERE id = v_space_id;

    INSERT INTO public.neighbor_space_events (
        space_id, class_id, actor_user_id, actor_role, event_type, target_type, target_id
    )
    SELECT
        v_space_id,
        selected.class_id,
        v_user_id,
        'admin',
        CASE WHEN selected.position = 1 THEN 'space_created' ELSE 'join_approved' END,
        CASE WHEN selected.position = 1 THEN 'space' ELSE 'class' END,
        CASE WHEN selected.position = 1 THEN v_space_id ELSE selected.class_id END
    FROM unnest(p_class_ids) WITH ORDINALITY selected(class_id, position);

    RETURN jsonb_build_object(
        'success', TRUE,
        'space_id', v_space_id,
        'status', 'active',
        'active_class_count', v_class_count,
        'student_access_enabled', FALSE
    );
END;
$$;


NOTIFY pgrst, 'reload schema';

COMMIT;
