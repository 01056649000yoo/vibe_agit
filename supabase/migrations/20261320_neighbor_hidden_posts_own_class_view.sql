-- 비공개(숨김)한 글은 그 글을 올린 학급에게만 보인다(2026-09-19).
--
-- 지금까지 교사 public_posts 는 모든 학급의 published+hidden 을 담아, 다른 반이 비공개한 글까지
-- 내 "공개 글 관리" 목록에 보였다. 비공개한 글은 남의 목록에서 사라져야 한다.
-- 다만 자기 반이 숨긴 글은 "다시 공개"를 위해 자기에게만 남긴다.
--   → published 는 모두에게, hidden 은 shared.class_id = 내 학급 일 때만.
-- 20261315(주제 정보 추가) 사본에서 public_posts WHERE 한 줄만 좁힌다.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_neighbor_teacher_workspace_core_20261237(p_class_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    IF v_membership.status <> 'active' THEN
        SELECT space.* INTO v_space FROM public.neighbor_spaces space WHERE space.id = v_membership.space_id;
        RETURN jsonb_build_object(
            'version', 1,
            'rollout_mode', v_mode,
            'class', jsonb_build_object(
                'id', p_class_id, 'name', v_class_name, 'module_enabled', v_module_enabled
            ),
            'space', jsonb_build_object(
                'id', v_space.id, 'name', v_space.name, 'my_role', v_membership.role,
                'my_status', v_membership.status, 'status', v_space.status
            ),
            'memberships', '[]'::JSONB,
            'review_posts', '[]'::JSONB,
            'public_posts', '[]'::JSONB,
            'review_total', 0
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
        'joined_at', membership.joined_at,
        'matchable_student_count', (SELECT count(*) FROM public.students student
            WHERE student.class_id = membership.class_id AND student.auth_id IS NOT NULL
              AND student.is_active IS DISTINCT FROM FALSE AND student.deleted_at IS NULL)
    ) ORDER BY membership.role, membership.requested_at, membership.class_id), '[]'::JSONB)
    INTO v_memberships
    FROM public.neighbor_space_classes membership
    WHERE membership.space_id = v_space.id
      AND membership.status IN ('pending', 'active');

    SELECT COALESCE(jsonb_agg(post_row.item ORDER BY post_row.requested_at ASC, post_row.shared_post_id ASC), '[]'::JSONB)
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
          AND shared.status = 'pending' AND public.neighbor_source_is_shareable_v1(post)
        ORDER BY shared.requested_at ASC, shared.id ASC
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
                'mission_id', post.mission_id,
                'mission_title', COALESCE(mission.title, '자율 글'),
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
        LEFT JOIN public.writing_missions mission
          ON mission.id = post.mission_id AND mission.class_id = post.class_id
        WHERE shared.space_id = v_space.id
          -- 공개 글은 모두에게, 숨긴 글은 그 글을 올린 학급에게만(다시 공개용).
          AND (shared.status = 'published' OR (shared.status = 'hidden' AND shared.class_id = p_class_id))
          AND public.neighbor_source_is_shareable_v1(post)
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
        'review_total', (SELECT count(*) FROM public.neighbor_shared_posts shared
            JOIN public.student_posts post ON post.id = shared.post_id AND post.class_id = shared.class_id
            WHERE shared.space_id = v_space.id AND shared.class_id = p_class_id
              AND shared.status = 'pending' AND public.neighbor_source_is_shareable_v1(post)),
        'public_posts', v_public_posts
    );
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
