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
    INSERT INTO public.classes(id,teacher_id,name,enabled_modules) VALUES(c,t,'120편 합성 학급',ARRAY['__configured__','class-agit']);
    INSERT INTO public.students(id,class_id,name,student_code,auth_id) VALUES(s,c,'비공개 실명',left(s::TEXT,8)||'CAP',a);
    UPDATE public.class_agit_rollout SET mode='pilot',external_enabled=TRUE WHERE singleton;
    DELETE FROM public.class_agit_pilot_classes;
    INSERT INTO public.class_agit_pilot_classes(class_id) VALUES(c);
    FOR i IN 1..121 LOOP
        INSERT INTO public.writing_missions(class_id,teacher_id,title,guide,genre,mission_type,input_template,min_chars,min_paragraphs,base_reward,bonus_reward)
            VALUES(c,t,'용량 과제 '||i,'합성 안내','글쓰기','글쓰기','freeform',1,1,0,0) RETURNING id INTO m;
        -- 20,000자 × 120편: 종전 공개판 6.5MB 상한도 넘는 실제 긴 글로 검사한다.
        INSERT INTO public.student_posts(class_id,student_id,mission_id,title,content,is_submitted,is_confirmed)
            VALUES(c,s,m,'용량 작품 '||i,repeat('가나다라마바사🌱',2500),TRUE,TRUE) RETURNING id INTO p;
        posts:=posts||to_jsonb(p);
    END LOOP;
    PERFORM set_config('test.cap_teacher',t::TEXT,TRUE); PERFORM set_config('test.cap_auth',a::TEXT,TRUE);
    PERFORM set_config('test.cap_class',c::TEXT,TRUE); PERFORM set_config('test.cap_posts',posts::TEXT,TRUE);
    PERFORM set_config('test.cap_ex',gen_random_uuid()::TEXT,TRUE);
    PERFORM set_config('app.bypass_profile_protection','false',TRUE);
END; $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.cap_teacher'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.cap_teacher'),'role','authenticated')::TEXT,TRUE);
DO $$
DECLARE c UUID:=current_setting('test.cap_class')::UUID; e UUID:=current_setting('test.cap_ex')::UUID;
    source JSONB; p TEXT; items JSONB:='[]'; share_items JSONB; payload JSONB; result JSONB; denied BOOLEAN;
BEGIN
    PERFORM public.run_class_agit_action_v1(c,'create',jsonb_build_object('exhibition_id',e));
    FOR p IN SELECT jsonb_array_elements_text(current_setting('test.cap_posts')::JSONB) LOOP
        source:=public.get_class_agit_source_v1(c,p::UUID)->'source';
        items:=items||jsonb_build_array(jsonb_build_object('sourceId',p,'sourceRevision',source->>'source_revision',
            'publicAlias',repeat('별',30),'classAcknowledged',TRUE));
    END LOOP;
    payload:=jsonb_build_object('exhibition_id',e,'expected_revision',1,'title','120편 전시','introduction','열 개의 전시실','items',items);
    denied:=FALSE;
    BEGIN PERFORM public.run_class_agit_action_v1(c,'save',payload); EXCEPTION WHEN check_violation THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION '121 works accepted'; END IF;
    payload:=jsonb_set(payload,'{items}',items-120);
    IF octet_length(payload::TEXT)<=30000 THEN RAISE EXCEPTION 'save payload did not cover old byte limit'; END IF;
    result:=public.run_class_agit_action_v1(c,'save',payload);
    IF jsonb_array_length(result->'draft'->'items')<>120 THEN RAISE EXCEPTION 'saved draft truncated'; END IF;
    PERFORM public.run_class_agit_action_v1(c,'publish',jsonb_build_object('exhibition_id',e,'expected_revision',2,'confirmed',TRUE));
    result:=public.get_class_agit_publication_v1(c,e,10);
    IF (result->>'total_count')::INTEGER<>120 OR jsonb_array_length(result->'exhibition'->'works')<>12
        THEN RAISE EXCEPTION 'teacher room 10 truncated'; END IF;
    result:=public.get_class_agit_share_workspace_v1(c,e);
    IF jsonb_array_length(result->'candidates')<>120 THEN RAISE EXCEPTION 'share candidates truncated'; END IF;
    SELECT jsonb_agg(jsonb_build_object('itemId',x->>'itemId','sourceRevision',x->>'sourceRevision',
        'publicAlias',repeat('별',30),'externalConfirmed',TRUE)) INTO share_items FROM jsonb_array_elements(result->'candidates') x;
    payload:=jsonb_build_object('token',repeat('d',64),'days',1,'starts_at',now(),'expires_at',now()+INTERVAL '1 day','confirmed',TRUE,'expected_revision',0,'exhibition_revision',3,
        'title','120편 외부 전시','items',share_items);
    IF octet_length(payload::TEXT)<=30000 THEN RAISE EXCEPTION 'share payload did not cover old byte limit'; END IF;
    denied:=FALSE;
    BEGIN PERFORM public.run_class_agit_share_action_v1(c,e,'publish',jsonb_set(payload,'{items}',share_items||jsonb_build_array(share_items->0)));
        EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION '121 external works accepted'; END IF;
    result:=public.run_class_agit_share_action_v1(c,e,'publish',payload);
    IF jsonb_array_length(result->'published_items')<>120 THEN RAISE EXCEPTION 'external publish truncated'; END IF;
