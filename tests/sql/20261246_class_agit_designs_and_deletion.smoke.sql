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
    FOR i IN 1..2 LOOP
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
 b UUID:=gen_random_uuid();p UUID:=(current_setting('test.direct_posts')::JSONB->>0)::UUID;
 source JSONB;item JSONB;payload JSONB;r JSONB;ed UUID;ex_item UUID;rev INTEGER;denied BOOLEAN;paper TEXT;design TEXT;
BEGIN
 source:=public.get_class_agit_source_v1(c,p)->'source';
 item:=jsonb_build_object('sourceId',p,'sourceRevision',source->>'source_revision','publicAlias','별 작가');
 PERFORM public.run_class_agit_action_v1(c,'create',jsonb_build_object('exhibition_id',e));
 payload:=jsonb_build_object('exhibition_id',e,'expected_revision',1,'title','디자인 전시','theme','night','items',jsonb_build_array(item));
 denied:=FALSE;BEGIN PERFORM public.run_class_agit_action_v1(c,'save',payload||'{"theme":"<script>"}'::JSONB);EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE;END;
 IF NOT denied THEN RAISE EXCEPTION 'invalid theme accepted';END IF;
 r:=public.run_class_agit_action_v1(c,'save',payload);
 ex_item:=(r->'draft'->'items'->0->>'itemId')::UUID;
 PERFORM public.run_class_agit_action_v1(c,'publish',jsonb_build_object('exhibition_id',e,'expected_revision',2,'confirmed',TRUE));
 r:=public.get_class_agit_publication_v1(c,e);
 IF r->'exhibition'->>'theme'<>'night' THEN RAISE EXCEPTION 'published theme missing';END IF;
 PERFORM public.run_class_agit_share_action_v1(c,e,'publish',jsonb_build_object('token',repeat('d',64),'starts_at',now(),'expires_at',now()+INTERVAL '30 days','expected_revision',0,
  'exhibition_revision',3,'title','디자인 공개본','items',jsonb_build_array(jsonb_build_object('itemId',ex_item,'sourceRevision',source->>'source_revision','publicAlias','별 작가'))));
 r:=public.run_class_agit_action_v1(c,'save',payload||'{"expected_revision":3,"theme":"museum"}'::JSONB);
 IF r->'draft'->>'theme'<>'museum' OR public.get_class_agit_publication_v1(c,e)->'exhibition'->>'theme'<>'night' THEN RAISE EXCEPTION 'draft changed frozen design';END IF;
 PERFORM public.run_class_agit_book_action_v1(c,'create',jsonb_build_object('book_id',b));
 payload:=jsonb_build_object('book_id',b,'title','판형 문집','issue_date',current_date,'items',jsonb_build_array(item-'publicAlias'));
 rev:=1;
 FOREACH paper IN ARRAY ARRAY['A4','A5','B5'] LOOP
  FOREACH design IN ARRAY ARRAY['botanical','editorial','notebook','constellation'] LOOP
   r:=public.run_class_agit_book_action_v1(c,'save',payload||jsonb_build_object('expected_revision',rev,'paper_format',paper,'design_id',design));rev:=rev+1;
   r:=public.get_class_agit_book_preview_v1(c,b,rev);
   IF r->'book'->'print' IS DISTINCT FROM jsonb_build_object('paper',paper,'design',design,'body_pt',12,'poem_pt',14,'version',2) THEN RAISE EXCEPTION 'paper/design preview lost';END IF;
  END LOOP;
 END LOOP;
 denied:=FALSE;BEGIN PERFORM public.run_class_agit_book_action_v1(c,'save',payload||jsonb_build_object('expected_revision',rev,'paper_format','A3'));EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE;END;
 IF NOT denied THEN RAISE EXCEPTION 'unbounded paper accepted';END IF;
 denied:=FALSE;BEGIN PERFORM public.run_class_agit_book_action_v1(c,'save',payload||jsonb_build_object('expected_revision',rev,'design_id','url(evil)'));EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE;END;
 IF NOT denied THEN RAISE EXCEPTION 'arbitrary design accepted';END IF;
 r:=public.run_class_agit_book_action_v1(c,'finalize',jsonb_build_object('book_id',b,'expected_revision',rev,'confirmed',TRUE));rev:=rev+1;
 ed:=(r->'book'->'editions'->0->>'id')::UUID;
 PERFORM public.run_class_agit_book_action_v1(c,'save',payload||jsonb_build_object('expected_revision',rev,'paper_format','A5','design_id','notebook'));rev:=rev+1;
 r:=public.get_class_agit_book_edition_v1(c,ed);
 IF r->'book'->'print'->>'paper'<>'B5' OR r->'book'->'print'->>'design'<>'constellation' THEN RAISE EXCEPTION 'edition design changed with draft';END IF;
 PERFORM public.run_class_agit_book_action_v1(c,'show',jsonb_build_object('book_id',b,'expected_revision',rev,'edition_id',ed));rev:=rev+1;
 PERFORM set_config('test.direct_book',b::TEXT,TRUE);PERFORM set_config('test.design_edition',ed::TEXT,TRUE);PERFORM set_config('test.book_revision',rev::TEXT,TRUE);
