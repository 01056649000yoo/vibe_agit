-- migrate:check 바깥 트랜잭션에서 실행되며 마지막에 모두 롤백된다.

DO $$
BEGIN
    IF (SELECT public FROM storage.buckets WHERE id = 'class-board-assets') IS DISTINCT FROM FALSE
       OR (SELECT file_size_limit FROM storage.buckets WHERE id = 'class-board-assets') <> 1048576 THEN
        RAISE EXCEPTION '우리 반 스크린 신규 이미지가 비공개·1MB 계약을 지키지 않습니다.';
    END IF;
    IF has_function_privilege('anon', 'public.get_teacher_class_board_roster_v1(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION '학생 뽑기 명단 RPC가 익명 역할에 열렸습니다.';
    END IF;
    IF has_function_privilege('anon', 'public.get_teacher_archived_class_boards_v1(uuid,integer)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.restore_teacher_class_board_v1(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION '숨긴 스크린 조회·복구 RPC가 익명 역할에 열렸습니다.';
    END IF;
END;
$$;

SELECT set_config('test.widget_teacher_id', fixture.teacher_id::TEXT, true),
       set_config('test.widget_class_id', fixture.class_id::TEXT, true)
FROM (
    SELECT class.teacher_id, class.id AS class_id
    FROM public.classes class
    JOIN public.profiles teacher ON teacher.id = class.teacher_id
    WHERE class.deleted_at IS NULL
      AND teacher.role = 'TEACHER'
      AND teacher.is_approved IS TRUE
      AND teacher.approval_revoked_at IS NULL
    ORDER BY class.created_at DESC
    LIMIT 1
) fixture;

DO $$ BEGIN
    IF current_setting('test.widget_teacher_id', true) IS NULL THEN
        RAISE EXCEPTION '수업 위젯 스모크에 사용할 교사 학급이 없습니다.';
    END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.widget_teacher_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.widget_teacher_id'), 'role', 'authenticated'
)::TEXT, true);

DO $$
DECLARE
    v_board JSONB;
    v_hidden JSONB;
    v_restored JSONB;
    v_roster JSONB;
BEGIN
    v_board := public.save_teacher_class_board_v1(
        current_setting('test.widget_class_id')::UUID,
        NULL,
        '수업 위젯 스모크',
        '{"version":2,"preset":"freeform-7-3"}'::JSONB,
        '[
          {"instanceId":"weather","widgetId":"weather","version":1,"zone":"content","order":10,"size":"medium","visible":true,"placement":{"x":1,"y":1,"width":24,"height":24,"pinned":false},"config":{"condition":"sunny","temperature":20,"message":"좋은 아침"}},
          {"instanceId":"timer","widgetId":"timer","version":1,"zone":"content","order":20,"size":"medium","visible":true,"placement":{"x":26,"y":1,"width":24,"height":24,"pinned":false},"config":{"label":"모둠 활동","durationSeconds":300}},
          {"instanceId":"stopwatch","widgetId":"stopwatch","version":1,"zone":"content","order":30,"size":"medium","visible":true,"placement":{"x":51,"y":1,"width":24,"height":24,"pinned":false},"config":{"label":"발표 시간"}},
          {"instanceId":"picker","widgetId":"student-picker","version":1,"zone":"content","order":40,"size":"medium","visible":true,"placement":{"x":76,"y":1,"width":24,"height":24,"pinned":false},"config":{"title":"발표자","allowRepeats":false}}
        ]'::JSONB,
        NULL
    );
    IF JSONB_ARRAY_LENGTH(v_board->'widgets') <> 4 THEN
        RAISE EXCEPTION '수업 위젯 네 종류가 한 스크린에 저장되지 않았습니다.';
    END IF;

    PERFORM public.archive_teacher_class_board_v1((v_board->>'id')::UUID);
    v_hidden := public.get_teacher_archived_class_boards_v1(
        current_setting('test.widget_class_id')::UUID,
        20
    );
    IF NOT EXISTS (
        SELECT 1
        FROM JSONB_ARRAY_ELEMENTS(v_hidden->'boards') item
        WHERE item->>'id' = v_board->>'id'
    ) THEN
        RAISE EXCEPTION '숨긴 스크린이 복구 목록에 나타나지 않았습니다.';
    END IF;

    v_restored := public.restore_teacher_class_board_v1((v_board->>'id')::UUID);
    IF v_restored->>'id' <> v_board->>'id' OR (v_restored->>'isActive')::BOOLEAN IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION '숨긴 스크린이 활성 상단 탭으로 복구되지 않았습니다.';
    END IF;

    v_roster := public.get_teacher_class_board_roster_v1(current_setting('test.widget_class_id')::UUID);
    IF JSONB_TYPEOF(v_roster->'names') <> 'array'
       OR JSONB_ARRAY_LENGTH(v_roster->'names') > 100
       OR v_roster::TEXT ~ 'student_id|auth_id|student_code' THEN
        RAISE EXCEPTION '학생 뽑기 명단의 형식·상한·식별 정보 제외 계약이 올바르지 않습니다.';
    END IF;
END;
$$;

RESET ROLE;
