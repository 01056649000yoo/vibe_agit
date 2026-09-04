DO $$
DECLARE
    v_table TEXT;
    v_tables TEXT[] := ARRAY[
        'neighbor_rollout_state', 'neighbor_rollout_events', 'neighbor_spaces', 'neighbor_space_classes',
        'neighbor_invites', 'neighbor_invite_attempts', 'neighbor_shared_posts', 'neighbor_comments',
        'neighbor_reactions', 'neighbor_saves', 'neighbor_feed_visits', 'neighbor_space_events'
    ];
BEGIN
    FOREACH v_table IN ARRAY v_tables LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_tables
            WHERE schemaname = 'public' AND tablename = v_table AND rowsecurity
        ) THEN
            RAISE EXCEPTION 'neighbor table must exist with RLS enabled: %', v_table;
        END IF;
        IF has_table_privilege('anon', format('public.%I', v_table), 'SELECT')
           OR has_table_privilege('authenticated', format('public.%I', v_table), 'SELECT')
           OR has_table_privilege('authenticated', format('public.%I', v_table), 'INSERT')
           OR has_table_privilege('service_role', format('public.%I', v_table), 'SELECT') THEN
            RAISE EXCEPTION 'neighbor table must not be directly accessible: %', v_table;
        END IF;
    END LOOP;

    -- 새 DB의 기본값이 internal인지는 정적 검사가 원본 마이그레이션에서 확인한다.
    -- 이 역할 스모크는 운영 DB에서도 다시 돌기 때문에 이미 limited/public/paused로 전환된
    -- 합법적인 운영 상태를 internal로 되돌리라고 요구하면 안 된다.
    IF (SELECT mode FROM public.neighbor_rollout_state WHERE singleton)
           NOT IN ('internal', 'limited_beta', 'public_beta', 'paused')
       OR (SELECT count(*) FROM public.neighbor_rollout_state) <> 1 THEN
        RAISE EXCEPTION 'neighbor rollout must have one valid state row';
    END IF;

    IF has_function_privilege('authenticated', 'public.guard_neighbor_space_class_v1()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.validate_neighbor_space_host_v1()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.guard_neighbor_shared_post_source_v1()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.assert_neighbor_teacher_class_v1(uuid)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.assert_neighbor_participating_teacher_v1(uuid,uuid)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.assert_neighbor_student_access_v1(uuid)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.assert_neighbor_student_post_access_v1(uuid,uuid)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.assert_neighbor_admin_v1()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.neighbor_acceptance_ready_v1(jsonb)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.neighbor_public_author_name_v1(uuid,uuid)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.sync_neighbor_shared_post_source_v1()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.generate_neighbor_invite_key_v1()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.get_student_home_bootstrap_core_20261199()', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.create_neighbor_space_v1(uuid,text,text,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'neighbor trigger helpers must not be client RPCs';
    END IF;
    IF has_function_privilege('anon', 'public.create_neighbor_space_v1(uuid,text,text,text)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.create_neighbor_space_v1(uuid,text,text,text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.request_neighbor_join_v1(text,uuid,text)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.request_neighbor_join_v1(text,uuid,text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.request_neighbor_post_share_v1(uuid,uuid)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.request_neighbor_post_share_v1(uuid,uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.get_neighbor_space_feed_v1(uuid,integer,timestamp with time zone,uuid)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.get_neighbor_space_feed_v1(uuid,integer,timestamp with time zone,uuid)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.get_neighbor_space_feed_v1(uuid,integer,timestamp with time zone,uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.get_neighbor_shared_post_v1(uuid,uuid)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.get_neighbor_shared_post_v1(uuid,uuid)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.get_neighbor_shared_post_v1(uuid,uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.save_neighbor_comment_v1(uuid,uuid,text,text)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.save_neighbor_comment_v1(uuid,uuid,text,text)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.save_neighbor_comment_v1(uuid,uuid,text,text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.toggle_neighbor_reaction_v1(uuid,uuid)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.toggle_neighbor_reaction_v1(uuid,uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.toggle_neighbor_save_v1(uuid,uuid)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.toggle_neighbor_save_v1(uuid,uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.get_neighbor_teacher_post_engagement_v1(uuid,uuid,uuid)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.get_neighbor_teacher_post_engagement_v1(uuid,uuid,uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.get_neighbor_admin_dashboard_v1(uuid)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.get_neighbor_admin_dashboard_v1(uuid)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.get_neighbor_admin_dashboard_v1(uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.create_neighbor_internal_trial_v1(text,uuid[])', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.create_neighbor_internal_trial_v1(text,uuid[])', 'EXECUTE')
       OR has_function_privilege('anon', 'public.set_neighbor_acceptance_check_v1(text,boolean)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.set_neighbor_acceptance_check_v1(text,boolean)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.change_neighbor_rollout_v1(text,text)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.change_neighbor_rollout_v1(text,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'neighbor teacher RPC grants are incorrect';
    END IF;
END;
$$;

-- Step 3: 기존 student_posts 원본을 복사하지 않고 공유 연결만 만들며,
-- 원학급 교사 검토와 참여 교사 긴급 숨김 경계를 실제 역할로 확인한다.
UPDATE public.neighbor_rollout_state SET mode = 'public_beta' WHERE singleton IS TRUE;

WITH source_candidate AS (
    SELECT
        class.id AS class_id,
        class.teacher_id,
        student.id AS student_id,
        student.auth_id AS student_auth_id,
        post.id AS post_id,
        row_number() OVER (ORDER BY post.created_at DESC, post.id) AS position
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
    JOIN public.student_posts post
      ON post.class_id = class.id
     AND post.student_id = student.id
     AND post.is_submitted IS TRUE
     AND post.recalled_at IS NULL
    WHERE class.deleted_at IS NULL
      AND NOT EXISTS (
          SELECT 1
          FROM public.neighbor_space_classes existing_membership
          WHERE existing_membership.class_id = class.id
            AND existing_membership.status IN ('pending', 'active')
      )
)
SELECT
    set_config('test.neighbor_post_class', COALESCE(max(class_id::TEXT) FILTER (WHERE position = 1), ''), TRUE),
    set_config('test.neighbor_post_teacher', COALESCE(max(teacher_id::TEXT) FILTER (WHERE position = 1), ''), TRUE),
    set_config('test.neighbor_post_student', COALESCE(max(student_id::TEXT) FILTER (WHERE position = 1), ''), TRUE),
    set_config('test.neighbor_post_student_auth', COALESCE(max(student_auth_id::TEXT) FILTER (WHERE position = 1), ''), TRUE),
    set_config('test.neighbor_post_source', COALESCE(max(post_id::TEXT) FILTER (WHERE position = 1), ''), TRUE)
FROM source_candidate;

SELECT
    set_config('test.neighbor_post_guest_class', COALESCE(class.id::TEXT, ''), TRUE),
    set_config('test.neighbor_post_guest_teacher', COALESCE(class.teacher_id::TEXT, ''), TRUE),
    set_config('test.neighbor_post_guest_student', COALESCE(student.id::TEXT, ''), TRUE),
    set_config('test.neighbor_post_guest_student_auth', COALESCE(student.auth_id::TEXT, ''), TRUE)
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
  AND class.id <> current_setting('test.neighbor_post_class')::UUID
  AND class.teacher_id <> current_setting('test.neighbor_post_teacher')::UUID
  AND NOT EXISTS (
      SELECT 1
      FROM public.neighbor_space_classes existing_membership
      WHERE existing_membership.class_id = class.id
        AND existing_membership.status IN ('pending', 'active')
  )
ORDER BY class.created_at DESC
LIMIT 1;

DO $$
DECLARE
    v_space_id UUID := gen_random_uuid();
BEGIN
    IF current_setting('test.neighbor_post_source') = ''
       OR current_setting('test.neighbor_post_guest_class', TRUE) IS NULL
       OR current_setting('test.neighbor_post_guest_class', TRUE) = ''
       OR current_setting('test.neighbor_post_guest_student_auth', TRUE) = '' THEN
        RAISE EXCEPTION 'Step 3-5 smoke requires a submitted source post and another approved teacher class with an active student';
    END IF;

    UPDATE public.classes class
    SET enabled_modules = CASE
        WHEN 'neighbor-agit' = ANY(COALESCE(class.enabled_modules, ARRAY[]::TEXT[]))
            THEN class.enabled_modules
        ELSE array_append(COALESCE(class.enabled_modules, ARRAY[]::TEXT[]), 'neighbor-agit')
    END
    WHERE class.id IN (
        current_setting('test.neighbor_post_class')::UUID,
        current_setting('test.neighbor_post_guest_class')::UUID
    );

    INSERT INTO public.neighbor_spaces (id, host_class_id, created_by, name, status)
    VALUES (
        v_space_id,
        current_setting('test.neighbor_post_class')::UUID,
        current_setting('test.neighbor_post_teacher')::UUID,
        'Step 3 글 검토 공간',
        'draft'
    );
    INSERT INTO public.neighbor_space_classes (
        space_id, class_id, role, status, public_class_name, joined_at, reviewed_at, reviewed_by
    ) VALUES
    (
        v_space_id,
        current_setting('test.neighbor_post_class')::UUID,
        'host', 'active', '원학급', NOW(), NOW(), current_setting('test.neighbor_post_teacher')::UUID
    ),
    (
        v_space_id,
        current_setting('test.neighbor_post_guest_class')::UUID,
        'guest', 'active', '참여학급', NOW(), NOW(), current_setting('test.neighbor_post_guest_teacher')::UUID
    );
    UPDATE public.neighbor_spaces SET status = 'active' WHERE id = v_space_id;
    PERFORM set_config('test.neighbor_post_space', v_space_id::TEXT, TRUE);
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.neighbor_post_teacher'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.neighbor_post_teacher'), 'role', 'authenticated'
)::TEXT, TRUE);

DO $$
DECLARE
    v_result JSONB;
BEGIN
    v_result := public.set_neighbor_class_access_v1(
        current_setting('test.neighbor_post_space')::UUID,
        current_setting('test.neighbor_post_class')::UUID,
        TRUE
    );
    IF (v_result->>'student_access_enabled')::BOOLEAN IS NOT TRUE THEN
        RAISE EXCEPTION 'original class teacher could not enable student access: %', v_result;
    END IF;
END;
$$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.neighbor_post_guest_teacher'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.neighbor_post_guest_teacher'), 'role', 'authenticated'
)::TEXT, TRUE);
SELECT public.set_neighbor_class_access_v1(
    current_setting('test.neighbor_post_space')::UUID,
    current_setting('test.neighbor_post_guest_class')::UUID,
    TRUE
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.neighbor_post_student_auth'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.neighbor_post_student_auth'), 'role', 'authenticated'
)::TEXT, TRUE);

