-- 합성 자료만 사용. 실행기가 전체를 ROLLBACK하거나 격리 DB를 제거한다.
DO $$
DECLARE slug TEXT; i INTEGER; r TEXT; four INTEGER:=0;
BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_function_privilege(r,'public.class_agit_samlink_slug_v1(integer)','EXECUTE')
     OR has_function_privilege(r,'public.class_agit_create_samlink_v1(uuid,uuid,text)','EXECUTE')
  THEN RAISE EXCEPTION 'samlink helper exposed to %',r; END IF;
 END LOOP;
 -- 옛 0인자 함수를 남겨 두면 호출이 모호해진다.
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='class_agit_samlink_slug_v1' AND p.pronargs=0)
 THEN RAISE EXCEPTION 'old zero-argument slug function still present'; END IF;
 FOR i IN 1..200 LOOP
  slug:=public.class_agit_samlink_slug_v1();
  IF length(slug)<>4 THEN RAISE EXCEPTION 'default slug length % is not samlink 4',length(slug); END IF;
  -- 샘링크 알파벳 그대로: l·o·0·1 을 뺀 32자.
  IF slug !~ '^[a-km-z2-9]{4}$' THEN RAISE EXCEPTION 'slug % is outside the samlink alphabet',slug; END IF;
  four:=four+1;
 END LOOP;
 IF four<>200 THEN RAISE EXCEPTION 'slug draws missing'; END IF;
 IF length(public.class_agit_samlink_slug_v1(6))<>6 THEN RAISE EXCEPTION 'collision fallback length is not 6'; END IF;
 IF length(public.class_agit_samlink_slug_v1(0))<>1 OR length(public.class_agit_samlink_slug_v1(99))<>30
 THEN RAISE EXCEPTION 'slug length is not clamped'; END IF;
END; $$;

DO $$
DECLARE t UUID:=gen_random_uuid(); a UUID:=gen_random_uuid(); c UUID:=gen_random_uuid(); s UUID:=gen_random_uuid();
 m UUID; p UUID; e UUID:=gen_random_uuid(); items JSONB:='[]'; src JSONB; r JSONB; link samlink.short_links%ROWTYPE;
 rooms JSONB:='[{"id":"spring","title":"봄","introduction":"","variant":0}]';
BEGIN
 PERFORM set_config('app.bypass_profile_protection','true',TRUE);
 INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data)
  VALUES(t,'native-'||t||'@example.invalid','{}','{}'),(a,'native-'||a||'@example.invalid','{}','{}');
 INSERT INTO public.profiles(id,role,is_approved) VALUES(t,'TEACHER',TRUE),(a,'STUDENT',TRUE)
  ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,is_approved=TRUE;
 INSERT INTO public.teachers(id,name,school_name) VALUES(t,'합성 교사','시험 학교');
 INSERT INTO public.classes(id,teacher_id,name,enabled_modules) VALUES(c,t,'샘링크 방식 합성 학급',ARRAY['__configured__','class-agit']);
 INSERT INTO public.students(id,class_id,name,student_code,auth_id) VALUES(s,c,'비공개 실명',left(s::TEXT,8)||'NTV',a);
 UPDATE public.class_agit_rollout SET mode='pilot',external_enabled=TRUE WHERE singleton;
 DELETE FROM public.class_agit_pilot_classes;
 INSERT INTO public.class_agit_pilot_classes(class_id) VALUES(c);
 INSERT INTO public.writing_missions(class_id,teacher_id,title,guide,genre,mission_type,input_template,min_chars,min_paragraphs,base_reward,bonus_reward)
  VALUES(c,t,'샘링크 과제','합성 안내','글쓰기','글쓰기','freeform',1,1,0,0) RETURNING id INTO m;
 INSERT INTO public.student_posts(class_id,student_id,mission_id,title,content,is_submitted,is_confirmed)
  VALUES(c,s,m,'작품 하나','본문',TRUE,TRUE) RETURNING id INTO p;
 PERFORM set_config('app.bypass_profile_protection','false',TRUE);
 PERFORM set_config('request.jwt.claim.sub',t::TEXT,TRUE);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',t::TEXT,'role','authenticated')::TEXT,TRUE);
 src:=public.get_class_agit_source_v1(c,p)->'source';
 items:=jsonb_build_array(jsonb_build_object('sourceId',p,'sourceRevision',src->>'source_revision','publicAlias','과거 가림 이름','roomId','spring'));
 PERFORM public.run_class_agit_action_v1(c,'create',jsonb_build_object('exhibition_id',e));
 PERFORM public.run_class_agit_action_v1(c,'save',jsonb_build_object('exhibition_id',e,'expected_revision',1,'title','샘링크 방식','layout_version',2,'rooms',rooms,'items',items));
 r:=public.get_class_agit_share_workspace_v1(c,e);
 SELECT jsonb_agg(jsonb_build_object('itemId',i->>'itemId','sourceRevision',i->>'sourceRevision','title','공개 제목','author','공개 지은이','roomId','spring'))
  INTO items FROM jsonb_array_elements(r->'candidates') i;
 r:=public.run_class_agit_share_action_v1(c,e,'publish',jsonb_build_object('display_version',2,'layout_version',2,'expected_revision',0,
  'exhibition_revision',2,'title','샘링크 방식 전시','rooms',rooms,'items',items,'token',repeat('e',64),'starts_at',now(),'expires_at',now()+INTERVAL '30 days'));
 IF r->'share'->>'short_url' !~ '^https://샘링크\.kr/[a-km-z2-9]{4}$' THEN RAISE EXCEPTION 'published url is not a samlink 4-char address: %',r->'share'->>'short_url'; END IF;
 SELECT * INTO link FROM samlink.short_links WHERE slug=(SELECT samlink_slug FROM public.class_agit_external_shares WHERE class_id=c AND id=e);
 -- 샘링크 프로그램에 주인과 이름표까지 남아야 목록에서 관리할 수 있다.
 IF link.created_by<>'agit-exhibition' OR link.display_label<>'아지트 글 전시관' THEN RAISE EXCEPTION 'samlink ownership/label missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM samlink.short_link_device_access WHERE link_id=link.id AND device_id='agit-exhibition')
 THEN RAISE EXCEPTION 'samlink device access row missing'; END IF;
 -- 표시자는 서명 기기 쿠키(device_<uuid>) 형식과 겹치면 안 된다. 겹치면 브라우저가 주인 행세를 할 수 있다.
 IF link.created_by ~ '^device_[0-9a-f-]{36}$' THEN RAISE EXCEPTION 'owner marker collides with a real device id'; END IF;
 IF link.destination<>'https://xn--vz0ba242ncqcba79xhwx.site/exhibition#'||repeat('e',64)
  OR link.expires_at IS DISTINCT FROM (SELECT expires_at FROM public.class_agit_external_shares WHERE class_id=c AND id=e)
 THEN RAISE EXCEPTION 'samlink destination/expiry contract changed'; END IF;
 PERFORM public.run_class_agit_share_action_v1(c,e,'revoke','{"expected_revision":1}');
 IF EXISTS(SELECT 1 FROM samlink.short_links WHERE slug=link.slug) THEN RAISE EXCEPTION 'revoked short link remains'; END IF;
 RAISE NOTICE 'Samlink-native slug: 4-char samlink alphabet, reserved-word skip, recorded owner/label and revocation sync passed';
END; $$;
