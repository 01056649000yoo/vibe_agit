-- 끄기·늘리기·만들기가 같은 순서로 방을 잠그는지, 그리고 한 세션 안의 기본 흐름이 그대로인지(롤백된다)
-- 두 세션이 겹치는 실제 경쟁은 이 파일로 못 본다 — 임시 방에서 두 세션을 동시에 돌려 따로 확인했다(WORKLOG 2026-10-11).
BEGIN;
DO $$
DECLARE v_room UUID; v_teacher UUID; v_open INTEGER;
BEGIN
    IF pg_get_functiondef('writing_helper.close_outline_board_v1(uuid,uuid)'::regprocedure) !~ 'FOR UPDATE'
       OR pg_get_functiondef('writing_helper.extend_outline_board_v1(uuid,uuid)'::regprocedure) !~ 'FOR UPDATE'
       OR pg_get_functiondef('writing_helper.open_outline_board_v1(uuid,uuid)'::regprocedure) !~ 'FOR UPDATE' THEN
        RAISE EXCEPTION '만들기·끄기·늘리기 중 방을 잠그지 않는 함수가 있음';
    END IF;
    IF pg_get_functiondef('writing_helper.get_teacher_outline_board_v1(uuid,uuid)'::regprocedure) ~ 'FOR UPDATE' THEN
        RAISE EXCEPTION '읽기 함수가 방을 잠금';
    END IF;

    SELECT r.id, r.teacher_id INTO v_room, v_teacher FROM writing_helper.rooms r
    WHERE COALESCE(r.activity_type, 'outline_builder') = 'outline_builder' LIMIT 1;
    IF v_room IS NULL THEN RAISE EXCEPTION '시험할 방이 없음'; END IF;
    UPDATE writing_helper.outline_boards SET revoked_at = now() WHERE room_id = v_room AND revoked_at IS NULL;

    PERFORM writing_helper.open_outline_board_v1(v_room, v_teacher);
    PERFORM writing_helper.extend_outline_board_v1(v_room, v_teacher);
    PERFORM writing_helper.open_outline_board_v1(v_room, v_teacher);   -- 새 주소
    PERFORM writing_helper.close_outline_board_v1(v_room, v_teacher);
    SELECT count(*) INTO v_open FROM writing_helper.outline_boards WHERE room_id = v_room AND revoked_at IS NULL;
    IF v_open <> 0 THEN RAISE EXCEPTION '끈 뒤에도 열린 판 %개', v_open; END IF;
    RAISE NOTICE '방 잠금 스모크 통과';
END $$;
ROLLBACK;
