-- 합성 계정·학급·글만 사용한다. migrate:check/run-rollback-smoke가 전체를 ROLLBACK한다.
DO $$
DECLARE v_id UUID; v_admin UUID:=gen_random_uuid(); v_other UUID:=gen_random_uuid(); v_teacher UUID:=gen_random_uuid();
    v_auth UUID:=gen_random_uuid(); v_other_auth UUID:=gen_random_uuid(); v_class UUID:=gen_random_uuid(); v_other_class UUID:=gen_random_uuid();
    v_student UUID:=gen_random_uuid(); v_other_student UUID:=gen_random_uuid(); v_mission UUID; v_post UUID; v_table TEXT;
BEGIN
    -- 운영 단계가 pilot/disabled여도 합성 시나리오는 같은 internal/OFF 상태에서 시작한다.
    -- 실행기의 단일 ROLLBACK 트랜잭션 안에서만 바꾸므로 실제 시범 학급·공개 설정은 복원된다.
    UPDATE public.class_agit_rollout SET mode='internal',external_enabled=FALSE,revision=1 WHERE singleton;
    DELETE FROM public.class_agit_pilot_classes;
    -- 가입 RPC가 쓰는 설정을 합성 계정 준비에만 사용하고 역할 검증 전 즉시 해제한다.
    PERFORM set_config('app.bypass_profile_protection','true',TRUE);
    FOREACH v_table IN ARRAY ARRAY['class_agit_rollout','class_agit_exhibitions','class_agit_items','class_agit_consent_events'] LOOP
        IF NOT EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=v_table AND rowsecurity)
            OR has_table_privilege('authenticated',format('public.%I',v_table),'SELECT,INSERT,UPDATE,DELETE')
            OR has_table_privilege('anon',format('public.%I',v_table),'SELECT')
            OR has_table_privilege('service_role',format('public.%I',v_table),'SELECT,INSERT,UPDATE,DELETE')
        THEN RAISE EXCEPTION 'class agit table boundary failed: %',v_table; END IF;
    END LOOP;
    IF has_function_privilege('authenticated','public.assert_class_agit_manager_v1(uuid)','EXECUTE')
       OR has_function_privilege('authenticated','public.class_agit_current_source_v1(uuid,uuid)','EXECUTE')
       OR has_function_privilege('anon','public.get_class_agit_publication_v1(uuid,uuid,integer)','EXECUTE')
       OR has_function_privilege('service_role','public.run_class_agit_action_v1(uuid,text,jsonb)','EXECUTE')
       OR has_function_privilege('authenticated','public.class_agit_visible_works_v1(uuid,uuid)','EXECUTE')
       OR has_function_privilege('anon','public.get_my_class_agit_exhibitions_v1()','EXECUTE')
       OR has_function_privilege('anon','public.get_my_class_agit_room_v1(uuid,integer)','EXECUTE')
       OR has_function_privilege('service_role','public.get_my_class_agit_work_v1(uuid,integer,text)','EXECUTE')
    THEN RAISE EXCEPTION 'class agit function grants failed'; END IF;
    FOREACH v_id IN ARRAY ARRAY[v_admin,v_other,v_teacher,v_auth,v_other_auth] LOOP
        INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data)
        VALUES(v_id,'class-agit-smoke-'||v_id||'@example.invalid','{}','{}');
        INSERT INTO public.profiles(id,role,is_approved) VALUES(v_id,'TEACHER',TRUE)
        ON CONFLICT(id) DO UPDATE SET role='TEACHER',is_approved=TRUE;
    END LOOP;
    UPDATE public.profiles SET role='ADMIN' WHERE id IN(v_admin,v_other);
    INSERT INTO public.teachers(id,name,school_name) VALUES(v_admin,'합성 관리자','시험 학교'),(v_other,'다른 합성 관리자','시험 학교');
    UPDATE public.profiles SET role='STUDENT' WHERE id IN(v_auth,v_other_auth);
    INSERT INTO public.classes(id,teacher_id,name,enabled_modules) VALUES(v_class,v_admin,'C1 합성 학급',ARRAY[]::TEXT[]),(v_other_class,v_other,'C1 다른 합성 학급',ARRAY[]::TEXT[]);
    INSERT INTO public.students(id,class_id,name,student_code,auth_id) VALUES(v_student,v_class,'합성 작가',left(v_student::TEXT,8)||'C1',v_auth),(v_other_student,v_other_class,'다른 합성 작가',left(v_other_student::TEXT,8)||'C1',v_other_auth);
    FOR i IN 1..17 LOOP
        INSERT INTO public.writing_missions(class_id,teacher_id,title,guide,genre,mission_type,input_template,min_chars,min_paragraphs,base_reward,bonus_reward)
        VALUES(v_class,v_admin,'C1 과제 '||i,'합성 안내','글쓰기',CASE WHEN i=2 THEN 'poem' WHEN i=16 THEN 'report' ELSE '글쓰기' END,
            CASE WHEN i=2 THEN 'poem' WHEN i=16 THEN 'report' ELSE 'freeform' END,1,1,0,0) RETURNING id INTO v_mission;
        INSERT INTO public.student_posts(class_id,student_id,mission_id,title,content,is_submitted,is_confirmed,structured_content)
        VALUES(v_class,v_student,v_mission,'C1 작품 '||i,'첫 문단'||E'\n\n'||'둘째 문단',i<>15,i NOT IN(14,15),
            CASE WHEN i=2 THEN '{"template":"poem","version":1,"stanzas":["첫 연\n둘째 행","다음 연"]}'::JSONB
                 WHEN i=16 THEN '{"template":"report","version":1,"sections":[{"id":"a","heading":"관찰","body":"관찰한 내용"},{"id":"b","heading":"결과","body":"알게 된 내용"}]}'::JSONB
                 WHEN i=17 THEN '{"template":"unknown","images":["private-path"]}'::JSONB ELSE NULL END) RETURNING id INTO v_post;
        IF i=1 THEN PERFORM set_config('test.ca_post',v_post::TEXT,TRUE); END IF;
        IF i=2 THEN PERFORM set_config('test.ca_poem',v_post::TEXT,TRUE); END IF;
    END LOOP;
    INSERT INTO public.writing_missions(class_id,teacher_id,title,guide,genre,mission_type,input_template,min_chars,min_paragraphs,base_reward,bonus_reward)
    VALUES(v_other_class,v_other,'다른 학급 과제','안내','글쓰기','글쓰기','freeform',1,1,0,0) RETURNING id INTO v_mission;
    INSERT INTO public.student_posts(class_id,student_id,mission_id,title,content,is_submitted,is_confirmed)
    VALUES(v_other_class,v_other_student,v_mission,'다른 학급 글','읽으면 안 되는 글',TRUE,TRUE) RETURNING id INTO v_post;
    PERFORM set_config('test.ca_other_post',v_post::TEXT,TRUE);
    PERFORM set_config('test.ca_admin',v_admin::TEXT,TRUE); PERFORM set_config('test.ca_other',v_other::TEXT,TRUE);
    PERFORM set_config('test.ca_teacher',v_teacher::TEXT,TRUE); PERFORM set_config('test.ca_auth',v_auth::TEXT,TRUE);
    PERFORM set_config('test.ca_other_auth',v_other_auth::TEXT,TRUE); PERFORM set_config('test.ca_class',v_class::TEXT,TRUE);
    PERFORM set_config('test.ca_other_class',v_other_class::TEXT,TRUE); PERFORM set_config('test.ca_student',v_student::TEXT,TRUE);
    PERFORM set_config('test.ca_ex',gen_random_uuid()::TEXT,TRUE);
    PERFORM set_config('app.bypass_profile_protection','false',TRUE);
