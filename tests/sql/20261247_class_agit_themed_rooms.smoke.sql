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
DECLARE c UUID:=current_setting('test.direct_class')::UUID; e UUID:=current_setting('test.direct_ex')::UUID;
 p JSONB; src JSONB; items JSONB:='[]';r JSONB;payload JSONB;shareitems JSONB;denied BOOLEAN; n INTEGER:=0;
 rooms JSONB:='[{"id":"spring","title":"봄 이야기","introduction":"새로운 시작","variant":0},{"id":"summer","title":"여름 이야기","introduction":"함께한 여름","variant":1},{"id":"autumn","title":"가을 이야기","introduction":"작은 결실","variant":2}]';
BEGIN
 FOR p IN SELECT value FROM jsonb_array_elements(current_setting('test.direct_posts')::JSONB) LOOP
  n:=n+1;src:=public.get_class_agit_source_v1(c,(p#>>'{}')::UUID)->'source';
  items:=items||jsonb_build_object('sourceId',p,'sourceRevision',src->>'source_revision','publicAlias','새싹 작가','roomId',CASE WHEN n<=13 THEN 'spring' WHEN n<=33 THEN 'summer' ELSE 'autumn' END);
 END LOOP;
 PERFORM public.run_class_agit_action_v1(c,'create',jsonb_build_object('exhibition_id',e));
 payload:=jsonb_build_object('exhibition_id',e,'expected_revision',1,'title','주제별 전시','theme','night','layout_version',2,'rooms',rooms,'items',items);
 denied:=FALSE;BEGIN PERFORM public.run_class_agit_action_v1(c,'save',jsonb_set(payload,'{items,0,roomId}','"summer"'));EXCEPTION WHEN check_violation THEN denied:=TRUE;END;
 IF NOT denied THEN RAISE EXCEPTION '21 works accepted in one room';END IF;
 denied:=FALSE;BEGIN PERFORM public.run_class_agit_action_v1(c,'save',jsonb_set(payload,'{rooms,0,variant}','4'));EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE;END;
 IF NOT denied THEN RAISE EXCEPTION 'invalid room variant accepted';END IF;
 r:=public.run_class_agit_action_v1(c,'save',jsonb_set(payload,'{items,0,roomId}','null'));
 denied:=FALSE;BEGIN PERFORM public.run_class_agit_action_v1(c,'publish',jsonb_build_object('exhibition_id',e,'expected_revision',2,'confirmed',TRUE));EXCEPTION WHEN check_violation THEN denied:=TRUE;END;
 IF NOT denied THEN RAISE EXCEPTION 'unassigned publication accepted';END IF;
 payload:=payload||'{"expected_revision":2}';r:=public.run_class_agit_action_v1(c,'save',payload);
 PERFORM public.run_class_agit_action_v1(c,'publish',jsonb_build_object('exhibition_id',e,'expected_revision',3,'confirmed',TRUE));
 r:=public.get_class_agit_publication_v1(c,e,2,2);
 IF jsonb_array_length(r->'exhibition'->'works')<>20 OR r->'rooms'->1->>'title'<>'여름 이야기' THEN RAISE EXCEPTION 'themed publication lost: %',r;END IF;
 SELECT jsonb_agg(jsonb_build_object('itemId',x->>'itemId','sourceRevision',x->>'sourceRevision','publicAlias','새싹 작가')) INTO shareitems FROM jsonb_array_elements(public.get_class_agit_workspace_v1(c,e)->'draft'->'items') x;
 PERFORM public.run_class_agit_share_action_v1(c,e,'publish',jsonb_build_object('token',repeat('d',64),'starts_at',now(),'expires_at',now()+INTERVAL '30 days','expected_revision',0,'exhibition_revision',4,'layout_version',2,'title','주제 공개본','items',shareitems));
 denied:=FALSE;BEGIN PERFORM public.run_class_agit_action_v1(c,'save',(payload-'rooms')||'{"expected_revision":4}');EXCEPTION WHEN SQLSTATE 'PT409' THEN denied:=TRUE;END;
 IF NOT denied THEN RAISE EXCEPTION 'old writer destroyed new room layout';END IF;
 r:=public.run_class_agit_action_v1(c,'save',jsonb_set(payload||'{"expected_revision":4}','{rooms,1,title}','"바뀐 편집본"'));
 IF public.get_class_agit_publication_v1(c,e,2,2)->'rooms'->1->>'title'<>'여름 이야기' THEN RAISE EXCEPTION 'draft changed frozen room';END IF;
END; $$;
RESET ROLE;
-- 본문 수정은 확정본에 전파하지 않는다.
UPDATE public.student_posts SET content='발행 후 수정 본문' WHERE class_id=current_setting('test.direct_class')::UUID AND id=(current_setting('test.direct_posts')::JSONB->>13)::UUID;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.direct_auth'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.direct_auth'),'role','authenticated')::TEXT,TRUE);
DO $$ DECLARE e UUID:=current_setting('test.direct_ex')::UUID;r JSONB;BEGIN
 r:=public.get_my_class_agit_room_v1(e,2,2);
 IF jsonb_array_length(r->'items')<>20 OR r->'rooms'->0->>'count'<>'13' OR r->'rooms'->2->>'count'<>'8' THEN RAISE EXCEPTION '13/20/8 assignment lost';END IF;
 IF jsonb_array_length(public.get_my_class_agit_room_v1(e,2)->'items')<>12 THEN RAISE EXCEPTION 'old reader compatibility broken';END IF;
 IF public.get_my_class_agit_work_v1(e,1,'published-14',2)->>'room_title'<>'여름 이야기' THEN RAISE EXCEPTION 'work topic missing';END IF;
 IF public.get_my_class_agit_work_v1(e,1,'published-14')->'work'->'blocks'->>0<>'수정 전 본문' THEN RAISE EXCEPTION 'original edit changed frozen class body';END IF;