DO $$
DECLARE
    v_result JSONB;
BEGIN
    v_result := public.request_neighbor_post_share_v1(
        current_setting('test.neighbor_post_space')::UUID,
        current_setting('test.neighbor_post_source')::UUID
    );
    IF v_result->>'status' <> 'pending' THEN
        RAISE EXCEPTION 'student share request did not enter pending review: %', v_result;
    END IF;
    PERFORM set_config('test.neighbor_shared_post', v_result->>'shared_post_id', TRUE);
END;
$$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.neighbor_post_guest_teacher'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.neighbor_post_guest_teacher'), 'role', 'authenticated'
)::TEXT, TRUE);

DO $$
DECLARE
    v_blocked BOOLEAN := FALSE;
BEGIN
    BEGIN
        PERFORM public.review_neighbor_shared_post_v1(
            current_setting('test.neighbor_post_space')::UUID,
            current_setting('test.neighbor_shared_post')::UUID,
            'publish', ''
        );
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'guest teacher reviewed another class post';
    END IF;
END;
$$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.neighbor_post_teacher'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.neighbor_post_teacher'), 'role', 'authenticated'
)::TEXT, TRUE);
SELECT public.review_neighbor_shared_post_v1(
    current_setting('test.neighbor_post_space')::UUID,
    current_setting('test.neighbor_shared_post')::UUID,
    'publish', ''
);

-- Step 4: 홈 요약은 기존 bootstrap 한 번에 포함하고, 피드·상세 RPC는
-- 공간/학급/학생 접근 조건을 서버에서 다시 확인한다.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.neighbor_post_student_auth'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.neighbor_post_student_auth'), 'role', 'authenticated'
)::TEXT, TRUE);

DO $$
DECLARE
    v_home JSONB;
    v_feed JSONB;
    v_detail JSONB;
    v_item JSONB;
    v_blocked BOOLEAN := FALSE;