END; $$;
RESET ROLE;

DO $$
DECLARE denied BOOLEAN:=FALSE; e UUID:=current_setting('test.cap_ex')::UUID; bytes INTEGER;
BEGIN
    SELECT octet_length(published_snapshot::TEXT) INTO bytes FROM public.class_agit_exhibitions WHERE id=e;
    IF bytes<=6500000 THEN RAISE EXCEPTION 'long-work snapshot did not cover old byte limit'; END IF;
    RAISE NOTICE '120-work published snapshot: % bytes',bytes;
    BEGIN UPDATE public.class_agit_items SET position=121 WHERE exhibition_id=e AND position=120;
        EXCEPTION WHEN check_violation THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'internal table accepted position 121'; END IF;
    denied:=FALSE;
    BEGIN UPDATE public.class_agit_external_items SET position=121 WHERE share_id=e AND position=120;
        EXCEPTION WHEN check_violation THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'external table accepted position 121'; END IF;
END; $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.cap_auth'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.cap_auth'),'role','authenticated')::TEXT,TRUE);
DO $$
DECLARE e UUID:=current_setting('test.cap_ex')::UUID; result JSONB; invalid TEXT; denied BOOLEAN; started TIMESTAMPTZ:=clock_timestamp();
BEGIN
    result:=public.get_my_class_agit_room_v1(e,10);
    IF (result->>'total_count')::INTEGER<>120 OR jsonb_array_length(result->'rooms')<>10
        OR jsonb_array_length(result->'items')<>12 OR result->'items'->11->>'id'<>'published-120'
        OR octet_length(result::TEXT)>12000 OR result::TEXT ~ 'blocks|sourceId|studentId'
        THEN RAISE EXCEPTION 'student 120-work summary budget or privacy failed'; END IF;
    RAISE NOTICE 'Student room 10: % ms, % bytes',extract(epoch FROM clock_timestamp()-started)*1000,octet_length(result::TEXT);
    result:=public.get_my_class_agit_work_v1(e,1,'published-61');
    IF result->>'previous_id'<>'published-60' OR result->>'next_id'<>'published-62' THEN RAISE EXCEPTION 'old boundary navigation failed'; END IF;
    result:=public.get_my_class_agit_work_v1(e,1,'published-120');
    IF result->>'previous_id'<>'published-119' OR result->>'next_id' IS NOT NULL
        OR char_length(result->'work'->'blocks'->>0)<>20000 THEN RAISE EXCEPTION 'last work incomplete'; END IF;
    FOREACH invalid IN ARRAY ARRAY['published-0','published-01','published-121','published-999','published-1000',repeat('9',1000)] LOOP
        denied:=FALSE;
        BEGIN PERFORM public.get_my_class_agit_work_v1(e,1,invalid); EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE; END;
        IF NOT denied THEN RAISE EXCEPTION 'invalid student work id accepted'; END IF;
    END LOOP;
    denied:=FALSE;
    BEGIN PERFORM public.get_my_class_agit_room_v1(e,11); EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'room 11 accepted'; END IF;
    denied:=FALSE;
    BEGIN PERFORM public.get_my_class_agit_room_v1(gen_random_uuid(),10); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'other exhibition accepted'; END IF;
