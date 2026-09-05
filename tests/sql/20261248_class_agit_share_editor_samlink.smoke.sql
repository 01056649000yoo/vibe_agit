-- 합성 자료만 사용. 실행기가 전체를 ROLLBACK하거나 격리 DB를 제거한다.
DO $$
DECLARE t UUID:=gen_random_uuid(); a UUID:=gen_random_uuid(); c UUID:=gen_random_uuid(); s UUID:=gen_random_uuid();
    m UUID; p UUID; posts JSONB:='[]'; r TEXT;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
        IF has_function_privilege(r,'public.class_agit_max_works_v1()','EXECUTE')
            OR has_function_privilege(r,'public.class_agit_valid_work_id_v1(text)','EXECUTE')
        THEN RAISE EXCEPTION 'capacity helpers exposed to %',r; END IF;
    END LOOP;
    IF public.class_agit_max_works_v1()<>120 THEN RAISE EXCEPTION 'expected 120 works'; END IF;
    PERFORM set_config('app.bypass_profile_protection','true',TRUE);
    INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data)
        VALUES(t,'capacity-'||t||'@example.invalid','{}','{}'),(a,'capacity-'||a||'@example.invalid','{}','{}');
    INSERT INTO public.profiles(id,role,is_approved) VALUES(t,'TEACHER',TRUE),(a,'STUDENT',TRUE)
        ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,is_approved=TRUE;
    INSERT INTO public.teachers(id,name,school_name) VALUES(t,'합성 교사','시험 학교');
    INSERT INTO public.classes(id,teacher_id,name,enabled_modules) VALUES(c,t,'확인 제거 합성 학급',ARRAY['__configured__','class-agit']);
    INSERT INTO public.students(id,class_id,name,student_code,auth_id) VALUES(s,c,'비공개 실명',left(s::TEXT,8)||'CAP',a);
    UPDATE public.class_agit_rollout SET mode='pilot',external_enabled=TRUE WHERE singleton;
    DELETE FROM public.class_agit_pilot_classes;
    INSERT INTO public.class_agit_pilot_classes(class_id) VALUES(c);
    FOR i IN 1..41 LOOP
        INSERT INTO public.writing_missions(class_id,teacher_id,title,guide,genre,mission_type,input_template,min_chars,min_paragraphs,base_reward,bonus_reward)
            VALUES(c,t,'용량 과제 '||i,'합성 안내','글쓰기','글쓰기','freeform',1,1,0,0) RETURNING id INTO m;
        INSERT INTO public.student_posts(class_id,student_id,mission_id,title,content,is_submitted,is_confirmed)
            VALUES(c,s,m,'용량 작품 '||i,'수정 전 본문',TRUE,TRUE) RETURNING id INTO p;
        posts:=posts||to_jsonb(p);
    END LOOP;
    PERFORM set_config('test.direct_teacher',t::TEXT,TRUE); PERFORM set_config('test.direct_auth',a::TEXT,TRUE);
    PERFORM set_config('test.direct_class',c::TEXT,TRUE); PERFORM set_config('test.direct_posts',posts::TEXT,TRUE);
    PERFORM set_config('test.direct_ex',gen_random_uuid()::TEXT,TRUE);
    PERFORM set_config('app.bypass_profile_protection','false',TRUE);
END; $$;


SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.direct_teacher'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.direct_teacher'),'role','authenticated')::TEXT,TRUE);
DO $$
DECLARE c UUID:=current_setting('test.direct_class')::UUID;e UUID:=current_setting('test.direct_ex')::UUID;
 p JSONB;src JSONB;items JSONB:='[]';n INTEGER:=0;r JSONB;payload JSONB;denied BOOLEAN;
 rooms JSONB:='[{"id":"spring","title":"봄","introduction":"","variant":0},{"id":"summer","title":"여름","introduction":"","variant":1},{"id":"autumn","title":"가을","introduction":"","variant":2}]';
