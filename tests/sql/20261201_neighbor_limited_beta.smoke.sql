-- 제한 공개 원장과 실제 관리자·교사·학생 흐름을 모두 한 트랜잭션에서 확인한다.
DO $$
DECLARE
    v_table TEXT;
BEGIN
    FOREACH v_table IN ARRAY ARRAY['neighbor_limited_classes', 'neighbor_limited_class_events'] LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_tables
            WHERE schemaname = 'public' AND tablename = v_table AND rowsecurity
        ) THEN
            RAISE EXCEPTION 'limited beta table must exist with RLS: %', v_table;
        END IF;
        IF has_table_privilege('anon', format('public.%I', v_table), 'SELECT')
           OR has_table_privilege('authenticated', format('public.%I', v_table), 'SELECT')
           OR has_table_privilege('authenticated', format('public.%I', v_table), 'INSERT')
           OR has_table_privilege('service_role', format('public.%I', v_table), 'SELECT') THEN
            RAISE EXCEPTION 'limited beta table must not be directly accessible: %', v_table;
        END IF;
    END LOOP;

    IF has_function_privilege('authenticated', 'public.neighbor_class_is_released_v1(uuid)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.get_neighbor_admin_dashboard_core_20261201(uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.set_neighbor_limited_class_v1(uuid,boolean)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.set_neighbor_limited_class_v1(uuid,boolean)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.set_neighbor_limited_class_v1(uuid,boolean)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.get_neighbor_teacher_workspace_v1(uuid)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.get_neighbor_teacher_workspace_v1(uuid)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.get_neighbor_teacher_workspace_v1(uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.get_neighbor_teacher_post_detail_v1(uuid,uuid,uuid)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.get_neighbor_teacher_post_detail_v1(uuid,uuid,uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.get_neighbor_my_share_candidates_v1(uuid,integer)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.get_neighbor_my_share_candidates_v1(uuid,integer)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.run_neighbor_teacher_action_v1(uuid,text,jsonb)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.run_neighbor_teacher_action_v1(uuid,text,jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'limited beta RPC grants are incorrect';
    END IF;
END;
$$;

UPDATE public.neighbor_rollout_state SET mode = 'internal' WHERE singleton IS TRUE;
DELETE FROM public.neighbor_limited_classes;

WITH teacher_classes AS (
    SELECT DISTINCT ON (class.teacher_id)
        class.teacher_id,
        class.id AS class_id,
        student.id AS student_id,
        student.auth_id AS student_auth_id
    FROM public.classes class
    JOIN public.profiles profile
      ON profile.id = class.teacher_id
     AND profile.role = 'TEACHER'
     AND profile.is_approved IS TRUE
     AND profile.approval_revoked_at IS NULL
    JOIN public.students student
      ON student.class_id = class.id
     AND student.auth_id IS NOT NULL
     AND student.is_active IS DISTINCT FROM FALSE
     AND student.deleted_at IS NULL
    WHERE class.deleted_at IS NULL
      AND NOT EXISTS (
          SELECT 1 FROM public.neighbor_internal_test_classes internal_test
          WHERE internal_test.class_id = class.id
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.neighbor_space_classes membership
          WHERE membership.class_id = class.id
            AND membership.status IN ('pending', 'active')
      )
    ORDER BY class.teacher_id, class.created_at DESC, student.id
), ranked AS (
    SELECT *, row_number() OVER (ORDER BY teacher_id) AS position FROM teacher_classes
)
SELECT
    set_config('test.limited_teacher_1', COALESCE(max(teacher_id::TEXT) FILTER (WHERE position = 1), ''), TRUE),
    set_config('test.limited_class_1', COALESCE(max(class_id::TEXT) FILTER (WHERE position = 1), ''), TRUE),
    set_config('test.limited_student_1', COALESCE(max(student_id::TEXT) FILTER (WHERE position = 1), ''), TRUE),
    set_config('test.limited_student_auth_1', COALESCE(max(student_auth_id::TEXT) FILTER (WHERE position = 1), ''), TRUE),
    set_config('test.limited_teacher_2', COALESCE(max(teacher_id::TEXT) FILTER (WHERE position = 2), ''), TRUE),
    set_config('test.limited_class_2', COALESCE(max(class_id::TEXT) FILTER (WHERE position = 2), ''), TRUE),
    set_config('test.limited_student_2', COALESCE(max(student_id::TEXT) FILTER (WHERE position = 2), ''), TRUE),
    set_config('test.limited_student_auth_2', COALESCE(max(student_auth_id::TEXT) FILTER (WHERE position = 2), ''), TRUE),
    set_config('test.limited_teacher_3', COALESCE(max(teacher_id::TEXT) FILTER (WHERE position = 3), ''), TRUE),
    set_config('test.limited_class_3', COALESCE(max(class_id::TEXT) FILTER (WHERE position = 3), ''), TRUE)
FROM ranked;

SELECT set_config('test.limited_admin', COALESCE((
    SELECT profile.id::TEXT
    FROM public.profiles profile
    WHERE profile.role = 'ADMIN'
    ORDER BY profile.created_at
    LIMIT 1
), ''), TRUE);

SELECT set_config('test.limited_admin_class', gen_random_uuid()::TEXT, TRUE);
INSERT INTO public.classes (id, teacher_id, name)
VALUES (
    current_setting('test.limited_admin_class')::UUID,
    current_setting('test.limited_admin')::UUID,
    '관리자 본인 제한 공개 스모크'
);

DO $$
BEGIN
    IF current_setting('test.limited_admin') = ''
       OR current_setting('test.limited_teacher_3') = ''
       OR current_setting('test.limited_student_auth_1') = ''
       OR current_setting('test.limited_student_auth_2') = '' THEN
        RAISE EXCEPTION 'limited beta smoke requires one admin and three approved teacher classes with active students';
    END IF;
END;
$$;

-- JWT의 관리자 표기만 위조한 교사는 학급 선택 RPC를 사용할 수 없다.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.limited_teacher_1'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.limited_teacher_1'),
    'role', 'authenticated',
    'app_metadata', jsonb_build_object('role', 'ADMIN')
)::TEXT, TRUE);
DO $$
DECLARE
    v_blocked BOOLEAN := FALSE;
