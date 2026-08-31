-- 이웃 아지트를 전체 공개 전에 선택 학급만 실제 화면으로 검증할 수 있게 한다.
-- 허용 학급 원장과 변경 이력은 브라우저에서 직접 읽지 못하며, 관리자·교사·학생은 전용 RPC만 사용한다.

BEGIN;

ALTER TABLE public.neighbor_rollout_state
    DROP CONSTRAINT IF EXISTS neighbor_rollout_state_mode_check;
ALTER TABLE public.neighbor_rollout_state
    ADD CONSTRAINT neighbor_rollout_state_mode_check
    CHECK (mode IN ('internal', 'limited_beta', 'public_beta', 'paused'));

ALTER TABLE public.neighbor_rollout_events
    DROP CONSTRAINT IF EXISTS neighbor_rollout_events_from_mode_check;
ALTER TABLE public.neighbor_rollout_events
    ADD CONSTRAINT neighbor_rollout_events_from_mode_check
    CHECK (from_mode IN ('internal', 'limited_beta', 'public_beta', 'paused'));
ALTER TABLE public.neighbor_rollout_events
    DROP CONSTRAINT IF EXISTS neighbor_rollout_events_to_mode_check;
ALTER TABLE public.neighbor_rollout_events
    ADD CONSTRAINT neighbor_rollout_events_to_mode_check
    CHECK (to_mode IN ('internal', 'limited_beta', 'public_beta', 'paused'));