BEGIN
 FOR p IN SELECT value FROM jsonb_array_elements(current_setting('test.direct_posts')::JSONB) LOOP
  n:=n+1;src:=public.get_class_agit_source_v1(c,(p#>>'{}')::UUID)->'source';
  items:=items||jsonb_build_object('sourceId',p,'sourceRevision',src->>'source_revision','publicAlias','과거 가림 이름','roomId',CASE WHEN n<=13 THEN 'spring' WHEN n<=33 THEN 'summer' ELSE 'autumn' END);
 END LOOP;
 PERFORM public.run_class_agit_action_v1(c,'create',jsonb_build_object('exhibition_id',e));
 PERFORM public.run_class_agit_action_v1(c,'save',jsonb_build_object('exhibition_id',e,'expected_revision',1,'title','공유 편집','layout_version',2,'rooms',rooms,'items',items));
 r:=public.get_class_agit_share_workspace_v1(c,e);
 IF r->'candidates'->0->>'authorName'<>'비공개 실명' THEN RAISE EXCEPTION 'teacher author missing';END IF;
 SELECT jsonb_agg(jsonb_build_object('itemId',i->>'itemId','sourceRevision',i->>'sourceRevision','title','외부 제목','author','교사가 정한 지은이','roomId',i->>'roomId') ORDER BY x.n)
 INTO items FROM jsonb_array_elements(r->'candidates') WITH ORDINALITY x(i,n);
 rooms:=jsonb_set(rooms,'{0,title}','"공개 봄 주제"');
 payload:=jsonb_build_object('display_version',2,'layout_version',2,'expected_revision',0,'exhibition_revision',2,'title','외부 전시','rooms',rooms,'items',items,'token',repeat('e',64),'starts_at',now(),'expires_at',now()+INTERVAL '30 days');
 denied:=FALSE;BEGIN PERFORM public.run_class_agit_share_action_v1(c,e,'publish',jsonb_set(payload,'{items,0,roomId}','"summer"'));EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE;END;
 IF NOT denied THEN RAISE EXCEPTION '21 works share accepted';END IF;
 denied:=FALSE;BEGIN PERFORM public.run_class_agit_share_action_v1(c,e,'publish',jsonb_set(payload,'{items,0,author}','""'));EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE;END;
 IF NOT denied THEN RAISE EXCEPTION 'blank author accepted';END IF;
 r:=public.run_class_agit_share_action_v1(c,e,'publish',payload);
 IF r->'share'->>'short_url' NOT LIKE 'https://샘링크.kr/e-%' OR r->'share'->>'publication_no'<>'1' THEN RAISE EXCEPTION 'samlink missing';END IF;
 IF r->'candidates'->0->>'shareTitle'<>'외부 제목' OR r->'candidates'->0->>'shareAuthor'<>'교사가 정한 지은이' OR r->'share_rooms'->0->>'title'<>'공개 봄 주제' THEN RAISE EXCEPTION 'editor restore missing';END IF;
 PERFORM set_config('test.editor_url',r->'share'->>'short_url',TRUE);
 r:=public.run_class_agit_share_action_v1(c,e,'publish',payload);
 IF r->'share'->>'short_url'<>current_setting('test.editor_url') OR r->'share'->>'publication_no'<>'1' THEN RAISE EXCEPTION 'retry duplicated link/publication';END IF;
 denied:=FALSE;BEGIN PERFORM public.run_class_agit_share_action_v1(c,e,'rotate',jsonb_build_object('display_version',2,'expected_revision',1,'token',repeat('f',64)));EXCEPTION WHEN SQLSTATE 'PT429' THEN denied:=TRUE;END;
 IF NOT denied THEN RAISE EXCEPTION 'shortlink creation budget missing';END IF;
END; $$;
RESET ROLE;
DO $$ DECLARE c UUID:=current_setting('test.direct_class')::UUID;e UUID:=current_setting('test.direct_ex')::UUID;s public.class_agit_external_shares%ROWTYPE;l samlink.short_links%ROWTYPE;r TEXT;
BEGIN
 SELECT * INTO s FROM public.class_agit_external_shares WHERE class_id=c AND id=e;
 SELECT * INTO l FROM samlink.short_links WHERE slug=s.samlink_slug;
 IF l.destination<>'https://xn--vz0ba242ncqcba79xhwx.site/exhibition#'||repeat('e',64) OR l.expires_at<>s.expires_at OR l.created_by IS NOT NULL THEN RAISE EXCEPTION 'samlink destination/expiry/ownership invalid';END IF;
 IF EXISTS(SELECT 1 FROM public.student_posts WHERE class_id=c AND title='외부 제목') THEN RAISE EXCEPTION 'source modified';END IF;
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_function_privilege(r,'public.class_agit_create_samlink_v1(uuid,uuid,text)','EXECUTE') OR has_function_privilege(r,'public.class_agit_sync_samlink_v1()','EXECUTE') THEN RAISE EXCEPTION 'private helper exposed'; END IF;
 END LOOP;
 UPDATE public.class_agit_external_shares SET shortened_at=now()-INTERVAL '10 seconds' WHERE class_id=c AND id=e;
END; $$;
SET LOCAL ROLE service_role;
DO $$ DECLARE r JSONB;BEGIN
 r:=public.read_public_class_agit_v1(repeat('e',64),1,NULL,NULL,2);
 IF r->'items'->0->>'title'<>'외부 제목' OR r->'items'->0->>'author'<>'교사가 정한 지은이' OR r->'rooms'->0->>'title'<>'공개 봄 주제' THEN RAISE EXCEPTION 'public display edits lost';END IF;
END; $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.direct_auth'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.direct_auth'),'role','authenticated')::TEXT,TRUE);
DO $$ DECLARE denied BOOLEAN:=FALSE;BEGIN
 BEGIN PERFORM public.get_class_agit_share_workspace_v1(current_setting('test.direct_class')::UUID,current_setting('test.direct_ex')::UUID);EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE;END;
 IF NOT denied THEN RAISE EXCEPTION 'student saw share editor';END IF;