END; $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.ca_admin'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.ca_admin'),'role','authenticated')::TEXT,TRUE);
DO $$
DECLARE v_class UUID:=current_setting('test.ca_class')::UUID; v_ex UUID:=current_setting('test.ca_ex')::UUID;
    v_result JSONB; v_page JSONB; v_next JSONB; v_source JSONB; v_items JSONB:='[]'; v_payload JSONB; v_denied BOOLEAN;
BEGIN
    v_result:=public.get_class_agit_workspace_v1(v_class);
    IF v_result->'class'->>'module_enabled'<>'false' THEN RAISE EXCEPTION 'must start OFF'; END IF;
    v_denied:=FALSE; BEGIN
        PERFORM public.run_class_agit_action_v1(v_class,'set_enabled','{"enabled":true,"expected_enabled":false}');
        EXCEPTION WHEN invalid_parameter_value THEN v_denied:=TRUE; END;
    IF NOT v_denied THEN RAISE EXCEPTION 'unconfigured class lost default menus'; END IF;
    v_denied:=FALSE; BEGIN PERFORM public.get_class_agit_workspace_v1(current_setting('test.ca_other_class')::UUID); EXCEPTION WHEN insufficient_privilege THEN v_denied:=TRUE; END;
    IF NOT v_denied THEN RAISE EXCEPTION 'another admin class visible'; END IF;
    v_denied:=FALSE; BEGIN PERFORM public.get_class_agit_source_v1(v_class,current_setting('test.ca_other_post')::UUID); EXCEPTION WHEN insufficient_privilege THEN v_denied:=TRUE; END;
    IF NOT v_denied THEN RAISE EXCEPTION 'another class source visible'; END IF;
    v_page:=public.get_class_agit_candidates_v1(v_class,'',NULL,NULL,1000);
    IF jsonb_array_length(v_page->'items')<>13 OR (v_page->'items'->0 ? 'content') THEN RAISE EXCEPTION 'candidate eligibility/summary failed'; END IF;
    IF jsonb_array_length(public.get_class_agit_candidates_v1(v_class,'%')->'items')<>0 THEN RAISE EXCEPTION 'search interpreted wildcard'; END IF;
    v_page:=public.get_class_agit_candidates_v1(v_class,'',NULL,NULL,5);
    v_next:=public.get_class_agit_candidates_v1(v_class,'',(v_page->'next_cursor'->>'updated_at')::TIMESTAMPTZ,(v_page->'next_cursor'->>'id')::UUID,5);
    IF jsonb_array_length(v_page->'items')<>5 OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_page->'items') a JOIN jsonb_array_elements(v_next->'items') b ON a->>'id'=b->>'id') THEN RAISE EXCEPTION 'cursor page overlaps'; END IF;
    v_source:=public.get_class_agit_source_v1(v_class,current_setting('test.ca_poem')::UUID)->'source';
    IF v_source->'blocks'<>'["첫 연\n둘째 행","다음 연"]'::JSONB THEN RAISE EXCEPTION 'poem layout lost'; END IF;
    v_result:=public.run_class_agit_action_v1(v_class,'create',jsonb_build_object('exhibition_id',v_ex));
    v_result:=public.run_class_agit_action_v1(v_class,'create',jsonb_build_object('exhibition_id',v_ex));
    IF jsonb_array_length(v_result->'projects')<>1 THEN RAISE EXCEPTION 'retry created duplicate exhibition'; END IF;
    FOR v_page IN SELECT value FROM jsonb_array_elements(public.get_class_agit_candidates_v1(v_class,'',NULL,NULL,50)->'items') LOOP
        v_source:=public.get_class_agit_source_v1(v_class,(v_page->>'id')::UUID)->'source';
        v_items:=v_items||jsonb_build_array(jsonb_build_object('sourceId',v_source->>'id','sourceRevision',v_source->>'source_revision','publicAlias','새싹 작가','classAcknowledged',TRUE,'title','위조 제목','blocks',jsonb_build_array('위조 본문')));
    END LOOP;
    v_payload:=jsonb_build_object('exhibition_id',v_ex,'expected_revision',1,'title','C1 전시','introduction','확인한 글','items',v_items);
    v_denied:=FALSE; BEGIN PERFORM public.run_class_agit_action_v1(v_class,'save',jsonb_set(v_payload,'{items}',v_items||jsonb_build_array(v_items->0))); EXCEPTION WHEN check_violation THEN v_denied:=TRUE; END;
    IF NOT v_denied THEN RAISE EXCEPTION 'duplicate work accepted'; END IF;
    v_denied:=FALSE; BEGIN PERFORM public.run_class_agit_action_v1(v_class,'save',jsonb_set(v_payload,'{items}',(SELECT jsonb_agg(jsonb_build_object('sourceId',gen_random_uuid())) FROM generate_series(1,61)))); EXCEPTION WHEN check_violation THEN v_denied:=TRUE; END;
    IF NOT v_denied THEN RAISE EXCEPTION '61 works accepted'; END IF;
    v_denied:=FALSE; BEGIN PERFORM public.run_class_agit_action_v1(v_class,'save',jsonb_set(v_payload,'{items,0,sourceId}',to_jsonb(current_setting('test.ca_other_post')))); EXCEPTION WHEN insufficient_privilege THEN v_denied:=TRUE; END;
    IF NOT v_denied THEN RAISE EXCEPTION 'cross-class source save accepted'; END IF;
    v_denied:=FALSE; BEGIN PERFORM public.run_class_agit_action_v1(v_class,'save',jsonb_set(v_payload,'{items,0,classAcknowledged}','false')); EXCEPTION WHEN invalid_parameter_value THEN v_denied:=TRUE; END;
    IF NOT v_denied THEN RAISE EXCEPTION 'missing consent accepted'; END IF;
    v_result:=public.run_class_agit_action_v1(v_class,'save',v_payload);
    IF v_result::TEXT LIKE '%위조%' OR jsonb_array_length(v_result->'draft'->'items')<>13 THEN RAISE EXCEPTION 'server trusted client content'; END IF;
    v_denied:=FALSE; BEGIN PERFORM public.run_class_agit_action_v1(v_class,'save',v_payload); EXCEPTION WHEN SQLSTATE 'PT409' THEN v_denied:=TRUE; END;
    IF NOT v_denied THEN RAISE EXCEPTION 'stale draft overwrote current'; END IF;
    v_denied:=FALSE; BEGIN PERFORM public.run_class_agit_action_v1(v_class,'publish',jsonb_build_object('exhibition_id',v_ex,'expected_revision',2,'confirmed',TRUE)); EXCEPTION WHEN insufficient_privilege THEN v_denied:=TRUE; END;
    IF NOT v_denied THEN RAISE EXCEPTION 'OFF publication accepted'; END IF;
    PERFORM public.run_class_agit_action_v1(v_class,'set_enabled',jsonb_build_object('enabled',TRUE,'expected_enabled',FALSE,
        'initial_modules',jsonb_build_array('__configured__','student-writing','friends-hideout'),'initial_vocab_tower_enabled',v_result->'class'->'vocab_tower_enabled'));
    v_result:=public.run_class_agit_action_v1(v_class,'set_enabled','{"enabled":true,"expected_enabled":true,"initial_modules":["__configured__"]}');
    IF NOT (v_result->'class'->'enabled_modules' ?& ARRAY['__configured__','class-agit','student-writing','friends-hideout'])
        THEN RAISE EXCEPTION 'class agit toggle overwrote existing menus'; END IF;
    v_result:=public.run_class_agit_action_v1(v_class,'publish',jsonb_build_object('exhibition_id',v_ex,'expected_revision',2,'confirmed',TRUE));
    v_page:=public.get_class_agit_publication_v1(v_class,v_ex,1); v_next:=public.get_class_agit_publication_v1(v_class,v_ex,2);
    IF jsonb_array_length(v_page->'exhibition'->'works')<>12 OR jsonb_array_length(v_next->'exhibition'->'works')<>1
        OR v_page::TEXT ~ 'itemId|sourceId|studentId|consentId|confirmed_by|source_revision' THEN RAISE EXCEPTION 'published DTO or 12 row cap failed'; END IF;
    -- 초안에서 한 편을 빼고 제목을 바꿔도 이미 공개한 판은 그대로다.
    v_payload:=jsonb_set(jsonb_set(v_payload,'{expected_revision}','3'),'{title}','"편집 중 제목"');
    v_payload:=jsonb_set(v_payload,'{items}',v_items-12);
    v_result:=public.run_class_agit_action_v1(v_class,'save',v_payload);
    v_page:=public.get_class_agit_publication_v1(v_class,v_ex,1);
    IF v_page->'exhibition'->>'title'<>'C1 전시' OR (v_page->>'total_count')::INTEGER<>13 THEN RAISE EXCEPTION 'draft edit changed published edition'; END IF;
    -- 13편으로 복구해 이후 회수·갱신을 검사한다.
    v_payload:=jsonb_set(jsonb_set(v_payload,'{expected_revision}','4'),'{items}',v_items);
    PERFORM public.run_class_agit_action_v1(v_class,'save',v_payload);
    PERFORM set_config('test.ca_payload',v_payload::TEXT,TRUE);