CREATE TABLE IF NOT EXISTS public.neighbor_limited_classes (
    class_id UUID PRIMARY KEY REFERENCES public.classes(id) ON DELETE CASCADE,
    enabled_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.neighbor_limited_class_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (action IN ('enabled', 'disabled')),
    changed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_neighbor_limited_class_events_recent
    ON public.neighbor_limited_class_events (created_at DESC, id DESC);

ALTER TABLE public.neighbor_limited_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neighbor_limited_class_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.neighbor_limited_classes
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.neighbor_limited_class_events
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.neighbor_class_is_released_v1(p_class_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT CASE rollout.mode
        WHEN 'public_beta' THEN TRUE
        WHEN 'limited_beta' THEN EXISTS (
            SELECT 1
            FROM public.neighbor_limited_classes limited
            WHERE limited.class_id = p_class_id
        )
        ELSE FALSE
    END
    FROM public.neighbor_rollout_state rollout
    WHERE rollout.singleton IS TRUE;
$$;

CREATE OR REPLACE FUNCTION public.assert_neighbor_teacher_class_v1(p_class_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_profile public.profiles%ROWTYPE;
    v_mode TEXT;
BEGIN
    IF v_user_id IS NULL OR p_class_id IS NULL THEN
        RAISE EXCEPTION '이웃 아지트 교사 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT profile.* INTO v_profile
    FROM public.profiles profile
    WHERE profile.id = v_user_id;

    SELECT rollout.mode INTO v_mode
    FROM public.neighbor_rollout_state rollout
    WHERE rollout.singleton IS TRUE;

    IF v_profile.role = 'ADMIN' THEN
        IF v_mode = 'paused' THEN
            RAISE EXCEPTION '이웃 아지트가 점검 중입니다.' USING ERRCODE = '55000';
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM public.classes class
            WHERE class.id = p_class_id AND class.deleted_at IS NULL
        ) THEN
            RAISE EXCEPTION '사용 가능한 학급이 아닙니다.' USING ERRCODE = '22023';
        END IF;
        IF v_mode = 'internal' AND NOT EXISTS (
            SELECT 1 FROM public.neighbor_internal_test_classes internal_test
            WHERE internal_test.class_id = p_class_id
        ) THEN
            RAISE EXCEPTION '관리자 내부 단계에서는 등록된 시험 학급만 사용할 수 있습니다.' USING ERRCODE = '42501';
        END IF;
        IF v_mode = 'limited_beta'
           AND public.neighbor_class_is_released_v1(p_class_id) IS NOT TRUE THEN
            RAISE EXCEPTION '현재 제한 공개 대상 학급이 아닙니다.' USING ERRCODE = '42501';
        END IF;
        RETURN 'admin';
    END IF;

    IF public.neighbor_class_is_released_v1(p_class_id) IS NOT TRUE
       OR v_profile.role <> 'TEACHER'
       OR v_profile.is_approved IS NOT TRUE
       OR v_profile.approval_revoked_at IS NOT NULL
       OR NOT EXISTS (
            SELECT 1 FROM public.classes class
            WHERE class.id = p_class_id
              AND class.teacher_id = v_user_id
              AND class.deleted_at IS NULL
       ) THEN
        RAISE EXCEPTION '현재 공개 대상인 담당 교사만 이웃 아지트를 관리할 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    RETURN 'teacher';
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_neighbor_participating_teacher_v1(
    p_space_id UUID,
    p_class_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_actor TEXT;
    v_actor_role TEXT;
BEGIN
    IF v_user_id IS NULL OR p_space_id IS NULL OR p_class_id IS NULL THEN
        RAISE EXCEPTION '이웃 아지트 교사 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    v_actor := public.assert_neighbor_teacher_class_v1(p_class_id);

    SELECT membership.role INTO v_actor_role
    FROM public.neighbor_space_classes membership
    JOIN public.neighbor_spaces space ON space.id = membership.space_id
    WHERE membership.space_id = p_space_id
      AND membership.class_id = p_class_id
      AND membership.status = 'active'
      AND space.status = 'active';

    IF v_actor_role IS NULL THEN
        RAISE EXCEPTION '현재 참여 중인 학급이 아닙니다.' USING ERRCODE = '42501';
    END IF;
    RETURN CASE WHEN v_actor = 'admin' THEN 'admin' ELSE v_actor_role END;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_neighbor_student_access_v1(p_space_id UUID)
RETURNS TABLE(student_id UUID, class_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_student_id UUID;
    v_class_id UUID;
BEGIN
    IF v_user_id IS NULL OR public.auth_user_role() <> 'STUDENT' THEN
        RAISE EXCEPTION '이웃 아지트를 사용할 수 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT student.id, student.class_id INTO v_student_id, v_class_id
    FROM public.students student
    JOIN public.classes class
      ON class.id = student.class_id
     AND class.deleted_at IS NULL
    WHERE student.auth_id = v_user_id
      AND student.is_active IS DISTINCT FROM FALSE
      AND student.deleted_at IS NULL
      AND 'neighbor-agit' = ANY(COALESCE(class.enabled_modules, ARRAY[]::TEXT[]))
    LIMIT 1;

    IF v_student_id IS NULL
       OR public.neighbor_class_is_released_v1(v_class_id) IS NOT TRUE
       OR NOT EXISTS (
            SELECT 1
            FROM public.neighbor_space_classes membership
            JOIN public.neighbor_spaces space ON space.id = membership.space_id
            WHERE membership.space_id = p_space_id
              AND membership.class_id = v_class_id
              AND membership.status = 'active'
              AND membership.student_access_enabled IS TRUE
              AND space.status = 'active'
              AND (
                  SELECT count(*)
                  FROM public.neighbor_space_classes active_membership
                  WHERE active_membership.space_id = p_space_id
                    AND active_membership.status = 'active'
              ) >= 2
       ) THEN
        RAISE EXCEPTION '학급에서 이웃 아지트를 아직 열지 않았습니다.' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY SELECT v_student_id, v_class_id;
END;
$$;

-- 학생 공개 스위치는 모듈 ON/OFF까지 같은 트랜잭션에서 맞춘다.
CREATE OR REPLACE FUNCTION public.set_neighbor_class_access_v1(
    p_space_id UUID,
    p_class_id UUID,
    p_enabled BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_actor TEXT;
    v_active_count INTEGER;
    v_enabled BOOLEAN := COALESCE(p_enabled, FALSE);
BEGIN
    v_actor := public.assert_neighbor_participating_teacher_v1(p_space_id, p_class_id);
    SELECT count(*)::INTEGER INTO v_active_count
    FROM public.neighbor_space_classes membership
    WHERE membership.space_id = p_space_id AND membership.status = 'active';

    IF v_enabled AND v_active_count < 2 THEN
        RAISE EXCEPTION '두 학급 이상 참여한 뒤 학생에게 열 수 있습니다.' USING ERRCODE = '23514';
    END IF;

    UPDATE public.neighbor_space_classes
    SET student_access_enabled = v_enabled
    WHERE space_id = p_space_id AND class_id = p_class_id AND status = 'active';

    UPDATE public.classes class
    SET enabled_modules = CASE
        WHEN v_enabled AND NOT ('neighbor-agit' = ANY(COALESCE(class.enabled_modules, ARRAY[]::TEXT[])))
            THEN array_append(COALESCE(class.enabled_modules, ARRAY[]::TEXT[]), 'neighbor-agit')
        WHEN NOT v_enabled
            THEN array_remove(COALESCE(class.enabled_modules, ARRAY[]::TEXT[]), 'neighbor-agit')
        ELSE class.enabled_modules
    END
    WHERE class.id = p_class_id;

    INSERT INTO public.neighbor_space_events (
        space_id, class_id, actor_user_id, actor_role, event_type, target_type, target_id
    ) VALUES (
        p_space_id, p_class_id, v_user_id, v_actor,
        'class_access_changed', 'class', p_class_id
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'student_access_enabled', v_enabled,
        'module_enabled', v_enabled
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_neighbor_limited_class_v1(
    p_class_id UUID,
    p_enabled BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_selected_count INTEGER;
    v_enabled BOOLEAN := COALESCE(p_enabled, FALSE);
BEGIN
    v_user_id := public.assert_neighbor_admin_v1();
    PERFORM pg_advisory_xact_lock(hashtext('neighbor-limited-classes'));
    IF p_class_id IS NULL OR p_enabled IS NULL THEN
        RAISE EXCEPTION '제한 공개에 사용할 승인 교사 학급이 아닙니다.' USING ERRCODE = '22023';
    END IF;
    IF v_enabled AND NOT EXISTS (
        SELECT 1
        FROM public.classes class
        JOIN public.profiles profile
          ON profile.id = class.teacher_id
         AND profile.role = 'TEACHER'
         AND profile.is_approved IS TRUE
         AND profile.approval_revoked_at IS NULL
        WHERE class.id = p_class_id
          AND class.deleted_at IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM public.neighbor_internal_test_classes internal_test
              WHERE internal_test.class_id = class.id
          )
    ) THEN
        RAISE EXCEPTION '제한 공개에 사용할 승인 교사 학급이 아닙니다.' USING ERRCODE = '22023';
    END IF;
    IF NOT v_enabled AND NOT EXISTS (
        SELECT 1 FROM public.neighbor_limited_classes limited WHERE limited.class_id = p_class_id
    ) THEN
        RAISE EXCEPTION '제한 공개에 사용할 승인 교사 학급이 아닙니다.' USING ERRCODE = '22023';
    END IF;

    IF v_enabled THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.neighbor_limited_classes limited
            WHERE limited.class_id = p_class_id
        ) AND (SELECT count(*) FROM public.neighbor_limited_classes) >= 8 THEN
            RAISE EXCEPTION '제한 공개 학급은 최대 8개까지 선택할 수 있습니다.' USING ERRCODE = '23514';
        END IF;
        INSERT INTO public.neighbor_limited_classes (class_id, enabled_by)
        VALUES (p_class_id, v_user_id)
        ON CONFLICT (class_id) DO NOTHING;
    ELSE
        IF (SELECT mode FROM public.neighbor_rollout_state WHERE singleton) = 'limited_beta'
           AND (SELECT count(*) FROM public.neighbor_limited_classes) <= 2 THEN
            RAISE EXCEPTION '제한 공개 중에는 두 학급 이상을 유지해야 합니다. 먼저 공개 단계를 중지해 주세요.'
                USING ERRCODE = '55000';
        END IF;
        DELETE FROM public.neighbor_limited_classes limited
        WHERE limited.class_id = p_class_id;
        UPDATE public.neighbor_space_classes membership
        SET student_access_enabled = FALSE
        WHERE membership.class_id = p_class_id
          AND membership.status = 'active';
        UPDATE public.classes class
        SET enabled_modules = array_remove(
            COALESCE(class.enabled_modules, ARRAY[]::TEXT[]), 'neighbor-agit'
        )
        WHERE class.id = p_class_id;
    END IF;

    INSERT INTO public.neighbor_limited_class_events (class_id, action, changed_by)
    VALUES (p_class_id, CASE WHEN v_enabled THEN 'enabled' ELSE 'disabled' END, v_user_id);

    SELECT count(*)::INTEGER INTO v_selected_count
    FROM public.neighbor_limited_classes;
    RETURN jsonb_build_object(
        'success', TRUE,
        'class_id', p_class_id,
        'selected', v_enabled,
        'selected_count', v_selected_count
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.change_neighbor_rollout_v1(
    p_mode TEXT,
    p_confirmation TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_rollout public.neighbor_rollout_state%ROWTYPE;
BEGIN
    v_user_id := public.assert_neighbor_admin_v1();
    PERFORM pg_advisory_xact_lock(hashtext('neighbor-limited-classes'));
    IF p_mode NOT IN ('internal', 'limited_beta', 'public_beta', 'paused') THEN
        RAISE EXCEPTION '지원하지 않는 공개 단계입니다.' USING ERRCODE = '22023';
    END IF;

    SELECT rollout.* INTO v_rollout
    FROM public.neighbor_rollout_state rollout
    WHERE rollout.singleton IS TRUE
    FOR UPDATE;

    IF p_mode = v_rollout.mode THEN
        RETURN jsonb_build_object('success', TRUE, 'mode', v_rollout.mode, 'changed', FALSE);
    END IF;
    IF p_mode = 'limited_beta'
       AND (SELECT count(*) FROM public.neighbor_limited_classes) < 2 THEN
        RAISE EXCEPTION '제한 공개 학급을 두 곳 이상 선택해 주세요.' USING ERRCODE = '55000';
    END IF;
    IF p_mode = 'public_beta' AND NOT public.neighbor_acceptance_ready_v1(v_rollout.acceptance_checks) THEN
        RAISE EXCEPTION '인수 점검 여섯 항목을 모두 확인한 뒤 공개할 수 있습니다.' USING ERRCODE = '55000';
    END IF;
    IF p_mode = 'public_beta' AND p_confirmation <> '전체 교사 Beta 공개' THEN
        RAISE EXCEPTION '전체 교사 공개 확인 문구가 일치하지 않습니다.' USING ERRCODE = '42501';
    END IF;

    IF p_mode = 'limited_beta' THEN
        UPDATE public.neighbor_space_classes membership
        SET student_access_enabled = FALSE
        WHERE membership.status = 'active'
          AND NOT EXISTS (
              SELECT 1 FROM public.neighbor_limited_classes limited
              WHERE limited.class_id = membership.class_id
          );
        UPDATE public.classes class
        SET enabled_modules = array_remove(
            COALESCE(class.enabled_modules, ARRAY[]::TEXT[]), 'neighbor-agit'
        )
        WHERE 'neighbor-agit' = ANY(COALESCE(class.enabled_modules, ARRAY[]::TEXT[]))
          AND NOT EXISTS (
              SELECT 1 FROM public.neighbor_limited_classes limited
              WHERE limited.class_id = class.id
          );
    END IF;

    INSERT INTO public.neighbor_rollout_events (
        from_mode, to_mode, checks_snapshot, confirmation_used, changed_by
    ) VALUES (
        v_rollout.mode, p_mode, v_rollout.acceptance_checks,
        p_mode = 'public_beta', v_user_id
    );
    UPDATE public.neighbor_rollout_state
    SET mode = p_mode, updated_by = v_user_id
    WHERE singleton IS TRUE;

    RETURN jsonb_build_object('success', TRUE, 'mode', p_mode, 'changed', TRUE);
END;
$$;

-- 기존 관리자 현황을 보존한 채 제한 공개 후보와 선택 상태만 한 응답에 합친다.
DO $$
BEGIN
    IF to_regprocedure('public.get_neighbor_admin_dashboard_core_20261201(uuid)') IS NULL THEN
        ALTER FUNCTION public.get_neighbor_admin_dashboard_v1(UUID)
            RENAME TO get_neighbor_admin_dashboard_core_20261201;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_neighbor_admin_dashboard_core_20261201(UUID)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_neighbor_admin_dashboard_v1(p_space_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_base JSONB;
    v_classes JSONB := '[]'::JSONB;
BEGIN
    PERFORM public.assert_neighbor_admin_v1();
    v_base := public.get_neighbor_admin_dashboard_core_20261201(p_space_id);

    SELECT COALESCE(jsonb_agg(candidate.item ORDER BY candidate.selected DESC, candidate.created_at DESC, candidate.class_id), '[]'::JSONB)
    INTO v_classes
    FROM (
        SELECT
            class.id AS class_id,
            class.created_at,
            limited.class_id IS NOT NULL AS selected,
            jsonb_build_object(
                'class_id', class.id,
                'class_name', class.name,
                'teacher_name', COALESCE(NULLIF(teacher.name, ''), NULLIF(profile.full_name, ''), '선생님'),
                'selected', limited.class_id IS NOT NULL,
                'has_active_space', EXISTS (
                    SELECT 1 FROM public.neighbor_space_classes membership
                    WHERE membership.class_id = class.id
                      AND membership.status IN ('pending', 'active')
                )
            ) AS item
        FROM public.classes class
        JOIN public.profiles profile ON profile.id = class.teacher_id
        LEFT JOIN public.teachers teacher ON teacher.id = profile.id
        LEFT JOIN public.neighbor_limited_classes limited ON limited.class_id = class.id
        WHERE class.deleted_at IS NULL
          AND (
              limited.class_id IS NOT NULL
              OR (
                  profile.role = 'TEACHER'
                  AND profile.is_approved IS TRUE
                  AND profile.approval_revoked_at IS NULL
              )
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.neighbor_internal_test_classes internal_test
              WHERE internal_test.class_id = class.id
          )
        ORDER BY (limited.class_id IS NOT NULL) DESC, class.created_at DESC, class.id
        LIMIT 100
    ) candidate;

    RETURN v_base || jsonb_build_object(
        'limited_classes', v_classes,
        'limited_class_count', (SELECT count(*)::INTEGER FROM public.neighbor_limited_classes),
        'limited_class_max', 8
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_neighbor_teacher_workspace_v1(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_mode TEXT;
    v_class_name TEXT;
    v_module_enabled BOOLEAN := FALSE;
    v_membership public.neighbor_space_classes%ROWTYPE;
    v_space public.neighbor_spaces%ROWTYPE;
    v_memberships JSONB := '[]'::JSONB;
    v_review_posts JSONB := '[]'::JSONB;
    v_public_posts JSONB := '[]'::JSONB;
BEGIN
    PERFORM public.assert_neighbor_teacher_class_v1(p_class_id);
    SELECT rollout.mode INTO v_mode
    FROM public.neighbor_rollout_state rollout WHERE rollout.singleton;
    SELECT class.name,
           'neighbor-agit' = ANY(COALESCE(class.enabled_modules, ARRAY[]::TEXT[]))
    INTO v_class_name, v_module_enabled
    FROM public.classes class WHERE class.id = p_class_id;

    SELECT membership.* INTO v_membership
    FROM public.neighbor_space_classes membership
    JOIN public.neighbor_spaces space ON space.id = membership.space_id
    WHERE membership.class_id = p_class_id
      AND membership.status IN ('pending', 'active')
      AND space.status IN ('active', 'paused')
    ORDER BY (membership.status = 'active') DESC, membership.updated_at DESC
    LIMIT 1;

    IF v_membership.id IS NULL THEN
        RETURN jsonb_build_object(
            'version', 1,
            'rollout_mode', v_mode,
            'class', jsonb_build_object(
                'id', p_class_id, 'name', v_class_name, 'module_enabled', v_module_enabled
            ),
            'space', NULL,
            'memberships', '[]'::JSONB,
            'review_posts', '[]'::JSONB,
            'public_posts', '[]'::JSONB
        );
    END IF;

    SELECT space.* INTO v_space
    FROM public.neighbor_spaces space WHERE space.id = v_membership.space_id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'class_id', membership.class_id,
        'class_name', membership.public_class_name,
        'role', membership.role,
        'status', membership.status,
        'student_access_enabled', membership.student_access_enabled,
        'requested_at', membership.requested_at,
        'joined_at', membership.joined_at
    ) ORDER BY membership.role, membership.requested_at, membership.class_id), '[]'::JSONB)
    INTO v_memberships
    FROM public.neighbor_space_classes membership
    WHERE membership.space_id = v_space.id
      AND membership.status IN ('pending', 'active');

    SELECT COALESCE(jsonb_agg(post_row.item ORDER BY post_row.requested_at DESC, post_row.shared_post_id DESC), '[]'::JSONB)
    INTO v_review_posts
    FROM (
        SELECT shared.id AS shared_post_id, shared.requested_at,
            jsonb_build_object(
                'shared_post_id', shared.id,
                'title', post.title,
                'excerpt', left(regexp_replace(COALESCE(post.content, ''), '[[:space:]]+', ' ', 'g'), 180),
                'student_name', student.name,
                'status', shared.status,
                'requested_at', shared.requested_at,
                'review_note', shared.review_note,
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
        JOIN public.student_posts post
          ON post.id = shared.post_id
         AND post.class_id = shared.class_id
         AND post.student_id = shared.student_id
        JOIN public.students student
          ON student.id = shared.student_id
         AND student.class_id = shared.class_id
        WHERE shared.space_id = v_space.id
          AND shared.class_id = p_class_id
          AND shared.status IN ('pending', 'published', 'returned', 'hidden')
        ORDER BY shared.requested_at DESC, shared.id DESC
        LIMIT 100
    ) post_row;

    SELECT COALESCE(jsonb_agg(post_row.item ORDER BY post_row.published_at DESC, post_row.shared_post_id DESC), '[]'::JSONB)
    INTO v_public_posts
    FROM (
        SELECT shared.id AS shared_post_id, shared.published_at,
            jsonb_build_object(
                'shared_post_id', shared.id,
                'title', post.title,
                'excerpt', left(regexp_replace(COALESCE(post.content, ''), '[[:space:]]+', ' ', 'g'), 180),
                'author_name', shared.public_author_name,
                'class_name', membership.public_class_name,
                'status', shared.status,
                'is_own_class', shared.class_id = p_class_id,
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
        WHERE shared.space_id = v_space.id
          AND shared.status IN ('published', 'hidden')
        ORDER BY shared.published_at DESC NULLS LAST, shared.id DESC
        LIMIT 50
    ) post_row;

    RETURN jsonb_build_object(
        'version', 1,
        'rollout_mode', v_mode,
        'class', jsonb_build_object(
            'id', p_class_id, 'name', v_class_name, 'module_enabled', v_module_enabled
        ),
        'space', jsonb_build_object(
            'id', v_space.id,
            'name', v_space.name,
            'description', v_space.public_description,
            'status', v_space.status,
            'host_class_id', v_space.host_class_id,
            'my_role', v_membership.role,
            'my_status', v_membership.status,
            'student_access_enabled', v_membership.student_access_enabled
        ),
        'memberships', v_memberships,
        'review_posts', v_review_posts,
        'public_posts', v_public_posts
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_neighbor_teacher_post_detail_v1(
    p_space_id UUID,
    p_actor_class_id UUID,
    p_shared_post_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_shared public.neighbor_shared_posts%ROWTYPE;
    v_result JSONB;
    v_comments JSONB := '[]'::JSONB;
BEGIN
    PERFORM public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);
    SELECT shared.* INTO v_shared
    FROM public.neighbor_shared_posts shared
    WHERE shared.id = p_shared_post_id
      AND shared.space_id = p_space_id
      AND shared.status IN ('published', 'hidden');
    IF v_shared.id IS NULL THEN
        RAISE EXCEPTION '확인할 수 있는 이웃 글이 아닙니다.' USING ERRCODE = '22023';
    END IF;

    SELECT jsonb_build_object(
        'version', 1,
        'shared_post_id', shared.id,
        'title', post.title,
        'content', post.content,
        'author_name', shared.public_author_name,
        'class_name', membership.public_class_name,
        'status', shared.status,
        'is_own_class', shared.class_id = p_actor_class_id,
        'published_at', shared.published_at
    ) INTO v_result
    FROM public.neighbor_shared_posts shared
    JOIN public.neighbor_space_classes membership
      ON membership.space_id = shared.space_id
     AND membership.class_id = shared.class_id
    JOIN public.student_posts post
      ON post.id = shared.post_id
     AND post.class_id = shared.class_id
     AND post.student_id = shared.student_id
    WHERE shared.id = p_shared_post_id;

    SELECT COALESCE(jsonb_agg(comment_row.item ORDER BY comment_row.created_at, comment_row.comment_id), '[]'::JSONB)
    INTO v_comments
    FROM (
        SELECT comment.id AS comment_id, comment.created_at,
            jsonb_build_object(
                'comment_id', comment.id,
                'content', comment.content,
                'status', comment.status,
                'author_name', public.neighbor_public_author_name_v1(p_space_id, comment.student_id),
                'class_name', membership.public_class_name,
                'is_own_class', comment.class_id = p_actor_class_id,
                'created_at', comment.created_at
            ) AS item
        FROM public.neighbor_comments comment
        JOIN public.neighbor_space_classes membership
          ON membership.space_id = comment.space_id
         AND membership.class_id = comment.class_id
        WHERE comment.shared_post_id = p_shared_post_id
          AND (
              comment.status = 'visible'
              OR (comment.status = 'hidden' AND comment.class_id = p_actor_class_id)
          )
        ORDER BY comment.created_at, comment.id
        LIMIT 100
    ) comment_row;

    RETURN v_result || jsonb_build_object('comments', v_comments);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_neighbor_my_share_candidates_v1(
    p_space_id UUID,
    p_limit INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID;
    v_class_id UUID;
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 50);
    v_items JSONB := '[]'::JSONB;
BEGIN
    SELECT access.student_id, access.class_id INTO v_student_id, v_class_id
    FROM public.assert_neighbor_student_access_v1(p_space_id) access;

    SELECT COALESCE(jsonb_agg(post_row.item ORDER BY post_row.updated_at DESC, post_row.post_id DESC), '[]'::JSONB)
    INTO v_items
    FROM (
        SELECT post.id AS post_id, post.updated_at,
            jsonb_build_object(
                'post_id', post.id,
                'title', post.title,
                'updated_at', post.updated_at,
                'shared_post_id', shared.id,
                'share_status', shared.status,
                'review_note', shared.review_note
            ) AS item
        FROM public.student_posts post
        LEFT JOIN public.neighbor_shared_posts shared
          ON shared.space_id = p_space_id
         AND shared.post_id = post.id
         AND shared.class_id = post.class_id
         AND shared.student_id = post.student_id
        WHERE post.class_id = v_class_id
          AND post.student_id = v_student_id
          AND post.is_submitted IS TRUE
          AND post.recalled_at IS NULL
        ORDER BY post.updated_at DESC, post.id DESC
        LIMIT v_limit
    ) post_row;

    RETURN jsonb_build_object('version', 1, 'max_rows', 50, 'items', v_items);
END;
$$;

-- 교사 행동은 기존 권한 검증 RPC를 호출하고 같은 응답에서 최신 작업 공간을 돌려줘 클라이언트 N+1을 막는다.
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
    IF p_action = 'create_space' THEN
        v_result := public.create_neighbor_space_v1(
            p_class_id,
            p_payload->>'name',
            p_payload->>'public_class_name',
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
            v_space_id,
            NULLIF(p_payload->>'target_class_id', '')::UUID,
            COALESCE((p_payload->>'approve')::BOOLEAN, FALSE)
        );
    ELSIF p_action = 'set_access' THEN
        v_result := public.set_neighbor_class_access_v1(
            v_space_id, p_class_id, COALESCE((p_payload->>'enabled')::BOOLEAN, FALSE)
        );
    ELSIF p_action = 'review_post' THEN
        v_result := public.review_neighbor_shared_post_v1(
            v_space_id,
            NULLIF(p_payload->>'shared_post_id', '')::UUID,
            p_payload->>'decision',
            COALESCE(p_payload->>'review_note', '')
        );
    ELSIF p_action IN ('hide_post', 'restore_post', 'hide_comment', 'restore_comment') THEN
        v_result := public.moderate_neighbor_item_v1(
            v_space_id,
            p_class_id,
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
        'success', TRUE,
        'action_result', v_result,
        'workspace', public.get_neighbor_teacher_workspace_v1(p_class_id)
    );
END;
$$;

-- 학생 홈은 기존 상세 조회를 늘리지 않고 제한 공개 학급 조건만 같은 bootstrap에 반영한다.
CREATE OR REPLACE FUNCTION public.get_student_home_bootstrap_v1()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_base JSONB;
    v_student_id UUID;
    v_class_id UUID;
    v_space_id UUID;
    v_new_count INTEGER := 0;
    v_home JSONB;
BEGIN
    v_base := public.get_student_home_bootstrap_core_20261199();
    v_student_id := NULLIF(v_base #>> '{student,id}', '')::UUID;
    v_class_id := NULLIF(v_base #>> '{student,class_id}', '')::UUID;

    SELECT membership.space_id INTO v_space_id
    FROM public.neighbor_space_classes membership
    JOIN public.neighbor_spaces space
      ON space.id = membership.space_id
     AND space.status = 'active'
    JOIN public.classes class
      ON class.id = membership.class_id
     AND class.deleted_at IS NULL
     AND 'neighbor-agit' = ANY(COALESCE(class.enabled_modules, ARRAY[]::TEXT[]))
    WHERE membership.class_id = v_class_id
      AND public.neighbor_class_is_released_v1(membership.class_id) IS TRUE
      AND membership.status = 'active'
      AND membership.student_access_enabled IS TRUE
      AND (
          SELECT count(*)
          FROM public.neighbor_space_classes active_membership
          WHERE active_membership.space_id = membership.space_id
            AND active_membership.status = 'active'
      ) >= 2
    LIMIT 1;

    IF v_space_id IS NOT NULL THEN
        SELECT LEAST(count(*)::INTEGER, 99) INTO v_new_count
        FROM public.neighbor_shared_posts shared
        JOIN public.neighbor_space_classes source_membership
          ON source_membership.space_id = shared.space_id
         AND source_membership.class_id = shared.class_id
         AND source_membership.status = 'active'
        JOIN public.student_posts post
          ON post.id = shared.post_id
         AND post.class_id = shared.class_id
         AND post.student_id = shared.student_id
         AND post.is_submitted IS TRUE
         AND post.recalled_at IS NULL
        LEFT JOIN public.neighbor_feed_visits visit
          ON visit.space_id = shared.space_id
         AND visit.student_id = v_student_id
         AND visit.class_id = v_class_id
        WHERE shared.space_id = v_space_id
          AND shared.status = 'published'
          AND shared.published_at > COALESCE(visit.last_seen_at, '-infinity'::TIMESTAMPTZ);
    END IF;

    v_home := COALESCE(v_base->'home', '{}'::JSONB) || jsonb_build_object(
        'neighbor_agit_available', v_space_id IS NOT NULL,
        'neighbor_agit_space_id', v_space_id,
        'neighbor_agit_new_count', COALESCE(v_new_count, 0)
    );
    RETURN jsonb_set(v_base, '{home}', v_home, TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.neighbor_class_is_released_v1(UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_neighbor_limited_class_v1(UUID, BOOLEAN)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_neighbor_admin_dashboard_v1(UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_neighbor_teacher_workspace_v1(UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_neighbor_teacher_post_detail_v1(UUID, UUID, UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_neighbor_my_share_candidates_v1(UUID, INTEGER)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.run_neighbor_teacher_action_v1(UUID, TEXT, JSONB)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_student_home_bootstrap_v1()
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.set_neighbor_limited_class_v1(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_neighbor_admin_dashboard_v1(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_neighbor_teacher_workspace_v1(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_neighbor_teacher_post_detail_v1(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_neighbor_my_share_candidates_v1(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_neighbor_teacher_action_v1(UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_home_bootstrap_v1() TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
