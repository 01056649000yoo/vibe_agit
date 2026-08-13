-- 이 파일은 run-rollback-smoke가 만든 바깥 트랜잭션에서 실행되고 마지막에 전부 롤백된다.

DO $$
BEGIN
    IF has_table_privilege('authenticated', 'public.writing_mission_lab_sources', 'SELECT')
       OR has_table_privilege('authenticated', 'public.writing_mission_lab_sources', 'INSERT')
       OR has_table_privilege('authenticated', 'public.writing_mission_lab_sources', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.writing_mission_lab_sources', 'DELETE') THEN
        RAISE EXCEPTION '참고함 연결표가 브라우저 역할에 직접 공개됐습니다.';
    END IF;
END;
$$;

SELECT set_config('test.wr_mission_id', fixture.mission_id::TEXT, true),
       set_config('test.wr_teacher_id', fixture.teacher_id::TEXT, true),
       set_config('test.wr_student_auth_id', fixture.student_auth_id::TEXT, true),
       set_config('test.wr_class_id', fixture.class_id::TEXT, true)
FROM (
    SELECT mission.id AS mission_id,
           class.teacher_id,
           student.auth_id AS student_auth_id,
           class.id AS class_id
    FROM public.writing_missions mission
    JOIN public.classes class
      ON class.id = mission.class_id
     AND class.deleted_at IS NULL
    JOIN public.profiles teacher
      ON teacher.id = class.teacher_id
     AND teacher.role = 'TEACHER'
     AND teacher.is_approved IS TRUE
     AND teacher.approval_revoked_at IS NULL
    JOIN public.students student
      ON student.class_id = class.id
     AND student.auth_id IS NOT NULL
     AND student.is_active IS DISTINCT FROM FALSE
     AND student.deleted_at IS NULL
    ORDER BY mission.created_at DESC
    LIMIT 1
) fixture;

DO $$
BEGIN
    IF current_setting('test.wr_mission_id', true) IS NULL
       OR current_setting('test.wr_teacher_id', true) IS NULL
       OR current_setting('test.wr_student_auth_id', true) IS NULL THEN
        RAISE EXCEPTION '참고함 권한 스모크에 사용할 교사·학생·과제 fixture가 없습니다.';
    END IF;
END;
$$;

SELECT set_config('test.wr_other_mission_id', COALESCE((
    SELECT mission.id::TEXT
    FROM public.writing_missions mission
    WHERE mission.class_id <> current_setting('test.wr_class_id')::UUID
    LIMIT 1
), ''), true);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.wr_teacher_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.wr_teacher_id'), 'role', 'authenticated'
)::TEXT, true);

DO $$
BEGIN
    PERFORM *
    FROM public.get_teacher_mission_lab_sources_v1(
        current_setting('test.wr_mission_id')::UUID
    );

    IF public.set_teacher_mission_lab_source_v1(
        current_setting('test.wr_mission_id')::UUID,
        'outline',
        NULL
    ) IS NOT TRUE THEN
        RAISE EXCEPTION '담당 교사가 과제 참고함 연결을 관리하지 못했습니다.';
    END IF;
END;
$$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.wr_student_auth_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.wr_student_auth_id'), 'role', 'authenticated',
    'app_metadata', jsonb_build_object('role', 'ADMIN', 'class_id', gen_random_uuid())
)::TEXT, true);

DO $$
DECLARE
    v_blocked BOOLEAN := FALSE;
    v_other_mission TEXT := current_setting('test.wr_other_mission_id', true);
BEGIN
    PERFORM *
    FROM public.get_my_writing_references_v1(
        current_setting('test.wr_mission_id')::UUID,
        20
    );

    BEGIN
        PERFORM *
        FROM public.get_teacher_mission_lab_sources_v1(
            current_setting('test.wr_mission_id')::UUID
        );
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION '학생이 교사용 연구소 연결 목록을 조회했습니다.';
    END IF;

    v_blocked := FALSE;
    BEGIN
        PERFORM public.set_teacher_mission_lab_source_v1(
            current_setting('test.wr_mission_id')::UUID,
            'outline',
            NULL
        );
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION '학생이 과제 참고함 연결을 변경했습니다.';
    END IF;

    IF COALESCE(v_other_mission, '') <> '' THEN
        v_blocked := FALSE;
        BEGIN
            PERFORM *
            FROM public.get_my_writing_references_v1(v_other_mission::UUID, 20);
        EXCEPTION WHEN insufficient_privilege THEN
            v_blocked := TRUE;
        END;
        IF NOT v_blocked THEN
            RAISE EXCEPTION '학생이 다른 학급 과제의 참고함 결과를 조회했습니다.';
        END IF;
    END IF;
END;
$$;

RESET ROLE;
