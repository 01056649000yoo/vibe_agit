-- Synthetic data only; the runner wraps this file in a rollback transaction.
DO $$
DECLARE t UUID:=gen_random_uuid(); outsider UUID:=gen_random_uuid(); a UUID:=gen_random_uuid(); c UUID:=gen_random_uuid(); other_class UUID:=gen_random_uuid();
    s UUID; m UUID; p UUID; students UUID[]:='{}'; posts UUID[]:='{}'; missions UUID[]:='{}';
BEGIN
    PERFORM set_config('app.bypass_profile_protection','true',TRUE);
    INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) SELECT x,'selection-'||x||'@example.invalid','{}','{}' FROM unnest(ARRAY[t,outsider,a]) x;
    INSERT INTO public.profiles(id,role,is_approved) VALUES(t,'TEACHER',TRUE),(outsider,'TEACHER',TRUE),(a,'STUDENT',TRUE)
        ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,is_approved=TRUE;
    INSERT INTO public.teachers(id,name,school_name) VALUES(t,'합성 교사','시험 학교'),(outsider,'다른 합성 교사','시험 학교');
    INSERT INTO public.classes(id,teacher_id,name,enabled_modules) VALUES(c,t,'작품 탐색 합성 학급',ARRAY['__configured__','class-agit']),
        (other_class,outsider,'다른 탐색 합성 학급',ARRAY['__configured__','class-agit']);
    UPDATE public.class_agit_rollout SET mode='pilot' WHERE singleton;
    DELETE FROM public.class_agit_pilot_classes;
    INSERT INTO public.class_agit_pilot_classes(class_id) VALUES(c),(other_class);
    FOR n IN 1..16 LOOP
        s:=gen_random_uuid();students:=array_append(students,s);
        INSERT INTO public.students(id,class_id,name,student_code,auth_id) VALUES(s,c,'학생 '||lpad(n::TEXT,2,'0'),left(s::TEXT,8)||'SEL',CASE WHEN n=1 THEN a END);
    END LOOP;
    FOR n IN 1..66 LOOP
        INSERT INTO public.writing_missions(class_id,teacher_id,title,guide,genre,mission_type,input_template,is_archived,created_at,min_chars,min_paragraphs,base_reward,bonus_reward)
            VALUES(c,t,'탐색 미션 '||lpad(n::TEXT,2,'0'),'합성 안내','글쓰기','글쓰기',CASE WHEN n=65 THEN 'report' ELSE 'freeform' END,n>50,
                now()-n*INTERVAL '1 day',1,1,0,0) RETURNING id INTO m;
        missions:=array_append(missions,m);
        IF n<66 THEN FOR k IN 1..16 LOOP
            INSERT INTO public.student_posts(class_id,student_id,mission_id,title,content,is_submitted,is_confirmed,updated_at,structured_content)
                VALUES(c,students[k],m,'탐색 작품 '||lpad(n::TEXT,2,'0')||'-'||lpad(k::TEXT,2,'0'),repeat('긴 본문 ',2000),TRUE,TRUE,now()-n*INTERVAL '1 day',CASE WHEN n=65 THEN '{"template":"report","version":1,"sections":[{"id":"a","heading":"관찰","body":"관찰한 내용"},{"id":"b","heading":"결과","body":"알게 된 내용"}]}'::JSONB END) RETURNING id INTO p;
            posts:=array_append(posts,p);
        END LOOP; END IF;
    END LOOP;
    PERFORM set_config('test.sel_teacher',t::TEXT,TRUE);PERFORM set_config('test.sel_outsider',outsider::TEXT,TRUE);PERFORM set_config('test.sel_student',a::TEXT,TRUE);
    PERFORM set_config('test.sel_class',c::TEXT,TRUE);PERFORM set_config('test.sel_other',other_class::TEXT,TRUE);
    PERFORM set_config('test.sel_posts',array_to_json(posts)::TEXT,TRUE);PERFORM set_config('test.sel_missions',array_to_json(missions)::TEXT,TRUE);
    PERFORM set_config('test.sel_students',array_to_json(students)::TEXT,TRUE);
    PERFORM set_config('app.bypass_profile_protection','false',TRUE);
