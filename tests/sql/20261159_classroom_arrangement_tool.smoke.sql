-- run-rollback-smoke가 만든 바깥 트랜잭션 안에서 실행되고 마지막에 모두 롤백된다.

DO $$
BEGIN
    IF has_table_privilege('authenticated', 'public.classroom_arrangement_settings', 'SELECT')
       OR has_table_privilege('authenticated', 'public.classroom_arrangement_history', 'INSERT')
       OR has_table_privilege('authenticated', 'public.survival_legacy_archives', 'SELECT') THEN
        RAISE EXCEPTION '자리·역할 내부 표가 브라우저 역할에 직접 공개됐습니다.';
    END IF;
END;
$$;

SELECT set_config('test.arr_teacher_id', fixture.teacher_id::TEXT, true),
       set_config('test.arr_class_id', fixture.class_id::TEXT, true)
FROM (
    SELECT class.teacher_id, class.id AS class_id
    FROM public.classes class
    JOIN public.profiles teacher
      ON teacher.id = class.teacher_id
     AND teacher.role = 'TEACHER'
     AND teacher.is_approved IS TRUE
     AND teacher.approval_revoked_at IS NULL
    WHERE class.deleted_at IS NULL
    ORDER BY class.created_at DESC
    LIMIT 1
) fixture;

DO $$ BEGIN
    IF current_setting('test.arr_teacher_id', true) IS NULL THEN
        RAISE EXCEPTION '자리·역할 권한 스모크에 사용할 교사 학급이 없습니다.';
    END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.arr_teacher_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.arr_teacher_id'), 'role', 'authenticated'
)::TEXT, true);

DO $$
DECLARE
    v_workspace JSONB;
    v_history_id UUID;
BEGIN
    v_workspace := public.get_teacher_classroom_arrangement_v1(
        current_setting('test.arr_class_id')::UUID, 500
    );
    IF JSONB_TYPEOF(v_workspace->'students') <> 'array'
       OR JSONB_TYPEOF(v_workspace->'history') <> 'array' THEN
        RAISE EXCEPTION '자리·역할 작업공간 형식이 올바르지 않습니다.';
    END IF;

    PERFORM public.save_teacher_classroom_arrangement_settings_v1(
        current_setting('test.arr_class_id')::UUID,
        '{"avoidDuplicates":true}'::JSONB,
        '{"roleGroups":[]}'::JSONB,
        '{}'::JSONB
    );

    v_history_id := (public.create_teacher_classroom_arrangement_history_v1(
        current_setting('test.arr_class_id')::UUID,
        'seat',
        '스모크 자리 배치',
        '{"format":"classroom-arrangement/seat-v1","assignments":[]}'::JSONB
    )->>'id')::UUID;
    PERFORM public.delete_teacher_classroom_arrangement_history_v1(v_history_id);

    PERFORM public.import_teacher_survival_archive_v1(
        REPEAT('a', 64), 2,
        '{"classCount":1}'::JSONB,
        '{"app":"classroom-tools","data":{"classes":[]}}'::JSONB
    );
END;
$$;

RESET ROLE;

SELECT set_config('test.arr_student_auth_id', COALESCE((
    SELECT student.auth_id::TEXT
    FROM public.students student
    WHERE student.auth_id IS NOT NULL
      AND student.deleted_at IS NULL
    LIMIT 1
), ''), true);

DO $$
DECLARE
    v_student_auth TEXT := current_setting('test.arr_student_auth_id', true);
    v_blocked BOOLEAN := FALSE;
BEGIN
    IF COALESCE(v_student_auth, '') = '' THEN RETURN; END IF;
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', v_student_auth, true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_student_auth, 'role', 'authenticated')::TEXT, true);
    BEGIN
        PERFORM public.get_teacher_classroom_arrangement_v1(
            current_setting('test.arr_class_id')::UUID, 50
        );
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION '학생이 교사용 자리·역할 작업공간을 조회했습니다.';
    END IF;
END;
$$;

RESET ROLE;