BEGIN
    BEGIN
        PERFORM public.set_neighbor_limited_class_v1(
            current_setting('test.limited_class_1')::UUID, TRUE
        );
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'forged admin selected a limited beta class';
    END IF;
END;
$$;
RESET ROLE;

-- 현재 실제 관리자가 직접 소유한 학급은 후보에 보이고 선택할 수 있다.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.limited_admin'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.limited_admin'), 'role', 'authenticated'
)::TEXT, TRUE);
DO $$
DECLARE
    v_result JSONB;
    v_dashboard JSONB;
BEGIN
    v_result := public.set_neighbor_limited_class_v1(
        current_setting('test.limited_admin_class')::UUID, TRUE
    );
    v_dashboard := public.get_neighbor_admin_dashboard_v1(NULL);
    IF v_result->>'selected' <> 'true'
       OR NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(v_dashboard->'limited_classes') candidate
            WHERE candidate->>'class_id' = current_setting('test.limited_admin_class')
              AND candidate->>'selected' = 'true'
       ) THEN
        RAISE EXCEPTION 'admin-owned class was not selectable: %, %', v_result, v_dashboard;
    END IF;
    PERFORM public.set_neighbor_limited_class_v1(
        current_setting('test.limited_admin_class')::UUID, FALSE
    );
END;
$$;
RESET ROLE;

-- 최대 8개 제한은 동시에 요청해도 서버 원장에서 강제한다.
DO $$
DECLARE
    v_class_ids UUID[] := ARRAY[
        gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
        gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()
    ];
BEGIN
    INSERT INTO public.classes (id, teacher_id, name)
    SELECT class_id, current_setting('test.limited_teacher_1')::UUID, '제한 공개 상한 스모크 ' || ordinality
    FROM unnest(v_class_ids) WITH ORDINALITY AS candidate(class_id, ordinality);
    PERFORM set_config('test.limited_limit_classes', array_to_string(v_class_ids, ','), TRUE);
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.limited_admin'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.limited_admin'), 'role', 'authenticated'
)::TEXT, TRUE);
DO $$
DECLARE
    v_class_id TEXT;
    v_index INTEGER := 0;
    v_ninth_blocked BOOLEAN := FALSE;
    v_result JSONB;
BEGIN
    FOREACH v_class_id IN ARRAY string_to_array(current_setting('test.limited_limit_classes'), ',') LOOP
        v_index := v_index + 1;
        BEGIN
            v_result := public.set_neighbor_limited_class_v1(v_class_id::UUID, TRUE);
        EXCEPTION WHEN check_violation THEN
            IF v_index = 9 THEN v_ninth_blocked := TRUE; ELSE RAISE; END IF;
        END;
    END LOOP;
    IF NOT v_ninth_blocked OR (v_result->>'selected_count')::INTEGER <> 8 THEN
        RAISE EXCEPTION 'limited beta class maximum was not enforced';
    END IF;
END;
$$;
RESET ROLE;
DELETE FROM public.neighbor_limited_classes;

-- 실제 관리자만 두 학급을 선택하고, 한 학급만으로는 제한 공개를 시작하지 못한다.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.limited_admin'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.limited_admin'), 'role', 'authenticated'
)::TEXT, TRUE);
DO $$
DECLARE
    v_blocked BOOLEAN := FALSE;
    v_result JSONB;
    v_dashboard JSONB;