END; $$;
RESET ROLE;

-- 같은 학급 학생 열람, 다른 학생/위조 관리자 쓰기·열람 차단.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.ca_auth'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.ca_auth'),'role','authenticated','app_metadata',jsonb_build_object('role','ADMIN'))::TEXT,TRUE);
DO $$
DECLARE denied BOOLEAN:=FALSE;
BEGIN
    PERFORM public.get_class_agit_publication_v1(current_setting('test.ca_class')::UUID,current_setting('test.ca_ex')::UUID,1);
    BEGIN PERFORM public.get_class_agit_workspace_v1(current_setting('test.ca_class')::UUID); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'student forged admin'; END IF;
END; $$;
-- C2: 같은 공개판의 목록/방은 요약만, 작품 선택에서 전문 한 편만 받는다.
DO $$
DECLARE v_ex UUID:=current_setting('test.ca_ex')::UUID; v_list JSONB; v_lobby JSONB; v_room JSONB; v_next JSONB;
    v_work JSONB; v_home JSONB; v_id TEXT; denied BOOLEAN;
BEGIN
    v_list:=public.get_my_class_agit_exhibitions_v1();
    IF jsonb_array_length(v_list->'exhibitions')<>1 OR v_list::TEXT ~ 'studentId|sourceId|blocks|C1 작품|합성 작가'
        THEN RAISE EXCEPTION 'student list leaked source or draft'; END IF;
    IF v_list->'exhibitions'->0->>'title'<>'C1 전시' THEN RAISE EXCEPTION 'student list used draft title'; END IF;
    v_lobby:=public.get_my_class_agit_room_v1(v_ex,0);
    v_room:=public.get_my_class_agit_room_v1(v_ex,1); v_next:=public.get_my_class_agit_room_v1(v_ex,2);
    IF jsonb_array_length(v_lobby->'items')<>0 OR jsonb_array_length(v_lobby->'rooms')<>2
        OR jsonb_array_length(v_room->'items')<>12 OR jsonb_array_length(v_next->'items')<>1
        OR v_room::TEXT ~ 'blocks|sourceId|studentId|consentId|itemId|source_revision'
        THEN RAISE EXCEPTION 'student room response exceeded summary budget'; END IF;
    v_id:=v_room->'items'->0->>'id';
    v_work:=public.get_my_class_agit_work_v1(v_ex,1,v_id);
    IF jsonb_array_length(v_work->'work'->'blocks')<1 OR v_work->'work'->>'id'<>v_id
        OR v_work::TEXT ~ 'sourceId|studentId|consentId|itemId|source_revision' THEN RAISE EXCEPTION 'student work DTO failed'; END IF;
    denied:=FALSE; BEGIN PERFORM public.get_my_class_agit_work_v1(v_ex,2,v_id); EXCEPTION WHEN SQLSTATE 'PT409' THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'student stale publication accepted'; END IF;
    denied:=FALSE; BEGIN PERFORM public.get_my_class_agit_work_v1(v_ex,1,'published-60'); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'unpublished work ordinal guessed'; END IF;
    denied:=FALSE; BEGIN PERFORM public.get_my_class_agit_room_v1(v_ex,6); EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'student room cap ignored'; END IF;
    v_home:=public.get_student_home_bootstrap_v1();
    IF v_home->'home'->>'class_agit_available'<>'true' OR NOT (v_home->'home' ?& ARRAY['neighbor_agit_available','neighbor_agit_space_id','neighbor_agit_new_count'])
        THEN RAISE EXCEPTION 'home signal or neighbor summary missing'; END IF;
    PERFORM set_config('test.ca_work',v_id,TRUE);
END; $$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.ca_other_auth'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.ca_other_auth'),'role','authenticated')::TEXT,TRUE);
DO $$ DECLARE denied BOOLEAN:=FALSE; BEGIN
    BEGIN PERFORM public.get_class_agit_publication_v1(current_setting('test.ca_class')::UUID,current_setting('test.ca_ex')::UUID,1); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'cross-class student read'; END IF;
    denied:=FALSE; BEGIN PERFORM public.get_my_class_agit_room_v1(current_setting('test.ca_ex')::UUID,1); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'student C2 cross-class read'; END IF;
END; $$;
RESET ROLE;

UPDATE public.student_posts SET content='새로 수정한 본문' WHERE class_id=current_setting('test.ca_class')::UUID AND id=current_setting('test.ca_post')::UUID;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.ca_admin'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.ca_admin'),'role','authenticated')::TEXT,TRUE);
DO $$
DECLARE v_class UUID:=current_setting('test.ca_class')::UUID; v_ex UUID:=current_setting('test.ca_ex')::UUID;
    v_result JSONB; v_payload JSONB:=current_setting('test.ca_payload')::JSONB; v_items JSONB; v_source JSONB; denied BOOLEAN:=FALSE; v_item_id UUID;