END; $$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ BEGIN
 IF public.read_public_class_agit_v1(repeat('d',64),0)->>'theme'<>'night' THEN RAISE EXCEPTION 'external design not frozen';END IF;
END; $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.direct_auth'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.direct_auth'),'role','authenticated')::TEXT,TRUE);
DO $$
DECLARE c UUID:=current_setting('test.direct_class')::UUID;e UUID:=current_setting('test.direct_ex')::UUID;b UUID:=current_setting('test.direct_book')::UUID;denied BOOLEAN;
BEGIN
 IF public.get_my_class_agit_room_v1(e,1)->>'theme'<>'night' THEN RAISE EXCEPTION 'student design missing';END IF;
 IF public.get_my_class_agit_books_v1()->'books'->0->>'design'<>'constellation' OR public.get_my_class_agit_books_v1()->'books'->0->>'paper'<>'B5' THEN RAISE EXCEPTION 'student edition design not frozen';END IF;
 denied:=FALSE;BEGIN PERFORM public.run_class_agit_action_v1(c,'delete',jsonb_build_object('exhibition_id',e,'expected_revision',4,'confirmed',TRUE));EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE;END;
 IF NOT denied THEN RAISE EXCEPTION 'student exhibition deletion accepted';END IF;
 denied:=FALSE;BEGIN PERFORM public.run_class_agit_book_action_v1(c,'delete',jsonb_build_object('book_id',b,'expected_revision',current_setting('test.book_revision')::INTEGER,'confirmed',TRUE));EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE;END;
 IF NOT denied THEN RAISE EXCEPTION 'student book deletion accepted';END IF;
END; $$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.direct_teacher'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.direct_teacher'),'role','authenticated')::TEXT,TRUE);
DO $$
DECLARE c UUID:=current_setting('test.direct_class')::UUID;e UUID:=current_setting('test.direct_ex')::UUID;b UUID:=current_setting('test.direct_book')::UUID;
 payload JSONB;r JSONB;denied BOOLEAN;