BEGIN
    PERFORM public.set_neighbor_limited_class_v1(current_setting('test.limited_class_1')::UUID, TRUE);
    BEGIN
        PERFORM public.change_neighbor_rollout_v1('limited_beta', '');
    EXCEPTION WHEN object_not_in_prerequisite_state THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'limited beta opened with fewer than two classes';
    END IF;

    PERFORM public.set_neighbor_limited_class_v1(current_setting('test.limited_class_2')::UUID, TRUE);
    v_result := public.change_neighbor_rollout_v1('limited_beta', '');
    IF v_result->>'mode' <> 'limited_beta' THEN
        RAISE EXCEPTION 'limited beta rollout failed: %', v_result;
    END IF;
    v_dashboard := public.get_neighbor_admin_dashboard_v1(NULL);
    IF (v_dashboard->>'limited_class_count')::INTEGER <> 2
       OR (v_dashboard->>'limited_class_max')::INTEGER <> 8
       OR jsonb_array_length(v_dashboard->'limited_classes') < 2 THEN
        RAISE EXCEPTION 'limited beta dashboard contract failed: %', v_dashboard;
    END IF;
END;
$$;
RESET ROLE;

-- 선택하지 않은 세 번째 교사는 실제 작업 공간 RPC를 사용할 수 없다.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.limited_teacher_3'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.limited_teacher_3'), 'role', 'authenticated'
)::TEXT, TRUE);
DO $$
DECLARE
    v_blocked BOOLEAN := FALSE;
BEGIN
    BEGIN
        PERFORM public.get_neighbor_teacher_workspace_v1(current_setting('test.limited_class_3')::UUID);
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'unselected teacher entered limited beta workspace';
    END IF;
END;
$$;
RESET ROLE;

-- 선택된 두 교사는 작업 묶음 RPC만으로 공간 생성→초대→신청→승인→학생 공개를 끝낸다.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.limited_teacher_1'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.limited_teacher_1'), 'role', 'authenticated'
)::TEXT, TRUE);
DO $$
DECLARE
    v_result JSONB;
BEGIN
    v_result := public.run_neighbor_teacher_action_v1(
        current_setting('test.limited_class_1')::UUID,
        'create_space',
        jsonb_build_object(
            'name', '제한 공개 롤백 공간',
            'public_class_name', '첫 번째 학급',
            'description', '실제 학급 제한 공개 검증'
        )
    );
    IF v_result #>> '{workspace,space,my_role}' <> 'host' THEN
        RAISE EXCEPTION 'limited host workspace was not returned: %', v_result;
    END IF;
    PERFORM set_config('test.limited_space', v_result #>> '{action_result,space_id}', TRUE);

    v_result := public.run_neighbor_teacher_action_v1(
        current_setting('test.limited_class_1')::UUID,
        'create_invite',
        jsonb_build_object('space_id', current_setting('test.limited_space'))
    );
    IF v_result #>> '{action_result,invite_key}' IS NULL THEN
        RAISE EXCEPTION 'limited host invite was not returned: %', v_result;
    END IF;
    PERFORM set_config('test.limited_invite', v_result #>> '{action_result,invite_key}', TRUE);
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.limited_teacher_2'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.limited_teacher_2'), 'role', 'authenticated'
)::TEXT, TRUE);
DO $$
DECLARE
    v_result JSONB;
BEGIN
    v_result := public.run_neighbor_teacher_action_v1(
        current_setting('test.limited_class_2')::UUID,
        'join_space',
        jsonb_build_object(
            'invite_key', current_setting('test.limited_invite'),
            'public_class_name', '두 번째 학급'
        )
    );
    IF v_result #>> '{workspace,space,my_status}' <> 'pending' THEN
        RAISE EXCEPTION 'limited guest join was not returned: %', v_result;
    END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.limited_teacher_1'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.limited_teacher_1'), 'role', 'authenticated'
)::TEXT, TRUE);
DO $$
DECLARE
    v_result JSONB;
BEGIN
    v_result := public.run_neighbor_teacher_action_v1(
        current_setting('test.limited_class_1')::UUID,
        'review_join',
        jsonb_build_object(
            'space_id', current_setting('test.limited_space'),
            'target_class_id', current_setting('test.limited_class_2'),
            'approve', TRUE
        )
    );
    IF jsonb_array_length(v_result #> '{workspace,memberships}') <> 2 THEN
        RAISE EXCEPTION 'limited host approval workspace is stale: %', v_result;
    END IF;
    v_result := public.run_neighbor_teacher_action_v1(
        current_setting('test.limited_class_1')::UUID,
        'set_access',
        jsonb_build_object('space_id', current_setting('test.limited_space'), 'enabled', TRUE)
    );
    IF (v_result #>> '{workspace,space,student_access_enabled}')::BOOLEAN IS NOT TRUE THEN
        RAISE EXCEPTION 'limited host student access was not enabled: %', v_result;
    END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.limited_teacher_2'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.limited_teacher_2'), 'role', 'authenticated'
)::TEXT, TRUE);
SELECT public.run_neighbor_teacher_action_v1(
    current_setting('test.limited_class_2')::UUID,
    'set_access',
    jsonb_build_object('space_id', current_setting('test.limited_space'), 'enabled', TRUE)
);
RESET ROLE;

