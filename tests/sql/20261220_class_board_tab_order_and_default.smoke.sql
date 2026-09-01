-- migrate:check 바깥 트랜잭션에서 실행되며 마지막에 모두 롤백된다.

DO $$
BEGIN
    IF has_function_privilege('anon', 'public.reorder_teacher_class_boards_v1(uuid,uuid[])', 'EXECUTE')
       OR has_function_privilege('anon', 'public.set_teacher_default_class_board_v1(uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.get_teacher_default_class_board_v1(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION '스크린 순서·기본 화면 RPC가 익명 역할에 열렸습니다.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'idx_class_boards_one_default_per_class'
          AND indexdef ~ 'is_default IS TRUE'
    ) THEN
        RAISE EXCEPTION '학급별 기본 스크린 하나를 보장하는 인덱스가 없습니다.';
    END IF;
END;
$$;

SELECT set_config('test.board_order_teacher_id', fixture.teacher_id::TEXT, true),
       set_config('test.board_order_class_id', fixture.class_id::TEXT, true)
FROM (
    SELECT class.teacher_id, class.id AS class_id
    FROM public.classes class
    JOIN public.profiles teacher ON teacher.id = class.teacher_id
    LEFT JOIN public.class_boards board
      ON board.class_id = class.id AND board.archived_at IS NULL
    WHERE class.deleted_at IS NULL
      AND teacher.role = 'TEACHER'
      AND teacher.is_approved IS TRUE
      AND teacher.approval_revoked_at IS NULL
    GROUP BY class.teacher_id, class.id, class.created_at
    HAVING COUNT(board.id) <= 18
    ORDER BY COUNT(board.id), class.created_at DESC
    LIMIT 1
) fixture;

DO $$ BEGIN
    IF current_setting('test.board_order_teacher_id', true) IS NULL THEN
        RAISE EXCEPTION '스크린 탭 순서 스모크에 사용할 교사 학급이 없습니다.';
    END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.board_order_teacher_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.board_order_teacher_id'), 'role', 'authenticated'
)::TEXT, true);

DO $$
DECLARE
    v_first JSONB;
    v_second JSONB;
    v_workspace JSONB;
    v_default JSONB;
    v_ids UUID[];
BEGIN
    v_first := public.save_teacher_class_board_v1(
        current_setting('test.board_order_class_id')::UUID,
        NULL,
        '기본 화면 스모크',
        '{"version":3,"preset":"freeform-stage-7-3"}'::JSONB,
        '[]'::JSONB,
        NULL,
        0
    );
    v_second := public.save_teacher_class_board_v1(
        current_setting('test.board_order_class_id')::UUID,
        NULL,
        '순서 화면 스모크',
        '{"version":3,"preset":"freeform-stage-7-3"}'::JSONB,
        '[]'::JSONB,
        NULL,
        1
    );

    PERFORM public.set_teacher_default_class_board_v1((v_second->>'id')::UUID);
    v_default := public.get_teacher_default_class_board_v1(current_setting('test.board_order_class_id')::UUID);
    IF v_default->>'boardId' <> v_second->>'id' THEN
        RAISE EXCEPTION '별표로 지정한 스크린이 기본 화면 조회에 반영되지 않았습니다.';
    END IF;

    SELECT ARRAY_AGG((item->>'id')::UUID ORDER BY CASE WHEN item->>'id' = v_first->>'id' THEN 0 ELSE 1 END, item->>'displayOrder')
    INTO v_ids
    FROM JSONB_ARRAY_ELEMENTS(
        public.get_teacher_class_board_workspace_v1(current_setting('test.board_order_class_id')::UUID, 20)->'boards'
    ) item;
    PERFORM public.reorder_teacher_class_boards_v1(current_setting('test.board_order_class_id')::UUID, v_ids);
    v_workspace := public.get_teacher_class_board_workspace_v1(current_setting('test.board_order_class_id')::UUID, 20);
    IF v_workspace->'boards'->0->>'id' <> v_first->>'id'
       OR (v_workspace->'boards'->0->>'displayOrder')::INTEGER <> 0
       OR NOT EXISTS (
           SELECT 1 FROM JSONB_ARRAY_ELEMENTS(v_workspace->'boards') item
           WHERE item->>'id' = v_second->>'id'
             AND (item->>'isDefault')::BOOLEAN IS TRUE
       ) THEN
        RAISE EXCEPTION '드래그 탭 순서 또는 기본 별표가 작업공간에 유지되지 않았습니다.';
    END IF;
END;
$$;

RESET ROLE;
