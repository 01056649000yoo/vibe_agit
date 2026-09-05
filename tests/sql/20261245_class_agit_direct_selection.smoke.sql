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
DECLARE c UUID:=current_setting('test.direct_class')::UUID; e UUID:=current_setting('test.direct_ex')::UUID;
    b UUID:=gen_random_uuid(); p UUID:=(current_setting('test.direct_posts')::JSONB->>0)::UUID;
    source JSONB; item JSONB; payload JSONB; result JSONB; share_payload JSONB; ex_item UUID; book_item UUID; denied BOOLEAN;
BEGIN
    source:=public.get_class_agit_source_v1(c,p)->'source';
    -- Neither legacy acknowledgement key nor a fabricated true flag is present.
    item:=jsonb_build_object('sourceId',p,'sourceRevision',source->>'source_revision','publicAlias','별 작가');
    PERFORM public.run_class_agit_action_v1(c,'create',jsonb_build_object('exhibition_id',e));
    payload:=jsonb_build_object('exhibition_id',e,'expected_revision',1,'title','직접 담은 전시','introduction','','items',jsonb_build_array(item));
    denied:=FALSE; BEGIN PERFORM public.run_class_agit_action_v1(c,'save',jsonb_set(payload,'{items,0,sourceRevision}','"stale"')); EXCEPTION WHEN SQLSTATE 'PT409' THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'stale exhibition source accepted'; END IF;
    result:=public.run_class_agit_action_v1(c,'save',payload);
    IF jsonb_array_length(result->'draft'->'items')<>1 THEN RAISE EXCEPTION 'direct exhibition save failed'; END IF;
    ex_item:=(result->'draft'->'items'->0->>'itemId')::UUID;
    denied:=FALSE; BEGIN PERFORM public.run_class_agit_action_v1(c,'save',payload); EXCEPTION WHEN SQLSTATE 'PT409' THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'stale exhibition revision accepted'; END IF;
    PERFORM public.run_class_agit_action_v1(c,'publish',jsonb_build_object('exhibition_id',e,'expected_revision',2,'confirmed',TRUE));

    PERFORM public.run_class_agit_book_action_v1(c,'create',jsonb_build_object('book_id',b));
    payload:=jsonb_build_object('book_id',b,'expected_revision',1,'title','직접 담은 문집','issue_date',current_date,'items',jsonb_build_array(item-'publicAlias'));
    denied:=FALSE; BEGIN PERFORM public.run_class_agit_book_action_v1(c,'save',jsonb_set(payload,'{items,0,sourceRevision}','"stale"')); EXCEPTION WHEN SQLSTATE 'PT409' THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'stale anthology source accepted'; END IF;
    result:=public.run_class_agit_book_action_v1(c,'save',payload);
    IF jsonb_array_length(result->'book'->'items')<>1 OR result::TEXT LIKE '%anthologyConfirmed%' THEN RAISE EXCEPTION 'direct anthology save failed'; END IF;
    book_item:=(result->'book'->'items'->0->>'itemId')::UUID;
    PERFORM public.run_class_agit_book_action_v1(c,'finalize',jsonb_build_object('book_id',b,'expected_revision',2,'confirmed',TRUE));

    share_payload:=jsonb_build_object('token',repeat('d',64),'starts_at',now(),'expires_at',now()+INTERVAL '30 days','expected_revision',0,
        'exhibition_revision',3,'title','직접 고른 공개본','items',jsonb_build_array(jsonb_build_object('itemId',ex_item,'sourceRevision',source->>'source_revision','publicAlias','별 작가')));
    denied:=FALSE; BEGIN PERFORM public.run_class_agit_share_action_v1(c,e,'publish',jsonb_set(share_payload,'{expires_at}',to_jsonb(now()+INTERVAL '31 days'))); EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'over 30 days accepted'; END IF;
    denied:=FALSE; BEGIN PERFORM public.run_class_agit_share_action_v1(c,e,'publish',jsonb_set(share_payload,'{items,0,publicAlias}','""')); EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'empty public alias accepted'; END IF;
    denied:=FALSE; BEGIN PERFORM public.run_class_agit_share_action_v1(c,e,'publish',jsonb_set(share_payload,'{items,0,sourceRevision}','"stale"')); EXCEPTION WHEN SQLSTATE 'PT409' THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'stale external source accepted'; END IF;
    result:=public.run_class_agit_share_action_v1(c,e,'publish',share_payload);
    IF jsonb_array_length(result->'published_items')<>1 THEN RAISE EXCEPTION 'direct external publication failed'; END IF;
    -- Retrying the same publication cannot create a second edition.
    result:=public.run_class_agit_share_action_v1(c,e,'publish',share_payload);
    IF result->'share'->>'publication_no'<>'1' THEN RAISE EXCEPTION 'publication retry duplicated'; END IF;
    PERFORM set_config('test.direct_book',b::TEXT,TRUE);
    PERFORM set_config('test.direct_ex_item',ex_item::TEXT,TRUE);
    PERFORM set_config('test.direct_book_item',book_item::TEXT,TRUE);
    PERFORM set_config('test.direct_item',item::TEXT,TRUE);
