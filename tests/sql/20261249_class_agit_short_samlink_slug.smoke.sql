-- 합성 자료만 사용. 실행기가 전체를 ROLLBACK하거나 격리 DB를 제거한다.
DO $$
DECLARE slug TEXT; seen JSONB:='[]'; i INTEGER; r TEXT;
BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_function_privilege(r,'public.class_agit_samlink_slug_v1()','EXECUTE')
     OR has_function_privilege(r,'public.class_agit_create_samlink_v1(uuid,uuid,text)','EXECUTE')
  THEN RAISE EXCEPTION 'samlink helper exposed to %',r; END IF;
 END LOOP;
 FOR i IN 1..200 LOOP
  slug:=public.class_agit_samlink_slug_v1();
  -- 짧아야 하지만 사람이 고르는 낱말만큼 짧으면 안 된다.
  IF length(slug)<>10 THEN RAISE EXCEPTION 'slug length % is not 10',length(slug); END IF;
  IF slug !~ '^[0-9a-hjkmnp-tv-z]{10}$' THEN RAISE EXCEPTION 'slug % uses confusable or unsafe characters',slug; END IF;
  IF seen@>to_jsonb(slug) THEN RAISE EXCEPTION 'slug % repeated within 200 draws',slug; END IF;
  seen:=seen||to_jsonb(slug);
 END LOOP;
 -- 61248의 26자 주소보다 실제로 짧고, 샘링크 보통 주소(4자)보다는 길게 유지한다.
 IF length(public.class_agit_samlink_slug_v1())>=26 THEN RAISE EXCEPTION 'slug not shortened'; END IF;
 IF length(public.class_agit_samlink_slug_v1())<=8 THEN RAISE EXCEPTION 'slug too guessable'; END IF;
END; $$;

DO $$
DECLARE t UUID:=gen_random_uuid(); a UUID:=gen_random_uuid(); c UUID:=gen_random_uuid(); s UUID:=gen_random_uuid();
 m UUID; p UUID; e UUID:=gen_random_uuid(); items JSONB:='[]'; src JSONB; r JSONB; link samlink.short_links%ROWTYPE;
 rooms JSONB:='[{"id":"spring","title":"봄","introduction":"","variant":0}]';
BEGIN
 PERFORM set_config('app.bypass_profile_protection','true',TRUE);
 INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data)
  VALUES(t,'slug-'||t||'@example.invalid','{}','{}'),(a,'slug-'||a||'@example.invalid','{}','{}');
 INSERT INTO public.profiles(id,role,is_approved) VALUES(t,'TEACHER',TRUE),(a,'STUDENT',TRUE)
  ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,is_approved=TRUE;
 INSERT INTO public.teachers(id,name,school_name) VALUES(t,'합성 교사','시험 학교');
 INSERT INTO public.classes(id,teacher_id,name,enabled_modules) VALUES(c,t,'짧은 주소 합성 학급',ARRAY['__configured__','class-agit']);
 INSERT INTO public.students(id,class_id,name,student_code,auth_id) VALUES(s,c,'비공개 실명',left(s::TEXT,8)||'SLG',a);
 UPDATE public.class_agit_rollout SET mode='pilot',external_enabled=TRUE WHERE singleton;
 DELETE FROM public.class_agit_pilot_classes;
 INSERT INTO public.class_agit_pilot_classes(class_id) VALUES(c);
 INSERT INTO public.writing_missions(class_id,teacher_id,title,guide,genre,mission_type,input_template,min_chars,min_paragraphs,base_reward,bonus_reward)
  VALUES(c,t,'짧은 주소 과제','합성 안내','글쓰기','글쓰기','freeform',1,1,0,0) RETURNING id INTO m;
 INSERT INTO public.student_posts(class_id,student_id,mission_id,title,content,is_submitted,is_confirmed)
  VALUES(c,s,m,'작품 하나','본문',TRUE,TRUE) RETURNING id INTO p;
 PERFORM set_config('app.bypass_profile_protection','false',TRUE);
 PERFORM set_config('request.jwt.claim.sub',t::TEXT,TRUE);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',t::TEXT,'role','authenticated')::TEXT,TRUE);
 src:=public.get_class_agit_source_v1(c,p)->'source';
 items:=jsonb_build_array(jsonb_build_object('sourceId',p,'sourceRevision',src->>'source_revision','publicAlias','과거 가림 이름','roomId','spring'));
 PERFORM public.run_class_agit_action_v1(c,'create',jsonb_build_object('exhibition_id',e));
 PERFORM public.run_class_agit_action_v1(c,'save',jsonb_build_object('exhibition_id',e,'expected_revision',1,'title','짧은 주소','layout_version',2,'rooms',rooms,'items',items));
 r:=public.get_class_agit_share_workspace_v1(c,e);
 SELECT jsonb_agg(jsonb_build_object('itemId',i->>'itemId','sourceRevision',i->>'sourceRevision','title','공개 제목','author','공개 지은이','roomId','spring'))
  INTO items FROM jsonb_array_elements(r->'candidates') i;
 r:=public.run_class_agit_share_action_v1(c,e,'publish',jsonb_build_object('display_version',2,'layout_version',2,'expected_revision',0,
  'exhibition_revision',2,'title','짧은 주소 전시','rooms',rooms,'items',items,'token',repeat('e',64),'starts_at',now(),'expires_at',now()+INTERVAL '30 days'));
 -- 발행 주소가 실제로 짧아지고 목적지·만료는 61248 계약 그대로여야 한다.
 IF r->'share'->>'short_url' !~ '^https://샘링크\.kr/[0-9a-hjkmnp-tv-z]{10}$' THEN RAISE EXCEPTION 'published short url not shortened: %',r->'share'->>'short_url'; END IF;
 SELECT * INTO link FROM samlink.short_links WHERE slug=(SELECT samlink_slug FROM public.class_agit_external_shares WHERE class_id=c AND id=e);
 IF link.destination<>'https://xn--vz0ba242ncqcba79xhwx.site/exhibition#'||repeat('e',64) OR link.created_by IS NOT NULL
  OR link.expires_at IS DISTINCT FROM (SELECT expires_at FROM public.class_agit_external_shares WHERE class_id=c AND id=e)
 THEN RAISE EXCEPTION 'samlink destination/expiry/ownership changed'; END IF;
 -- 해지하면 짧아진 주소도 함께 사라진다(61248 트리거 유지).
 PERFORM public.run_class_agit_share_action_v1(c,e,'revoke','{"expected_revision":1}');
 IF EXISTS(SELECT 1 FROM samlink.short_links WHERE slug=link.slug) THEN RAISE EXCEPTION 'revoked short link remains'; END IF;
 RAISE NOTICE 'Short samlink slug: 10-char unambiguous random slug, destination/expiry contract and revocation sync passed';
END; $$;
