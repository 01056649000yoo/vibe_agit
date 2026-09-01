-- run-rollback-smoke 또는 migrate:check의 바깥 트랜잭션에서 실행되고 마지막에 모두 롤백된다.

DO $$
BEGIN
    IF has_table_privilege('authenticated', 'public.class_boards', 'SELECT')
       OR has_table_privilege('authenticated', 'public.class_boards', 'INSERT')
       OR has_table_privilege('service_role', 'public.class_boards', 'SELECT') THEN
        RAISE EXCEPTION '우리 반 스크린 내부 표가 브라우저 역할에 직접 공개됐습니다.';
    END IF;
    IF (SELECT public FROM storage.buckets WHERE id = 'class-board-assets') IS DISTINCT FROM FALSE
       OR (SELECT file_size_limit FROM storage.buckets WHERE id = 'class-board-assets') <> 1048576 THEN
        RAISE EXCEPTION '우리 반 스크린 이미지 버킷이 비공개·1MB 계약을 지키지 않습니다.';
    END IF;
END;
$$;

SELECT set_config('test.board_teacher_id', fixture.teacher_id::TEXT, true),
       set_config('test.board_class_id', fixture.class_id::TEXT, true)
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

-- 내부 스냅숏 함수는 브라우저 역할에 실행 권한을 열지 않는다. 함수 소유자 상태에서
-- 비교 기준만 먼저 보관하고, 아래 실제 기능 호출은 authenticated 교사로 검증한다.
SELECT set_config(
    'test.board_expected_snapshot',
    public.teacher_assignment_submission_board_snapshot_v2(
        current_setting('test.board_class_id')::UUID, NULL, 20, 1
    )::TEXT,
    true
);

DO $$ BEGIN
    IF current_setting('test.board_teacher_id', true) IS NULL THEN
        RAISE EXCEPTION '우리 반 스크린 권한 스모크에 사용할 교사 학급이 없습니다.';
    END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.board_teacher_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.board_teacher_id'), 'role', 'authenticated'
)::TEXT, true);

DO $$
DECLARE
    v_board JSONB;
    v_copy JSONB;
    v_archive JSONB;
    v_workspace JSONB;
    v_presentation JSONB;
    v_status JSONB;
    v_snapshot JSONB;
    v_summary JSONB;
BEGIN
    v_workspace := public.get_teacher_class_board_workspace_v1(
        current_setting('test.board_class_id')::UUID, 200
    );
    IF v_workspace->>'version' <> '1'
       OR JSONB_TYPEOF(v_workspace->'boards') <> 'array'
       OR JSONB_ARRAY_LENGTH(v_workspace->'boards') > 20 THEN
        RAISE EXCEPTION '우리 반 스크린 작업공간 형식이나 상한이 올바르지 않습니다.';
    END IF;

    v_board := public.save_teacher_class_board_v1(
        current_setting('test.board_class_id')::UUID,
        NULL,
        '스크린 스모크',
        '{"version":1,"preset":"split-8-4"}'::JSONB,
        '[
          {"instanceId":"smoke-text","widgetId":"text","version":1,"zone":"content","order":10,"size":"medium","visible":true,"config":{"heading":"안내","body":"오늘도 즐겁게 써요.","tone":"paper"}},
          {"instanceId":"smoke-image","widgetId":"image","version":1,"zone":"content","order":20,"size":"large","visible":true,"config":{"path":"","caption":"","fit":"contain"}},
          {"instanceId":"smoke-status","widgetId":"writing-status","version":1,"zone":"sidebar","order":10,"size":"large","visible":true,"config":{"missionId":null}}
        ]'::JSONB,
        NULL
    );
    IF v_board->>'revision' <> '1' OR v_board->>'isActive' <> 'true' THEN
        RAISE EXCEPTION '첫 스크린 저장 결과가 올바르지 않습니다.';
    END IF;

    v_presentation := public.get_teacher_class_board_presentation_v1((v_board->>'id')::UUID);
    IF v_presentation#>>'{board,id}' <> v_board->>'id'
       OR v_presentation::TEXT ~ 'student_name|recent_submissions|structured_content' THEN
        RAISE EXCEPTION '발표 응답에 학생 식별 정보나 글 내용이 포함됐습니다.';
    END IF;

    v_status := public.get_teacher_class_board_status_v1(
        current_setting('test.board_class_id')::UUID, NULL
    );
    v_snapshot := current_setting('test.board_expected_snapshot')::JSONB;
    v_summary := v_snapshot->'scope_summary';
    IF v_status::TEXT ~ 'student_name|student_statuses|recent_submissions|post_id'
       OR (v_status->>'confirmedCount')::INTEGER <> COALESCE((v_summary->>'confirmed_count')::INTEGER, 0)
       OR (v_status->>'pendingCount')::INTEGER <> COALESCE((v_summary->>'pending_count')::INTEGER, 0)
       OR (v_status->>'rewritingCount')::INTEGER <> COALESCE((v_summary->>'rewriting_count')::INTEGER, 0)
       OR (v_status->>'notSubmittedCount')::INTEGER <> COALESCE((v_summary->>'not_submitted_count')::INTEGER, 0)
       OR JSONB_ARRAY_LENGTH(v_status->'missionOptions') > 20 THEN
        RAISE EXCEPTION '발표 현황이 기존 제출 집계와 다르거나 개인정보를 포함합니다.';
    END IF;

    v_copy := public.duplicate_teacher_class_board_v1((v_board->>'id')::UUID);
    IF v_copy->>'id' = v_board->>'id' OR v_copy->>'isActive' <> 'true' THEN
        RAISE EXCEPTION '스크린 복제 결과가 올바르지 않습니다.';
    END IF;
    v_archive := public.archive_teacher_class_board_v1((v_copy->>'id')::UUID);
    v_workspace := public.get_teacher_class_board_workspace_v1(
        current_setting('test.board_class_id')::UUID, 20
    );
    IF v_archive->>'activeBoardId' <> v_board->>'id'
       OR NOT EXISTS (
           SELECT 1
           FROM JSONB_ARRAY_ELEMENTS(v_workspace->'boards') item
           WHERE item->>'id' = v_board->>'id' AND item->>'isActive' = 'true'
       )
       OR EXISTS (
           SELECT 1
           FROM JSONB_ARRAY_ELEMENTS(v_workspace->'boards') item
           WHERE item->>'id' = v_copy->>'id'
       ) THEN
        RAISE EXCEPTION '현재 스크린 보관 뒤 이전 스크린이 활성화되지 않았습니다.';
    END IF;
END;
$$;

RESET ROLE;

SELECT set_config('test.board_student_auth_id', COALESCE((
    SELECT student.auth_id::TEXT
    FROM public.students student
    WHERE student.auth_id IS NOT NULL AND student.deleted_at IS NULL
    LIMIT 1
), ''), true);

DO $$
DECLARE
    v_student_auth TEXT := current_setting('test.board_student_auth_id', true);
    v_blocked BOOLEAN := FALSE;
BEGIN
    IF COALESCE(v_student_auth, '') = '' THEN RETURN; END IF;
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', v_student_auth, true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_student_auth, 'role', 'authenticated')::TEXT, true);
    BEGIN
        PERFORM public.get_teacher_class_board_workspace_v1(
            current_setting('test.board_class_id')::UUID, 20
        );
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION '학생이 교사용 우리 반 스크린 작업공간을 조회했습니다.';
    END IF;
END;
$$;

RESET ROLE;