BEGIN
    v_result:=public.get_class_agit_workspace_v1(v_class,v_ex);
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_result->'draft'->'items') a WHERE a->>'sourceId'=current_setting('test.ca_post') AND a->>'sourceChanged'='true') THEN RAISE EXCEPTION 'source change not flagged'; END IF;
    IF public.get_class_agit_publication_v1(v_class,v_ex)::TEXT LIKE '%새로 수정한 본문%' THEN RAISE EXCEPTION 'source update mutated frozen publication'; END IF;
    BEGIN PERFORM public.run_class_agit_action_v1(v_class,'publish',jsonb_build_object('exhibition_id',v_ex,'expected_revision',5,'confirmed',TRUE)); EXCEPTION WHEN SQLSTATE 'PT409' THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'stale source published'; END IF;
    v_source:=public.get_class_agit_source_v1(v_class,current_setting('test.ca_post')::UUID)->'source';
    SELECT jsonb_agg(CASE WHEN a->>'sourceId'=current_setting('test.ca_post') THEN jsonb_set(a,'{sourceRevision}',v_source->'source_revision') ELSE a END ORDER BY n)
    INTO v_items FROM jsonb_array_elements(v_payload->'items') WITH ORDINALITY x(a,n);
    v_payload:=jsonb_set(jsonb_set(v_payload,'{expected_revision}','5'),'{items}',v_items);
    v_result:=public.run_class_agit_action_v1(v_class,'save',v_payload);
    IF (public.get_class_agit_publication_v1(v_class,v_ex)->>'total_count')::INTEGER<>13 THEN RAISE EXCEPTION 'source refresh changed published visibility'; END IF;
    PERFORM public.run_class_agit_action_v1(v_class,'publish',jsonb_build_object('exhibition_id',v_ex,'expected_revision',6,'confirmed',TRUE));
    SELECT (a->>'itemId')::UUID INTO v_item_id FROM jsonb_array_elements(v_result->'draft'->'items') a WHERE a->>'sourceId'=current_setting('test.ca_post');
    PERFORM set_config('test.ca_item',v_item_id::TEXT,TRUE);
    PERFORM public.run_class_agit_action_v1(v_class,'withdraw',jsonb_build_object('exhibition_id',v_ex,'expected_revision',7,'item_id',v_item_id));
    IF (public.get_class_agit_publication_v1(v_class,v_ex)->>'total_count')::INTEGER<>12 THEN RAISE EXCEPTION 'withdraw did not hide current publication'; END IF;
    v_payload:=jsonb_set(v_payload,'{expected_revision}','8');
    PERFORM public.run_class_agit_action_v1(v_class,'save',v_payload);
    IF (public.get_class_agit_publication_v1(v_class,v_ex)->>'total_count')::INTEGER<>12 THEN RAISE EXCEPTION 'reconfirmation revived old publication'; END IF;
    PERFORM public.run_class_agit_action_v1(v_class,'publish',jsonb_build_object('exhibition_id',v_ex,'expected_revision',9,'confirmed',TRUE));
    IF (public.get_class_agit_publication_v1(v_class,v_ex)->>'total_count')::INTEGER<>13 THEN RAISE EXCEPTION 'republication did not restore confirmed work'; END IF;
    PERFORM public.run_class_agit_action_v1(v_class,'set_enabled','{"enabled":false,"expected_enabled":true}');
    denied:=FALSE; BEGIN PERFORM public.get_class_agit_publication_v1(v_class,v_ex); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'OFF read allowed'; END IF;
    PERFORM public.run_class_agit_action_v1(v_class,'save',jsonb_set(v_payload,'{expected_revision}','10'));
    PERFORM public.run_class_agit_action_v1(v_class,'set_enabled',jsonb_build_object('enabled',TRUE,'expected_enabled',FALSE,
        'initial_modules',jsonb_build_array('__configured__','student-writing','friends-hideout'),'initial_vocab_tower_enabled',v_result->'class'->'vocab_tower_enabled'));
END; $$;
RESET ROLE;

UPDATE public.student_posts SET is_submitted=FALSE,is_confirmed=FALSE,approved_at=NULL WHERE class_id=current_setting('test.ca_class')::UUID AND id=current_setting('test.ca_post')::UUID;
DO $$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM public.class_agit_items WHERE class_id=current_setting('test.ca_class')::UUID AND id=current_setting('test.ca_item')::UUID AND revoked_at IS NOT NULL)
    THEN RAISE EXCEPTION 'source recall did not revoke'; END IF;
END; $$;
UPDATE public.student_posts SET is_submitted=TRUE,is_confirmed=TRUE WHERE class_id=current_setting('test.ca_class')::UUID AND id=current_setting('test.ca_post')::UUID;
DO $$ BEGIN
    IF (public.get_class_agit_publication_v1(current_setting('test.ca_class')::UUID,current_setting('test.ca_ex')::UUID)->>'total_count')::INTEGER<>12
    THEN RAISE EXCEPTION 'resubmission revived recalled publication'; END IF;
END; $$;
DELETE FROM public.student_posts WHERE class_id=current_setting('test.ca_class')::UUID AND id=current_setting('test.ca_poem')::UUID;
DO $$ BEGIN
    IF (public.get_class_agit_publication_v1(current_setting('test.ca_class')::UUID,current_setting('test.ca_ex')::UUID)->>'total_count')::INTEGER<>11
    THEN RAISE EXCEPTION 'deleted source remains visible'; END IF;
END; $$;
UPDATE public.students SET is_active=FALSE WHERE class_id=current_setting('test.ca_class')::UUID AND id=current_setting('test.ca_student')::UUID;
DO $$ BEGIN
    IF (public.get_class_agit_publication_v1(current_setting('test.ca_class')::UUID,current_setting('test.ca_ex')::UUID)->>'total_count')::INTEGER<>0
    THEN RAISE EXCEPTION 'inactive student works remain visible'; END IF;
END; $$;
-- 중단/보관/복원은 저장 초안을 유지하며 저절로 다시 공개하지 않는다.
SET LOCAL ROLE authenticated;
DO $$ DECLARE v_class UUID:=current_setting('test.ca_class')::UUID; v_ex UUID:=current_setting('test.ca_ex')::UUID;
    v_result JSONB; v_action TEXT; v_revision INTEGER:=11; denied BOOLEAN;
BEGIN
    FOREACH v_action IN ARRAY ARRAY['unpublish','archive','restore'] LOOP
        v_result:=public.run_class_agit_action_v1(v_class,v_action,jsonb_build_object('exhibition_id',v_ex,'expected_revision',v_revision));
        v_revision:=v_revision+1;
        IF jsonb_array_length(v_result->'draft'->'items')<>13 THEN RAISE EXCEPTION 'state change lost draft'; END IF;
        denied:=FALSE; BEGIN PERFORM public.get_class_agit_publication_v1(v_class,v_ex); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
        IF NOT denied THEN RAISE EXCEPTION 'non-published state readable'; END IF;
    END LOOP;
