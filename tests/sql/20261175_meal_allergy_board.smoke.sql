-- migrate:check 트랜잭션 안에서 실행되며 마지막에 모두 롤백된다.

DO $$
BEGIN
    IF has_table_privilege('authenticated', 'public.student_meal_health_profiles', 'SELECT')
       OR has_table_privilege('authenticated', 'public.class_meal_school_settings', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.class_meal_health_authorizations', 'SELECT')
       OR has_table_privilege('authenticated', 'public.meal_allergen_catalog', 'SELECT')
       OR has_table_privilege('authenticated', 'public.neis_meal_cache', 'SELECT') THEN
        RAISE EXCEPTION '급식·건강 내부 테이블이 브라우저 역할에 직접 공개되었습니다.';
    END IF;
    IF NOT has_table_privilege('service_role', 'public.neis_meal_cache', 'SELECT')
       OR NOT has_table_privilege('service_role', 'public.neis_meal_cache', 'INSERT') THEN
        RAISE EXCEPTION '급식 Edge 함수가 캐시를 읽고 쓸 권한이 없습니다.';
    END IF;
    IF (SELECT COUNT(*) FROM public.meal_allergen_catalog) <> 19 THEN
        RAISE EXCEPTION '공식 알레르기 항목 19개가 준비되지 않았습니다.';
    END IF;
END;
$$;

SELECT set_config('test.meal_teacher_id', fixture.teacher_id::TEXT, true),
       set_config('test.meal_class_id', fixture.class_id::TEXT, true),
       set_config('test.meal_student_id', fixture.student_id::TEXT, true)
FROM (
    SELECT class.teacher_id, class.id AS class_id, student.id AS student_id
    FROM public.classes class
    JOIN public.profiles teacher
      ON teacher.id = class.teacher_id
     AND teacher.role = 'TEACHER'
     AND teacher.is_approved IS TRUE
     AND teacher.approval_revoked_at IS NULL
    JOIN public.students student
      ON student.class_id = class.id
     AND student.deleted_at IS NULL
     AND student.is_active IS DISTINCT FROM FALSE
    WHERE class.deleted_at IS NULL
    ORDER BY class.created_at DESC, student.id
    LIMIT 1
) fixture;

DO $$ BEGIN
    IF current_setting('test.meal_teacher_id', true) IS NULL THEN
        RAISE EXCEPTION '급식 도구 권한 스모크에 사용할 교사·학급·학생이 없습니다.';
    END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.meal_teacher_id'), true);
SELECT set_config('request.jwt.claims', JSONB_BUILD_OBJECT(
    'sub', current_setting('test.meal_teacher_id'), 'role', 'authenticated'
)::TEXT, true);

DO $$
DECLARE
    v_workspace JSONB;
    v_saved JSONB;
    v_blocked BOOLEAN := FALSE;
BEGIN
    v_workspace := public.get_teacher_meal_board_workspace_v1(
        current_setting('test.meal_class_id')::UUID
    );
    IF JSONB_TYPEOF(v_workspace->'students') <> 'array'
       OR JSONB_ARRAY_LENGTH(v_workspace->'students') < 1
       OR JSONB_ARRAY_LENGTH(v_workspace->'students') > 100
       OR JSONB_ARRAY_LENGTH(v_workspace->'allergens') <> 19
       OR v_workspace->'healthAuthorization' IS DISTINCT FROM 'null'::JSONB THEN
        RAISE EXCEPTION '급식 도구 작업공간 형식 또는 목록 상한이 올바르지 않습니다.';
    END IF;

    BEGIN
        PERFORM public.save_teacher_student_meal_health_v1(
            current_setting('test.meal_class_id')::UUID,
            current_setting('test.meal_student_id')::UUID,
            'confirmed_none',
            '{}'::SMALLINT[]
        );
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION '처리 근거 확인 전 학생 건강 항목이 저장되었습니다.';
    END IF;

    PERFORM public.confirm_teacher_meal_health_authorization_v1(
        current_setting('test.meal_class_id')::UUID
    );
    v_saved := public.save_teacher_student_meal_health_v1(
        current_setting('test.meal_class_id')::UUID,
        current_setting('test.meal_student_id')::UUID,
        'has_items',
        ARRAY[2, 6]::SMALLINT[]
    );
    IF v_saved->'allergenCodes' <> '[2,6]'::JSONB THEN
        RAISE EXCEPTION '학생 건강 항목이 정규화되어 저장되지 않았습니다.';
    END IF;

    PERFORM public.save_teacher_meal_school_v1(
        current_setting('test.meal_class_id')::UUID,
        'class', 'B10', '7010001', '테스트초등학교', '서울특별시 테스트로 1'
    );
    v_workspace := public.get_teacher_meal_board_workspace_v1(
        current_setting('test.meal_class_id')::UUID
    );
    IF v_workspace#>>'{school,source}' <> 'class_override'
       OR v_workspace#>>'{school,schoolCode}' <> '7010001'
       OR v_workspace->'healthAuthorization' IS NULL THEN
        RAISE EXCEPTION '학급별 급식 학교 또는 처리 근거 확인 기록이 적용되지 않았습니다.';
    END IF;

    PERFORM public.save_teacher_meal_school_v1(
        current_setting('test.meal_class_id')::UUID,
        'default', 'B10', '7010002', '기본테스트초등학교', '서울특별시 기본로 2'
    );
    v_workspace := public.get_teacher_meal_board_workspace_v1(
        current_setting('test.meal_class_id')::UUID
    );
    IF v_workspace#>>'{school,source}' <> 'teacher_default'
       OR v_workspace#>>'{school,schoolCode}' <> '7010002' THEN
        RAISE EXCEPTION '교사 기본 학교 자동 연동이 올바르지 않습니다.';
    END IF;
END;
$$;

RESET ROLE;

SELECT set_config('test.meal_other_teacher_id', COALESCE((
    SELECT class.teacher_id::TEXT
    FROM public.classes class
    WHERE class.teacher_id <> current_setting('test.meal_teacher_id')::UUID
      AND class.deleted_at IS NULL
    LIMIT 1
), ''), true);

DO $$
DECLARE
    v_other_teacher TEXT := current_setting('test.meal_other_teacher_id', true);
    v_blocked BOOLEAN := FALSE;
BEGIN
    IF COALESCE(v_other_teacher, '') = '' THEN RETURN; END IF;
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', v_other_teacher, true);
    PERFORM set_config('request.jwt.claims', JSONB_BUILD_OBJECT(
        'sub', v_other_teacher, 'role', 'authenticated'
    )::TEXT, true);
    BEGIN
        PERFORM public.get_teacher_meal_board_workspace_v1(
            current_setting('test.meal_class_id')::UUID
        );
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION '다른 교사가 급식·건강 작업공간을 조회했습니다.';
    END IF;
END;
$$;

RESET ROLE;

SELECT set_config('test.meal_student_auth_id', COALESCE((
    SELECT student.auth_id::TEXT
    FROM public.students student
    WHERE student.auth_id IS NOT NULL
      AND student.deleted_at IS NULL
      AND student.is_active IS DISTINCT FROM FALSE
    LIMIT 1
), ''), true);

DO $$
DECLARE
    v_student_auth TEXT := current_setting('test.meal_student_auth_id', true);
    v_blocked BOOLEAN := FALSE;
BEGIN
    IF COALESCE(v_student_auth, '') = '' THEN RETURN; END IF;
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', v_student_auth, true);
    PERFORM set_config('request.jwt.claims', JSONB_BUILD_OBJECT(
        'sub', v_student_auth, 'role', 'authenticated'
    )::TEXT, true);
    BEGIN
        PERFORM public.get_teacher_meal_board_workspace_v1(
            current_setting('test.meal_class_id')::UUID
        );
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION '학생이 교사용 급식·건강 작업공간을 조회했습니다.';
    END IF;
END;
$$;

RESET ROLE;

DO $$
DECLARE
    v_function TEXT;
BEGIN
    SELECT pg_get_functiondef('public.get_teacher_meal_board_workspace_v1(uuid)'::REGPROCEDURE)
        || pg_get_functiondef('public.confirm_teacher_meal_health_authorization_v1(uuid)'::REGPROCEDURE)
        || pg_get_functiondef('public.save_teacher_student_meal_health_v1(uuid,uuid,text,smallint[])'::REGPROCEDURE)
        || pg_get_functiondef('public.save_teacher_meal_school_v1(uuid,text,text,text,text,text)'::REGPROCEDURE)
    INTO v_function;
    IF v_function ~ 'auth\.jwt|app_metadata' THEN
        RAISE EXCEPTION '급식 도구 권한 판정이 JWT 메타데이터를 신뢰합니다.';
    END IF;
END;
$$;