BEGIN
    v_home := public.get_student_home_bootstrap_v1();
    IF (v_home #>> '{home,neighbor_agit_available}')::BOOLEAN IS NOT TRUE
       OR v_home #>> '{home,neighbor_agit_space_id}' <> current_setting('test.neighbor_post_space')
       OR COALESCE((v_home #>> '{home,neighbor_agit_new_count}')::INTEGER, 0) < 1 THEN
        RAISE EXCEPTION 'student home bootstrap omitted the accessible neighbor space: %', v_home->'home';
    END IF;

    v_feed := public.get_neighbor_space_feed_v1(
        current_setting('test.neighbor_post_space')::UUID, 999, NULL, NULL
    );
    v_item := v_feed #> '{items,0}';
    IF jsonb_array_length(COALESCE(v_feed->'items', '[]'::JSONB)) <> 1
       OR (v_feed->>'max_rows')::INTEGER <> 50
       OR v_item->>'author_name' !~ '^이웃 작가 [0-9A-F]{4}$'
       OR v_item->>'class_name' <> '원학급'
       OR v_item ?| ARRAY['post_id', 'student_id', 'class_id', 'content'] THEN
        RAISE EXCEPTION 'neighbor feed summary or public identity contract failed: %', v_feed;
    END IF;

    v_home := public.get_student_home_bootstrap_v1();
    IF COALESCE((v_home #>> '{home,neighbor_agit_new_count}')::INTEGER, -1) <> 0 THEN
        RAISE EXCEPTION 'opening the feed did not clear its home new count: %', v_home->'home';
    END IF;

    v_detail := public.get_neighbor_shared_post_v1(
        current_setting('test.neighbor_post_space')::UUID,
        current_setting('test.neighbor_shared_post')::UUID
    );
    IF v_detail->>'content' IS NULL
       OR v_detail->>'title' IS NULL
       OR v_detail ?| ARRAY['post_id', 'student_id', 'class_id'] THEN
        RAISE EXCEPTION 'neighbor detail contract failed: %', v_detail;
    END IF;

    BEGIN
        PERFORM public.get_neighbor_space_feed_v1(gen_random_uuid(), 20, NULL, NULL);
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'neighbor feed accepted a different space id';
    END IF;
END;
$$;

RESET ROLE;
UPDATE public.classes
SET enabled_modules = array_remove(COALESCE(enabled_modules, ARRAY[]::TEXT[]), 'neighbor-agit')
WHERE id = current_setting('test.neighbor_post_class')::UUID;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.neighbor_post_student_auth'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.neighbor_post_student_auth'), 'role', 'authenticated'
)::TEXT, TRUE);
DO $$
DECLARE
    v_blocked BOOLEAN := FALSE;
BEGIN
    BEGIN
        PERFORM public.get_neighbor_space_feed_v1(
            current_setting('test.neighbor_post_space')::UUID, 20, NULL, NULL
        );
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'neighbor feed ignored the class module OFF state';
    END IF;
END;
$$;

RESET ROLE;
UPDATE public.classes
SET enabled_modules = array_append(COALESCE(enabled_modules, ARRAY[]::TEXT[]), 'neighbor-agit')
WHERE id = current_setting('test.neighbor_post_class')::UUID;
UPDATE public.neighbor_space_classes
SET student_access_enabled = FALSE
WHERE space_id = current_setting('test.neighbor_post_space')::UUID
  AND class_id = current_setting('test.neighbor_post_class')::UUID;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.neighbor_post_student_auth'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.neighbor_post_student_auth'), 'role', 'authenticated'
)::TEXT, TRUE);
DO $$
DECLARE
    v_blocked BOOLEAN := FALSE;
BEGIN
    BEGIN
        PERFORM public.get_neighbor_space_feed_v1(
            current_setting('test.neighbor_post_space')::UUID, 20, NULL, NULL
        );
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'neighbor feed ignored the teacher access OFF state';
    END IF;
END;
$$;

RESET ROLE;
UPDATE public.neighbor_space_classes
SET student_access_enabled = TRUE
WHERE space_id = current_setting('test.neighbor_post_space')::UUID
  AND class_id = current_setting('test.neighbor_post_class')::UUID;

-- Step 5: 다른 학급 학생이 한 줄 댓글·공감·간직하기를 사용하고, 쓰기 RPC
-- 응답과 교사 학급별 집계가 보이는 상태만 같은 숫자로 계산하는지 확인한다.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.neighbor_post_guest_student_auth'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.neighbor_post_guest_student_auth'), 'role', 'authenticated'
)::TEXT, TRUE);

DO $$
DECLARE
    v_first JSONB;
    v_updated JSONB;
    v_deleted JSONB;
    v_restored JSONB;
    v_reaction JSONB;
    v_saved JSONB;
    v_detail JSONB;
    v_feed JSONB;
BEGIN
    v_first := public.save_neighbor_comment_v1(
        current_setting('test.neighbor_post_space')::UUID,
        current_setting('test.neighbor_shared_post')::UUID,
        '글의 장면이 눈앞에 잘 그려져요.',
        'save'
    );
    PERFORM set_config('test.neighbor_comment', v_first->>'comment_id', TRUE);
    v_updated := public.save_neighbor_comment_v1(
        current_setting('test.neighbor_post_space')::UUID,
        current_setting('test.neighbor_shared_post')::UUID,
        '글의 장면과 느낌이 눈앞에 잘 그려져요.',
        'save'
    );
    IF v_first->>'comment_id' <> v_updated->>'comment_id' THEN
        RAISE EXCEPTION 'neighbor comment accepted a second physical row';
    END IF;

    v_deleted := public.save_neighbor_comment_v1(
        current_setting('test.neighbor_post_space')::UUID,
        current_setting('test.neighbor_shared_post')::UUID,
        '',
        'delete'
    );
    IF v_deleted->>'status' <> 'deleted' OR (v_deleted->>'comment_count')::INTEGER <> 0 THEN
        RAISE EXCEPTION 'own neighbor comment delete did not leave a private tombstone: %', v_deleted;
    END IF;
    v_restored := public.save_neighbor_comment_v1(
        current_setting('test.neighbor_post_space')::UUID,
        current_setting('test.neighbor_shared_post')::UUID,
        '글의 장면과 느낌이 눈앞에 잘 그려져요.',
        'save'
    );
    IF v_restored->>'comment_id' <> v_first->>'comment_id'
       OR (v_restored->>'comment_count')::INTEGER <> 1 THEN
        RAISE EXCEPTION 'deleted neighbor comment did not reuse its one row: %', v_restored;
    END IF;

    v_reaction := public.toggle_neighbor_reaction_v1(
        current_setting('test.neighbor_post_space')::UUID,
        current_setting('test.neighbor_shared_post')::UUID
    );
    IF (v_reaction->>'active')::BOOLEAN IS NOT TRUE OR (v_reaction->>'reaction_count')::INTEGER <> 1 THEN
        RAISE EXCEPTION 'neighbor empathy toggle did not activate once: %', v_reaction;
    END IF;
    v_saved := public.toggle_neighbor_save_v1(
        current_setting('test.neighbor_post_space')::UUID,
        current_setting('test.neighbor_shared_post')::UUID
    );
    IF (v_saved->>'saved')::BOOLEAN IS NOT TRUE THEN
        RAISE EXCEPTION 'other-class neighbor post was not saved as a reference: %', v_saved;
    END IF;

    v_detail := public.get_neighbor_shared_post_v1(
        current_setting('test.neighbor_post_space')::UUID,
        current_setting('test.neighbor_shared_post')::UUID
    );
    IF jsonb_array_length(v_detail->'comments') <> 1
       OR (v_detail->>'comment_count')::INTEGER <> 1
       OR (v_detail->>'reaction_count')::INTEGER <> 1
       OR (v_detail->>'my_reaction')::BOOLEAN IS NOT TRUE
       OR (v_detail->>'my_saved')::BOOLEAN IS NOT TRUE
       OR v_detail #>> '{comments,0,author_name}' !~ '^이웃 작가 [0-9A-F]{4}$'
       OR (v_detail #> '{comments,0}') ?| ARRAY['student_id', 'class_id'] THEN
        RAISE EXCEPTION 'neighbor interaction detail contract failed: %', v_detail;
    END IF;
    v_feed := public.get_neighbor_space_feed_v1(
        current_setting('test.neighbor_post_space')::UUID, 20, NULL, NULL
    );
    IF (v_feed #>> '{items,0,comment_count}')::INTEGER <> 1
       OR (v_feed #>> '{items,0,reaction_count}')::INTEGER <> 1
       OR (v_feed #>> '{items,0,my_saved}')::BOOLEAN IS NOT TRUE THEN
        RAISE EXCEPTION 'neighbor feed interaction summary failed: %', v_feed;
    END IF;
END;
$$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.neighbor_post_student_auth'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.neighbor_post_student_auth'), 'role', 'authenticated'
)::TEXT, TRUE);
DO $$
DECLARE
    v_own_save_blocked BOOLEAN := FALSE;
    v_delete_blocked BOOLEAN := FALSE;
BEGIN
    BEGIN
        PERFORM public.toggle_neighbor_save_v1(
            current_setting('test.neighbor_post_space')::UUID,
            current_setting('test.neighbor_shared_post')::UUID
        );
    EXCEPTION WHEN invalid_parameter_value THEN
        v_own_save_blocked := TRUE;
    END;
    IF NOT v_own_save_blocked THEN
        RAISE EXCEPTION 'own neighbor post was saved as an external reference';
    END IF;
    BEGIN
        PERFORM public.save_neighbor_comment_v1(
            current_setting('test.neighbor_post_space')::UUID,
            current_setting('test.neighbor_shared_post')::UUID,
            '',
            'delete'
        );
    EXCEPTION WHEN object_not_in_prerequisite_state THEN
        v_delete_blocked := TRUE;
    END;
    IF NOT v_delete_blocked THEN
        RAISE EXCEPTION 'student changed another student neighbor comment';
    END IF;
END;
$$;

RESET ROLE;
DO $$
BEGIN
    IF (SELECT count(*) FROM public.neighbor_comments
        WHERE shared_post_id = current_setting('test.neighbor_shared_post')::UUID
          AND student_id = current_setting('test.neighbor_post_guest_student')::UUID) <> 1
       OR NOT EXISTS (
           SELECT 1 FROM public.neighbor_comments
           WHERE id = current_setting('test.neighbor_comment')::UUID AND status = 'visible'
       ) THEN
        RAISE EXCEPTION 'neighbor comment one-row or ownership boundary failed';
    END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.neighbor_post_teacher'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.neighbor_post_teacher'), 'role', 'authenticated'
)::TEXT, TRUE);
DO $$
DECLARE
    v_summary JSONB;
    v_restore_blocked BOOLEAN := FALSE;