END; $$;
RESET ROLE;
-- 현재 담당자가 일반 교사로 바뀌면 JWT의 ADMIN 주장으로 내부 기능을 열 수 없다.
UPDATE public.classes SET teacher_id=current_setting('test.ca_teacher')::UUID WHERE id=current_setting('test.ca_class')::UUID;
SELECT set_config('request.jwt.claim.sub',current_setting('test.ca_teacher'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.ca_teacher'),'role','authenticated','app_metadata',jsonb_build_object('role','ADMIN'))::TEXT,TRUE);
SET LOCAL ROLE authenticated;
DO $$ DECLARE denied BOOLEAN:=FALSE; BEGIN
    BEGIN PERFORM public.get_class_agit_workspace_v1(current_setting('test.ca_class')::UUID); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'normal teacher forged internal access'; END IF;
END; $$;
RESET ROLE;
UPDATE public.classes SET teacher_id=current_setting('test.ca_admin')::UUID WHERE id=current_setting('test.ca_class')::UUID;
SELECT set_config('request.jwt.claim.sub',current_setting('test.ca_admin'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.ca_admin'),'role','authenticated')::TEXT,TRUE);
UPDATE public.class_agit_rollout SET mode='disabled' WHERE singleton;
DO $$ DECLARE denied BOOLEAN:=FALSE; BEGIN
    BEGIN PERFORM public.get_class_agit_workspace_v1(current_setting('test.ca_class')::UUID); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'disabled rollout ignored'; END IF;
END; $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.ca_auth'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.ca_auth'),'role','authenticated')::TEXT,TRUE);
DO $$ DECLARE denied BOOLEAN:=FALSE; BEGIN
    BEGIN PERFORM public.get_my_class_agit_work_v1(current_setting('test.ca_ex')::UUID,1,current_setting('test.ca_work')); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'student C2 inactive or disabled access'; END IF;
END; $$;
RESET ROLE;

-- C2: 최대 전시 60편과 독립적인 OFF/중단/철회 경계. 모두 합성 자료이며 마지막에 롤백한다.
UPDATE public.class_agit_rollout SET mode='internal' WHERE singleton;
UPDATE public.students SET is_active=TRUE WHERE id=current_setting('test.ca_student')::UUID;
UPDATE public.classes SET enabled_modules=ARRAY['__configured__','class-agit','friends-hideout'] WHERE id=current_setting('test.ca_class')::UUID;
DO $$
DECLARE v_class UUID:=current_setting('test.ca_class')::UUID; v_mission UUID; v_post UUID; v_posts JSONB:='[]';
BEGIN
    FOR i IN 1..60 LOOP
    INSERT INTO public.writing_missions(class_id,teacher_id,title,guide,genre,mission_type,input_template,min_chars,min_paragraphs,base_reward,bonus_reward)
    VALUES(v_class,current_setting('test.ca_admin')::UUID,'C2 규모 점검','합성','글쓰기','글쓰기','freeform',1,1,0,0) RETURNING id INTO v_mission;
        INSERT INTO public.student_posts(class_id,student_id,mission_id,title,content,is_submitted,is_confirmed)
        VALUES(v_class,current_setting('test.ca_student')::UUID,v_mission,'C2 작품 '||i,repeat('한글과 이모지 🌱. ',1000),TRUE,TRUE) RETURNING id INTO v_post;
        v_posts:=v_posts||jsonb_build_array(v_post);
    END LOOP;
    PERFORM set_config('test.ca_scale_posts',v_posts::TEXT,TRUE);
    PERFORM set_config('test.ca_scale_ex',gen_random_uuid()::TEXT,TRUE);
END; $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.ca_admin'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.ca_admin'),'role','authenticated')::TEXT,TRUE);
DO $$
DECLARE v_class UUID:=current_setting('test.ca_class')::UUID; v_ex UUID:=current_setting('test.ca_scale_ex')::UUID;
    v_items JSONB:='[]'; v_post TEXT; v_source JSONB; v_draft JSONB;
BEGIN
    v_draft:=public.run_class_agit_action_v1(v_class,'create',jsonb_build_object('exhibition_id',v_ex));
    FOR v_post IN SELECT jsonb_array_elements_text(current_setting('test.ca_scale_posts')::JSONB) LOOP
        v_source:=public.get_class_agit_source_v1(v_class,v_post::UUID)->'source';
        v_items:=v_items||jsonb_build_array(jsonb_build_object('sourceId',v_post,'sourceRevision',v_source->>'source_revision','classAcknowledged',TRUE,'publicAlias','합성 작가'));
    END LOOP;
    v_draft:=public.run_class_agit_action_v1(v_class,'save',jsonb_build_object('exhibition_id',v_ex,'expected_revision',v_draft->'draft'->'revision',
        'title','C2 60편 전시','introduction','합성 부하 점검','items',v_items));
    PERFORM public.run_class_agit_action_v1(v_class,'publish',jsonb_build_object('exhibition_id',v_ex,'expected_revision',v_draft->'draft'->'revision','confirmed',TRUE));
END; $$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.ca_auth'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.ca_auth'),'role','authenticated')::TEXT,TRUE);
DO $$
DECLARE v_ex UUID:=current_setting('test.ca_scale_ex')::UUID; v_page JSONB; v_work JSONB; v_start TIMESTAMPTZ:=clock_timestamp();
BEGIN
    v_page:=public.get_my_class_agit_room_v1(v_ex,5);
    IF (v_page->>'total_count')::INTEGER<>60 OR jsonb_array_length(v_page->'rooms')<>5 OR jsonb_array_length(v_page->'items')<>12
       OR octet_length(v_page::TEXT)>8000 THEN RAISE EXCEPTION 'student 60-work room budget failed'; END IF;
    RAISE NOTICE 'C2 synthetic 60-work room: % ms, % bytes',extract(epoch FROM clock_timestamp()-v_start)*1000,octet_length(v_page::TEXT);
    v_work:=public.get_my_class_agit_work_v1(v_ex,1,'published-60');
    IF v_work->>'previous_id'<>'published-59' OR v_work->>'next_id' IS NOT NULL
       OR length(v_work->'work'->'blocks'->>0)<10000 THEN RAISE EXCEPTION 'student long last-work detail failed'; END IF;
END; $$;
RESET ROLE;
-- 공개 철회는 방을 재배치하되 작품 ID를 바꾸지 않는다. 이미 받아 둔 액자로도 전문을 얻지 못한다.
UPDATE public.class_agit_items SET revoked_at=now() WHERE class_id=current_setting('test.ca_class')::UUID
    AND exhibition_id=current_setting('test.ca_scale_ex')::UUID AND position=1;
SET LOCAL ROLE authenticated;
DO $$ DECLARE v_ex UUID:=current_setting('test.ca_scale_ex')::UUID; v_page JSONB; denied BOOLEAN:=FALSE; BEGIN
    v_page:=public.get_my_class_agit_room_v1(v_ex,1);
    IF v_page->'items'->0->>'id'<>'published-2' OR (v_page->>'total_count')::INTEGER<>59 THEN RAISE EXCEPTION 'student withdrawal changed identity'; END IF;
    BEGIN PERFORM public.get_my_class_agit_work_v1(v_ex,1,'published-1'); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'student read withdrawn work'; END IF;
END; $$;
RESET ROLE;
UPDATE public.class_agit_exhibitions SET publication_no=publication_no+1 WHERE id=current_setting('test.ca_scale_ex')::UUID;
SET LOCAL ROLE authenticated;
DO $$ DECLARE denied BOOLEAN:=FALSE; BEGIN
    BEGIN PERFORM public.get_my_class_agit_work_v1(current_setting('test.ca_scale_ex')::UUID,1,'published-2'); EXCEPTION WHEN SQLSTATE 'PT409' THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'student reopened superseded edition'; END IF;
END; $$;
RESET ROLE;
UPDATE public.classes SET enabled_modules=array_remove(enabled_modules,'class-agit') WHERE id=current_setting('test.ca_class')::UUID;
SET LOCAL ROLE authenticated;
DO $$ DECLARE denied BOOLEAN:=FALSE; BEGIN
    BEGIN PERFORM public.get_my_class_agit_room_v1(current_setting('test.ca_scale_ex')::UUID,1); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied OR public.get_student_home_bootstrap_v1()->'home'->>'class_agit_available'<>'false' THEN RAISE EXCEPTION 'student module OFF ignored'; END IF;
