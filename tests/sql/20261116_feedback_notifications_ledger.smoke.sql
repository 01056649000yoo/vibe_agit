-- 내 글 소식 원장 전환 스모크. 실제 운영 스키마에서 트리거·필터·갈래 분리를 확인한다.
-- 반드시 ROLLBACK 트랜잭션 안에서 돌린다(반응·댓글을 실제로 넣었다 지운다).
DO $$
DECLARE
  v_owner public.students%ROWTYPE;
  v_actor public.students%ROWTYPE;
  v_post_id UUID;
  v_reaction_id UUID;
  v_comment_id UUID;
  v_self_reaction_id UUID;
  v_count INTEGER;
  v_result JSONB;
  v_payload JSONB;
BEGIN
  -- 같은 학급에서 글 주인과 반응을 남길 다른 학생을 고른다.
  SELECT s.* INTO v_owner
  FROM public.students s
  WHERE s.auth_id IS NOT NULL AND s.deleted_at IS NULL AND s.is_active IS DISTINCT FROM FALSE
    AND EXISTS (SELECT 1 FROM public.student_posts p
                WHERE p.student_id = s.id AND p.class_id = s.class_id
                  AND p.is_submitted IS TRUE AND p.visibility = 'class')
    AND EXISTS (SELECT 1 FROM public.classes c WHERE c.id = s.class_id AND c.deleted_at IS NULL)
  LIMIT 1;
  IF v_owner.id IS NULL THEN RAISE EXCEPTION '스모크용 글 주인을 찾지 못했습니다.'; END IF;

  SELECT s.* INTO v_actor
  FROM public.students s
  WHERE s.class_id = v_owner.class_id AND s.id <> v_owner.id
    AND s.deleted_at IS NULL AND s.is_active IS DISTINCT FROM FALSE
  LIMIT 1;
  IF v_actor.id IS NULL THEN RAISE EXCEPTION '스모크용 상대 학생을 찾지 못했습니다.'; END IF;

  SELECT p.id INTO v_post_id
  FROM public.student_posts p
  WHERE p.student_id = v_owner.id AND p.class_id = v_owner.class_id
    AND p.is_submitted IS TRUE AND p.visibility = 'class'
    AND NOT EXISTS (SELECT 1 FROM public.post_reactions r
                    WHERE r.post_id = p.id AND r.student_id = v_actor.id)
  LIMIT 1;
  IF v_post_id IS NULL THEN RAISE EXCEPTION '스모크용 글을 찾지 못했습니다.'; END IF;

  -- 이 학생의 기존 미확인은 전환 대상이 아니므로 비우고 시작한다.
  DELETE FROM public.student_notification_events WHERE student_id = v_owner.id;

  -- ① 친구 반응 → 알림 생성
  INSERT INTO public.post_reactions (post_id, student_id, reaction_type, class_id)
  VALUES (v_post_id, v_actor.id, 'heart', v_owner.class_id)
  RETURNING id INTO v_reaction_id;

  SELECT count(*) INTO v_count FROM public.student_notification_events
  WHERE student_id = v_owner.id AND module_id = 'feedback'
    AND event_type = 'feedback.reaction_received' AND event_key = format('reaction:%s', v_reaction_id);
  IF v_count <> 1 THEN RAISE EXCEPTION '① 반응 알림이 생성되지 않았습니다(개수 %).', v_count; END IF;

  SELECT payload INTO v_payload FROM public.student_notification_events
  WHERE event_key = format('reaction:%s', v_reaction_id);
  IF COALESCE(v_payload->>'actor_name', '') = '' OR v_payload->>'reaction_type' <> 'heart'
     OR v_payload->>'post_id' <> v_post_id::text THEN
    RAISE EXCEPTION '① 반응 알림 payload 계약 오류: %', v_payload;
  END IF;

  -- ② 반응을 취소하면 알림도 사라진다(없는 반응을 보러 가지 않도록)
  DELETE FROM public.post_reactions WHERE id = v_reaction_id;
  SELECT count(*) INTO v_count FROM public.student_notification_events
  WHERE event_key = format('reaction:%s', v_reaction_id);
  IF v_count <> 0 THEN RAISE EXCEPTION '② 반응 취소 후에도 알림이 남았습니다.'; END IF;

  -- ③ 내가 내 글에 남긴 반응은 알리지 않는다
  INSERT INTO public.post_reactions (post_id, student_id, reaction_type, class_id)
  VALUES (v_post_id, v_owner.id, 'star', v_owner.class_id)
  RETURNING id INTO v_self_reaction_id;
  SELECT count(*) INTO v_count FROM public.student_notification_events
  WHERE event_key = format('reaction:%s', v_self_reaction_id);
  IF v_count <> 0 THEN RAISE EXCEPTION '③ 자기 반응이 알림으로 생성되었습니다.'; END IF;
  DELETE FROM public.post_reactions WHERE id = v_self_reaction_id;

  -- ④ 승인된 친구 댓글 → 알림 생성
  INSERT INTO public.post_comments (post_id, student_id, content, status, class_id)
  VALUES (v_post_id, v_actor.id, '글의 마지막 문장이 오래 남았어요.', 'approved', v_owner.class_id)
  RETURNING id INTO v_comment_id;

  SELECT count(*) INTO v_count FROM public.student_notification_events
  WHERE student_id = v_owner.id AND event_type = 'feedback.comment_received'
    AND event_key = format('comment:%s', v_comment_id);
  IF v_count <> 1 THEN RAISE EXCEPTION '④ 댓글 알림이 생성되지 않았습니다(개수 %).', v_count; END IF;

  SELECT payload INTO v_payload FROM public.student_notification_events
  WHERE event_key = format('comment:%s', v_comment_id);
  IF (v_payload->>'is_teacher')::boolean IS DISTINCT FROM FALSE
     OR COALESCE(v_payload->>'excerpt', '') = '' THEN
    RAISE EXCEPTION '④ 댓글 알림 payload 계약 오류: %', v_payload;
  END IF;

  -- ⑤ 승인이 풀리면 알림을 회수하고, 다시 승인되면 되살아난다
  UPDATE public.post_comments SET status = 'pending' WHERE id = v_comment_id;
  SELECT count(*) INTO v_count FROM public.student_notification_events
  WHERE event_key = format('comment:%s', v_comment_id);
  IF v_count <> 0 THEN RAISE EXCEPTION '⑤ 승인이 풀렸는데 알림이 남았습니다.'; END IF;

  UPDATE public.post_comments SET status = 'approved' WHERE id = v_comment_id;
  SELECT count(*) INTO v_count FROM public.student_notification_events
  WHERE event_key = format('comment:%s', v_comment_id);
  IF v_count <> 1 THEN RAISE EXCEPTION '⑤ 재승인 후 알림이 살아나지 않았습니다.'; END IF;

  -- ⑥ 갈래가 섞이지 않는지 확인한다. 할 일 알림 한 건을 따로 넣어 비교한다.
  PERFORM public.notification_emit_v1(
    v_owner.id, 'writing', 'writing.approved', 'student_post', v_post_id,
    jsonb_build_object('post_id', v_post_id, 'post_title', '스모크', 'point_delta', 0),
    format('smoke:%s:approved', v_post_id)
  );

  PERFORM set_config('request.jwt.claim.sub', v_owner.auth_id::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner.auth_id, 'role', 'authenticated')::text, true);

  v_result := public.get_my_activity_notifications_v1(p_module_ids => ARRAY['feedback']);
  IF jsonb_array_length(v_result->'items') <> 1
     OR v_result->'items'->0->>'event_type' <> 'feedback.comment_received' THEN
    RAISE EXCEPTION '⑥ feedback 갈래 조회에 다른 알림이 섞였습니다: %', v_result->'items';
  END IF;

  v_result := public.get_my_activity_notifications_v1(p_exclude_module_ids => ARRAY['feedback']);
  IF jsonb_array_length(v_result->'items') <> 1
     OR v_result->'items'->0->>'event_type' <> 'writing.approved' THEN
    RAISE EXCEPTION '⑥ 할 일 갈래 조회에 내 글 소식이 섞였습니다: %', v_result->'items';
  END IF;

  -- ⑦ 홈 부트스트랩이 두 갈래를 따로 센다
  v_result := public.get_student_home_bootstrap_v1();
  IF (v_result->'feedback_notifications'->>'unread_count')::int <> 1 THEN
    RAISE EXCEPTION '⑦ 내 글 소식 개수가 1이 아닙니다: %', v_result->'feedback_notifications';
  END IF;
  IF (v_result->'activity_notifications'->>'unread_count')::int <> 1 THEN
    RAISE EXCEPTION '⑦ 활동 알림 개수가 1이 아닙니다: %', v_result->'activity_notifications';
  END IF;
  IF (v_result->'home'->>'has_activity')::boolean IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION '⑦ has_activity가 내 글 소식을 따르지 않습니다.';
  END IF;

  -- ⑧ 갈래별 모두 확인이 다른 갈래를 건드리지 않는다
  v_result := public.mark_my_activity_notifications_read_all_v1(p_module_ids => ARRAY['feedback']);
  IF (v_result->>'marked_count')::int <> 1 THEN
    RAISE EXCEPTION '⑧ 모두 확인이 1건을 처리하지 않았습니다: %', v_result;
  END IF;

  v_result := public.get_student_home_bootstrap_v1();
  IF (v_result->'feedback_notifications'->>'unread_count')::int <> 0 THEN
    RAISE EXCEPTION '⑧ 모두 확인 후에도 내 글 소식이 남았습니다.';
  END IF;
  IF (v_result->'activity_notifications'->>'unread_count')::int <> 1 THEN
    RAISE EXCEPTION '⑧ 모두 확인이 할 일 알림까지 지웠습니다.';
  END IF;
  IF (v_result->'home'->>'has_activity')::boolean IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION '⑧ 모두 확인 후에도 has_activity가 참입니다.';
  END IF;

  -- ⑨ 댓글이 지워지면 알림도 지워진다(이미 확인한 알림이어도 남기지 않는다)
  DELETE FROM public.post_comments WHERE id = v_comment_id;
  SELECT count(*) INTO v_count FROM public.student_notification_events
  WHERE event_key = format('comment:%s', v_comment_id);
  IF v_count <> 0 THEN RAISE EXCEPTION '⑨ 댓글 삭제 후에도 알림이 남았습니다.'; END IF;

  RAISE NOTICE '내 글 소식 원장 스모크 9개 통과 (학생 %, 글 %)', v_owner.id, v_post_id;