END; $$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ DECLARE r JSONB;BEGIN
 r:=public.read_public_class_agit_v1(repeat('d',64),2,NULL,NULL,2);
 IF r->'items'->0->>'author'<>'새싹 작가 14' THEN RAISE EXCEPTION 'automatic external alias missing';END IF;
 IF jsonb_array_length(r->'items')<>20 OR r->'rooms'->1->>'title'<>'여름 이야기' OR r->'rooms'->1->>'variant'<>'1' THEN RAISE EXCEPTION 'external frozen rooms lost';END IF;
 IF public.read_public_class_agit_v1(repeat('d',64),2,'published-14',1,2)->'work'->'blocks'->>0<>'수정 전 본문' THEN RAISE EXCEPTION 'original edit changed frozen external body';END IF;
END; $$;
RESET ROLE;
-- 호환 쓰기/120편은 별도 합성 전시에 검증한다.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.direct_teacher'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.direct_teacher'),'role','authenticated')::TEXT,TRUE);
SELECT set_config('test.capacity_ex',gen_random_uuid()::TEXT,TRUE);
RESET ROLE;
DO $$ DECLARE c UUID:=current_setting('test.direct_class')::UUID;p UUID;s UUID;m UUID;ids JSONB:='[]';BEGIN
 SELECT student_id,mission_id INTO s,m FROM public.student_posts WHERE class_id=c LIMIT 1;
 FOR n IN 1..121 LOOP
  INSERT INTO public.writing_missions(class_id,teacher_id,title,guide,genre,mission_type,input_template,min_chars,min_paragraphs,base_reward,bonus_reward) VALUES(c,current_setting('test.direct_teacher')::UUID,'용량 과제 '||n,'안내','글쓰기','글쓰기','freeform',1,1,0,0) RETURNING id INTO m;
  INSERT INTO public.student_posts(class_id,student_id,mission_id,title,content,is_submitted,is_confirmed) VALUES(c,s,m,'최대 용량 '||n,'합성 본문',TRUE,TRUE) RETURNING id INTO p;
  ids:=ids||to_jsonb(p);
 END LOOP;PERFORM set_config('test.capacity_posts',ids::TEXT,TRUE);