END; $$;
RESET ROLE;
UPDATE public.classes SET enabled_modules=array_append(enabled_modules,'class-agit') WHERE id=current_setting('test.ca_class')::UUID;
UPDATE public.class_agit_exhibitions SET state='draft' WHERE id=current_setting('test.ca_scale_ex')::UUID;
SET LOCAL ROLE authenticated;
DO $$ DECLARE denied BOOLEAN:=FALSE; BEGIN
    IF jsonb_array_length(public.get_my_class_agit_exhibitions_v1()->'exhibitions')<>0
        OR public.get_student_home_bootstrap_v1()->'home'->>'class_agit_available'<>'false' THEN RAISE EXCEPTION 'student unpublished exhibition listed'; END IF;
    BEGIN PERFORM public.get_my_class_agit_work_v1(current_setting('test.ca_scale_ex')::UUID,2,'published-2'); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'student unpublished work readable'; END IF;
END; $$;
RESET ROLE;

-- C3–C5: independent anthology consent, frozen editions, anonymous release and rollout.
DO $$ DECLARE t TEXT; v_class UUID:=current_setting('test.ca_class')::UUID; v_m UUID; v_post UUID; ids JSONB:=current_setting('test.ca_scale_posts')::JSONB; BEGIN
    FOREACH t IN ARRAY ARRAY['class_agit_books','class_agit_book_items','class_agit_book_editions','class_agit_release_events','class_agit_external_shares','class_agit_external_items','class_agit_public_read_budget','class_agit_pilot_classes'] LOOP
        IF NOT EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t AND rowsecurity)
            OR has_table_privilege('anon',format('public.%I',t),'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated',format('public.%I',t),'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('service_role',format('public.%I',t),'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'C3/4 RLS grant: %',t; END IF;
    END LOOP;
    IF has_function_privilege('anon','public.get_class_agit_book_preview_v1(uuid,uuid,integer)','EXECUTE') OR has_function_privilege('authenticated','public.class_agit_book_draft_snapshot_v1(uuid,uuid)','EXECUTE') OR has_function_privilege('anon','public.get_my_class_agit_books_v1(uuid,text)','EXECUTE') OR has_function_privilege('authenticated','public.class_agit_take_public_budget_v1(text,integer)','EXECUTE') OR has_function_privilege('anon','public.manage_class_agit_rollout_v1(jsonb)','EXECUTE') OR NOT has_function_privilege('anon','public.read_public_class_agit_v1(text,integer,text,integer)','EXECUTE') THEN RAISE EXCEPTION 'C3/4 function grants'; END IF;
    IF (SELECT external_enabled FROM public.class_agit_rollout WHERE singleton) THEN RAISE EXCEPTION 'external sharing default must be OFF'; END IF;
    FOR i IN 61..100 LOOP
        INSERT INTO public.writing_missions(class_id,teacher_id,title,guide,genre,mission_type,input_template,min_chars,min_paragraphs,base_reward,bonus_reward)
        VALUES(v_class,current_setting('test.ca_admin')::UUID,'C3 규모 점검','합성','글쓰기','글쓰기','freeform',1,1,0,0) RETURNING id INTO v_m;
        INSERT INTO public.student_posts(class_id,student_id,mission_id,title,content,is_submitted,is_confirmed)
        VALUES(v_class,current_setting('test.ca_student')::UUID,v_m,'C3 작품 '||i,'문집용 새 문장. 한글과 이모지 🌱',TRUE,TRUE) RETURNING id INTO v_post;
        ids:=ids||jsonb_build_array(v_post);
    END LOOP;
    PERFORM set_config('test.ca_book_posts',ids::TEXT,TRUE); PERFORM set_config('test.ca_book',gen_random_uuid()::TEXT,TRUE);
END; $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.ca_admin'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.ca_admin'),'role','authenticated')::TEXT,TRUE);
DO $$ DECLARE c UUID:=current_setting('test.ca_class')::UUID; b UUID:=current_setting('test.ca_book')::UUID; r JSONB; p JSONB; s JSONB; ids JSONB:='[]'; id TEXT; denied BOOLEAN; started TIMESTAMPTZ; BEGIN
    r:=public.run_class_agit_book_action_v1(c,'create',jsonb_build_object('book_id',b));
    r:=public.run_class_agit_book_action_v1(c,'create',jsonb_build_object('book_id',b));
    IF jsonb_array_length(r->'books')<>1 THEN RAISE EXCEPTION 'duplicate book create'; END IF;
    FOR id IN SELECT jsonb_array_elements_text(current_setting('test.ca_book_posts')::JSONB) LOOP
        s:=public.get_class_agit_source_v1(c,id::UUID)->'source';
        ids:=ids||jsonb_build_array(jsonb_build_object('sourceId',id,'sourceRevision',s->>'source_revision','anthologyConfirmed',TRUE,'blocks',jsonb_build_array('위조본문')));
    END LOOP;
    p:=jsonb_build_object('book_id',b,'expected_revision',1,'title','100편 시험 문집','subtitle','한글 문집','introduction','함께 쓴 이야기','class_label','시험 학급','term','2026 2학기','issue_date','2026-09-05','grouping','custom','items',ids);
    denied:=FALSE; BEGIN PERFORM public.run_class_agit_book_action_v1(c,'save',jsonb_set(p,'{items,0,anthologyConfirmed}','false')); EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'class consent implicitly became book consent'; END IF;
    denied:=FALSE; BEGIN PERFORM public.run_class_agit_book_action_v1(c,'save',jsonb_set(p,'{items}',ids||jsonb_build_array(ids->0))); EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION '101 works accepted'; END IF;
    denied:=FALSE; BEGIN PERFORM public.run_class_agit_book_action_v1(c,'save',jsonb_set(p,'{items,0,sourceId}',to_jsonb(current_setting('test.ca_other_post')))); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'cross-class book source'; END IF;
    r:=public.run_class_agit_book_action_v1(c,'save',p);
    IF jsonb_array_length(r->'book'->'items')<>100 OR r->'book'->'items'->0->'blocks'='["위조본문"]'::JSONB THEN RAISE EXCEPTION 'book 100/canonical source'; END IF;
    denied:=FALSE; BEGIN PERFORM public.run_class_agit_book_action_v1(c,'save',p); EXCEPTION WHEN SQLSTATE 'PT409' THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'stale book write'; END IF;
    s:=public.get_class_agit_book_preview_v1(c,b,2);
    IF jsonb_array_length(s->'book'->'works')<>100 OR s->>'draft'<>'true' OR s::TEXT ~ '"(sourceId|studentId|consentId|itemId)"' THEN RAISE EXCEPTION 'draft print boundary'; END IF;
    IF jsonb_array_length(public.get_class_agit_book_workspace_v1(c,b)->'book'->'editions')<>0 THEN RAISE EXCEPTION 'draft preview created edition'; END IF;
    started:=clock_timestamp();
    r:=public.run_class_agit_book_action_v1(c,'finalize',jsonb_build_object('book_id',b,'expected_revision',2,'confirmed',TRUE));
    PERFORM set_config('test.ca_edition',r->'book'->'editions'->0->>'id',TRUE);
    s:=public.get_class_agit_book_edition_v1(c,current_setting('test.ca_edition')::UUID);
    IF jsonb_array_length(s->'book'->'works')<>100 OR s::TEXT ~ '"(sourceId|studentId|consentId|itemId)"' THEN RAISE EXCEPTION 'edition leaked references'; END IF;
    RAISE NOTICE 'C3 100 works finalize + print DTO: % ms, % bytes',extract(epoch FROM clock_timestamp()-started)*1000,octet_length(s::TEXT);
    PERFORM public.run_class_agit_book_action_v1(c,'show',jsonb_build_object('book_id',b,'expected_revision',3,'edition_id',current_setting('test.ca_edition')));
    PERFORM set_config('test.ca_book_first_item',r->'book'->'items'->0->>'itemId',TRUE);