BEGIN
    v_summary := public.get_neighbor_teacher_post_engagement_v1(
        current_setting('test.neighbor_post_space')::UUID,
        current_setting('test.neighbor_post_class')::UUID,
        current_setting('test.neighbor_shared_post')::UUID
    );
    IF (v_summary->>'visible_comment_count')::INTEGER <> 1
       OR (v_summary->>'reaction_count')::INTEGER <> 1
       OR jsonb_array_length(v_summary->'classes') <> 2 THEN
        RAISE EXCEPTION 'teacher class engagement summary failed: %', v_summary;
    END IF;

    PERFORM public.moderate_neighbor_item_v1(
        current_setting('test.neighbor_post_space')::UUID,
        current_setting('test.neighbor_post_class')::UUID,
        'comment', current_setting('test.neighbor_comment')::UUID,
        'hide', '댓글 롤백 스모크'
    );
    BEGIN
        PERFORM public.moderate_neighbor_item_v1(
            current_setting('test.neighbor_post_space')::UUID,
            current_setting('test.neighbor_post_class')::UUID,
            'comment', current_setting('test.neighbor_comment')::UUID,
            'restore', ''
        );
    EXCEPTION WHEN insufficient_privilege THEN
        v_restore_blocked := TRUE;
    END;
    IF NOT v_restore_blocked THEN
        RAISE EXCEPTION 'another class teacher restored the hidden comment';
    END IF;
END;
$$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.neighbor_post_guest_student_auth'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.neighbor_post_guest_student_auth'), 'role', 'authenticated'
)::TEXT, TRUE);
DO $$
DECLARE
    v_detail JSONB;
    v_edit_blocked BOOLEAN := FALSE;
BEGIN
    v_detail := public.get_neighbor_shared_post_v1(
        current_setting('test.neighbor_post_space')::UUID,
        current_setting('test.neighbor_shared_post')::UUID
    );
    IF (v_detail->>'comment_count')::INTEGER <> 0
       OR jsonb_array_length(v_detail->'comments') <> 0 THEN
        RAISE EXCEPTION 'hidden neighbor comment remained in the student detail';
    END IF;
    BEGIN
        PERFORM public.save_neighbor_comment_v1(
            current_setting('test.neighbor_post_space')::UUID,
            current_setting('test.neighbor_shared_post')::UUID,
            '숨김을 우회하지 못하는 댓글',
            'save'
        );
    EXCEPTION WHEN insufficient_privilege THEN
        v_edit_blocked := TRUE;
    END;
    IF NOT v_edit_blocked THEN
        RAISE EXCEPTION 'student edited a teacher-hidden neighbor comment';
    END IF;
END;
$$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.neighbor_post_guest_teacher'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.neighbor_post_guest_teacher'), 'role', 'authenticated'
)::TEXT, TRUE);
SELECT public.moderate_neighbor_item_v1(
    current_setting('test.neighbor_post_space')::UUID,
    current_setting('test.neighbor_post_guest_class')::UUID,
    'comment', current_setting('test.neighbor_comment')::UUID,
    'restore', ''
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.neighbor_post_guest_teacher'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.neighbor_post_guest_teacher'), 'role', 'authenticated'
)::TEXT, TRUE);

DO $$
DECLARE
    v_result JSONB;
    v_restore_blocked BOOLEAN := FALSE;
BEGIN
    v_result := public.moderate_neighbor_item_v1(
        current_setting('test.neighbor_post_space')::UUID,
        current_setting('test.neighbor_post_guest_class')::UUID,
        'post', current_setting('test.neighbor_shared_post')::UUID,
        'hide', '롤백 스모크'
    );
    IF v_result->>'status' <> 'hidden' THEN
        RAISE EXCEPTION 'participant teacher could not emergency-hide: %', v_result;
    END IF;
    BEGIN
        PERFORM public.moderate_neighbor_item_v1(
            current_setting('test.neighbor_post_space')::UUID,
            current_setting('test.neighbor_post_guest_class')::UUID,
            'post', current_setting('test.neighbor_shared_post')::UUID,
            'restore', ''
        );
    EXCEPTION WHEN insufficient_privilege THEN
        v_restore_blocked := TRUE;
    END;
    IF NOT v_restore_blocked THEN
        RAISE EXCEPTION 'guest teacher restored another class post';
    END IF;