END; $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.sel_teacher'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.sel_teacher'),'role','authenticated')::TEXT,TRUE);
DO $$
DECLARE c UUID:=current_setting('test.sel_class')::UUID; ms JSONB:=current_setting('test.sel_missions')::JSONB; ps JSONB:=current_setting('test.sel_posts')::JSONB;
    r JSONB; next JSONB; first JSONB; seen UUID[]:='{}'; ids UUID[]; denied BOOLEAN; started TIMESTAMPTZ:=clock_timestamp(); e UUID:=gen_random_uuid();
BEGIN
    r:=public.get_class_agit_missions_v1(c);
    IF jsonb_array_length(r->'items')<>50 OR (r->>'has_more')::BOOLEAN IS NOT TRUE THEN RAISE EXCEPTION 'mission first page limit'; END IF;
    IF (r->'items'->0->>'review_count')::INTEGER<>16 THEN RAISE EXCEPTION 'review count mismatch'; END IF;
    r:=public.get_class_agit_missions_v1(c,'','all',r->'next_cursor');
    IF jsonb_array_length(r->'items')<>16 OR (r->>'has_more')::BOOLEAN THEN RAISE EXCEPTION 'mission tail page'; END IF;
    IF r->'items'->14->'supported'<>'false'::JSONB OR r->'items'->15->>'review_count'<>'0' THEN RAISE EXCEPTION 'unsupported or empty mission hidden'; END IF;
    r:=public.get_class_agit_missions_v1(c,'미션 66','archived');
    IF jsonb_array_length(r->'items')<>1 THEN RAISE EXCEPTION 'archived old mission search'; END IF;
    r:=public.get_class_agit_missions_v1(c,'','active',NULL,999);
    IF jsonb_array_length(r->'items')<>50 THEN RAISE EXCEPTION 'active scope'; END IF;
    r:=public.get_class_agit_candidates_v2(c,jsonb_build_object('mission_id',ms->>60,'sort','student'));
    IF jsonb_array_length(r->'items')<>16 OR r->'items'->0->>'student_name'<>'학생 01' THEN RAISE EXCEPTION 'mission student order'; END IF;
    IF r::TEXT LIKE '%source_revision%' OR r::TEXT LIKE '%blocks%' OR octet_length(r::TEXT)>15000 THEN RAISE EXCEPTION 'list contains full bodies'; END IF;
    r:=public.get_class_agit_candidates_v2(c,jsonb_build_object('query','탐색 작품 61-01'));
    IF jsonb_array_length(r->'items')<>1 THEN RAISE EXCEPTION 'global search omitted old work'; END IF;
    r:=public.get_class_agit_candidates_v2(c,jsonb_build_object('mission_id',ms->>0,'excluded_students',jsonb_build_array(current_setting('test.sel_students')::JSONB->>0)));
    IF jsonb_array_length(r->'items')<>15 THEN RAISE EXCEPTION 'unrepresented student filter'; END IF;
    -- Same timestamps and repeated student names across missions must not skip/duplicate cursor rows.
    FOREACH denied IN ARRAY ARRAY[FALSE,TRUE] LOOP
        next:=NULL;seen:='{}';
        LOOP
            r:=public.get_class_agit_candidates_v2(c,jsonb_build_object('sort',CASE WHEN denied THEN 'student' ELSE 'recent' END,'limit',50,'cursor',next));
            SELECT array_agg((x->>'id')::UUID) INTO ids FROM jsonb_array_elements(r->'items') x;
            IF seen&&ids THEN RAISE EXCEPTION 'duplicate candidate cursor row'; END IF;
            seen:=seen||ids;
            EXIT WHEN (r->>'has_more')::BOOLEAN IS NOT TRUE;next:=r->'next_cursor';
        END LOOP;
        IF cardinality(seen)<>1024 THEN RAISE EXCEPTION 'cursor omitted works: %',cardinality(seen); END IF;
    END LOOP;
    SELECT array_agg(x::UUID) INTO ids FROM jsonb_array_elements_text(ps) WITH ORDINALITY p(x,n) WHERE n<=50;
    r:=public.get_class_agit_sources_v1(c,ids);
    IF jsonb_array_length(r->'items')<>50 OR r->'items'->0->'source'->>'mission_id'<>ms->>0 THEN RAISE EXCEPTION 'bulk source order/mission'; END IF;
    first:=r->'items'->0->'source';
    r:=public.get_class_agit_sources_v1(c,ARRAY[ids[2],gen_random_uuid(),ids[1]]);
    IF r->'items'->0->>'id'<>ids[2]::TEXT OR r->'items'->1->'source'<>'null'::JSONB OR r->'items'->2->>'id'<>ids[1]::TEXT THEN RAISE EXCEPTION 'mixed review results/order'; END IF;
    denied:=FALSE; BEGIN PERFORM public.get_class_agit_sources_v1(c,ids||gen_random_uuid()); EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION '51-source batch accepted'; END IF;
    denied:=FALSE; BEGIN PERFORM public.get_class_agit_sources_v1(c,ARRAY[ids[1],ids[1]]); EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'duplicate bulk IDs accepted'; END IF;
    denied:=FALSE; BEGIN PERFORM public.get_class_agit_candidates_v2(c,jsonb_build_object('cursor',jsonb_build_object('id',ids[1]))); EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'malformed cursor accepted'; END IF;
    PERFORM public.run_class_agit_action_v1(c,'create',jsonb_build_object('exhibition_id',e));
    r:=public.run_class_agit_action_v1(c,'save',jsonb_build_object('exhibition_id',e,'expected_revision',1,'title','탐색 결과 전시','introduction','',
        'items',jsonb_build_array(jsonb_build_object('sourceId',first->>'id','sourceRevision',first->>'source_revision','publicAlias','작가','classAcknowledged',TRUE))));
    IF r->'draft'->'items'->0->>'missionId'<>ms->>0 THEN RAISE EXCEPTION 'saved mission provenance lost'; END IF;
    denied:=FALSE; BEGIN PERFORM public.get_class_agit_missions_v1(current_setting('test.sel_other')::UUID); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'cross-class mission catalog leaked'; END IF;
    RAISE NOTICE 'Selection smoke: 66 missions, 1040 long posts, both full cursor walks and bulk validation in % ms',round(extract(epoch FROM clock_timestamp()-started)*1000);