-- 담임은 자기 학급의 제출 완료 일반 글을 불러와 바로 전시하지만 다른 학급 글은 올릴 수 없다.
WITH inserted AS (
    INSERT INTO public.writing_missions (
        class_id, teacher_id, title, guide, genre, mission_type,
        min_chars, min_paragraphs, base_reward, bonus_threshold,
        bonus_reward, allow_comments, guide_questions, tags, is_archived
    )
    SELECT class.id, class.teacher_id, '교사 직접 전시 확인', '제출 글을 직접 전시합니다.', '글쓰기', '글쓰기',
        1, 1, 0, 0, 0, FALSE, '[]'::JSONB, '[]'::JSONB, FALSE
    FROM public.classes class
    WHERE class.id = current_setting('test.limited_class_1')::UUID
    RETURNING id
)
SELECT set_config('test.neighbor_direct_mission', id::TEXT, TRUE) FROM inserted;
WITH inserted AS (
    INSERT INTO public.student_posts (
        mission_id, student_id, class_id, title, content, is_submitted, first_submitted_at
    ) VALUES (
        current_setting('test.neighbor_direct_mission')::UUID,
        current_setting('test.limited_student_1')::UUID,
        current_setting('test.limited_class_1')::UUID,
        '선생님이 소개하는 글', '학생이 제출했고 선생님이 직접 이웃에게 소개할 글입니다.', TRUE, NOW()
    ) RETURNING id
)
SELECT set_config('test.neighbor_direct_post', id::TEXT, TRUE) FROM inserted;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.limited_teacher_1'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.limited_teacher_1'), 'role', 'authenticated'
)::TEXT, TRUE);
DO $$
DECLARE
    v_candidates JSONB;
    v_result JSONB;
BEGIN
    v_candidates := public.get_neighbor_teacher_share_candidates_v1(
        current_setting('test.limited_space')::UUID,
        current_setting('test.limited_class_1')::UUID,
        100
    );
    IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_candidates->'items') item
        WHERE item->>'post_id' = current_setting('test.neighbor_direct_post')
    ) THEN
        RAISE EXCEPTION 'teacher direct-share candidate missing: %', v_candidates;
    END IF;
    v_result := public.run_neighbor_teacher_action_v1(
        current_setting('test.limited_class_1')::UUID, 'publish_gallery_post',
        jsonb_build_object(
            'space_id', current_setting('test.limited_space'),
            'post_id', current_setting('test.neighbor_direct_post')
        )
    );
    IF v_result #>> '{action_result,status}' <> 'published' THEN
        RAISE EXCEPTION 'teacher direct-share publish failed: %', v_result;
    END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.limited_teacher_2'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.limited_teacher_2'), 'role', 'authenticated'
)::TEXT, TRUE);
DO $$
DECLARE v_blocked BOOLEAN := FALSE;
BEGIN
    BEGIN
        PERFORM public.run_neighbor_teacher_action_v1(
            current_setting('test.limited_class_2')::UUID, 'publish_gallery_post',
            jsonb_build_object(
                'space_id', current_setting('test.limited_space'),
                'post_id', current_setting('test.neighbor_direct_post')
            )
        );
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'counterpart teacher published another class post';
    END IF;
END;
$$;
RESET ROLE;

-- 한 공간 안에 공동 주제와 글짝 교환을 열고, 기존 과제·제출 글을 통해 실제 학생 흐름을 확인한다.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.limited_teacher_1'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.limited_teacher_1'), 'role', 'authenticated'
)::TEXT, TRUE);
DO $$
DECLARE
    v_result JSONB;
BEGIN
    v_result := public.run_neighbor_teacher_action_v1(
        current_setting('test.limited_class_1')::UUID,
        'create_activity',
        jsonb_build_object(
            'space_id', current_setting('test.limited_space'),
            'type', 'topic', 'title', '같이 보는 우리 동네',
            'prompt', '우리 동네에서 소개하고 싶은 장소를 써 봅시다.'
        )
    );
    PERFORM set_config('test.neighbor_topic', v_result #>> '{action_result,activity_id}', TRUE);
    v_result := public.run_neighbor_teacher_action_v1(
        current_setting('test.limited_class_1')::UUID,
        'create_activity',
        jsonb_build_object(
            'space_id', current_setting('test.limited_space'),
            'type', 'exchange', 'title', '나를 소개하는 편지',
            'prompt', '글짝에게 내가 좋아하는 것을 소개해 봅시다.',
            'exchange_class_ids', jsonb_build_array(
                current_setting('test.limited_class_1'), current_setting('test.limited_class_2')
            ),
            'exchange_share_scope', 'space'
        )
    );
    PERFORM set_config('test.neighbor_exchange', v_result #>> '{action_result,activity_id}', TRUE);
    IF jsonb_array_length(v_result #> '{workspace,activities}') <> 2 THEN
        RAISE EXCEPTION 'teacher activity workspace was stale: %', v_result;
    END IF;
END;
$$;
RESET ROLE;

-- 제안 직후 과제는 보관 상태이고 학생에게 보이지 않는다. 상대 학급 교사가 먼저 활동안을 승인한다.
DO $$
BEGIN
    IF (SELECT count(*) FROM public.neighbor_activities activity
        WHERE activity.id IN (
            current_setting('test.neighbor_topic')::UUID,
            current_setting('test.neighbor_exchange')::UUID
        ) AND activity.status = 'pending_approval') <> 2
       OR (SELECT count(*) FROM public.neighbor_activity_approvals approval
           WHERE approval.activity_id IN (
               current_setting('test.neighbor_topic')::UUID,
               current_setting('test.neighbor_exchange')::UUID
           ) AND approval.class_id = current_setting('test.limited_class_2')::UUID
             AND approval.status = 'pending') <> 2
       OR (SELECT count(*) FROM public.writing_missions mission
           JOIN public.neighbor_activity_classes link ON link.mission_id = mission.id
           WHERE link.activity_id IN (
               current_setting('test.neighbor_topic')::UUID,
               current_setting('test.neighbor_exchange')::UUID
           ) AND mission.is_archived IS TRUE) <> 4 THEN
        RAISE EXCEPTION 'activity proposal was visible before counterpart approval';
    END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.limited_student_auth_1'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.limited_student_auth_1'), 'role', 'authenticated'
)::TEXT, TRUE);
DO $$
DECLARE
    v_gallery JSONB;
    v_blocked BOOLEAN := FALSE;