END;
$$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.neighbor_post_student_auth'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.neighbor_post_student_auth'), 'role', 'authenticated'
)::TEXT, TRUE);
DO $$
DECLARE
    v_blocked BOOLEAN := FALSE;
    v_feed JSONB;
    v_detail_blocked BOOLEAN := FALSE;
BEGIN
    v_feed := public.get_neighbor_space_feed_v1(
        current_setting('test.neighbor_post_space')::UUID, 20, NULL, NULL
    );
    IF jsonb_array_length(COALESCE(v_feed->'items', '[]'::JSONB)) <> 0 THEN
        RAISE EXCEPTION 'hidden neighbor post remained visible';
    END IF;
    BEGIN
        PERFORM public.get_neighbor_shared_post_v1(
            current_setting('test.neighbor_post_space')::UUID,
            current_setting('test.neighbor_shared_post')::UUID
        );
    EXCEPTION WHEN invalid_parameter_value THEN
        v_detail_blocked := TRUE;
    END;
    IF NOT v_detail_blocked THEN
        RAISE EXCEPTION 'guessed hidden neighbor detail was readable';
    END IF;
    BEGIN
        PERFORM public.request_neighbor_post_share_v1(
            current_setting('test.neighbor_post_space')::UUID,
            current_setting('test.neighbor_post_source')::UUID
        );
    EXCEPTION WHEN object_not_in_prerequisite_state THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'student bypassed an emergency-hidden post';
    END IF;
END;
$$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.neighbor_post_teacher'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.neighbor_post_teacher'), 'role', 'authenticated'
)::TEXT, TRUE);
SELECT public.moderate_neighbor_item_v1(
    current_setting('test.neighbor_post_space')::UUID,
    current_setting('test.neighbor_post_class')::UUID,
    'post', current_setting('test.neighbor_shared_post')::UUID,
    'restore', ''
);

RESET ROLE;
UPDATE public.student_posts
SET title = title || ' [Step 3 재검토]'
WHERE id = current_setting('test.neighbor_post_source')::UUID;

DO $$
BEGIN
    IF (SELECT status FROM public.neighbor_shared_posts
        WHERE id = current_setting('test.neighbor_shared_post')::UUID) <> 'pending' THEN
        RAISE EXCEPTION 'source edit did not return published share to pending review';
    END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.neighbor_post_teacher'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.neighbor_post_teacher'), 'role', 'authenticated'
)::TEXT, TRUE);
SELECT public.review_neighbor_shared_post_v1(
    current_setting('test.neighbor_post_space')::UUID,
    current_setting('test.neighbor_shared_post')::UUID,
    'publish', ''
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.neighbor_post_student_auth'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.neighbor_post_student_auth'), 'role', 'authenticated'
)::TEXT, TRUE);
SELECT public.recall_my_neighbor_shared_post_v1(
    current_setting('test.neighbor_post_space')::UUID,
    current_setting('test.neighbor_shared_post')::UUID
);

RESET ROLE;
DO $$
BEGIN
    IF (SELECT status FROM public.neighbor_shared_posts
        WHERE id = current_setting('test.neighbor_shared_post')::UUID) <> 'recalled' THEN
        RAISE EXCEPTION 'student recall did not remove the shared post';
    END IF;
    IF (SELECT count(*) FROM public.neighbor_comments
        WHERE shared_post_id = current_setting('test.neighbor_shared_post')::UUID) <> 1
       OR (SELECT count(*) FROM public.neighbor_reactions
           WHERE shared_post_id = current_setting('test.neighbor_shared_post')::UUID) <> 1
       OR (SELECT count(*) FROM public.neighbor_saves
           WHERE shared_post_id = current_setting('test.neighbor_shared_post')::UUID) <> 1 THEN
        RAISE EXCEPTION 'neighbor interaction rows disappeared after source recall';
    END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.neighbor_post_guest_student_auth'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.neighbor_post_guest_student_auth'), 'role', 'authenticated'
)::TEXT, TRUE);
DO $$
DECLARE
    v_blocked BOOLEAN := FALSE;
BEGIN
    BEGIN
        PERFORM public.get_neighbor_shared_post_v1(
            current_setting('test.neighbor_post_space')::UUID,
            current_setting('test.neighbor_shared_post')::UUID
        );
    EXCEPTION WHEN invalid_parameter_value THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'recalled neighbor post content remained readable';
    END IF;
END;
$$;

RESET ROLE;
UPDATE public.neighbor_space_classes
SET status = 'left',
    student_access_enabled = FALSE,
    left_at = NOW()
WHERE space_id = current_setting('test.neighbor_post_space')::UUID
  AND class_id = current_setting('test.neighbor_post_class')::UUID;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.neighbor_post_student_auth'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.neighbor_post_student_auth'), 'role', 'authenticated'
)::TEXT, TRUE);
DO $$
DECLARE
    v_blocked BOOLEAN := FALSE;
BEGIN
    BEGIN
        PERFORM public.get_neighbor_space_feed_v1(
            current_setting('test.neighbor_post_space')::UUID, 20, NULL, NULL
        );
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'left class retained neighbor feed access';
    END IF;
END;
$$;

RESET ROLE;
UPDATE public.neighbor_space_classes
SET status = 'left',
    student_access_enabled = FALSE,
    left_at = NOW()
WHERE space_id = current_setting('test.neighbor_post_space')::UUID
  AND status = 'active';
UPDATE public.neighbor_spaces
SET status = 'closed', closed_at = NOW()
WHERE id = current_setting('test.neighbor_post_space')::UUID;
DO $$
BEGIN
    IF (SELECT count(*) FROM public.neighbor_comments
        WHERE shared_post_id = current_setting('test.neighbor_shared_post')::UUID) <> 1
       OR (SELECT count(*) FROM public.neighbor_reactions
           WHERE shared_post_id = current_setting('test.neighbor_shared_post')::UUID) <> 1
       OR (SELECT count(*) FROM public.neighbor_saves
           WHERE shared_post_id = current_setting('test.neighbor_shared_post')::UUID) <> 1 THEN
        RAISE EXCEPTION 'neighbor interaction rows disappeared after space close';
    END IF;
END;
$$;
UPDATE public.neighbor_rollout_state SET mode = 'internal' WHERE singleton IS TRUE;

-- 아래부터는 전용 RPC의 실제 역할 흐름을 검사한다. 호스트 이전·종료는 여러 행을
-- 원자적으로 바꾸므로 최종 상태에서 호스트 제약을 확인한다.
SET CONSTRAINTS neighbor_spaces_host_constraint, neighbor_space_classes_host_constraint DEFERRED;

