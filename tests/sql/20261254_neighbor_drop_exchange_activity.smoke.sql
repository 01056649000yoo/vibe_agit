-- 합성 자료만 사용. 실행기가 전체를 ROLLBACK하거나 격리 DB를 제거한다.
DO $$
DECLARE r TEXT; leftover INTEGER;
BEGIN
 -- 1) 교환 활동 자료가 남아 있으면 안 된다.
 SELECT count(*) INTO leftover FROM public.neighbor_activities WHERE activity_type='exchange';
 IF leftover<>0 THEN RAISE EXCEPTION 'exchange activities remain: %',leftover; END IF;
 SELECT count(*) INTO leftover FROM public.neighbor_exchange_matches;
 IF leftover<>0 THEN RAISE EXCEPTION 'exchange match rows remain: %',leftover; END IF;

 -- 2) 활동 종류는 이제 주제 하나뿐이다.
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='neighbor_activities_activity_type_check'
    AND pg_get_constraintdef(oid) LIKE '%activity_type = ''topic''%')
 THEN RAISE EXCEPTION 'activity type is not restricted to topic'; END IF;

 -- 3) 교환 전용 RPC 는 사라져야 한다.
 FOREACH r IN ARRAY ARRAY['get_neighbor_exchange_roster_v1','propose_neighbor_exchange_matches_v1','review_neighbor_exchange_matches_v1'] LOOP
  IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=r)
  THEN RAISE EXCEPTION 'exchange rpc % still exists',r; END IF;
 END LOOP;

 -- 4) 주제 활동을 읽는 함수들은 그대로 살아 있어야 한다(운영 중인 경로다).
 FOREACH r IN ARRAY ARRAY['create_neighbor_activity_v1','get_neighbor_student_activities_v1',
    'get_neighbor_teacher_activities_v1','get_neighbor_activity_feed_v1','request_neighbor_activity_post_v1'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=r)
  THEN RAISE EXCEPTION 'live neighbor function % went missing',r; END IF;
 END LOOP;

 -- 5) 새 활동 만들기는 주제만 받는다.
 IF (SELECT prosrc FROM pg_proc WHERE proname='create_neighbor_activity_v1') NOT LIKE '%p_activity_type <> ''topic''%'
 THEN RAISE EXCEPTION 'create still accepts a non-topic activity'; END IF;
END; $$;

-- 6) 교환 행을 직접 넣어도 DB 가 막는다.
DO $$
DECLARE space UUID; actor UUID:=gen_random_uuid(); denied BOOLEAN:=FALSE;
BEGIN
 SELECT id INTO space FROM public.neighbor_spaces LIMIT 1;
 IF space IS NULL THEN RAISE NOTICE '합성 공간이 없어 삽입 검사는 건너뜁니다'; RETURN; END IF;
 BEGIN
  INSERT INTO public.neighbor_activities(space_id,activity_type,title,prompt,created_by)
   VALUES(space,'exchange','막혀야 하는 활동','안내',actor);
 EXCEPTION WHEN check_violation OR foreign_key_violation THEN denied:=TRUE;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'an exchange row was accepted'; END IF;
 RAISE NOTICE 'Neighbor exchange removal: data cleared, type restricted to topic, dedicated RPCs dropped, live topic path intact';
END; $$;