BEGIN
    v_gallery := public.get_neighbor_space_feed_v1(current_setting('test.limited_space')::UUID, 20, NULL, NULL);
    BEGIN
        PERFORM public.get_neighbor_activity_feed_v1(
            current_setting('test.limited_space')::UUID,
            current_setting('test.neighbor_topic')::UUID, 20, NULL, NULL
        );
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := TRUE;
    END;
    IF jsonb_array_length(v_gallery->'activities') <> 0 OR NOT v_blocked THEN
        RAISE EXCEPTION 'pending activity leaked to student: %, %', v_gallery, v_blocked;
    END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.limited_teacher_2'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.limited_teacher_2'), 'role', 'authenticated'
)::TEXT, TRUE);
DO $$
DECLARE
    v_result JSONB;
BEGIN
    v_result := public.run_neighbor_teacher_action_v1(
        current_setting('test.limited_class_2')::UUID, 'review_activity',
        jsonb_build_object('space_id', current_setting('test.limited_space'),
            'activity_id', current_setting('test.neighbor_topic'), 'approve', TRUE)
    );
    IF v_result #>> '{action_result,status}' <> 'open' THEN
        RAISE EXCEPTION 'topic activity did not open after counterpart approval: %', v_result;
    END IF;
    v_result := public.run_neighbor_teacher_action_v1(
        current_setting('test.limited_class_2')::UUID, 'review_activity',
        jsonb_build_object('space_id', current_setting('test.limited_space'),
            'activity_id', current_setting('test.neighbor_exchange'), 'approve', TRUE)
    );
    IF v_result #>> '{action_result,status}' <> 'open' THEN
        RAISE EXCEPTION 'exchange activity did not open after counterpart approval: %', v_result;
    END IF;
END;
$$;
RESET ROLE;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.writing_missions mission
        JOIN public.neighbor_activity_classes link ON link.mission_id = mission.id
        WHERE link.activity_id = current_setting('test.neighbor_topic')::UUID
          AND mission.is_archived IS TRUE
    ) OR EXISTS (
        SELECT 1 FROM public.writing_missions mission
        JOIN public.neighbor_activity_classes link ON link.mission_id = mission.id
        WHERE link.activity_id = current_setting('test.neighbor_exchange')::UUID
          AND mission.is_archived IS FALSE
    ) THEN
        RAISE EXCEPTION 'activity approval did not preserve the exchange matching gate';
    END IF;
END;
$$;

-- 호스트가 두 학급 학생 명단으로 매칭안을 만들고 상대 교사가 승인해야 글짝 과제가 열린다.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.limited_teacher_1'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.limited_teacher_1'), 'role', 'authenticated'
)::TEXT, TRUE);
DO $$
DECLARE
    v_roster JSONB;
    v_students_1 JSONB;
    v_students_2 JSONB;
    v_larger JSONB;
    v_smaller JSONB;
    v_pairs JSONB := '[]'::JSONB;
    v_index INTEGER;
    v_result JSONB;
