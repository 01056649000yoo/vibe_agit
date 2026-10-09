-- 과제 "선생님만 읽기" 스모크(롤백된다):
-- ① 끄면 이미 낸 글이 비공개로 ② 같은 반 친구는 직접 읽기·학급 피드에서 못 보고 ③ 본인·선생님은 본다
-- ④ 학생이 다시 저장해도 비공개 유지 ⑤ 다시 켜면 반 공개로 돌아온다
BEGIN;
DO $$
DECLARE
    v_post UUID; v_mission UUID; v_class UUID; v_writer UUID; v_writer_auth UUID; v_friend_auth UUID; v_teacher UUID;
    v_seen INTEGER; v_feed JSONB; v_vis TEXT;
BEGIN
    SELECT p.id, p.mission_id, p.class_id, p.student_id INTO v_post, v_mission, v_class, v_writer
    FROM public.student_posts p
    JOIN public.students s ON s.id = p.student_id AND s.auth_id IS NOT NULL AND s.deleted_at IS NULL
    WHERE p.writing_context = 'assignment' AND p.is_submitted AND p.visibility = 'class'
      AND EXISTS (SELECT 1 FROM public.students f WHERE f.class_id = p.class_id AND f.id <> p.student_id AND f.auth_id IS NOT NULL AND f.deleted_at IS NULL)
    LIMIT 1;
    SELECT auth_id INTO v_writer_auth FROM public.students WHERE id = v_writer;
    SELECT auth_id INTO v_friend_auth FROM public.students WHERE class_id = v_class AND id <> v_writer AND auth_id IS NOT NULL AND deleted_at IS NULL LIMIT 1;
    SELECT teacher_id INTO v_teacher FROM public.classes WHERE id = v_class;
    IF v_post IS NULL THEN RAISE EXCEPTION '시험할 과제 글이 없음'; END IF;

    -- ① 끄기(20261388 부터 제출 글이 있는 과제는 서버가 닫기를 막는다 — 이 시험은 '선생님만' 상태의 가림만 보므로 준비 단계에서 잠시 끈다)
    ALTER TABLE public.writing_missions DISABLE TRIGGER trg_guard_mission_peer_reading_v1;
    UPDATE public.writing_missions SET peer_reading_enabled = FALSE WHERE id = v_mission;
    ALTER TABLE public.writing_missions ENABLE TRIGGER trg_guard_mission_peer_reading_v1;
    SELECT visibility INTO v_vis FROM public.student_posts WHERE id = v_post;
    IF v_vis <> 'private' THEN RAISE EXCEPTION '끈 뒤에도 공개: %', v_vis; END IF;

    -- ② 친구
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_friend_auth, 'role', 'authenticated')::TEXT, TRUE);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO v_seen FROM public.student_posts WHERE id = v_post;
    IF v_seen <> 0 THEN RAISE EXCEPTION '친구가 직접 읽을 수 있음'; END IF;
    v_feed := public.get_class_public_writing_feed_v1('assignment', NULL, v_mission, 50, NULL, NULL);
    IF v_feed::TEXT LIKE '%' || v_post::TEXT || '%' THEN RAISE EXCEPTION '학급 피드에 보임'; END IF;
    RESET ROLE;

    -- ③ 본인·선생님
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_auth, 'role', 'authenticated')::TEXT, TRUE);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO v_seen FROM public.student_posts WHERE id = v_post;
    IF v_seen <> 1 THEN RAISE EXCEPTION '본인이 못 읽음'; END IF;
    -- ④ 학생이 다시 저장(visibility 를 class 로 바꾸려 해도)
    UPDATE public.student_posts SET visibility = 'class' WHERE id = v_post;
    RESET ROLE;
    SELECT visibility INTO v_vis FROM public.student_posts WHERE id = v_post;
    IF v_vis <> 'private' THEN RAISE EXCEPTION '학생이 공개로 바꿈'; END IF;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_teacher, 'role', 'authenticated')::TEXT, TRUE);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO v_seen FROM public.student_posts WHERE id = v_post;
    IF v_seen <> 1 THEN RAISE EXCEPTION '선생님이 못 읽음'; END IF;
    RESET ROLE;

    -- ⑤ 다시 켜기 — 과제 수정으로 켜도 '열기' 로 기록되어(20261389) 승인한 글만 반 공개
    UPDATE public.writing_missions SET peer_reading_enabled = TRUE WHERE id = v_mission;
    IF (SELECT peer_reading_opened_at FROM public.writing_missions WHERE id = v_mission) IS NULL THEN
        RAISE EXCEPTION '과제 수정으로 켰는데 연 시각이 없음';
    END IF;
    SELECT visibility INTO v_vis FROM public.student_posts WHERE id = v_post;
    IF v_vis <> (CASE WHEN (SELECT is_confirmed FROM public.student_posts WHERE id = v_post) THEN 'class' ELSE 'private' END) THEN
        RAISE EXCEPTION '다시 켠 뒤 공개 범위가 승인 여부와 다름: %', v_vis;
    END IF;
    RAISE NOTICE '선생님만 읽기 스모크 통과';
END;
$$;
ROLLBACK;