WITH teacher_classes AS (
    SELECT DISTINCT ON (class.teacher_id)
        class.teacher_id,
        class.id AS class_id
    FROM public.classes class
    JOIN public.profiles profile
      ON profile.id = class.teacher_id
     AND profile.role = 'TEACHER'
     AND profile.is_approved IS TRUE
     AND profile.approval_revoked_at IS NULL
    WHERE class.deleted_at IS NULL
      AND NOT EXISTS (
          SELECT 1
          FROM public.neighbor_space_classes existing_membership
          WHERE existing_membership.class_id = class.id
            AND existing_membership.status IN ('pending', 'active')
      )
    ORDER BY class.teacher_id, class.created_at DESC
), ranked AS (
    SELECT teacher_id, class_id, row_number() OVER (ORDER BY teacher_id) AS position
    FROM teacher_classes
)
SELECT
    set_config('test.neighbor_teacher_1', COALESCE(max(teacher_id::TEXT) FILTER (WHERE position = 1), ''), TRUE),
    set_config('test.neighbor_class_1', COALESCE(max(class_id::TEXT) FILTER (WHERE position = 1), ''), TRUE),
    set_config('test.neighbor_teacher_2', COALESCE(max(teacher_id::TEXT) FILTER (WHERE position = 2), ''), TRUE),
    set_config('test.neighbor_class_2', COALESCE(max(class_id::TEXT) FILTER (WHERE position = 2), ''), TRUE),
    set_config('test.neighbor_teacher_3', COALESCE(max(teacher_id::TEXT) FILTER (WHERE position = 3), ''), TRUE),
    set_config('test.neighbor_class_3', COALESCE(max(class_id::TEXT) FILTER (WHERE position = 3), ''), TRUE),
    set_config('test.neighbor_teacher_4', COALESCE(max(teacher_id::TEXT) FILTER (WHERE position = 4), ''), TRUE),
    set_config('test.neighbor_class_4', COALESCE(max(class_id::TEXT) FILTER (WHERE position = 4), ''), TRUE)
FROM ranked;

SELECT set_config('test.neighbor_admin', COALESCE((
    SELECT profile.id::TEXT
    FROM public.profiles profile
    WHERE profile.role = 'ADMIN'
    ORDER BY profile.created_at
    LIMIT 1
), ''), TRUE);

DO $$
BEGIN
    IF current_setting('test.neighbor_admin') = ''
       OR current_setting('test.neighbor_teacher_4') = '' THEN
        RAISE EXCEPTION 'neighbor RPC smoke requires one admin and four approved teachers with classes';
    END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.neighbor_teacher_1'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.neighbor_teacher_1'),
    'role', 'authenticated',
    'app_metadata', jsonb_build_object('role', 'ADMIN')
)::TEXT, TRUE);

DO $$
DECLARE
    v_blocked BOOLEAN := FALSE;
BEGIN
    BEGIN
        PERFORM public.create_neighbor_space_v1(
            current_setting('test.neighbor_class_1')::UUID,
            '위조 관리자 공간', '위조 학급', ''
        );
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'internal 단계에서 일반 교사 또는 위조 관리자 JWT가 공간을 만들었습니다.';
    END IF;
END;
$$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.neighbor_admin'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.neighbor_admin'), 'role', 'authenticated'
)::TEXT, TRUE);

DO $$
DECLARE
    v_result JSONB;
BEGIN
    v_result := public.create_neighbor_space_v1(
        current_setting('test.neighbor_class_1')::UUID,
        '관리자 내부 시험 공간', '첫 번째 학급', 'Step 2 롤백 시험'
    );
    IF (v_result->>'success')::BOOLEAN IS NOT TRUE OR v_result->>'status' <> 'active' THEN
        RAISE EXCEPTION 'actual admin could not create the internal preview space: %', v_result;
    END IF;
    PERFORM set_config('test.neighbor_space', v_result->>'space_id', TRUE);
END;
$$;

RESET ROLE;
UPDATE public.neighbor_rollout_state
SET mode = 'public_beta', updated_by = current_setting('test.neighbor_admin')::UUID
WHERE singleton IS TRUE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.neighbor_teacher_1'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.neighbor_teacher_1'), 'role', 'authenticated'
)::TEXT, TRUE);

DO $$
DECLARE
    v_result JSONB;
BEGIN
    v_result := public.create_neighbor_invite_v1(current_setting('test.neighbor_space')::UUID);
    IF (v_result->>'success')::BOOLEAN IS NOT TRUE
       OR v_result->>'invite_key' !~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}(-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}){3}$' THEN
        RAISE EXCEPTION 'invite key contract failed: %', v_result;
    END IF;
    PERFORM set_config('test.neighbor_invite_key', v_result->>'invite_key', TRUE);
END;
$$;

RESET ROLE;
DO $$
DECLARE
    v_normalized TEXT := replace(current_setting('test.neighbor_invite_key'), '-', '');
    v_invite public.neighbor_invites%ROWTYPE;
BEGIN
    SELECT invite.* INTO v_invite
    FROM public.neighbor_invites invite
    WHERE invite.space_id = current_setting('test.neighbor_space')::UUID
      AND invite.status = 'active';
    IF v_invite.id IS NULL
       OR v_invite.invite_hash <> encode(extensions.digest(convert_to(v_normalized, 'UTF8'), 'sha256'), 'hex')
       OR v_invite.invite_hash LIKE '%' || v_normalized || '%'
       OR v_invite.expires_at NOT BETWEEN NOW() + INTERVAL '23 hours 59 minutes'
                                      AND NOW() + INTERVAL '24 hours 1 minute' THEN
        RAISE EXCEPTION 'invite must be hash-only and expire in 24 hours';
    END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.neighbor_teacher_3'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.neighbor_teacher_3'), 'role', 'authenticated'
)::TEXT, TRUE);

DO $$
DECLARE
    v_result JSONB;
    v_index INTEGER;
BEGIN
    FOR v_index IN 1..5 LOOP
        v_result := public.request_neighbor_join_v1(
            'AAAA-AAAA-AAAA-AAAA',
            current_setting('test.neighbor_class_3')::UUID,
            '세 번째 학급'
        );
    END LOOP;
    IF v_result->>'error' <> 'invalid_or_expired_invite'
       OR (v_result->>'retry_after_seconds')::INTEGER < 1 THEN
        RAISE EXCEPTION 'fifth invite failure did not start the cooldown: %', v_result;
    END IF;
    v_result := public.request_neighbor_join_v1(
        'BBBB-BBBB-BBBB-BBBB',
        current_setting('test.neighbor_class_3')::UUID,
        '세 번째 학급'
    );
    IF v_result->>'error' <> 'rate_limited' THEN
        RAISE EXCEPTION 'invite failure rate limit did not block the sixth attempt: %', v_result;
    END IF;
END;
$$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.neighbor_teacher_2'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.neighbor_teacher_2'), 'role', 'authenticated'
)::TEXT, TRUE);