BEGIN
    v_roster := public.get_neighbor_exchange_roster_v1(
        current_setting('test.limited_space')::UUID,
        current_setting('test.limited_class_1')::UUID,
        current_setting('test.neighbor_exchange')::UUID
    );
    SELECT class_item->'students' INTO v_students_1
    FROM jsonb_array_elements(v_roster->'classes') class_item
    WHERE class_item->>'class_id' = current_setting('test.limited_class_1')
    LIMIT 1;
    SELECT class_item->'students' INTO v_students_2
    FROM jsonb_array_elements(v_roster->'classes') class_item
    WHERE class_item->>'class_id' = current_setting('test.limited_class_2')
    LIMIT 1;
    IF jsonb_array_length(v_students_1) >= jsonb_array_length(v_students_2) THEN
        v_larger := v_students_1;
        v_smaller := v_students_2;
    ELSE
        v_larger := v_students_2;
        v_smaller := v_students_1;
    END IF;
    IF jsonb_array_length(v_smaller) = 0
       OR jsonb_array_length(v_larger) > jsonb_array_length(v_smaller) * 2
       OR v_roster::TEXT ~ 'student_id' THEN
        RAISE EXCEPTION 'exchange roster exposed ids or missed students: %', v_roster;
    END IF;
    FOR v_index IN 0..jsonb_array_length(v_larger) - 1 LOOP
        v_pairs := v_pairs || jsonb_build_array(jsonb_build_object(
            'student_key', v_larger->v_index->>'student_key',
            'partner_key', v_smaller->(v_index % jsonb_array_length(v_smaller))->>'student_key'
        ));
    END LOOP;
    v_result := public.run_neighbor_teacher_action_v1(
        current_setting('test.limited_class_1')::UUID, 'propose_exchange_matches',
        jsonb_build_object(
            'space_id', current_setting('test.limited_space'),
            'activity_id', current_setting('test.neighbor_exchange'),
            'pairs', v_pairs
        )
    );
    IF v_result #>> '{action_result,status}' <> 'matching_review' THEN
        RAISE EXCEPTION 'exchange match proposal failed: %', v_result;
    END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.limited_teacher_2'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.limited_teacher_2'), 'role', 'authenticated'
)::TEXT, TRUE);
DO $$
DECLARE v_result JSONB;
BEGIN
    v_result := public.run_neighbor_teacher_action_v1(
        current_setting('test.limited_class_2')::UUID, 'review_exchange_matches',
        jsonb_build_object(
            'space_id', current_setting('test.limited_space'),
            'activity_id', current_setting('test.neighbor_exchange'),
            'approve', TRUE
        )
    );
    IF v_result #>> '{action_result,status}' <> 'matched' THEN
        RAISE EXCEPTION 'counterpart match approval did not open missions: %', v_result;
    END IF;
END;
$$;
RESET ROLE;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.writing_missions mission
        JOIN public.neighbor_activity_classes link ON link.mission_id = mission.id
        WHERE link.activity_id = current_setting('test.neighbor_exchange')::UUID
          AND mission.is_archived IS TRUE
    ) THEN
        RAISE EXCEPTION 'approved exchange missions remained archived';
    END IF;
END;
$$;

SELECT set_config('test.neighbor_topic_mission_1', (
    SELECT link.mission_id::TEXT FROM public.neighbor_activity_classes link
    WHERE link.activity_id = current_setting('test.neighbor_topic')::UUID
      AND link.class_id = current_setting('test.limited_class_1')::UUID
), TRUE);
SELECT set_config('test.neighbor_topic_mission_2', (
    SELECT link.mission_id::TEXT FROM public.neighbor_activity_classes link
    WHERE link.activity_id = current_setting('test.neighbor_topic')::UUID
      AND link.class_id = current_setting('test.limited_class_2')::UUID
), TRUE);
SELECT set_config('test.neighbor_exchange_mission_1', (
    SELECT link.mission_id::TEXT FROM public.neighbor_activity_classes link
    WHERE link.activity_id = current_setting('test.neighbor_exchange')::UUID
      AND link.class_id = current_setting('test.limited_class_1')::UUID
), TRUE);
SELECT set_config('test.neighbor_exchange_mission_2', (
    SELECT link.mission_id::TEXT FROM public.neighbor_activity_classes link
    WHERE link.activity_id = current_setting('test.neighbor_exchange')::UUID
      AND link.class_id = current_setting('test.limited_class_2')::UUID
), TRUE);

INSERT INTO public.student_posts (mission_id, student_id, class_id, title, content, is_submitted, first_submitted_at)
VALUES
    (current_setting('test.neighbor_topic_mission_1')::UUID, current_setting('test.limited_student_1')::UUID,
        current_setting('test.limited_class_1')::UUID, '첫 학급의 장소', '첫 학급 학생이 소개하는 우리 동네 장소입니다.', TRUE, NOW()),
    (current_setting('test.neighbor_topic_mission_2')::UUID, current_setting('test.limited_student_2')::UUID,
        current_setting('test.limited_class_2')::UUID, '둘째 학급의 장소', '둘째 학급 학생이 소개하는 우리 동네 장소입니다.', TRUE, NOW()),
    (current_setting('test.neighbor_exchange_mission_1')::UUID, current_setting('test.limited_student_1')::UUID,
        current_setting('test.limited_class_1')::UUID, '첫 번째 소개 편지', '나는 책 읽기와 산책을 좋아합니다.', TRUE, NOW()),
    (current_setting('test.neighbor_exchange_mission_2')::UUID, current_setting('test.limited_student_2')::UUID,
        current_setting('test.limited_class_2')::UUID, '두 번째 소개 편지', '나는 그림 그리기와 운동을 좋아합니다.', TRUE, NOW());