END; $$;
RESET ROLE;

SELECT set_config('role',CASE WHEN to_regclass('public.class_agit_publication_catalog') IS NULL THEN 'anon' ELSE 'service_role' END,TRUE);
DO $$
DECLARE result JSONB; started TIMESTAMPTZ:=clock_timestamp();
BEGIN
    result:=public.read_public_class_agit_v1(repeat('d',64),10);
    IF (result->>'total_count')::INTEGER<>120 OR jsonb_array_length(result->'rooms')<>10
        OR jsonb_array_length(result->'items')<>12 OR result->'items'->11->>'id'<>'published-120'
        OR result::TEXT ~ 'blocks|sourceId|studentId|비공개 실명' THEN RAISE EXCEPTION 'external 120-work summary failed'; END IF;
    RAISE NOTICE 'Public room 10: % ms, % bytes',extract(epoch FROM clock_timestamp()-started)*1000,octet_length(result::TEXT);
    result:=public.read_public_class_agit_v1(repeat('d',64),10,'published-120',1);
    IF char_length(result->'work'->'blocks'->>0)<>20000 THEN RAISE EXCEPTION 'external last work incomplete'; END IF;
    IF public.read_public_class_agit_v1(repeat('d',64),11)->>'error'<>'unavailable'
        OR public.read_public_class_agit_v1(repeat('d',64),10,'published-121',1)->>'error'<>'unavailable'
        THEN RAISE EXCEPTION 'invalid external request accepted'; END IF;
END; $$;
RESET ROLE;

-- 철회 검증 뒤 원상복구해 격리 HTTP 검사에서도 120편을 그대로 사용한다.
SAVEPOINT capacity_withdrawal;
UPDATE public.student_posts SET is_submitted=FALSE,is_confirmed=FALSE WHERE id=(current_setting('test.cap_posts')::JSONB->>119)::UUID;
SET LOCAL ROLE authenticated;
DO $$
DECLARE e UUID:=current_setting('test.cap_ex')::UUID; denied BOOLEAN:=FALSE;
BEGIN
    IF public.get_my_class_agit_room_v1(e,10)->>'total_count'<>'119' THEN RAISE EXCEPTION 'withdrawn student work visible'; END IF;
    BEGIN PERFORM public.get_my_class_agit_work_v1(e,1,'published-120'); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'withdrawn student last work readable'; END IF;
END; $$;
RESET ROLE;
SELECT set_config('role',CASE WHEN to_regclass('public.class_agit_publication_catalog') IS NULL THEN 'anon' ELSE 'service_role' END,TRUE);
DO $$
BEGIN
    IF public.read_public_class_agit_v1(repeat('d',64),10)->>'total_count'<>'119'
        OR public.read_public_class_agit_v1(repeat('d',64),10,'published-120',1)->>'error'<>'unavailable'
        THEN RAISE EXCEPTION 'withdrawn external last work readable'; END IF;
END; $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT capacity_withdrawal;
RELEASE SAVEPOINT capacity_withdrawal;
