-- migrate:check 바깥 트랜잭션에서 실행되며 마지막에 모두 롤백된다.

DO $$
BEGIN
    IF (SELECT public FROM storage.buckets WHERE id = 'class-board-assets') IS DISTINCT FROM FALSE
       OR (SELECT file_size_limit FROM storage.buckets WHERE id = 'class-board-assets') <> 2097152 THEN
        RAISE EXCEPTION '우리 반 스크린 이미지 버킷이 비공개·2MB 계약을 지키지 않습니다.';
    END IF;
END;
$$;

SELECT set_config('test.free_board_teacher_id', fixture.teacher_id::TEXT, true),
       set_config('test.free_board_class_id', fixture.class_id::TEXT, true)
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
    IF current_setting('test.free_board_teacher_id', true) IS NULL THEN
        RAISE EXCEPTION '자유 배치 스모크에 사용할 교사 학급이 없습니다.';
    END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.free_board_teacher_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.free_board_teacher_id'), 'role', 'authenticated'
)::TEXT, true);

DO $$
DECLARE
    v_board JSONB;
    v_presentation JSONB;
    v_status JSONB;
    v_total INTEGER;
    v_submitter_count INTEGER;
    v_non_submitter_count INTEGER;
    v_invalid_blocked BOOLEAN := FALSE;
BEGIN
    v_board := public.save_teacher_class_board_v1(
        current_setting('test.free_board_class_id')::UUID,
        NULL,
        '자유 배치 스모크',
        '{"version":2,"preset":"freeform-7-3"}'::JSONB,
        '[
          {"instanceId":"free-text","widgetId":"text","version":1,"zone":"content","order":10,"size":"medium","visible":true,"placement":{"x":3,"y":4,"width":45,"height":42,"pinned":true},"config":{"heading":"안내","body":"자유롭게 배치해요.","tone":"paper"}},
          {"instanceId":"free-image","widgetId":"image","version":1,"zone":"content","order":20,"size":"large","visible":true,"placement":{"x":51,"y":4,"width":46,"height":48,"pinned":false},"config":{"path":"","caption":"","fit":"contain"}},
          {"instanceId":"free-status","widgetId":"writing-status","version":1,"zone":"sidebar","order":10,"size":"large","visible":true,"config":{"missionId":null}}
        ]'::JSONB,
        NULL
    );

    v_presentation := public.get_teacher_class_board_presentation_v1((v_board->>'id')::UUID);
    IF v_presentation#>>'{board,layout,version}' <> '2'
       OR v_presentation#>>'{board,widgets,0,placement,x}' <> '3'
       OR v_presentation#>>'{board,widgets,0,placement,pinned}' <> 'true'
       OR v_presentation::TEXT ~ 'student_id|post_id|structured_content|auth_id' THEN
        RAISE EXCEPTION '자유 배치 좌표·핀 상태가 발표 화면에 그대로 보존되지 않았습니다.';
    END IF;

    v_status := public.get_teacher_class_board_status_v1(
        current_setting('test.free_board_class_id')::UUID, NULL
    );
    IF JSONB_TYPEOF(v_status->'submitterNames') <> 'array'
       OR JSONB_TYPEOF(v_status->'nonSubmitterNames') <> 'array'
       OR JSONB_TYPEOF(v_status->'rewritingNames') <> 'array'
       OR JSONB_TYPEOF(v_status#>'{dailyWriting,diary}') <> 'object'
       OR JSONB_TYPEOF(v_status#>'{dailyWriting,readingLog}') <> 'object'
       OR JSONB_ARRAY_LENGTH(v_status->'missionOptions') > 20
       OR v_status::TEXT ~ 'student_id|student_statuses|recent_submissions|post_id|structured_content|auth_id' THEN
        RAISE EXCEPTION '오늘의 학급 현황 응답 계약이 올바르지 않습니다: %', v_status;
    END IF;

    v_total := COALESCE((v_status->>'totalStudents')::INTEGER, 0);
    v_submitter_count := JSONB_ARRAY_LENGTH(v_status->'submitterNames');
    v_non_submitter_count := JSONB_ARRAY_LENGTH(v_status->'nonSubmitterNames');
    IF v_status->>'scope' = 'mission' AND v_total <= 100 AND (
        v_submitter_count <> (v_status->>'submittedCount')::INTEGER
        OR v_non_submitter_count <> (v_status->>'rewritingCount')::INTEGER
            + (v_status->>'notSubmittedCount')::INTEGER
        OR v_submitter_count + v_non_submitter_count <> v_total
    ) THEN
        RAISE EXCEPTION '미션 제출자·미제출자 이름 수가 집계 숫자와 다릅니다: %', v_status;
    END IF;
    IF COALESCE((v_status#>>'{dailyWriting,diary,completedStudentCount}')::INTEGER, 0) > v_total
       OR COALESCE((v_status#>>'{dailyWriting,readingLog,completedStudentCount}')::INTEGER, 0) > v_total THEN
        RAISE EXCEPTION '오늘의 일기·독서록 완료 학생 수가 학급 인원을 넘었습니다.';
    END IF;

    BEGIN
        PERFORM public.save_teacher_class_board_v1(
            current_setting('test.free_board_class_id')::UUID,
            NULL,
            '경계 밖 배치',
            '{"version":2,"preset":"freeform-7-3"}'::JSONB,
            '[{"instanceId":"outside","widgetId":"text","version":1,"zone":"content","order":10,"size":"medium","visible":true,"placement":{"x":90,"y":4,"width":20,"height":42,"pinned":false},"config":{"heading":"","body":"","tone":"paper"}}]'::JSONB,
            NULL
        );
    EXCEPTION WHEN SQLSTATE '22023' THEN
        v_invalid_blocked := TRUE;
    END;
    IF NOT v_invalid_blocked THEN
        RAISE EXCEPTION '화면 경계를 벗어난 자유 배치가 저장됐습니다.';
    END IF;
END;
$$;

RESET ROLE;