END; $$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.ca_auth'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.ca_auth'),'role','authenticated')::TEXT,TRUE);
DO $$ DECLARE r JSONB; denied BOOLEAN:=FALSE; BEGIN
    r:=public.get_my_class_agit_books_v1(); IF jsonb_array_length(r->'books')<>1 THEN RAISE EXCEPTION 'student shelf'; END IF;
    r:=public.get_my_class_agit_books_v1(current_setting('test.ca_edition')::UUID);
    IF jsonb_array_length(r->'works')<>100 OR r::TEXT ~ '"(blocks|sourceId|studentId|consentId|itemId)"' OR octet_length(r::TEXT)>25000 THEN RAISE EXCEPTION 'book outline budget/privacy'; END IF;
    r:=public.get_my_class_agit_books_v1(current_setting('test.ca_edition')::UUID,'chapter-100');
    IF r->'work'->>'title'<>'C3 작품 100' OR public.get_student_home_bootstrap_v1()->'home'->>'class_agit_available'<>'true' THEN RAISE EXCEPTION 'chapter100/book-only home'; END IF;
    BEGIN PERFORM public.get_class_agit_book_workspace_v1(current_setting('test.ca_class')::UUID); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'student edited book'; END IF;
END; $$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.ca_other_auth'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.ca_other_auth'),'role','authenticated')::TEXT,TRUE);
DO $$ DECLARE denied BOOLEAN:=FALSE; BEGIN
    BEGIN PERFORM public.get_my_class_agit_books_v1(current_setting('test.ca_edition')::UUID); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'other student book'; END IF;
END; $$;
RESET ROLE;
UPDATE public.student_posts SET content='확정 뒤 수정한 원글' WHERE id=(current_setting('test.ca_book_posts')::JSONB->>99)::UUID;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.ca_admin'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.ca_admin'),'role','authenticated')::TEXT,TRUE);
DO $$ DECLARE r JSONB; denied BOOLEAN:=FALSE; BEGIN
    r:=public.get_class_agit_book_edition_v1(current_setting('test.ca_class')::UUID,current_setting('test.ca_edition')::UUID);
    IF r->'book'->'works'->99->'blocks'->>0<>'문집용 새 문장. 한글과 이모지 🌱' THEN RAISE EXCEPTION 'edition mutated with source'; END IF;
    PERFORM public.run_class_agit_book_action_v1(current_setting('test.ca_class')::UUID,'withdraw',jsonb_build_object('book_id',current_setting('test.ca_book'),'expected_revision',4,'item_id',current_setting('test.ca_book_first_item')));
    BEGIN PERFORM public.get_class_agit_book_edition_v1(current_setting('test.ca_class')::UUID,current_setting('test.ca_edition')::UUID); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'print ignored withdrawal'; END IF;
END; $$;
-- Prepare a distinct external publication while student switch is OFF.
RESET ROLE;
UPDATE public.classes SET enabled_modules=array_remove(enabled_modules,'class-agit') WHERE id=current_setting('test.ca_class')::UUID;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.ca_admin'),TRUE);
DO $$ DECLARE c UUID:=current_setting('test.ca_class')::UUID; ex UUID:=current_setting('test.ca_scale_ex')::UUID; r JSONB; p JSONB; items JSONB:='[]'; i JSONB; denied BOOLEAN:=FALSE; BEGIN
    r:=public.get_class_agit_share_workspace_v1(c,ex);
    FOR i IN SELECT value FROM jsonb_array_elements(r->'candidates') LIMIT 12 LOOP
        items:=items||jsonb_build_array(jsonb_build_object('itemId',i->>'itemId','sourceRevision',i->>'sourceRevision','publicAlias','별빛 작가','externalConfirmed',TRUE));
    END LOOP;
    p:=jsonb_build_object('expected_revision',0,'exhibition_revision',r->'exhibition_revision','title','우리의 전시','introduction','공개 소개','days',30,'token',repeat('a',64),'confirmed',TRUE,'items',items);
    BEGIN PERFORM public.run_class_agit_share_action_v1(c,ex,'publish',p); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'external OFF ignored'; END IF;
    r:=public.manage_class_agit_rollout_v1();
    PERFORM public.manage_class_agit_rollout_v1(jsonb_build_object('mode','internal','external_enabled',TRUE,'class_ids','[]'::JSONB,'expected_revision',r->'settings'->'revision'));
    denied:=FALSE; BEGIN PERFORM public.run_class_agit_share_action_v1(c,ex,'publish',jsonb_set(p,'{items,0,externalConfirmed}','false')); EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'external consent implicit'; END IF;
    r:=public.run_class_agit_share_action_v1(c,ex,'publish',p);
    IF r::TEXT ~ '(token_hash|aaaaaaaaaaaaaaaa)' THEN RAISE EXCEPTION 'manager returned token'; END IF;
    IF (r->'share'->>'revision')::INT<>1 THEN RAISE EXCEPTION 'external revision'; END IF;
    r:=public.run_class_agit_share_action_v1(c,ex,'publish',p);
    IF (r->'share'->>'revision')::INT<>1 THEN RAISE EXCEPTION 'lost response retry duplicated release'; END IF;
    PERFORM set_config('test.ca_external_first',r->'published_items'->0->>'id',TRUE);
END; $$;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',TRUE); SELECT set_config('request.jwt.claims','{"role":"anon"}',TRUE);
DO $$ DECLARE r JSONB; BEGIN
    r:=public.read_public_class_agit_v1(repeat('a',64),1);
    IF r->>'error' IS NOT NULL OR jsonb_array_length(r->'items')<>12 OR r::TEXT ~ '"(blocks|student_id|post_id|class_id|sourceId|token_hash)"' OR r->'items'->0->>'author'<>'별빛 작가' THEN RAISE EXCEPTION 'public room safety %',r->>'error'; END IF;
    IF current_setting('response.headers') NOT LIKE '%no-store%' OR current_setting('response.headers') NOT LIKE '%no-referrer%' THEN RAISE EXCEPTION 'public response headers'; END IF;
    r:=public.read_public_class_agit_v1(repeat('a',64),1,'published-2',1);
    IF r->'work'->'blocks' IS NULL THEN RAISE EXCEPTION 'anonymous detail'; END IF;
    IF public.read_public_class_agit_v1(repeat('b',64))->>'error'<>'unavailable' OR public.read_public_class_agit_v1('x')->>'error'<>'unavailable' THEN RAISE EXCEPTION 'guessing valid share'; END IF;
    IF public.read_public_class_agit_v1(repeat('a',64),1,'published-2',2)->>'error'<>'changed' THEN RAISE EXCEPTION 'public wrong edition'; END IF;
END; $$;
RESET ROLE;
-- Recall and restore the source: previous release must stay revoked.
UPDATE public.student_posts SET recalled_at=now() WHERE id=(current_setting('test.ca_scale_posts')::JSONB->>1)::UUID;
UPDATE public.student_posts SET recalled_at=NULL WHERE id=(current_setting('test.ca_scale_posts')::JSONB->>1)::UUID;
SET LOCAL ROLE anon;
DO $$ BEGIN
    IF public.read_public_class_agit_v1(repeat('a',64),1,'published-2',1)->>'error'<>'unavailable' THEN RAISE EXCEPTION 'recall restored old external consent'; END IF;
