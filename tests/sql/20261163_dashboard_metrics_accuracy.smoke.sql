-- migrate:check의 바깥 트랜잭션에서 실행되고 마지막에 전부 롤백된다.

DO $$
BEGIN
    IF has_function_privilege('anon', 'public.get_student_by_auth()', 'EXECUTE')
       OR has_function_privilege('anon', 'public.bind_student_auth(text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.get_class_operations_dashboard(uuid,text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.admin_get_service_overview_v1(integer)', 'EXECUTE') THEN
        RAISE EXCEPTION '대시보드 또는 학생 인증 RPC가 익명 역할에 열려 있습니다.';
    END IF;

    IF NOT has_function_privilege('authenticated', 'public.get_student_by_auth()', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.bind_student_auth(text)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.get_class_operations_dashboard(uuid,text)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.admin_get_service_overview_v1(integer)', 'EXECUTE') THEN
        RAISE EXCEPTION '로그인 화면에서 필요한 대시보드 또는 학생 인증 RPC를 실행할 수 없습니다.';
    END IF;

    IF has_function_privilege(
        'authenticated',
        'public.record_system_peak_v1(date,integer,integer,integer,numeric,integer)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION '서버 최고치 기록 RPC가 브라우저 역할에 열려 있습니다.';
    END IF;
END;
$$;

-- 저장된 학생 세션 복구가 접속 시각을 실제로 갱신하는지 확인한다.
DO $$
DECLARE
    v_student public.students%ROWTYPE;
    v_result JSON;
BEGIN
    SELECT s.* INTO v_student
    FROM public.students s
    WHERE s.auth_id IS NOT NULL
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
    ORDER BY s.created_at
    LIMIT 1;

    IF v_student.id IS NULL THEN
        RAISE NOTICE '인증 연결 학생이 없어 last_login 스모크를 건너뜀';
        RETURN;
    END IF;

    PERFORM set_config('app.bypass_student_trigger', 'true', true);
    UPDATE public.students SET last_login = NOW() - INTERVAL '1 day' WHERE id = v_student.id;
    PERFORM set_config('app.bypass_student_trigger', 'false', true);

    PERFORM set_config('request.jwt.claim.sub', v_student.auth_id::TEXT, true);
    PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('sub', v_student.auth_id, 'role', 'authenticated')::TEXT,
        true
    );

    v_result := public.get_student_by_auth();
    IF NOT COALESCE((v_result->>'success')::BOOLEAN, FALSE) THEN
        RAISE EXCEPTION '학생 세션 복구가 실패했습니다: %', v_result;
    END IF;
    IF (SELECT last_login FROM public.students WHERE id = v_student.id) < NOW() - INTERVAL '1 minute' THEN
        RAISE EXCEPTION '학생 세션 복구 뒤 last_login이 갱신되지 않았습니다.';
    END IF;
END;
$$;

-- 관리자 서비스 현황과 사용량 요약을 같은 원본에서 직접 센 값과 비교한다.
DO $$
DECLARE
    v_admin_id UUID;
    v_result JSONB;
    v_usage JSON;
    v_today_start TIMESTAMPTZ;
    v_week_start TIMESTAMPTZ;
    v_expected BIGINT;
BEGIN
    SELECT p.id INTO v_admin_id
    FROM public.profiles p
    WHERE p.role = 'ADMIN'
    ORDER BY p.created_at
    LIMIT 1;

    IF v_admin_id IS NULL THEN
        RAISE NOTICE '관리자 계정이 없어 관리자 대시보드 스모크를 건너뜀';
        RETURN;
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_admin_id::TEXT, true);
    PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('sub', v_admin_id, 'role', 'authenticated')::TEXT,
        true
    );

    v_today_start := (timezone('Asia/Seoul', NOW())::DATE)::TIMESTAMP AT TIME ZONE 'Asia/Seoul';
    v_week_start := (timezone('Asia/Seoul', NOW())::DATE - 6)::TIMESTAMP AT TIME ZONE 'Asia/Seoul';
    v_result := public.admin_get_service_overview_v1(30);

    SELECT COUNT(*) INTO v_expected FROM public.profiles
    WHERE role = 'TEACHER' AND last_login_at >= v_today_start;
    IF (v_result#>>'{today,teachers}')::BIGINT <> v_expected THEN
        RAISE EXCEPTION '오늘 접속 교사 수가 원본과 다릅니다: %, %', v_result#>>'{today,teachers}', v_expected;
    END IF;

    SELECT COUNT(*) INTO v_expected FROM public.students
    WHERE last_login >= v_today_start AND (deleted_at IS NULL OR deleted_at > NOW());
    IF (v_result#>>'{today,students}')::BIGINT <> v_expected THEN
        RAISE EXCEPTION '오늘 접속 학생 수가 원본과 다릅니다: %, %', v_result#>>'{today,students}', v_expected;
    END IF;

    SELECT COUNT(*) INTO v_expected FROM public.ai_request_events WHERE created_at >= v_today_start;
    IF (v_result#>>'{today,ai_calls}')::BIGINT <> v_expected THEN
        RAISE EXCEPTION '오늘 AI 호출 수가 원본과 다릅니다: %, %', v_result#>>'{today,ai_calls}', v_expected;
    END IF;

    SELECT COUNT(*) INTO v_expected FROM public.student_posts
    WHERE is_submitted IS TRUE AND COALESCE(first_submitted_at, created_at) >= v_today_start;
    IF (v_result#>>'{today,posts}')::BIGINT <> v_expected THEN
        RAISE EXCEPTION '오늘 제출 글 수가 원본과 다릅니다: %, %', v_result#>>'{today,posts}', v_expected;
    END IF;

    SELECT COUNT(*) INTO v_expected FROM public.students
    WHERE last_login >= v_week_start AND (deleted_at IS NULL OR deleted_at > NOW());
    IF (v_result#>>'{week,students}')::BIGINT <> v_expected THEN
        RAISE EXCEPTION '최근 7일 접속 학생 수가 원본과 다릅니다: %, %', v_result#>>'{week,students}', v_expected;
    END IF;

    IF jsonb_array_length(v_result->'trend') > 30 THEN
        RAISE EXCEPTION '30일 추세가 30행을 넘습니다: %', jsonb_array_length(v_result->'trend');
    END IF;

    v_usage := public.admin_get_usage_overview(60, 30);
    SELECT COUNT(*) INTO v_expected FROM public.profiles WHERE role = 'TEACHER';
    IF (v_usage->>'teacher_total')::BIGINT <> v_expected THEN
        RAISE EXCEPTION '가입 선생님 수에 관리자 등이 섞였습니다: %, %', v_usage->>'teacher_total', v_expected;
    END IF;

    SELECT COUNT(*) INTO v_expected FROM public.classes
    WHERE deleted_at IS NULL OR deleted_at > NOW();
    IF (v_usage->>'class_total')::BIGINT <> v_expected THEN
        RAISE EXCEPTION '활성 학급 수가 원본과 다릅니다: %, %', v_usage->>'class_total', v_expected;
    END IF;

    SELECT COUNT(*) INTO v_expected
    FROM public.students s
    JOIN public.classes c ON c.id = s.class_id
    WHERE (s.deleted_at IS NULL OR s.deleted_at > NOW())
      AND (c.deleted_at IS NULL OR c.deleted_at > NOW());
    IF (v_usage->>'student_total')::BIGINT <> v_expected THEN
        RAISE EXCEPTION '활성 학생 수가 원본과 다릅니다: %, %', v_usage->>'student_total', v_expected;
    END IF;

    IF EXISTS (SELECT 1 FROM public.admin_get_teacher_usage(60, 30) u WHERE u.role <> 'TEACHER') THEN
        RAISE EXCEPTION '선생님 사용량 목록에 선생님이 아닌 계정이 섞였습니다.';
    END IF;
END;
$$;

-- 교사 학급 현황의 접속/글쓰기 기본 수치를 직접 센 값과 비교한다.
DO $$
DECLARE
    v_class_id UUID;
    v_teacher_id UUID;
    v_result JSONB;
    v_period_start TIMESTAMPTZ;
    v_expected BIGINT;
BEGIN
    SELECT c.id, c.teacher_id INTO v_class_id, v_teacher_id
    FROM public.classes c
    JOIN public.profiles p ON p.id = c.teacher_id AND p.role = 'TEACHER'
    WHERE c.deleted_at IS NULL OR c.deleted_at > NOW()
    ORDER BY c.created_at
    LIMIT 1;

    IF v_class_id IS NULL THEN
        RAISE NOTICE '교사 학급이 없어 학급 운영 대시보드 스모크를 건너뜀';
        RETURN;
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_teacher_id::TEXT, true);
    PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('sub', v_teacher_id, 'role', 'authenticated')::TEXT,
        true
    );

    v_period_start := ((timezone('Asia/Seoul', NOW()))::DATE - 6)::TIMESTAMP AT TIME ZONE 'Asia/Seoul';
    v_result := public.get_class_operations_dashboard(v_class_id, '7d');

    SELECT COUNT(*) INTO v_expected FROM public.students
    WHERE class_id = v_class_id AND (deleted_at IS NULL OR deleted_at > NOW());
    IF (v_result#>>'{summary,students}')::BIGINT <> v_expected THEN
        RAISE EXCEPTION '학급 학생 수가 원본과 다릅니다: %, %', v_result#>>'{summary,students}', v_expected;
    END IF;

    SELECT COUNT(*) INTO v_expected FROM public.students
    WHERE class_id = v_class_id
      AND (deleted_at IS NULL OR deleted_at > NOW())
      AND last_login >= v_period_start;
    IF (v_result#>>'{summary,accessed_students}')::BIGINT <> v_expected THEN
        RAISE EXCEPTION '학급 접속 학생 수가 원본과 다릅니다: %, %', v_result#>>'{summary,accessed_students}', v_expected;
    END IF;

    WITH submission_times AS (
        SELECT e.post_id, MIN(e.occurred_at) AS submitted_at
        FROM public.writing_activity_events e
        WHERE e.class_id = v_class_id
          AND e.event_type IN ('post_submitted', 'post_resubmitted')
        GROUP BY e.post_id
    )
    SELECT COUNT(*) INTO v_expected
    FROM public.student_posts post
    JOIN public.students student
      ON student.id = post.student_id
     AND student.class_id = v_class_id
    LEFT JOIN submission_times st ON st.post_id = post.id
    WHERE post.class_id = v_class_id
      AND post.is_submitted IS TRUE
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
      AND COALESCE(post.first_submitted_at, st.submitted_at, post.created_at) >= v_period_start;
    IF (v_result#>>'{summary,submitted_posts}')::BIGINT <> v_expected THEN
        RAISE EXCEPTION '학급 작성 완료 글 수가 원본과 다릅니다: %, %', v_result#>>'{summary,submitted_posts}', v_expected;
    END IF;

    IF jsonb_array_length(v_result->'missions') > 6 THEN
        RAISE EXCEPTION '최근 미션 목록이 6개 상한을 넘었습니다.';
    END IF;
    IF jsonb_array_length(v_result#>'{actions,assignment_pending,items}') > 8
       OR jsonb_array_length(v_result#>'{actions,reading_pending,items}') > 8
       OR jsonb_array_length(v_result#>'{actions,evaluation_pending,items}') > 8
       OR jsonb_array_length(v_result#>'{actions,inactive_students,items}') > 8 THEN
        RAISE EXCEPTION '교사 확인 목록이 8개 상한을 넘었습니다.';
    END IF;
END;
$$;
