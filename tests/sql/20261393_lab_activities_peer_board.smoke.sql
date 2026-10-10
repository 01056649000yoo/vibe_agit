-- 종료된 개요짜기 + 친구 개요 모음 → 학생 목록 스모크(롤백된다)
BEGIN;
DO $$
DECLARE v_student RECORD; v_room UUID; v_teacher UUID; v_slug TEXT; v_row RECORD;
BEGIN
    -- 학생이 있고 그 반 선생님의 개요짜기 방이 있는 반
    SELECT s.id, s.auth_id, s.class_id, r.id AS room_id, r.teacher_id INTO v_student
    FROM public.students s
    JOIN public.classes c ON c.id = s.class_id
    JOIN writing_helper.rooms r ON r.agit_class_id = s.class_id AND r.teacher_id = c.teacher_id
    WHERE s.auth_id IS NOT NULL AND s.is_active IS DISTINCT FROM FALSE AND s.deleted_at IS NULL
      AND COALESCE(r.activity_type, 'outline_builder') = 'outline_builder'
    LIMIT 1;
    IF v_student.room_id IS NULL THEN RAISE EXCEPTION '시험할 반이 없음'; END IF;
    v_room := v_student.room_id; v_teacher := v_student.teacher_id;

    UPDATE writing_helper.outline_boards SET revoked_at = now() WHERE room_id = v_room AND revoked_at IS NULL;
    UPDATE writing_helper.rooms SET is_active = FALSE WHERE id = v_room;

    PERFORM set_config('request.jwt.claim.sub', v_student.auth_id::TEXT, TRUE);
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_student.auth_id, 'role', 'authenticated')::TEXT, TRUE);

    -- ① 종료된 방, 판 없음 → 안 보임
    IF EXISTS (SELECT 1 FROM public.get_my_lab_activities_v1(50, NULL, NULL) a WHERE a.id = v_room) THEN RAISE EXCEPTION '종료된 방이 판 없이 보임'; END IF;

    -- ② 친구 개요 모음 켜기 → 보임(보기 전용·마감)
    PERFORM writing_helper.open_outline_board_v1(v_room, v_teacher);
    SELECT samlink_slug INTO v_slug FROM writing_helper.outline_boards WHERE room_id = v_room AND revoked_at IS NULL;
    SELECT * INTO v_row FROM public.get_my_lab_activities_v1(50, NULL, NULL) a WHERE a.id = v_room;
    IF v_row.id IS NULL OR v_row.room_is_active OR v_row.peer_board_until IS NULL THEN RAISE EXCEPTION '켰는데 안 보임/표시 이상: %', row_to_json(v_row); END IF;

    -- ③ 공유 기간이 지나면 저절로 사라짐
    UPDATE samlink.short_links SET expires_at = now() - interval '1 minute' WHERE slug = v_slug;
    IF EXISTS (SELECT 1 FROM public.get_my_lab_activities_v1(50, NULL, NULL) a WHERE a.id = v_room) THEN RAISE EXCEPTION '기간이 지났는데 보임'; END IF;

    -- ④ 다시 열고 선생님이 끄면 사라짐
    UPDATE samlink.short_links SET expires_at = now() + interval '1 day' WHERE slug = v_slug;
    IF NOT EXISTS (SELECT 1 FROM public.get_my_lab_activities_v1(50, NULL, NULL) a WHERE a.id = v_room) THEN RAISE EXCEPTION '샘링크에서 늘렸는데 안 보임'; END IF;
    PERFORM writing_helper.close_outline_board_v1(v_room, v_teacher);
    IF EXISTS (SELECT 1 FROM public.get_my_lab_activities_v1(50, NULL, NULL) a WHERE a.id = v_room) THEN RAISE EXCEPTION '끈 뒤에도 보임'; END IF;

    -- ⑤ 진행 중인 방은 판이 없어도 그대로 보이고 room_is_active
    UPDATE writing_helper.rooms SET is_active = TRUE WHERE id = v_room;
    SELECT * INTO v_row FROM public.get_my_lab_activities_v1(50, NULL, NULL) a WHERE a.id = v_room;
    IF v_row.id IS NULL OR NOT v_row.room_is_active OR v_row.peer_board_until IS NOT NULL THEN RAISE EXCEPTION '진행 중인 방 표시 이상'; END IF;

    IF has_function_privilege('anon', 'public.get_my_lab_activities_v1(integer,timestamp with time zone,uuid)', 'EXECUTE') THEN RAISE EXCEPTION 'anon 이 부를 수 있음'; END IF;
    RAISE NOTICE '종료된 개요짜기 친구 개요 모음 목록 스모크 통과';
END $$;
ROLLBACK;