END; $$;
RESET ROLE;
DO $$
DECLARE c UUID:=current_setting('test.direct_class')::UUID;
BEGIN
    IF (SELECT count(*) FROM public.class_agit_consent_events WHERE class_id=c AND action='selected')<>1
        OR (SELECT count(*) FROM public.class_agit_release_events WHERE class_id=c AND action='selected')<>2
        OR EXISTS(SELECT 1 FROM public.class_agit_consent_events WHERE class_id=c AND action='confirmed')
        OR EXISTS(SELECT 1 FROM public.class_agit_release_events WHERE class_id=c AND action='confirmed')
        THEN RAISE EXCEPTION 'selection was falsely recorded as consent'; END IF;
    PERFORM set_config('test.direct_ex_generation',(SELECT consent_id::TEXT FROM public.class_agit_items WHERE id=current_setting('test.direct_ex_item')::UUID),TRUE);
    PERFORM set_config('test.direct_book_generation',(SELECT consent_id::TEXT FROM public.class_agit_book_items WHERE id=current_setting('test.direct_book_item')::UUID),TRUE);
END; $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE c UUID:=current_setting('test.direct_class')::UUID; e UUID:=current_setting('test.direct_ex')::UUID;b UUID:=current_setting('test.direct_book')::UUID;
    item JSONB:=current_setting('test.direct_item')::JSONB;r JSONB;denied BOOLEAN;
BEGIN
    -- A teacher can withdraw and reselect, but this must not revive earlier publications.
    PERFORM public.run_class_agit_action_v1(c,'withdraw',jsonb_build_object('exhibition_id',e,'expected_revision',3,'item_id',current_setting('test.direct_ex_item')));
    PERFORM public.run_class_agit_action_v1(c,'save',jsonb_build_object('exhibition_id',e,'expected_revision',4,'title','다시 담은 전시','items',jsonb_build_array(item)));
    r:=public.get_class_agit_publication_v1(c,e);
    IF (r->>'total_count')::INTEGER<>0 THEN RAISE EXCEPTION 'reselection revived old exhibition'; END IF;
    PERFORM public.run_class_agit_book_action_v1(c,'withdraw',jsonb_build_object('book_id',b,'expected_revision',3,'item_id',current_setting('test.direct_book_item')));
    PERFORM public.run_class_agit_book_action_v1(c,'save',jsonb_build_object('book_id',b,'expected_revision',4,'title','다시 담은 문집','issue_date',current_date,'items',jsonb_build_array(item-'publicAlias')));
    denied:=FALSE; BEGIN PERFORM public.run_class_agit_action_v1(gen_random_uuid(),'create',jsonb_build_object('exhibition_id',gen_random_uuid())); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'cross-class write accepted'; END IF;
END; $$;
RESET ROLE;
DO $$
DECLARE c UUID:=current_setting('test.direct_class')::UUID;
BEGIN
    IF EXISTS(SELECT 1 FROM public.class_agit_items WHERE id=current_setting('test.direct_ex_item')::UUID AND consent_id=current_setting('test.direct_ex_generation')::UUID)
        OR EXISTS(SELECT 1 FROM public.class_agit_book_items WHERE id=current_setting('test.direct_book_item')::UUID AND consent_id=current_setting('test.direct_book_generation')::UUID)
        THEN RAISE EXCEPTION 'revocation generation was reused'; END IF;
    -- A later original edit must leave the already-published external text frozen.
    UPDATE public.student_posts SET content='수정된 원문' WHERE class_id=c AND id=(current_setting('test.direct_posts')::JSONB->>0)::UUID;
    IF NOT EXISTS(SELECT 1 FROM public.class_agit_external_items WHERE class_id=c AND snapshot->'blocks' @> '["수정 전 본문"]'::JSONB)
        THEN RAISE EXCEPTION 'external snapshot changed with original'; END IF;
    UPDATE public.student_posts SET is_submitted=FALSE,is_confirmed=FALSE WHERE class_id=c AND id=(current_setting('test.direct_posts')::JSONB->>0)::UUID;
    IF EXISTS(SELECT 1 FROM public.class_agit_external_items WHERE class_id=c AND revoked_at IS NULL)
        THEN RAISE EXCEPTION 'source recall did not revoke public copy'; END IF;
END; $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE c UUID:=current_setting('test.direct_class')::UUID; e UUID:=current_setting('test.direct_ex')::UUID;b UUID:=current_setting('test.direct_book')::UUID;
    item JSONB:=current_setting('test.direct_item')::JSONB; denied BOOLEAN;
BEGIN
    denied:=FALSE; BEGIN PERFORM public.run_class_agit_action_v1(c,'save',jsonb_build_object('exhibition_id',e,'expected_revision',5,'title','회수 거부','items',jsonb_build_array(item))); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'recalled source accepted into exhibition'; END IF;
    denied:=FALSE; BEGIN PERFORM public.run_class_agit_book_action_v1(c,'save',jsonb_build_object('book_id',b,'expected_revision',5,'title','회수 거부','items',jsonb_build_array(item-'publicAlias'))); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'recalled source accepted into anthology'; END IF;
END; $$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.direct_auth'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.direct_auth'),'role','authenticated')::TEXT,TRUE);
DO $$
DECLARE c UUID:=current_setting('test.direct_class')::UUID;e UUID:=current_setting('test.direct_ex')::UUID; denied BOOLEAN;
BEGIN
    denied:=FALSE; BEGIN PERFORM public.run_class_agit_action_v1(c,'create',jsonb_build_object('exhibition_id',gen_random_uuid())); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'student exhibition write accepted'; END IF;
    denied:=FALSE; BEGIN PERFORM public.run_class_agit_book_action_v1(c,'create',jsonb_build_object('book_id',gen_random_uuid())); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'student anthology write accepted'; END IF;
    denied:=FALSE; BEGIN PERFORM public.run_class_agit_share_action_v1(c,e,'publish','{}'); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'student external write accepted'; END IF;
    RAISE NOTICE 'Direct selection: exhibition/book/share without acknowledgements, role/revision/period boundaries, frozen copies and revocation passed';
END; $$;
RESET ROLE;
