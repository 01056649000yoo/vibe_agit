-- 합성 자료만 사용. 실행기가 전체를 ROLLBACK하거나 격리 DB를 제거한다.
-- 수록 철회한 작품이 외부 공개본에 실리지 않는지, 그리고 철회분을 뺀 채 발행할 수 있는지 본다.
DO $$
DECLARE t UUID:=gen_random_uuid(); a UUID:=gen_random_uuid(); c UUID:=gen_random_uuid(); s UUID:=gen_random_uuid();
 m UUID; p UUID; e UUID:=gen_random_uuid(); posts JSONB:='[]';
BEGIN
 PERFORM set_config('app.bypass_profile_protection','true',TRUE);
 INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data)
  VALUES(t,'wd-'||t||'@example.invalid','{}','{}'),(a,'wd-'||a||'@example.invalid','{}','{}');
 INSERT INTO public.profiles(id,role,is_approved) VALUES(t,'TEACHER',TRUE),(a,'STUDENT',TRUE)
  ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,is_approved=TRUE;
 INSERT INTO public.teachers(id,name,school_name) VALUES(t,'합성 교사','시험 학교');
 INSERT INTO public.classes(id,teacher_id,name,enabled_modules) VALUES(c,t,'철회 합성 학급',ARRAY['__configured__','class-agit']);
 INSERT INTO public.students(id,class_id,name,student_code,auth_id) VALUES(s,c,'비공개 실명',left(s::TEXT,8)||'WDR',a);
 UPDATE public.class_agit_rollout SET mode='pilot',external_enabled=TRUE WHERE singleton;
 DELETE FROM public.class_agit_pilot_classes;
 INSERT INTO public.class_agit_pilot_classes(class_id) VALUES(c);
 FOR i IN 1..3 LOOP
  INSERT INTO public.writing_missions(class_id,teacher_id,title,guide,genre,mission_type,input_template,min_chars,min_paragraphs,base_reward,bonus_reward)
   VALUES(c,t,'철회 과제 '||i,'합성 안내','글쓰기','글쓰기','freeform',1,1,0,0) RETURNING id INTO m;
  INSERT INTO public.student_posts(class_id,student_id,mission_id,title,content,is_submitted,is_confirmed)
   VALUES(c,s,m,'작품 '||i,'비밀 본문 '||i,TRUE,TRUE) RETURNING id INTO p;
  posts:=posts||to_jsonb(p);
 END LOOP;
 PERFORM set_config('app.bypass_profile_protection','false',TRUE);
 PERFORM set_config('test.wd_class',c::TEXT,TRUE); PERFORM set_config('test.wd_ex',e::TEXT,TRUE);
 PERFORM set_config('test.wd_teacher',t::TEXT,TRUE); PERFORM set_config('test.wd_posts',posts::TEXT,TRUE);
END; $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.wd_teacher'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.wd_teacher'),'role','authenticated')::TEXT,TRUE);

DO $$
DECLARE c UUID:=current_setting('test.wd_class')::UUID; e UUID:=current_setting('test.wd_ex')::UUID;
 p JSONB; src JSONB; items JSONB:='[]';
 rooms JSONB:='[{"id":"one","title":"봄","introduction":"","variant":0}]';
BEGIN
 FOR p IN SELECT value FROM jsonb_array_elements(current_setting('test.wd_posts')::JSONB) LOOP
  src:=public.get_class_agit_source_v1(c,(p#>>'{}')::UUID)->'source';
  items:=items||jsonb_build_object('sourceId',p,'sourceRevision',src->>'source_revision','publicAlias','가림','roomId','one');
 END LOOP;
 PERFORM public.run_class_agit_action_v1(c,'create',jsonb_build_object('exhibition_id',e));
 PERFORM public.run_class_agit_action_v1(c,'save',jsonb_build_object('exhibition_id',e,'expected_revision',1,'title','철회 시험','layout_version',2,'rooms',rooms,'items',items));
END; $$;
RESET ROLE;

-- 대상 작품 고르기는 표를 직접 읽어야 해서 관리 역할로 한다(브라우저 역할은 표에 접근할 수 없다).
DO $$ BEGIN
 PERFORM set_config('test.wd_victim',
  (SELECT id::TEXT FROM public.class_agit_items
    WHERE class_id=current_setting('test.wd_class')::UUID AND exhibition_id=current_setting('test.wd_ex')::UUID
    ORDER BY position OFFSET 1 LIMIT 1), TRUE);
END; $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.wd_teacher'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.wd_teacher'),'role','authenticated')::TEXT,TRUE);
DO $$
DECLARE c UUID:=current_setting('test.wd_class')::UUID; e UUID:=current_setting('test.wd_ex')::UUID;
 items JSONB; r JSONB; payload JSONB; victim UUID:=current_setting('test.wd_victim')::UUID; denied BOOLEAN;
 rooms JSONB:='[{"id":"one","title":"봄","introduction":"","variant":0}]';
