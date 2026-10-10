-- 연구소 친구 개요 모음 스모크(롤백된다)
BEGIN;
DO $$
DECLARE
    v_room UUID; v_teacher UUID; v_other UUID; v_done INTEGER; v_writing INTEGER;
    v_board JSONB; v_board2 JSONB; v_page JSONB; v_token TEXT; v_old_token TEXT; v_slug TEXT;
    v_exp TIMESTAMPTZ; v_exp2 TIMESTAMPTZ; v_blocked BOOLEAN; v_text TEXT;
BEGIN
    -- 제출한 개요와 쓰는 중인 개요가 함께 있는 개요짜기 방
    SELECT s.room_id INTO v_room
    FROM writing_helper.student_sessions s JOIN writing_helper.rooms r ON r.id = s.room_id
    WHERE COALESCE(r.activity_type, 'outline_builder') = 'outline_builder'
    GROUP BY s.room_id
    HAVING count(*) FILTER (WHERE s.status = 'done') > 0 AND count(*) FILTER (WHERE s.status <> 'done') > 0
    LIMIT 1;
    IF v_room IS NULL THEN RAISE EXCEPTION '시험할 방이 없음'; END IF;
    SELECT teacher_id INTO v_teacher FROM writing_helper.rooms WHERE id = v_room;
    SELECT count(*) FILTER (WHERE status = 'done'), count(*) FILTER (WHERE status <> 'done')
    INTO v_done, v_writing FROM writing_helper.student_sessions WHERE room_id = v_room;
    SELECT id INTO v_other FROM auth.users WHERE id <> v_teacher LIMIT 1;

    -- ① 다른 선생님은 못 만든다
    v_blocked := FALSE;
    BEGIN PERFORM writing_helper.open_outline_board_v1(v_room, v_other);
    EXCEPTION WHEN insufficient_privilege THEN v_blocked := TRUE; END;
    IF NOT v_blocked THEN RAISE EXCEPTION '다른 선생님이 판을 만듦'; END IF;

    -- ② 만들기: 5글자 이상·숫자 포함 샘링크, 1주, 선생님 계정 목록에 등록
    v_board := writing_helper.open_outline_board_v1(v_room, v_teacher);
    v_slug := v_board->>'slug';
    IF v_board->>'state' <> 'open' OR length(v_slug) < 5 OR v_slug !~ '[2-9]' THEN RAISE EXCEPTION '판 만들기 이상: %', v_board; END IF;
    SELECT token INTO v_token FROM writing_helper.outline_boards WHERE room_id = v_room AND revoked_at IS NULL;
    SELECT expires_at INTO v_exp FROM samlink.short_links WHERE slug = v_slug;
    IF v_exp NOT BETWEEN now() + interval '6 days 23 hours' AND now() + interval '7 days 1 minute' THEN RAISE EXCEPTION '기간이 1주가 아님'; END IF;
    IF NOT EXISTS (SELECT 1 FROM samlink.short_link_account_access a JOIN samlink.short_links l ON l.id = a.link_id
                   WHERE l.slug = v_slug AND a.user_id = v_teacher AND a.is_owner) THEN RAISE EXCEPTION '선생님 샘링크 목록에 없음'; END IF;
    IF NOT EXISTS (SELECT 1 FROM samlink.short_links WHERE slug = v_slug AND destination LIKE '%/lab/board/' || v_token) THEN RAISE EXCEPTION '목적지 이상'; END IF;

    -- ③ 공개 페이지: 제출한 개요만, 학생 접속 코드·세션 id 없음
    v_page := writing_helper.get_outline_board_v1(v_token);
    IF v_page->>'state' <> 'open' OR jsonb_array_length(v_page->'students') <> v_done THEN RAISE EXCEPTION '제출한 개요 수가 다름: % vs %', jsonb_array_length(v_page->'students'), v_done; END IF;
    v_text := v_page::TEXT;
    IF EXISTS (SELECT 1 FROM writing_helper.student_sessions s WHERE s.room_id = v_room AND position(s.id::TEXT IN v_text) > 0) THEN RAISE EXCEPTION '세션 id 가 실림'; END IF;
    IF v_text ~* 'access_code|login_code|password' THEN RAISE EXCEPTION '접속 코드가 실림'; END IF;
    IF writing_helper.get_outline_board_v1('nope')->>'state' <> 'missing'
       OR writing_helper.get_outline_board_v1(repeat('a', 48))->>'state' <> 'missing' THEN RAISE EXCEPTION '없는 판이 열림'; END IF;

    -- ④ 1주 늘리기: 같은 주소, 7일 더
    v_board2 := writing_helper.extend_outline_board_v1(v_room, v_teacher);
    SELECT expires_at INTO v_exp2 FROM samlink.short_links WHERE slug = v_slug;
    IF v_board2->>'slug' <> v_slug OR v_exp2 < v_exp + interval '6 days 23 hours' THEN RAISE EXCEPTION '늘리기 이상'; END IF;

    -- ⑤ 샘링크에서 기간이 지나면 페이지도 닫힘(샘링크가 원본)
    UPDATE samlink.short_links SET expires_at = now() - interval '1 minute' WHERE slug = v_slug;
    IF writing_helper.get_outline_board_v1(v_token)->>'state' <> 'expired'
       OR (writing_helper.get_outline_board_v1(v_token) ? 'students') THEN RAISE EXCEPTION '만료돼도 열림'; END IF;
    -- 샘링크에서 늘리면 다시 열림
    UPDATE samlink.short_links SET expires_at = now() + interval '1 day' WHERE slug = v_slug;
    IF writing_helper.get_outline_board_v1(v_token)->>'state' <> 'open' THEN RAISE EXCEPTION '샘링크에서 늘렸는데 안 열림'; END IF;

    -- ⑥ 새 주소: 옛 주소는 곧바로 닫힘
    v_old_token := v_token;
    v_board2 := writing_helper.open_outline_board_v1(v_room, v_teacher);
    IF v_board2->>'slug' = v_slug THEN RAISE EXCEPTION '새 주소가 같음'; END IF;
    IF writing_helper.get_outline_board_v1(v_old_token)->>'state' <> 'closed' THEN RAISE EXCEPTION '옛 주소가 열림'; END IF;
    IF (SELECT count(*) FROM writing_helper.outline_boards WHERE room_id = v_room AND revoked_at IS NULL) <> 1 THEN RAISE EXCEPTION '열린 판이 하나가 아님'; END IF;

    -- ⑦ 공유 끄기: 판·샘링크 함께 닫힘, 늘리기 불가
    SELECT token, samlink_slug INTO v_token, v_slug FROM writing_helper.outline_boards WHERE room_id = v_room AND revoked_at IS NULL;
    PERFORM writing_helper.close_outline_board_v1(v_room, v_teacher);
    IF writing_helper.get_outline_board_v1(v_token)->>'state' <> 'closed'
       OR (SELECT is_active FROM samlink.short_links WHERE slug = v_slug) THEN RAISE EXCEPTION '끄기 이상'; END IF;
    IF writing_helper.get_teacher_outline_board_v1(v_room, v_teacher) IS NOT NULL THEN RAISE EXCEPTION '끈 뒤에도 선생님 화면에 판'; END IF;
    v_blocked := FALSE;
    BEGIN PERFORM writing_helper.extend_outline_board_v1(v_room, v_teacher);
    EXCEPTION WHEN invalid_parameter_value THEN v_blocked := TRUE; END;
    IF NOT v_blocked THEN RAISE EXCEPTION '끈 판을 늘림'; END IF;

    -- ⑧ 개요짜기가 아닌 방은 거절
    v_blocked := FALSE;
    BEGIN PERFORM writing_helper.open_outline_board_v1(r.id, r.teacher_id)
          FROM writing_helper.rooms r WHERE r.activity_type IN ('question_voting', 'one_line_share') LIMIT 1;
          IF NOT FOUND THEN v_blocked := TRUE; END IF;
    EXCEPTION WHEN invalid_parameter_value THEN v_blocked := TRUE; END;
    IF NOT v_blocked THEN RAISE EXCEPTION '개요짜기가 아닌 방에 판'; END IF;

    -- ⑨ 방을 지우면 샘링크 링크도 지움
    PERFORM writing_helper.open_outline_board_v1(v_room, v_teacher);
    SELECT samlink_slug INTO v_slug FROM writing_helper.outline_boards WHERE room_id = v_room AND revoked_at IS NULL;
    DELETE FROM writing_helper.outline_boards WHERE room_id = v_room;
    IF EXISTS (SELECT 1 FROM samlink.short_links WHERE slug = v_slug) THEN RAISE EXCEPTION '방 판을 지웠는데 샘링크가 남음'; END IF;

    -- ⑩ 학생·외부 계정은 함수를 부를 수 없다
    IF has_function_privilege('anon', 'writing_helper.get_outline_board_v1(text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'writing_helper.open_outline_board_v1(uuid,uuid)', 'EXECUTE')
       OR has_table_privilege('authenticated', 'writing_helper.outline_boards', 'SELECT') THEN RAISE EXCEPTION '권한이 열려 있음'; END IF;

    RAISE NOTICE '연구소 친구 개요 모음 스모크 통과 (제출 %명·쓰는 중 %명)', v_done, v_writing;
END $$;
ROLLBACK;
