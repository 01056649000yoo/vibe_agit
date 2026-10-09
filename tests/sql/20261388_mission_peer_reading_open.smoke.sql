-- 친구들에게 열기 스모크(롤백된다)
BEGIN;
DO $$
DECLARE
    v_mission UUID; v_class UUID; v_teacher UUID; v_friend_auth UUID; v_other_teacher UUID;
    v_approved_post UUID; v_pending_post UUID; v_seen INTEGER; v_res JSONB; v_blocked BOOLEAN; v_notes INTEGER;
BEGIN
    -- 승인 글과 승인 안 된 제출 글이 함께 있는 과제
    SELECT p.mission_id, p.class_id INTO v_mission, v_class
    FROM public.student_posts p
    WHERE p.writing_context = 'assignment'
    GROUP BY p.mission_id, p.class_id
    HAVING count(*) FILTER (WHERE p.is_confirmed) > 0 AND count(*) FILTER (WHERE p.is_submitted AND NOT p.is_confirmed) > 0
    LIMIT 1;
    IF v_mission IS NULL THEN RAISE EXCEPTION '시험할 과제가 없음'; END IF;
    SELECT teacher_id INTO v_teacher FROM public.classes WHERE id = v_class;
    SELECT id INTO v_approved_post FROM public.student_posts WHERE mission_id = v_mission AND is_confirmed LIMIT 1;
    SELECT id INTO v_pending_post FROM public.student_posts WHERE mission_id = v_mission AND is_submitted AND NOT is_confirmed LIMIT 1;
    SELECT s.auth_id INTO v_friend_auth FROM public.students s
    WHERE s.class_id = v_class AND s.deleted_at IS NULL AND s.auth_id IS NOT NULL
      AND s.id NOT IN (SELECT student_id FROM public.student_posts WHERE id IN (v_approved_post, v_pending_post)) LIMIT 1;
    SELECT id INTO v_other_teacher FROM public.profiles WHERE role = 'TEACHER' AND id <> v_teacher LIMIT 1;

    -- 선생님만 읽기로(아직 연 적 없음) — 제출 글이 있어 서버는 막아야 하므로 주인 권한으로 준비
    ALTER TABLE public.writing_missions DISABLE TRIGGER trg_guard_mission_peer_reading_v1;
    UPDATE public.writing_missions SET peer_reading_enabled = FALSE, peer_reading_opened_at = NULL WHERE id = v_mission;
    ALTER TABLE public.writing_missions ENABLE TRIGGER trg_guard_mission_peer_reading_v1;

    -- ① 친구는 못 본다
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_friend_auth, 'role', 'authenticated')::TEXT, TRUE);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO v_seen FROM public.student_posts WHERE id IN (v_approved_post, v_pending_post);
    RESET ROLE;
    IF v_seen <> 0 THEN RAISE EXCEPTION '열기 전 친구가 봄'; END IF;

    -- ⑥ 다른 선생님은 못 연다
    IF v_other_teacher IS NOT NULL THEN
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other_teacher, 'role', 'authenticated')::TEXT, TRUE);
        v_blocked := FALSE;
        BEGIN PERFORM public.open_mission_peer_reading_v1(v_mission, TRUE, FALSE);
        EXCEPTION WHEN insufficient_privilege THEN v_blocked := TRUE; END;
        IF NOT v_blocked THEN RAISE EXCEPTION '다른 선생님이 열었음'; END IF;
    END IF;

    -- 미리 세기는 바꾸지 않는다
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_teacher, 'role', 'authenticated')::TEXT, TRUE);
    v_res := public.open_mission_peer_reading_v1(v_mission, TRUE, TRUE);
    IF (v_res->>'approved')::INT < 1 OR (SELECT peer_reading_enabled FROM public.writing_missions WHERE id = v_mission) THEN
        RAISE EXCEPTION '미리 세기가 이상함: %', v_res;
    END IF;

    -- ② 열기: 승인 글만 보인다
    v_res := public.open_mission_peer_reading_v1(v_mission, TRUE, FALSE);
    IF (v_res->>'opened_at') IS NULL THEN RAISE EXCEPTION '열리지 않음'; END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_friend_auth, 'role', 'authenticated')::TEXT, TRUE);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO v_seen FROM public.student_posts WHERE id = v_approved_post;
    IF v_seen <> 1 THEN RAISE EXCEPTION '승인 글이 안 보임'; END IF;
    SELECT count(*) INTO v_seen FROM public.student_posts WHERE id = v_pending_post;
    IF v_seen <> 0 THEN RAISE EXCEPTION '승인 안 된 글이 보임'; END IF;
    RESET ROLE;

    -- ③ 승인하면 보인다
    UPDATE public.student_posts SET is_confirmed = TRUE WHERE id = v_pending_post;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_friend_auth, 'role', 'authenticated')::TEXT, TRUE);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO v_seen FROM public.student_posts WHERE id = v_pending_post;
    RESET ROLE;
    IF v_seen <> 1 THEN RAISE EXCEPTION '승인했는데 안 보임'; END IF;

    -- ④ 닫기는 막힌다
    v_blocked := FALSE;
    BEGIN UPDATE public.writing_missions SET peer_reading_enabled = FALSE WHERE id = v_mission;
    EXCEPTION WHEN raise_exception THEN v_blocked := TRUE; END;
    IF NOT v_blocked THEN RAISE EXCEPTION '연 과제를 닫았음'; END IF;

    -- ⑤ 알림은 한 번만
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_teacher, 'role', 'authenticated')::TEXT, TRUE);
    PERFORM public.open_mission_peer_reading_v1(v_mission, TRUE, FALSE);
    SELECT count(*) INTO v_notes FROM public.student_notification_events
    WHERE event_key = format('writing:%s:peer_opened', v_mission);
    IF v_notes <> (SELECT count(*) FROM public.students WHERE class_id = v_class AND deleted_at IS NULL) THEN
        RAISE EXCEPTION '알림 수가 학생 수와 다름: %', v_notes;
    END IF;
    RAISE NOTICE '친구들에게 열기 스모크 통과';
END;
$$;
ROLLBACK;