DO $$
DECLARE
    v_result JSONB;
BEGIN
    v_result := public.request_neighbor_join_v1(
        current_setting('test.neighbor_invite_key'),
        current_setting('test.neighbor_class_2')::UUID,
        '두 번째 학급'
    );
    IF (v_result->>'success')::BOOLEAN IS NOT TRUE OR v_result->>'status' <> 'pending' THEN
        RAISE EXCEPTION 'guest join request failed: %', v_result;
    END IF;
END;
$$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.neighbor_teacher_4'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.neighbor_teacher_4'), 'role', 'authenticated'
)::TEXT, TRUE);

DO $$
DECLARE
    v_result JSONB;
BEGIN
    v_result := public.request_neighbor_join_v1(
        current_setting('test.neighbor_invite_key'),
        current_setting('test.neighbor_class_4')::UUID,
        '네 번째 학급'
    );
    IF v_result->>'error' <> 'invalid_or_expired_invite' THEN
        RAISE EXCEPTION 'used one-time invite key was accepted again: %', v_result;
    END IF;
END;
$$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.neighbor_teacher_1'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.neighbor_teacher_1'), 'role', 'authenticated'
)::TEXT, TRUE);

DO $$
DECLARE
    v_result JSONB;
BEGIN
    v_result := public.review_neighbor_join_v1(
        current_setting('test.neighbor_space')::UUID,
        current_setting('test.neighbor_class_2')::UUID,
        TRUE
    );
    IF v_result->>'status' <> 'active' OR (v_result->>'active_class_count')::INTEGER <> 2 THEN
        RAISE EXCEPTION 'host approval failed: %', v_result;
    END IF;
    v_result := public.transfer_neighbor_host_v1(
        current_setting('test.neighbor_space')::UUID,
        current_setting('test.neighbor_class_2')::UUID
    );
    IF v_result->>'host_class_id' <> current_setting('test.neighbor_class_2') THEN
        RAISE EXCEPTION 'host transfer failed: %', v_result;
    END IF;
END;
$$;

DO $$
DECLARE
    v_blocked BOOLEAN := FALSE;
    v_result JSONB;
BEGIN
    BEGIN
        PERFORM public.close_neighbor_space_v1(current_setting('test.neighbor_space')::UUID);
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'previous host retained host-only close permission';
    END IF;

    v_result := public.leave_neighbor_space_v1(
        current_setting('test.neighbor_space')::UUID,
        current_setting('test.neighbor_class_1')::UUID
    );
    IF v_result->>'status' <> 'left'
       OR (v_result->>'student_access_paused')::BOOLEAN IS NOT TRUE THEN
        RAISE EXCEPTION 'guest leave flow failed: %', v_result;
    END IF;
END;
$$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.neighbor_teacher_2'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.neighbor_teacher_2'), 'role', 'authenticated'
)::TEXT, TRUE);

DO $$
DECLARE
    v_result JSONB;
BEGIN
    v_result := public.close_neighbor_space_v1(current_setting('test.neighbor_space')::UUID);
    IF v_result->>'status' <> 'closed' THEN
        RAISE EXCEPTION 'new host could not close the space: %', v_result;
    END IF;
END;
$$;

RESET ROLE;
SET CONSTRAINTS neighbor_spaces_host_constraint, neighbor_space_classes_host_constraint IMMEDIATE;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.neighbor_space_classes membership
        WHERE membership.space_id = current_setting('test.neighbor_space')::UUID
          AND membership.status = 'active'
    ) OR NOT EXISTS (
        SELECT 1 FROM public.neighbor_spaces space
        WHERE space.id = current_setting('test.neighbor_space')::UUID
          AND space.status = 'closed'
          AND space.closed_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'closed neighbor space retained active access';
    END IF;
END;
$$;

-- Step 6: 실제 관리자만 내부 시험 공간·현황·점검표·공개 단계를 관리하며,
-- 점검 여섯 항목과 확인 문구 중 하나라도 없으면 전체 교사 공개가 실패한다.
UPDATE public.neighbor_rollout_state
SET mode = 'internal',
    acceptance_checks = jsonb_build_object(
        'permissions', FALSE, 'desktop', FALSE, 'tablet', FALSE,
        'mobile', FALSE, 'performance', FALSE, 'operations', FALSE
    )
WHERE singleton IS TRUE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.neighbor_teacher_1'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.neighbor_teacher_1'), 'role', 'authenticated',
    'app_metadata', jsonb_build_object('role', 'ADMIN')
)::TEXT, TRUE);
DO $$
DECLARE
    v_blocked BOOLEAN := FALSE;
BEGIN
    BEGIN
        PERFORM public.get_neighbor_admin_dashboard_v1(NULL);
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'forged admin could read the neighbor admin dashboard';
    END IF;
END;
$$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.neighbor_admin'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.neighbor_admin'), 'role', 'authenticated'
)::TEXT, TRUE);
DO $$
DECLARE
    v_trial JSONB;
    v_dashboard JSONB;
    v_rollout JSONB;
    v_blocked BOOLEAN := FALSE;
    v_wrong_phrase_blocked BOOLEAN := FALSE;
    v_key TEXT;