BEGIN
 -- 두 번째 작품의 수록을 철회한다.
 PERFORM public.run_class_agit_action_v1(c,'withdraw',jsonb_build_object('exhibition_id',e,'expected_revision',2,'item_id',victim,'confirmed',TRUE));

 -- 교사 화면 후보에 철회 표시가 실려야 화면이 미리 막을 수 있다.
 r:=public.get_class_agit_share_workspace_v1(c,e);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'candidates') x WHERE (x->>'revoked')::BOOLEAN)
 THEN RAISE EXCEPTION '후보 목록에 철회 표시가 없어 화면이 미리 막을 수 없다'; END IF;

 -- 철회한 작품을 넣은 외부 발행은 거절되어야 한다.
 SELECT jsonb_agg(jsonb_build_object('itemId',i->>'itemId','sourceRevision',i->>'sourceRevision','title','외부 '||x.n,'author','지은이','roomId','one') ORDER BY x.n)
  INTO items FROM jsonb_array_elements(r->'candidates') WITH ORDINALITY x(i,n);
 payload:=jsonb_build_object('display_version',2,'layout_version',2,'expected_revision',0,'exhibition_revision',3,
   'title','외부 전시','rooms',rooms,'items',items,'token',repeat('e',64),'starts_at',now(),'expires_at',now()+INTERVAL '30 days');
 denied:=FALSE;
 BEGIN PERFORM public.run_class_agit_share_action_v1(c,e,'publish',payload);
 EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
 IF NOT denied THEN RAISE EXCEPTION '누출: 외부 발행이 철회한 작품을 받아들였다'; END IF;

 -- 철회한 작품을 빼면 발행할 수 있어야 한다(빼지도 넣지도 못하는 상태가 되면 안 된다).
 SELECT jsonb_agg(e2) INTO items FROM jsonb_array_elements(items) e2
  WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'candidates') x
                   WHERE (x->>'revoked')::BOOLEAN AND x->>'itemId'=e2->>'itemId');
 payload:=jsonb_set(payload,'{items}',items);
 r:=public.run_class_agit_share_action_v1(c,e,'publish',payload);
 IF r->'share'->>'publication_no'<>'1' THEN RAISE EXCEPTION '철회분을 뺀 발행이 실패했다: %', r->'share'; END IF;
 PERFORM set_config('test.wd_token',repeat('e',64),TRUE);
END; $$;
RESET ROLE;

SET LOCAL ROLE service_role;
DO $$
DECLARE r JSONB;
BEGIN
 r:=public.read_public_class_agit_v1(current_setting('test.wd_token'),1,NULL,NULL,2);
 IF jsonb_array_length(r->'items')<>2 THEN RAISE EXCEPTION '공개본은 2편이어야 하는데 %', r->'items'; END IF;
 IF r::TEXT LIKE '%비밀 본문 2%' OR r::TEXT LIKE '%작품 2%'
 THEN RAISE EXCEPTION '누출: 철회한 작품이 익명 화면에 나왔다: %', r->'items'; END IF;
 RAISE NOTICE '수록 철회: 외부 발행이 철회분을 거절하고, 나머지는 정상 발행되며, 익명 화면에 철회분이 나오지 않는다';
END; $$;
RESET ROLE;
