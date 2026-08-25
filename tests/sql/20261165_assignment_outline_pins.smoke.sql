-- 이 파일은 check-migrations가 만든 바깥 트랜잭션에서 실행되고 마지막에 전부 롤백된다.

DO $$
BEGIN
    IF has_table_privilege('authenticated', 'public.writing_assignment_outline_pins', 'SELECT')
       OR has_table_privilege('authenticated', 'public.writing_assignment_outline_pins', 'INSERT')
       OR has_table_privilege('authenticated', 'public.writing_assignment_outline_pins', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.writing_assignment_outline_pins', 'DELETE')
       OR has_table_privilege('authenticated', 'public.writing_assignment_outline_pin_events', 'SELECT')
       OR has_table_privilege('authenticated', 'public.writing_assignment_outline_pin_events', 'INSERT') THEN
        RAISE EXCEPTION '학생 브라우저에 과제 개요 고정 원장이 직접 공개되었습니다.';
    END IF;

    IF has_function_privilege('anon', 'public.set_my_assignment_outline_pin_v1(uuid,uuid,uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.get_my_writing_references_v1(uuid,integer)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.get_teacher_post_detail_v1(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION '개요 고정·조회 RPC가 anon에 공개되었습니다.';
    END IF;
END;
$$;

-- 승인되지 않은 과제 한 건을 골라 학생 권한으로 최초 고정/멱등 호출/교체 충돌을 확인한다.
SELECT set_config('test.outline_pin_mission_id', fixture.mission_id::TEXT, true),
       set_config('test.outline_pin_student_auth_id', fixture.student_auth_id::TEXT, true),
       set_config('test.outline_pin_result_id', fixture.result_id::TEXT, true)
FROM (
    SELECT mission.id AS mission_id,
           student.auth_id AS student_auth_id,
           portable.id AS result_id
    FROM public.writing_missions mission
    JOIN public.classes class
      ON class.id = mission.class_id
     AND class.deleted_at IS NULL
    JOIN public.students student
      ON student.class_id = mission.class_id
     AND student.auth_id IS NOT NULL
     AND student.is_active IS DISTINCT FROM FALSE
     AND student.deleted_at IS NULL
    JOIN writing_helper.portable_results portable
      ON portable.agit_student_id = student.id
     AND portable.class_id = mission.class_id
     AND portable.result_kind = 'outline'
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.student_posts post
        WHERE post.class_id = mission.class_id
          AND post.student_id = student.id
          AND post.mission_id = mission.id
          AND post.is_confirmed IS TRUE
    )
    ORDER BY portable.updated_at DESC, mission.created_at DESC
    LIMIT 1
) fixture;

DO $$
BEGIN
    IF current_setting('test.outline_pin_mission_id', true) IS NULL
       OR current_setting('test.outline_pin_student_auth_id', true) IS NULL
       OR current_setting('test.outline_pin_result_id', true) IS NULL THEN
        RAISE EXCEPTION '개요 고정 권한 스모크에 사용할 완료 개요·학생·과제 fixture가 없습니다.';
    END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.outline_pin_student_auth_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.outline_pin_student_auth_id'),
    'role', 'authenticated',
    'app_metadata', jsonb_build_object('role', 'ADMIN')
)::TEXT, true);

DO $$
DECLARE
    v_mission_id UUID := current_setting('test.outline_pin_mission_id')::UUID;
    v_first UUID := current_setting('test.outline_pin_result_id')::UUID;
    v_second UUID;
    v_expected UUID;
    v_result JSONB;
BEGIN
    SELECT reference.id
      INTO v_expected
    FROM public.get_my_writing_references_v1(v_mission_id, 20) reference
    WHERE reference.is_pinned
    LIMIT 1;

    v_result := public.set_my_assignment_outline_pin_v1(v_mission_id, v_first, v_expected);
    IF COALESCE((v_result->>'success')::BOOLEAN, FALSE) IS NOT TRUE THEN
        RAISE EXCEPTION '본인 개요 고정에 실패했습니다: %', v_result;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.get_my_writing_references_v1(v_mission_id, 20) reference
        WHERE reference.id = v_first
          AND reference.is_pinned
          AND reference.result_updated_at IS NOT NULL
          AND reference.pinned_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION '고정 개요가 최신 내용·고정 시각과 함께 첫 행 범위에 포함되지 않았습니다.';
    END IF;

    v_result := public.set_my_assignment_outline_pin_v1(v_mission_id, v_first, v_first);
    IF v_result->>'status' <> 'unchanged' THEN
        RAISE EXCEPTION '같은 개요 재요청이 멱등 처리되지 않았습니다: %', v_result;
    END IF;

    SELECT reference.id
      INTO v_second
    FROM public.get_my_writing_references_v1(v_mission_id, 20) reference
    WHERE reference.result_kind = 'outline'
      AND reference.id <> v_first
    ORDER BY reference.completed_at DESC
    LIMIT 1;

    IF v_second IS NOT NULL THEN
        v_result := public.set_my_assignment_outline_pin_v1(v_mission_id, v_second, NULL);
        IF v_result->>'status' <> 'conflict' THEN
            RAISE EXCEPTION '오래된 탭의 개요 교체가 충돌로 차단되지 않았습니다: %', v_result;
        END IF;

        v_result := public.set_my_assignment_outline_pin_v1(v_mission_id, v_second, v_first);
        IF v_result->>'status' <> 'replaced' THEN
            RAISE EXCEPTION '확인된 다른 개요 교체에 실패했습니다: %', v_result;
        END IF;
    END IF;
END;
$$;

RESET ROLE;

-- 교사 상세는 별도 개요 RPC 없이 기존 한 번의 응답에 nullable outline_reference를 포함한다.
SELECT set_config('test.outline_teacher_id', fixture.teacher_id::TEXT, true),
       set_config('test.outline_post_id', fixture.post_id::TEXT, true)
FROM (
    SELECT class.teacher_id, post.id AS post_id
    FROM public.student_posts post
    JOIN public.classes class
      ON class.id = post.class_id
     AND class.deleted_at IS NULL
    WHERE class.teacher_id IS NOT NULL
    ORDER BY post.updated_at DESC
    LIMIT 1
) fixture;

DO $$
DECLARE
    v_detail JSONB;
BEGIN
    IF current_setting('test.outline_teacher_id', true) IS NULL
       OR current_setting('test.outline_post_id', true) IS NULL THEN
        RAISE EXCEPTION '교사 개요 상세 스모크에 사용할 글 fixture가 없습니다.';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', current_setting('test.outline_teacher_id'), true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', current_setting('test.outline_teacher_id'), 'role', 'authenticated'
    )::TEXT, true);

    v_detail := public.get_teacher_post_detail_v1(current_setting('test.outline_post_id')::UUID);
    IF v_detail->>'version' <> '2'
       OR NOT (v_detail ? 'outline_reference')
       OR v_detail->'reactions' IS NULL
       OR v_detail->'comments' IS NULL THEN
        RAISE EXCEPTION '교사 글 상세 개요 계약 오류: %', v_detail;
    END IF;
END;
$$;