BEGIN
    BEGIN
        PERFORM public.change_neighbor_rollout_v1('public_beta', '전체 교사 Beta 공개');
    EXCEPTION WHEN object_not_in_prerequisite_state THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'rollout opened without all acceptance checks';
    END IF;

    v_trial := public.create_neighbor_internal_trial_v1(
        'Step 6 관리자 시험 공간',
        ARRAY[
            current_setting('test.neighbor_class_1')::UUID,
            current_setting('test.neighbor_class_2')::UUID
        ]
    );
    IF (v_trial->>'success')::BOOLEAN IS NOT TRUE
       OR (v_trial->>'active_class_count')::INTEGER <> 2
       OR (v_trial->>'student_access_enabled')::BOOLEAN IS NOT FALSE THEN
        RAISE EXCEPTION 'admin internal trial did not connect two classes safely: %', v_trial;
    END IF;
    PERFORM set_config('test.neighbor_admin_trial', v_trial->>'space_id', TRUE);

    v_dashboard := public.get_neighbor_admin_dashboard_v1((v_trial->>'space_id')::UUID);
    IF (v_dashboard->>'version')::INTEGER <> 1
       OR jsonb_array_length(v_dashboard->'spaces') < 1
       OR jsonb_array_length(v_dashboard->'eligible_classes') < 2
       OR v_dashboard #>> '{rollout,mode}' <> 'internal'
       OR (v_dashboard #>> '{rollout,ready_for_public_beta}')::BOOLEAN IS NOT FALSE THEN
        RAISE EXCEPTION 'neighbor admin dashboard contract failed: %', v_dashboard;
    END IF;

    FOREACH v_key IN ARRAY ARRAY['permissions', 'desktop', 'tablet', 'mobile', 'performance'] LOOP
        PERFORM public.set_neighbor_acceptance_check_v1(v_key, TRUE);
    END LOOP;
    v_blocked := FALSE;
    BEGIN
        PERFORM public.change_neighbor_rollout_v1('public_beta', '전체 교사 Beta 공개');
    EXCEPTION WHEN object_not_in_prerequisite_state THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'rollout opened with only five acceptance checks';
    END IF;

    PERFORM public.set_neighbor_acceptance_check_v1('operations', TRUE);
    BEGIN
        PERFORM public.change_neighbor_rollout_v1('public_beta', '공개');
    EXCEPTION WHEN insufficient_privilege THEN
        v_wrong_phrase_blocked := TRUE;
    END;
    IF NOT v_wrong_phrase_blocked THEN
        RAISE EXCEPTION 'rollout opened without the explicit confirmation phrase';
    END IF;

    v_rollout := public.change_neighbor_rollout_v1('public_beta', '전체 교사 Beta 공개');
    IF v_rollout->>'mode' <> 'public_beta' OR (v_rollout->>'changed')::BOOLEAN IS NOT TRUE THEN
        RAISE EXCEPTION 'confirmed rollout change failed: %', v_rollout;
    END IF;
END;
$$;

RESET ROLE;
DO $$
BEGIN
    IF (SELECT mode FROM public.neighbor_rollout_state WHERE singleton) <> 'public_beta'
       OR NOT EXISTS (
           SELECT 1 FROM public.neighbor_rollout_events event
           WHERE event.from_mode = 'internal'
             AND event.to_mode = 'public_beta'
             AND event.confirmation_used IS TRUE
             AND event.changed_by = current_setting('test.neighbor_admin')::UUID
       ) THEN
        RAISE EXCEPTION 'confirmed rollout change was not recorded';
    END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.neighbor_admin'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.neighbor_admin'), 'role', 'authenticated'
)::TEXT, TRUE);
SELECT public.change_neighbor_rollout_v1('internal', '');
RESET ROLE;

-- INITIALLY DEFERRED 호스트 무결성 트리거를 ROLLBACK 전에 실제로 실행한다.
SET CONSTRAINTS neighbor_spaces_host_constraint, neighbor_space_classes_host_constraint IMMEDIATE;

DO $$
DECLARE
    v_teacher UUID;
    v_class UUID := gen_random_uuid();
    v_space UUID := gen_random_uuid();
    v_missing_host_blocked BOOLEAN := FALSE;
BEGIN
    SELECT profile.id INTO v_teacher
    FROM public.profiles profile
    WHERE profile.role IN ('TEACHER', 'ADMIN')
    ORDER BY CASE WHEN profile.role = 'TEACHER' THEN 0 ELSE 1 END, profile.created_at
    LIMIT 1;

    INSERT INTO public.classes (id, teacher_id, name)
    VALUES (v_class, v_teacher, '호스트 무결성 스모크');

    BEGIN
        INSERT INTO public.neighbor_spaces (id, host_class_id, created_by, name, status)
        VALUES (v_space, v_class, v_teacher, '호스트 없는 공간', 'active');
    EXCEPTION WHEN check_violation THEN
        v_missing_host_blocked := TRUE;
    END;
    IF NOT v_missing_host_blocked THEN
        RAISE EXCEPTION 'active space without one matching host class must be blocked';
    END IF;
END;
$$;

DO $$
DECLARE
    v_teacher UUID;
    v_space UUID := gen_random_uuid();
    v_second_space UUID := gen_random_uuid();
    v_classes UUID[] := ARRAY[
        gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()
    ];
    v_fifth_blocked BOOLEAN := FALSE;
    v_second_space_blocked BOOLEAN := FALSE;
BEGIN
    SELECT profile.id INTO v_teacher
    FROM public.profiles profile
    WHERE profile.role IN ('TEACHER', 'ADMIN')
    ORDER BY CASE WHEN profile.role = 'TEACHER' THEN 0 ELSE 1 END, profile.created_at
    LIMIT 1;
    IF v_teacher IS NULL THEN
        RAISE EXCEPTION 'teacher or admin profile is required for neighbor foundation smoke';
    END IF;

    INSERT INTO public.classes (id, teacher_id, name)
    SELECT class_id, v_teacher, '이웃 스모크 ' || ordinality
    FROM unnest(v_classes) WITH ORDINALITY AS test_class(class_id, ordinality);

    INSERT INTO public.neighbor_spaces (id, host_class_id, created_by, name, status)
    VALUES (v_space, v_classes[1], v_teacher, '이웃 스모크 공간', 'draft');
    INSERT INTO public.neighbor_space_classes (
        space_id, class_id, role, status, public_class_name, joined_at, reviewed_at, reviewed_by
    ) VALUES (
        v_space, v_classes[1], 'host', 'active', '호스트 학급', NOW(), NOW(), v_teacher
    );
    UPDATE public.neighbor_spaces SET status = 'active' WHERE id = v_space;

    INSERT INTO public.neighbor_space_classes (
        space_id, class_id, role, status, public_class_name, joined_at, reviewed_at, reviewed_by
    )
    SELECT v_space, v_classes[index], 'guest', 'active', '게스트 학급 ' || index, NOW(), NOW(), v_teacher
    FROM generate_series(2, 4) AS index;

    BEGIN
        INSERT INTO public.neighbor_space_classes (
            space_id, class_id, role, status, public_class_name, joined_at, reviewed_at, reviewed_by
        ) VALUES (
            v_space, v_classes[5], 'guest', 'active', '다섯 번째 학급', NOW(), NOW(), v_teacher
        );
    EXCEPTION WHEN check_violation THEN
        v_fifth_blocked := TRUE;
    END;
    IF NOT v_fifth_blocked THEN
        RAISE EXCEPTION 'fifth active class must be blocked';
    END IF;

    INSERT INTO public.neighbor_spaces (id, host_class_id, created_by, name, status)
    VALUES (v_second_space, v_classes[5], v_teacher, '두 번째 이웃 공간', 'draft');
    INSERT INTO public.neighbor_space_classes (
        space_id, class_id, role, status, public_class_name, joined_at, reviewed_at, reviewed_by
    ) VALUES (
        v_second_space, v_classes[5], 'host', 'active', '두 번째 호스트', NOW(), NOW(), v_teacher
    );

    BEGIN
        INSERT INTO public.neighbor_space_classes (
            space_id, class_id, role, status, public_class_name, joined_at, reviewed_at, reviewed_by
        ) VALUES (
            v_second_space, v_classes[2], 'guest', 'active', '중복 참여 학급', NOW(), NOW(), v_teacher
        );
    EXCEPTION WHEN unique_violation THEN
        v_second_space_blocked := TRUE;
    END;
    IF NOT v_second_space_blocked THEN
        RAISE EXCEPTION 'one class must not join two active neighbor spaces';
    END IF;
END;
$$;
