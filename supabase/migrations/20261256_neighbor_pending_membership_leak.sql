-- 보안 점검(2026-09-07) 수정: 이웃 아지트에서 **승인 대기 학급이 공간 전체 자료를 받던** 문제.
--
-- `get_neighbor_teacher_workspace_v1` 은 자기 멤버십을 `status IN ('pending','active')` 로 찾은 뒤
-- 그 상태를 다시 보지 않고 응답을 만들었다. 그래서 호스트가 승인하기 전인 학급이
--   · 다른 참여 학급의 내부 class_id·학급명·참여 시각·매칭 가능 학생 수
--   · 발행된 글의 학생 **실명**·학급명·제목·본문 발췌(180자)
--   · 활동 제목·안내와 학급별 제출/검토/공개 수
-- 를 그대로 받았다. 화면(TeacherEntry.jsx)은 대기 카드만 그려 감췄을 뿐 서버가 이미 보내고 있었다.
-- 초대키를 손에 넣은 교사는 참여 신청만 하고 승인 없이 계속 조회할 수 있었다.
--
-- 다른 이웃 읽기 경로(assert_neighbor_participating_teacher_v1·assert_neighbor_student_access_v1)는
-- 모두 `status='active'` 를 요구한다. 이 함수만 빠져 있었다.
-- 고침: 승인 전에는 "어느 공간에 신청했는지"(공간 id·이름·내 상태)까지만 돌려준다.
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

    -- 2026-09-07 보안 점검: 승인 대기(pending) 학급에도 공간 전체 자료를 내주고 있었다.
    -- 호스트가 아직 승인하지 않았는데 다른 학급의 class_id·학급명·학생 수, 그리고 발행 글의
    -- 학생 실명·제목·본문 발췌(180자)까지 응답에 담겼다. 화면만 감추고 서버는 보내고 있었다.
    -- 승인 전에는 "무슨 공간에 신청했는지"까지만 알려 준다.
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
          AND shared.status IN ('published', 'hidden') AND public.neighbor_source_is_shareable_v1(post)
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

CREATE OR REPLACE FUNCTION public.get_neighbor_teacher_workspace_v1(p_class_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_base JSONB;
    v_space_id UUID;
BEGIN
    PERFORM public.assert_neighbor_teacher_class_v1(p_class_id);
    v_base := public.get_neighbor_teacher_workspace_core_20261237(p_class_id);
    -- 승인 대기 학급에는 활동 목록도 붙이지 않는다(활동 제목·안내·학급별 제출 수가 담긴다).
    v_space_id := CASE WHEN v_base #>> '{space,my_status}' = 'active'
        THEN NULLIF(v_base #>> '{space,id}', '')::UUID ELSE NULL END;
    RETURN v_base || jsonb_build_object(
        'activities', CASE WHEN v_space_id IS NULL THEN '[]'::JSONB
            ELSE public.get_neighbor_teacher_activities_v1(v_space_id, p_class_id) END
    );
END;
$function$;

NOTIFY pgrst,'reload schema';
COMMIT;
