-- 합성 자료만 사용. 실행기가 전체를 ROLLBACK하거나 격리 DB를 제거한다.
DO $$
DECLARE r TEXT;
BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_function_privilege(r,'public.class_agit_create_samlink_v1(uuid,uuid,text)','EXECUTE')
     OR has_function_privilege(r,'public.class_agit_samlink_slug_v1(integer)','EXECUTE')
  THEN RAISE EXCEPTION 'samlink helper exposed to %',r; END IF;
 END LOOP;
END; $$;

DO $$
DECLARE t UUID:=gen_random_uuid(); a UUID:=gen_random_uuid(); c UUID:=gen_random_uuid(); s UUID:=gen_random_uuid();
 m UUID; p UUID; e UUID:=gen_random_uuid(); items JSONB; src JSONB; r JSONB; link samlink.short_links%ROWTYPE;
 rooms JSONB:='[{"id":"spring","title":"봄","introduction":"","variant":0}]';
BEGIN
 PERFORM set_config('app.bypass_profile_protection','true',TRUE);
 INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data)
  VALUES(t,'slug8-'||t||'@example.invalid','{}','{}'),(a,'slug8-'||a||'@example.invalid','{}','{}');
 INSERT INTO public.profiles(id,role,is_approved) VALUES(t,'TEACHER',TRUE),(a,'STUDENT',TRUE)
  ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,is_approved=TRUE;
 INSERT INTO public.teachers(id,name,school_name) VALUES(t,'합성 교사','시험 학교');
 INSERT INTO public.classes(id,teacher_id,name,enabled_modules) VALUES(c,t,'긴 주소 합성 학급',ARRAY['__configured__','class-agit']);
 INSERT INTO public.students(id,class_id,name,student_code,auth_id) VALUES(s,c,'비공개 실명',left(s::TEXT,8)||'LNG',a);
 UPDATE public.class_agit_rollout SET mode='pilot',external_enabled=TRUE WHERE singleton;
 DELETE FROM public.class_agit_pilot_classes;
 INSERT INTO public.class_agit_pilot_classes(class_id) VALUES(c);
 INSERT INTO public.writing_missions(class_id,teacher_id,title,guide,genre,mission_type,input_template,min_chars,min_paragraphs,base_reward,bonus_reward)
  VALUES(c,t,'긴 주소 과제','합성 안내','글쓰기','글쓰기','freeform',1,1,0,0) RETURNING id INTO m;
 INSERT INTO public.student_posts(class_id,student_id,mission_id,title,content,is_submitted,is_confirmed)
  VALUES(c,s,m,'작품 하나','본문',TRUE,TRUE) RETURNING id INTO p;
 PERFORM set_config('app.bypass_profile_protection','false',TRUE);
 PERFORM set_config('request.jwt.claim.sub',t::TEXT,TRUE);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',t::TEXT,'role','authenticated')::TEXT,TRUE);
 src:=public.get_class_agit_source_v1(c,p)->'source';
 items:=jsonb_build_array(jsonb_build_object('sourceId',p,'sourceRevision',src->>'source_revision','publicAlias','과거 가림 이름','roomId','spring'));
 PERFORM public.run_class_agit_action_v1(c,'create',jsonb_build_object('exhibition_id',e));
 PERFORM public.run_class_agit_action_v1(c,'save',jsonb_build_object('exhibition_id',e,'expected_revision',1,'title','긴 주소','layout_version',2,'rooms',rooms,'items',items));
 r:=public.get_class_agit_share_workspace_v1(c,e);
 SELECT jsonb_agg(jsonb_build_object('itemId',i->>'itemId','sourceRevision',i->>'sourceRevision','title','공개 제목','author','공개 지은이','roomId','spring'))
  INTO items FROM jsonb_array_elements(r->'candidates') i;
 r:=public.run_class_agit_share_action_v1(c,e,'publish',jsonb_build_object('display_version',2,'layout_version',2,'expected_revision',0,
  'exhibition_revision',2,'title','긴 주소 전시','rooms',rooms,'items',items,'token',repeat('e',64),'starts_at',now(),'expires_at',now()+INTERVAL '30 days'));
 -- 전시 주소는 샘링크 기본(4자)보다 길어야 한다. 전체 교사 공개에서는 살아 있는 주소가 수십 개가 된다.
 IF r->'share'->>'short_url' !~ '^https://샘링크\.kr/[a-km-z2-9]{8}$' THEN RAISE EXCEPTION 'published url is not an 8-char address: %',r->'share'->>'short_url'; END IF;
 SELECT * INTO link FROM samlink.short_links WHERE slug=(SELECT samlink_slug FROM public.class_agit_external_shares WHERE class_id=c AND id=e);
 IF link.destination<>'https://xn--vz0ba242ncqcba79xhwx.site/exhibition#'||repeat('e',64) OR link.created_by<>'agit-exhibition'
  OR link.display_label<>'아지트 글 전시관'
  OR link.expires_at IS DISTINCT FROM (SELECT expires_at FROM public.class_agit_external_shares WHERE class_id=c AND id=e)
 THEN RAISE EXCEPTION 'samlink destination/owner/expiry contract changed'; END IF;
 -- 회전해도 8자를 유지하고 옛 주소는 사라진다.
 UPDATE public.class_agit_external_shares SET shortened_at=now()-INTERVAL '10 seconds' WHERE class_id=c AND id=e;
 r:=public.run_class_agit_share_action_v1(c,e,'rotate',jsonb_build_object('display_version',2,'expected_revision',1,'token',repeat('f',64)));
 IF r->'share'->>'short_url' !~ '^https://샘링크\.kr/[a-km-z2-9]{8}$' THEN RAISE EXCEPTION 'rotated url is not 8 chars'; END IF;
 IF EXISTS(SELECT 1 FROM samlink.short_links WHERE slug=link.slug) THEN RAISE EXCEPTION 'old link remains after rotation'; END IF;
 RAISE NOTICE 'Longer share slug: 8-char samlink-alphabet address on publish and rotation, contract preserved';
END; $$;