-- 공동 주제와 승인된 글짝 교환 모두 학생이 제출 뒤 담임 검토를 요청한다.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.limited_student_auth_1'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.limited_student_auth_1'), 'role', 'authenticated'
)::TEXT, TRUE);
DO $$
DECLARE v_result JSONB;
BEGIN
    v_result := public.request_neighbor_activity_post_v1(
        current_setting('test.limited_space')::UUID, current_setting('test.neighbor_topic')::UUID
    );
    PERFORM set_config('test.neighbor_topic_shared_1', v_result->>'shared_post_id', TRUE);
    v_result := public.request_neighbor_activity_post_v1(
        current_setting('test.limited_space')::UUID, current_setting('test.neighbor_exchange')::UUID
    );
    PERFORM set_config('test.neighbor_exchange_shared_1', v_result->>'shared_post_id', TRUE);
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.limited_student_auth_2'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.limited_student_auth_2'), 'role', 'authenticated'
)::TEXT, TRUE);
DO $$
DECLARE v_result JSONB;
BEGIN
    v_result := public.request_neighbor_activity_post_v1(
        current_setting('test.limited_space')::UUID, current_setting('test.neighbor_topic')::UUID
    );
    PERFORM set_config('test.neighbor_topic_shared_2', v_result->>'shared_post_id', TRUE);
    v_result := public.request_neighbor_activity_post_v1(
        current_setting('test.limited_space')::UUID, current_setting('test.neighbor_exchange')::UUID
    );
    PERFORM set_config('test.neighbor_exchange_shared_2', v_result->>'shared_post_id', TRUE);
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.limited_teacher_1'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.limited_teacher_1'), 'role', 'authenticated'
)::TEXT, TRUE);
DO $$
DECLARE
    v_result JSONB;
    v_shared_id UUID;
BEGIN
    v_shared_id := current_setting('test.neighbor_topic_shared_1')::UUID;
    PERFORM public.run_neighbor_teacher_action_v1(
        current_setting('test.limited_class_1')::UUID, 'review_post',
        jsonb_build_object('space_id', current_setting('test.limited_space'),
            'shared_post_id', v_shared_id, 'decision', 'publish', 'review_note', '')
    );
    PERFORM public.run_neighbor_teacher_action_v1(
        current_setting('test.limited_class_1')::UUID, 'review_post',
        jsonb_build_object('space_id', current_setting('test.limited_space'),
            'shared_post_id', current_setting('test.neighbor_exchange_shared_1'),
            'decision', 'publish', 'review_note', '')
    );
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.limited_teacher_2'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.limited_teacher_2'), 'role', 'authenticated'
)::TEXT, TRUE);
DO $$
DECLARE
    v_shared JSONB;
    v_workspace JSONB;
BEGIN
    v_workspace := public.get_neighbor_teacher_workspace_v1(current_setting('test.limited_class_2')::UUID);
    FOR v_shared IN SELECT item FROM jsonb_array_elements(v_workspace->'review_posts') item
    LOOP
        PERFORM public.run_neighbor_teacher_action_v1(
            current_setting('test.limited_class_2')::UUID, 'review_post',
            jsonb_build_object('space_id', current_setting('test.limited_space'),
                'shared_post_id', v_shared->>'shared_post_id', 'decision', 'publish', 'review_note', '')
        );
    END LOOP;
END;
$$;
RESET ROLE;

-- 배정된 학생은 실명으로 자기 글과 상대 글만 읽고, 상대 글에 댓글을 남길 수 있다.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.limited_student_auth_1'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.limited_student_auth_1'), 'role', 'authenticated'
)::TEXT, TRUE);
DO $$
DECLARE
    v_gallery JSONB;
    v_feed JSONB;
    v_detail JSONB;
    v_partner_post UUID;
    v_partner_name TEXT;
BEGIN
    v_gallery := public.get_neighbor_space_feed_v1(current_setting('test.limited_space')::UUID, 20, NULL, NULL);
    v_feed := public.get_neighbor_activity_feed_v1(
        current_setting('test.limited_space')::UUID,
        current_setting('test.neighbor_exchange')::UUID, 20, NULL, NULL
    );
    SELECT (item->>'shared_post_id')::UUID, item->>'author_name'
    INTO v_partner_post, v_partner_name
    FROM jsonb_array_elements(v_feed->'items') item
    WHERE (item->>'is_mine')::BOOLEAN IS FALSE
    LIMIT 1;
    v_detail := public.get_neighbor_shared_post_v1(current_setting('test.limited_space')::UUID, v_partner_post);
    PERFORM public.save_neighbor_comment_v1(
        current_setting('test.limited_space')::UUID, v_partner_post, '소개해 줘서 고마워!', 'save'
    );
    IF jsonb_array_length(v_gallery->'activities') <> 2
       OR jsonb_array_length(v_feed->'items') <> 2
       OR v_detail->>'author_name' <> v_partner_name THEN
        RAISE EXCEPTION 'student activity feed or real name failed: %, %, %', v_gallery, v_feed, v_detail;
    END IF;