BEGIN
 payload:=jsonb_build_object('exhibition_id',e,'expected_revision',4,'confirmed',TRUE);
 denied:=FALSE;BEGIN PERFORM public.run_class_agit_action_v1(c,'delete',payload||'{"expected_revision":1}'::JSONB);EXCEPTION WHEN SQLSTATE 'PT409' THEN denied:=TRUE;END;
 IF NOT denied THEN RAISE EXCEPTION 'stale exhibition deletion accepted';END IF;
 denied:=FALSE;BEGIN PERFORM public.run_class_agit_action_v1(c,'delete',payload-'confirmed');EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE;END;
 IF NOT denied THEN RAISE EXCEPTION 'unconfirmed exhibition deletion accepted';END IF;
 denied:=FALSE;BEGIN PERFORM public.run_class_agit_action_v1(gen_random_uuid(),'delete',payload);EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE;END;
 IF NOT denied THEN RAISE EXCEPTION 'cross-class exhibition deletion accepted';END IF;
 r:=public.run_class_agit_action_v1(c,'delete',payload);
 IF r->'draft'<>'null'::JSONB OR jsonb_array_length(r->'projects')<>0 THEN RAISE EXCEPTION 'exhibition not removed';END IF;
 -- Deleting the exhibition must leave the independently created anthology readable.
 r:=public.get_class_agit_book_edition_v1(c,current_setting('test.design_edition')::UUID);
 IF jsonb_array_length(r->'book'->'works')<>1 THEN RAISE EXCEPTION 'exhibition deletion damaged anthology';END IF;
 payload:=jsonb_build_object('book_id',b,'expected_revision',current_setting('test.book_revision')::INTEGER,'confirmed',TRUE);
 denied:=FALSE;BEGIN PERFORM public.run_class_agit_book_action_v1(c,'delete',payload||'{"expected_revision":1}'::JSONB);EXCEPTION WHEN SQLSTATE 'PT409' THEN denied:=TRUE;END;
 IF NOT denied THEN RAISE EXCEPTION 'stale book deletion accepted';END IF;
 denied:=FALSE;BEGIN PERFORM public.run_class_agit_book_action_v1(c,'delete',payload-'confirmed');EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE;END;
 IF NOT denied THEN RAISE EXCEPTION 'unconfirmed book deletion accepted';END IF;
 denied:=FALSE;BEGIN PERFORM public.run_class_agit_book_action_v1(gen_random_uuid(),'delete',payload);EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE;END;
 IF NOT denied THEN RAISE EXCEPTION 'cross-class book deletion accepted';END IF;
 r:=public.run_class_agit_book_action_v1(c,'delete',payload);
 IF r->'book'<>'null'::JSONB OR jsonb_array_length(r->'books')<>0 THEN RAISE EXCEPTION 'book not removed';END IF;
 denied:=FALSE;BEGIN PERFORM public.get_class_agit_book_edition_v1(c,current_setting('test.design_edition')::UUID);EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE;END;
 IF NOT denied THEN RAISE EXCEPTION 'deleted edition still available';END IF;
END; $$;
RESET ROLE;
DO $$
DECLARE c UUID:=current_setting('test.direct_class')::UUID;
BEGIN
 IF EXISTS(SELECT 1 FROM public.class_agit_items WHERE class_id=c) OR EXISTS(SELECT 1 FROM public.class_agit_published_items WHERE class_id=c)
 OR EXISTS(SELECT 1 FROM public.class_agit_publication_catalog WHERE class_id=c) OR EXISTS(SELECT 1 FROM public.class_agit_publication_slots WHERE class_id=c)
 OR EXISTS(SELECT 1 FROM public.class_agit_external_shares WHERE class_id=c) OR EXISTS(SELECT 1 FROM public.class_agit_external_items WHERE class_id=c)
 OR EXISTS(SELECT 1 FROM public.class_agit_book_editions WHERE class_id=c) OR EXISTS(SELECT 1 FROM public.class_agit_book_items WHERE class_id=c)
 THEN RAISE EXCEPTION 'deletion left reachable copies';END IF;
 IF (SELECT count(*) FROM public.student_posts WHERE class_id=c)<>2 THEN RAISE EXCEPTION 'original posts changed by deletion';END IF;
END; $$;
SET LOCAL ROLE service_role;
DO $$ BEGIN
 IF public.read_public_class_agit_v1(repeat('d',64),0)->>'error'<>'unavailable' THEN RAISE EXCEPTION 'deleted share still available';END IF;
 RAISE NOTICE 'Designs/deletion: 12 print combinations, frozen class/external/edition settings, role/revision/confirmation checks, cascade cleanup and originals retained';
END; $$;
RESET ROLE;