END; $$;

-- 권한 경계: 새 RPC가 비로그인에 열려 있지 않고, 정리 함수는 학생·교사에게 닫혀 있어야 한다.
DO $$
BEGIN
  IF has_function_privilege('anon',
      'public.get_my_activity_notifications_v1(integer,timestamptz,uuid,text[],text[])', 'EXECUTE') THEN
    RAISE EXCEPTION '알림 목록 RPC가 anon에 공개되었습니다.';
  END IF;
  IF has_function_privilege('anon',
      'public.mark_my_activity_notifications_read_all_v1(text[],text[])', 'EXECUTE') THEN
    RAISE EXCEPTION '모두 확인 RPC가 anon에 공개되었습니다.';
  END IF;
  IF has_function_privilege('authenticated',
      'public.purge_read_student_notifications_v1(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION '알림 정리 함수가 로그인 사용자에게 공개되었습니다.';
  END IF;
  IF has_function_privilege('authenticated', 'public.notification_emit_v1(uuid,text,text,text,uuid,jsonb,text,smallint)', 'EXECUTE') THEN
    RAISE EXCEPTION '알림 생성 내부 함수가 로그인 사용자에게 공개되었습니다.';
  END IF;
  RAISE NOTICE '권한 경계 4개 통과';
END; $$;