END; $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.ca_admin'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.ca_admin'),'role','authenticated')::TEXT,TRUE);
DO $$ DECLARE c UUID:=current_setting('test.ca_class')::UUID; ex UUID:=current_setting('test.ca_scale_ex')::UUID; BEGIN
    PERFORM public.run_class_agit_share_action_v1(c,ex,'rotate',jsonb_build_object('expected_revision',1,'token',repeat('c',64),'days',1));
END; $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
    IF public.read_public_class_agit_v1(repeat('a',64))->>'error'<>'unavailable' OR public.read_public_class_agit_v1(repeat('c',64))->>'error' IS NOT NULL THEN RAISE EXCEPTION 'rotation failed'; END IF;
END; $$;
RESET ROLE;
UPDATE public.class_agit_external_shares SET expires_at=now()-interval '1 second' WHERE class_id=current_setting('test.ca_class')::UUID;
SET LOCAL ROLE anon;
DO $$ BEGIN IF public.read_public_class_agit_v1(repeat('c',64))->>'error'<>'unavailable' THEN RAISE EXCEPTION 'expired release'; END IF; END; $$;
RESET ROLE;
UPDATE public.class_agit_external_shares SET expires_at=now()+interval '1 day' WHERE class_id=current_setting('test.ca_class')::UUID;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.ca_admin'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.ca_admin'),'role','authenticated')::TEXT,TRUE);
DO $$ DECLARE r JSONB; BEGIN
    r:=public.manage_class_agit_rollout_v1();
    PERFORM public.manage_class_agit_rollout_v1(jsonb_build_object('mode','pilot','external_enabled',TRUE,'class_ids',jsonb_build_array(current_setting('test.ca_other_class')),'expected_revision',r->'settings'->'revision'));
END; $$;
SET LOCAL ROLE anon;
DO $$ BEGIN IF public.read_public_class_agit_v1(repeat('c',64))->>'error'<>'unavailable' THEN RAISE EXCEPTION 'pilot excluded class still public'; END IF; END; $$;
RESET ROLE;
UPDATE public.class_agit_rollout SET mode='internal' WHERE singleton;
-- Failed requests retain a bounded rate counter (return JSON, never raise after increment).
UPDATE public.class_agit_public_read_budget SET requests=3000,window_start=date_trunc('minute',clock_timestamp()) WHERE bucket='global';
SET LOCAL ROLE anon;
DO $$ BEGIN IF public.read_public_class_agit_v1('invalid')->>'error'<>'rate_limited' OR current_setting('response.status')<>'429' THEN RAISE EXCEPTION 'global anonymous rate limit'; END IF; END; $$;
RESET ROLE;
DO $$ BEGIN IF (SELECT requests FROM public.class_agit_public_read_budget WHERE bucket='global')<>3001 THEN RAISE EXCEPTION 'rate increment rolled back'; END IF; END; $$;
UPDATE public.class_agit_public_read_budget SET requests=1;

SAVEPOINT class_agit_release_extra;
-- Reconfirmation restores only new anthology editions, never an old withdrawn one.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.ca_admin'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.ca_admin'),'role','authenticated')::TEXT,TRUE);
DO $$ DECLARE c UUID:=current_setting('test.ca_class')::UUID; b UUID:=current_setting('test.ca_book')::UUID; r JSONB; s JSONB; e UUID; BEGIN
    s:=public.get_class_agit_source_v1(c,(current_setting('test.ca_book_posts')::JSONB->>0)::UUID)->'source';
    r:=public.run_class_agit_book_action_v1(c,'save',jsonb_build_object('book_id',b,'expected_revision',5,'title','새 확인 문집','issue_date','2026-09-05','items',jsonb_build_array(jsonb_build_object('sourceId',s->>'id','sourceRevision',s->>'source_revision','anthologyConfirmed',TRUE))));
    r:=public.run_class_agit_book_action_v1(c,'finalize',jsonb_build_object('book_id',b,'expected_revision',6,'confirmed',TRUE));
    e:=(r->'book'->'editions'->0->>'id')::UUID;
    IF jsonb_array_length(public.get_class_agit_book_edition_v1(c,e)->'book'->'works')<>1 THEN RAISE EXCEPTION 'new book consent not available'; END IF;
END; $$;
RESET ROLE;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.class_agit_book_visible_works_v1(current_setting('test.ca_class')::UUID,current_setting('test.ca_edition')::UUID) WHERE work_id='chapter-1') THEN RAISE EXCEPTION 'new confirmation revived old book'; END IF; END; $$;
UPDATE public.classes SET teacher_id=current_setting('test.ca_teacher')::UUID WHERE id=current_setting('test.ca_class')::UUID;
SET LOCAL ROLE authenticated;
DO $$ DECLARE r JSONB; p JSONB; denied BOOLEAN:=FALSE; BEGIN
    r:=public.manage_class_agit_rollout_v1();
    p:=jsonb_build_object('mode','pilot','external_enabled',TRUE,'class_ids',jsonb_build_array(current_setting('test.ca_class')),'expected_revision',r->'settings'->'revision');
    BEGIN PERFORM public.manage_class_agit_rollout_v1(jsonb_set(p,'{class_ids}',jsonb_build_array(current_setting('test.ca_class'),current_setting('test.ca_other_class'),current_setting('test.ca_class')))); EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'pilot more than 2 accepted'; END IF;
    PERFORM public.manage_class_agit_rollout_v1(p);
END; $$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.ca_teacher'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.ca_teacher'),'role','authenticated')::TEXT,TRUE);
DO $$ DECLARE denied BOOLEAN:=FALSE; BEGIN
    IF public.get_class_agit_access_v1(current_setting('test.ca_class')::UUID)->>'allowed'<>'true' THEN RAISE EXCEPTION 'approved pilot teacher rejected'; END IF;
    PERFORM public.get_class_agit_book_workspace_v1(current_setting('test.ca_class')::UUID);
    BEGIN PERFORM public.manage_class_agit_rollout_v1(); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'pilot teacher became rollout admin'; END IF;
END; $$;
RESET ROLE;
UPDATE public.class_agit_public_read_budget SET requests=600,window_start=date_trunc('minute',clock_timestamp()) WHERE bucket='share:'||current_setting('test.ca_scale_ex');
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',TRUE); SELECT set_config('request.jwt.claims','{"role":"anon"}',TRUE);
DO $$ BEGIN IF public.read_public_class_agit_v1(repeat('c',64))->>'error'<>'rate_limited' THEN RAISE EXCEPTION 'share rate limit ignored'; END IF; END; $$;
RESET ROLE;
UPDATE public.class_agit_public_read_budget SET requests=1;
SELECT set_config('request.jwt.claim.sub',current_setting('test.ca_teacher'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.ca_teacher'),'role','authenticated')::TEXT,TRUE);
UPDATE public.students SET is_active=FALSE WHERE id=current_setting('test.ca_student')::UUID;
UPDATE public.students SET is_active=TRUE WHERE id=current_setting('test.ca_student')::UUID;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',TRUE); SELECT set_config('request.jwt.claims','{"role":"anon"}',TRUE);
DO $$ BEGIN IF (public.read_public_class_agit_v1(repeat('c',64))->>'total_count')::INT<>0 THEN RAISE EXCEPTION 'reactivating student revived external consent'; END IF; END; $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT class_agit_release_extra;
RELEASE SAVEPOINT class_agit_release_extra;