END; $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE c UUID:=current_setting('test.direct_class')::UUID;e UUID:=current_setting('test.capacity_ex')::UUID;p JSONB;n INTEGER:=0;items JSONB:='[]';rooms JSONB:='[]';src JSONB;payload JSONB;r JSONB;denied BOOLEAN;
BEGIN
 FOR p IN SELECT value FROM jsonb_array_elements(current_setting('test.capacity_posts')::JSONB) LOOP
  n:=n+1;src:=public.get_class_agit_source_v1(c,(p#>>'{}')::UUID)->'source';items:=items||jsonb_build_object('sourceId',p,'sourceRevision',src->>'source_revision','publicAlias','새싹 작가','roomId','full-'||LEAST(6,(n-1)/20+1));
 END LOOP;
 FOR n IN 1..6 LOOP rooms:=rooms||jsonb_build_object('id','full-'||n,'title','주제 '||n,'introduction','','variant',n%4);END LOOP;
 PERFORM public.run_class_agit_action_v1(c,'create',jsonb_build_object('exhibition_id',e));
 payload:=jsonb_build_object('exhibition_id',e,'expected_revision',1,'title','120편','rooms',rooms,'items',items);
 denied:=FALSE;BEGIN PERFORM public.run_class_agit_action_v1(c,'save',payload);EXCEPTION WHEN check_violation THEN denied:=TRUE;END;
 IF NOT denied THEN RAISE EXCEPTION '121 works accepted';END IF;
 payload:=jsonb_set(payload,'{items}',items-120);r:=public.run_class_agit_action_v1(c,'save',payload);
 PERFORM public.run_class_agit_action_v1(c,'publish',jsonb_build_object('exhibition_id',e,'expected_revision',2,'confirmed',TRUE));
 r:=public.get_class_agit_publication_v1(c,e,6,2);
 IF r->>'total_count'<>'120' OR jsonb_array_length(r->'rooms')<>6 OR jsonb_array_length(r->'exhibition'->'works')<>20 THEN RAISE EXCEPTION '20x6 layout failed';END IF;
 -- 12편을 기대하는 예전 탭은 여전히 열 번째 페이지의 120번 작품에 접근한다.
 r:=public.get_class_agit_publication_v1(c,e,10);
 IF jsonb_array_length(r->'exhibition'->'works')<>12 OR r->'exhibition'->'works'->11->>'id'<>'published-120' THEN RAISE EXCEPTION 'legacy tenth room failed';END IF;
 e:=gen_random_uuid();PERFORM public.run_class_agit_action_v1(c,'create',jsonb_build_object('exhibition_id',e));
 payload:=(payload-'rooms')||jsonb_build_object('exhibition_id',e);r:=public.run_class_agit_action_v1(c,'save',payload);
 IF jsonb_array_length(r->'draft'->'rooms')<>10 OR r->'draft'->'items'->119->>'roomId'<>'room-10' THEN RAISE EXCEPTION 'legacy twelve-work save layout lost';END IF;
END; $$;
RESET ROLE;
-- 첫 방 전체 회수: 2·3번 방은 합치거나 재번호하지 않는다.
UPDATE public.student_posts SET is_submitted=FALSE,is_confirmed=FALSE WHERE class_id=current_setting('test.direct_class')::UUID AND id IN(SELECT (value#>>'{}')::UUID FROM jsonb_array_elements(current_setting('test.direct_posts')::JSONB) WITH ORDINALITY x(value,n) WHERE n<=13);
SET LOCAL ROLE service_role;
DO $$ DECLARE r JSONB;BEGIN
 r:=public.read_public_class_agit_v1(repeat('d',64),2,NULL,NULL,2);
 IF r->'rooms'->0->>'number'<>'2' OR jsonb_array_length(r->'items')<>20 OR r->'items'->0->>'id'<>'published-14' THEN RAISE EXCEPTION 'withdrawal regrouped topics';END IF;
END; $$;
RESET ROLE;
-- 읽기에서 원본 재조회를 시도하면 바로 실패하게 만들어 퇴행을 잡는다.
CREATE OR REPLACE FUNCTION public.class_agit_current_source_v1(p_class_id UUID,p_post_id UUID) RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'original source re-read'; END; $$;
SET LOCAL ROLE service_role;
DO $$ DECLARE r JSONB;started TIMESTAMPTZ:=clock_timestamp();BEGIN
 FOR n IN 1..50 LOOP r:=public.read_public_class_agit_v1(repeat('d',64),2,NULL,NULL,2);END LOOP;
 IF jsonb_array_length(r->'items')<>20 THEN RAISE EXCEPTION 'frozen read failed';END IF;
 RAISE NOTICE '20-summary read, 50 sequential DB calls: % ms total, % bytes JSON',round(extract(epoch FROM clock_timestamp()-started)*1000,2),octet_length(r::TEXT);
END; $$;
RESET ROLE;
UPDATE public.class_agit_external_shares SET starts_at=now()-INTERVAL '30 days',expires_at=now() WHERE class_id=current_setting('test.direct_class')::UUID;
SET LOCAL ROLE service_role;
DO $$ BEGIN
 IF public.read_public_class_agit_v1(repeat('d',64),2,NULL,NULL,2)->>'error'<>'unavailable' THEN RAISE EXCEPTION 'expired exhibition exposed';END IF;
 RAISE NOTICE 'Themed rooms: 13/20/8, capacity/unassigned/old-writer guards, frozen text/layout, legacy reader, withdrawal boundaries and expiry passed';
END; $$;
RESET ROLE;