END; $$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.direct_teacher'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.direct_teacher'),'role','authenticated')::TEXT,TRUE);
DO $$ DECLARE c UUID:=current_setting('test.direct_class')::UUID;e UUID:=current_setting('test.direct_ex')::UUID;r JSONB;BEGIN
 r:=public.run_class_agit_share_action_v1(c,e,'rotate',jsonb_build_object('display_version',2,'expected_revision',1,'token',repeat('f',64)));
 IF r->'share'->>'short_url'=current_setting('test.editor_url') THEN RAISE EXCEPTION 'rotation reused old slug';END IF;
 PERFORM set_config('test.editor_url2',r->'share'->>'short_url',TRUE);
 PERFORM public.run_class_agit_share_action_v1(c,e,'extend',jsonb_build_object('expected_revision',2,'expires_at',now()+INTERVAL '1 day'));
END; $$;
RESET ROLE;
DO $$ DECLARE s public.class_agit_external_shares%ROWTYPE;BEGIN
 IF EXISTS(SELECT 1 FROM samlink.short_links WHERE slug=replace(current_setting('test.editor_url'),'https://샘링크.kr/','')) THEN RAISE EXCEPTION 'old link remains';END IF;
 SELECT * INTO s FROM public.class_agit_external_shares WHERE id=current_setting('test.direct_ex')::UUID;
 IF (SELECT expires_at FROM samlink.short_links WHERE slug=s.samlink_slug) IS DISTINCT FROM s.expires_at THEN RAISE EXCEPTION 'expiry not synced';END IF;
END; $$;
SET LOCAL ROLE authenticated;
SELECT public.run_class_agit_share_action_v1(current_setting('test.direct_class')::UUID,current_setting('test.direct_ex')::UUID,'revoke','{"expected_revision":3}');
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM samlink.short_links WHERE slug=replace(current_setting('test.editor_url2'),'https://샘링크.kr/','')) THEN RAISE EXCEPTION 'revoked shortlink remains';END IF;
 UPDATE public.class_agit_external_shares SET revoked_at=NULL,expires_at=now()+INTERVAL '1 day' WHERE id=current_setting('test.direct_ex')::UUID;
 PERFORM public.class_agit_create_samlink_v1(current_setting('test.direct_class')::UUID,current_setting('test.direct_ex')::UUID,repeat('f',64));
 PERFORM set_config('test.delete_slug',(SELECT samlink_slug FROM public.class_agit_external_shares WHERE id=current_setting('test.direct_ex')::UUID),TRUE);
 DELETE FROM public.class_agit_exhibitions WHERE class_id=current_setting('test.direct_class')::UUID AND id=current_setting('test.direct_ex')::UUID;
 IF EXISTS(SELECT 1 FROM samlink.short_links WHERE slug=current_setting('test.delete_slug')) THEN RAISE EXCEPTION 'deleted exhibition shortlink remains';END IF;
 RAISE NOTICE 'Share editor: metadata/room edits, identity, Samlink expiry/rotation/revocation/deletion, retry and role boundaries passed';
END; $$;