END;
$$;
RESET ROLE;

-- 게스트 교사도 제안할 수 있지만 상대 교사가 거절하면 보관 과제와 활동은 학생에게 보이지 않는다.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.limited_teacher_1'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.limited_teacher_1'), 'role', 'authenticated'
)::TEXT, TRUE);
SELECT public.run_neighbor_teacher_action_v1(
    current_setting('test.limited_class_1')::UUID, 'close_activity',
    jsonb_build_object('space_id', current_setting('test.limited_space'),
        'activity_id', current_setting('test.neighbor_topic'))
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.limited_teacher_2'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.limited_teacher_2'), 'role', 'authenticated'
)::TEXT, TRUE);
DO $$
DECLARE v_result JSONB;
BEGIN
    v_result := public.run_neighbor_teacher_action_v1(
        current_setting('test.limited_class_2')::UUID, 'create_activity',
        jsonb_build_object('space_id', current_setting('test.limited_space'),
            'type', 'topic', 'title', '거절 확인용 주제', 'prompt', '학생에게 보이면 안 됩니다.')
    );
    PERFORM set_config('test.neighbor_rejected_topic', v_result #>> '{action_result,activity_id}', TRUE);
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.limited_teacher_1'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.limited_teacher_1'), 'role', 'authenticated'
)::TEXT, TRUE);
SELECT public.run_neighbor_teacher_action_v1(
    current_setting('test.limited_class_1')::UUID, 'review_activity',
    jsonb_build_object('space_id', current_setting('test.limited_space'),
        'activity_id', current_setting('test.neighbor_rejected_topic'), 'approve', FALSE)
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.limited_student_auth_1'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.limited_student_auth_1'), 'role', 'authenticated'
)::TEXT, TRUE);
DO $$
DECLARE v_gallery JSONB;
BEGIN
    v_gallery := public.get_neighbor_space_feed_v1(current_setting('test.limited_space')::UUID, 20, NULL, NULL);
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_gallery->'activities') item
        WHERE item->>'id' = current_setting('test.neighbor_rejected_topic')
    ) THEN
        RAISE EXCEPTION 'rejected activity leaked into student summary: %', v_gallery;
    END IF;
END;
$$;
RESET ROLE;

-- 선택 학급 학생만 bootstrap과 지연 공개 후보 RPC를 사용할 수 있다.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.limited_student_auth_1'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.limited_student_auth_1'), 'role', 'authenticated'
)::TEXT, TRUE);
DO $$
DECLARE
    v_home JSONB;
    v_candidates JSONB;
BEGIN
    v_home := public.get_student_home_bootstrap_v1();
    v_candidates := public.get_neighbor_my_share_candidates_v1(
        current_setting('test.limited_space')::UUID, 500
    );
    IF (v_home #>> '{home,neighbor_agit_available}')::BOOLEAN IS NOT TRUE
       OR v_home #>> '{home,neighbor_agit_space_id}' <> current_setting('test.limited_space')
       OR (v_candidates->>'max_rows')::INTEGER <> 50
       OR jsonb_array_length(v_candidates->'items') > 50 THEN
        RAISE EXCEPTION 'limited student bootstrap or share candidates failed: %, %', v_home, v_candidates;
    END IF;
END;
$$;
RESET ROLE;

-- 제한 공개 중에는 두 학급 아래로 줄일 수 없고, 중지한 뒤 해제하면 학생 공개와 모듈이 함께 꺼진다.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.limited_admin'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.limited_admin'), 'role', 'authenticated'
)::TEXT, TRUE);
DO $$
DECLARE
    v_blocked BOOLEAN := FALSE;
BEGIN
    BEGIN
        PERFORM public.set_neighbor_limited_class_v1(current_setting('test.limited_class_2')::UUID, FALSE);
    EXCEPTION WHEN object_not_in_prerequisite_state THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'limited rollout dropped below two selected classes';
    END IF;

    PERFORM public.change_neighbor_rollout_v1('internal', '');
    PERFORM public.set_neighbor_limited_class_v1(current_setting('test.limited_class_2')::UUID, FALSE);
END;
$$;
RESET ROLE;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.neighbor_space_classes membership
        WHERE membership.space_id = current_setting('test.limited_space')::UUID
          AND membership.class_id = current_setting('test.limited_class_2')::UUID
          AND membership.student_access_enabled IS TRUE
    ) OR EXISTS (
        SELECT 1 FROM public.classes class
        WHERE class.id = current_setting('test.limited_class_2')::UUID
          AND 'neighbor-agit' = ANY(COALESCE(class.enabled_modules, ARRAY[]::TEXT[]))
    ) OR NOT EXISTS (
        SELECT 1 FROM public.neighbor_limited_class_events event
        WHERE event.class_id = current_setting('test.limited_class_2')::UUID
          AND event.action = 'disabled'
          AND event.changed_by = current_setting('test.limited_admin')::UUID
    ) THEN
        RAISE EXCEPTION 'limited class removal did not close access or record audit history';
    END IF;
END;
$$;
