-- check-migrations의 바깥 트랜잭션에서 실행되고 마지막에 모두 롤백된다.
-- 열린 개요 모음에서 `새 주소 만들기` 를 하면 옛 샘링크 링크는 멈추고 새 링크만 살아 있는지 본다.

DO $$
DECLARE
    v_board writing_helper.outline_boards%ROWTYPE;
    v_new_slug TEXT;
BEGIN
    SELECT * INTO v_board FROM writing_helper.outline_boards
    WHERE revoked_at IS NULL ORDER BY created_at DESC LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION '열린 개요 모음이 없어 새 주소 만들기 스모크를 할 수 없습니다.';
    END IF;

    PERFORM writing_helper.open_outline_board_v1(v_board.room_id, v_board.teacher_id);

    IF (SELECT is_active FROM samlink.short_links WHERE slug = v_board.samlink_slug) IS DISTINCT FROM FALSE THEN
        RAISE EXCEPTION '새 주소를 만들었는데 옛 샘링크 링크(%)가 살아 있습니다.', v_board.samlink_slug;
    END IF;

    SELECT samlink_slug INTO v_new_slug FROM writing_helper.outline_boards
    WHERE room_id = v_board.room_id AND revoked_at IS NULL;
    IF v_new_slug IS NULL OR v_new_slug = v_board.samlink_slug
       OR (SELECT is_active FROM samlink.short_links WHERE slug = v_new_slug) IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION '새 주소의 샘링크 링크가 살아 있는 하나뿐이어야 합니다(%).', v_new_slug;
    END IF;
END;
$$;