END; $$;
RESET ROLE;
-- Mutations after browsing must be rejected on bulk validation, without disclosing another class.
DO $$
DECLARE c UUID:=current_setting('test.sel_class')::UUID;p UUID:=(current_setting('test.sel_posts')::JSONB->>0)::UUID;
BEGIN
    UPDATE public.student_posts SET is_submitted=FALSE,is_confirmed=FALSE WHERE class_id=c AND id=p;
    IF public.class_agit_current_source_v1(c,p) IS NOT NULL THEN RAISE EXCEPTION 'recalled source remains available'; END IF;
    IF to_regprocedure('public.get_class_agit_candidates_v1(uuid,text,timestamp with time zone,uuid,integer)') IS NOT NULL THEN RAISE EXCEPTION 'old candidate RPC remains'; END IF;
    IF has_function_privilege('anon','public.get_class_agit_sources_v1(uuid,uuid[])','EXECUTE') OR has_function_privilege('service_role','public.get_class_agit_missions_v1(uuid,text,text,jsonb,integer)','EXECUTE')
        OR has_function_privilege('authenticated','public.class_agit_mission_format_v1(text,text)','EXECUTE') THEN RAISE EXCEPTION 'selection grants too broad'; END IF;
END; $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.sel_student'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.sel_student'),'role','authenticated')::TEXT,TRUE);
DO $$ DECLARE denied BOOLEAN:=FALSE;c UUID:=current_setting('test.sel_class')::UUID; BEGIN
    BEGIN PERFORM public.get_class_agit_missions_v1(c); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'student catalog access'; END IF;
    denied:=FALSE; BEGIN PERFORM public.get_class_agit_candidates_v2(c); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'student candidate access'; END IF;
    denied:=FALSE; BEGIN PERFORM public.get_class_agit_sources_v1(c,ARRAY[(current_setting('test.sel_posts')::JSONB->>0)::UUID]); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'student bulk access'; END IF;
END; $$;
RESET ROLE;
