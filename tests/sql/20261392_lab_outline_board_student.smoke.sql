-- 학생 개요 화면의 친구 개요 모음 띠 스모크(롤백된다)
BEGIN;
DO $$
DECLARE v_room UUID; v_teacher UUID; v_res JSONB; v_slug TEXT;
BEGIN
    SELECT r.id, r.teacher_id INTO v_room, v_teacher
    FROM writing_helper.rooms r
    WHERE COALESCE(r.activity_type, 'outline_builder') = 'outline_builder' LIMIT 1;
    IF v_room IS NULL THEN RAISE EXCEPTION '시험할 방이 없음'; END IF;

    -- 판이 없으면 띠 없음
    UPDATE writing_helper.outline_boards SET revoked_at = now() WHERE room_id = v_room AND revoked_at IS NULL;
    IF writing_helper.get_student_outline_board_v1(v_room) IS NOT NULL THEN RAISE EXCEPTION '판 없이 띠'; END IF;

    -- 열면: 상태·주소·마감·긴 번호
    PERFORM writing_helper.open_outline_board_v1(v_room, v_teacher);
    v_res := writing_helper.get_student_outline_board_v1(v_room);
    v_slug := v_res->>'slug';
    IF v_res->>'state' <> 'open' OR v_res->>'token' !~ '^[a-f0-9]{48}$' OR v_res->>'expires_at' IS NULL THEN RAISE EXCEPTION '열린 판 이상: %', v_res; END IF;
    IF v_res->>'token' <> (SELECT token FROM writing_helper.outline_boards WHERE room_id = v_room AND revoked_at IS NULL) THEN RAISE EXCEPTION '다른 판 번호'; END IF;

    -- 기간이 지나면 expired 로 남는다(띠는 회색으로)
    UPDATE samlink.short_links SET expires_at = now() - interval '1 minute' WHERE slug = v_slug;
    IF writing_helper.get_student_outline_board_v1(v_room)->>'state' <> 'expired' THEN RAISE EXCEPTION '만료가 안 보임'; END IF;

    -- 샘링크에서 지우면 띠 없음
    DELETE FROM samlink.short_links WHERE slug = v_slug;
    IF writing_helper.get_student_outline_board_v1(v_room) IS NOT NULL THEN RAISE EXCEPTION '지운 주소인데 띠'; END IF;

    -- 선생님이 끄면 띠 없음
    PERFORM writing_helper.open_outline_board_v1(v_room, v_teacher);
    PERFORM writing_helper.close_outline_board_v1(v_room, v_teacher);
    IF writing_helper.get_student_outline_board_v1(v_room) IS NOT NULL THEN RAISE EXCEPTION '끈 판인데 띠'; END IF;

    IF has_function_privilege('anon', 'writing_helper.get_student_outline_board_v1(uuid)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'writing_helper.get_student_outline_board_v1(uuid)', 'EXECUTE') THEN RAISE EXCEPTION '권한이 열려 있음'; END IF;

    RAISE NOTICE '학생 친구 개요 모음 띠 스모크 통과';
END $$;
ROLLBACK;
