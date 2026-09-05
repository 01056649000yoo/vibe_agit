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
    INSERT INTO public.classes(id,teacher_id,name,enabled_modules) VALUES(c,t,'고정판 합성 학급',ARRAY['__configured__','class-agit']);
    INSERT INTO public.students(id,class_id,name,student_code,auth_id) VALUES(s,c,'비공개 실명',left(s::TEXT,8)||'CAP',a);
    UPDATE public.class_agit_rollout SET mode='pilot',external_enabled=TRUE WHERE singleton;
    DELETE FROM public.class_agit_pilot_classes;
    INSERT INTO public.class_agit_pilot_classes(class_id) VALUES(c);
    FOR i IN 1..13 LOOP
        INSERT INTO public.writing_missions(class_id,teacher_id,title,guide,genre,mission_type,input_template,min_chars,min_paragraphs,base_reward,bonus_reward)
            VALUES(c,t,'용량 과제 '||i,'합성 안내','글쓰기','글쓰기','freeform',1,1,0,0) RETURNING id INTO m;
        -- 20,000자 × 120편: 종전 공개판 6.5MB 상한도 넘는 실제 긴 글로 검사한다.
        INSERT INTO public.student_posts(class_id,student_id,mission_id,title,content,is_submitted,is_confirmed)
            VALUES(c,s,m,'용량 작품 '||i,repeat('가나다라마바사🌱',2500),TRUE,TRUE) RETURNING id INTO p;
        posts:=posts||to_jsonb(p);
    END LOOP;
    PERFORM set_config('test.frozen_teacher',t::TEXT,TRUE); PERFORM set_config('test.frozen_auth',a::TEXT,TRUE);
    PERFORM set_config('test.frozen_class',c::TEXT,TRUE); PERFORM set_config('test.frozen_posts',posts::TEXT,TRUE);
    PERFORM set_config('test.frozen_ex',gen_random_uuid()::TEXT,TRUE);
    PERFORM set_config('app.bypass_profile_protection','false',TRUE);
END; $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.frozen_teacher'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.frozen_teacher'),'role','authenticated')::TEXT,TRUE);
DO $$
DECLARE c UUID:=current_setting('test.frozen_class')::UUID; e UUID:=current_setting('test.frozen_ex')::UUID;
    source JSONB; p TEXT; items JSONB:='[]'; share_items JSONB; payload JSONB; result JSONB; denied BOOLEAN;
BEGIN
    PERFORM public.run_class_agit_action_v1(c,'create',jsonb_build_object('exhibition_id',e));
    FOR p IN SELECT jsonb_array_elements_text(current_setting('test.frozen_posts')::JSONB) LOOP
        source:=public.get_class_agit_source_v1(c,p::UUID)->'source';
        items:=items||jsonb_build_array(jsonb_build_object('sourceId',p,'sourceRevision',source->>'source_revision','publicAlias','별 작가','classAcknowledged',TRUE));
    END LOOP;
    PERFORM public.run_class_agit_action_v1(c,'save',jsonb_build_object('exhibition_id',e,'expected_revision',1,'title','고정 전시','introduction','고정 소개','items',items));
    PERFORM public.run_class_agit_action_v1(c,'publish',jsonb_build_object('exhibition_id',e,'expected_revision',2,'confirmed',TRUE));
    result:=public.get_class_agit_share_workspace_v1(c,e);
    SELECT jsonb_agg(jsonb_build_object('itemId',x->>'itemId','sourceRevision',x->>'sourceRevision','publicAlias','별 작가','externalConfirmed',TRUE))
        INTO share_items FROM jsonb_array_elements(result->'candidates') x;
    payload:=jsonb_build_object('token',repeat('f',64),'starts_at',now(),'expires_at',now()+INTERVAL '720 hours',
        'confirmed',TRUE,'expected_revision',0,'exhibition_revision',3,'title','고정 외부 전시','items',share_items);
    FOREACH p IN ARRAY ARRAY[(now()+INTERVAL '720 hours 1 second')::TEXT,now()::TEXT,'infinity','not-a-date'] LOOP
        denied:=FALSE;
        BEGIN PERFORM public.run_class_agit_share_action_v1(c,e,'publish',jsonb_set(payload,'{expires_at}',to_jsonb(p)));
            EXCEPTION WHEN invalid_parameter_value OR invalid_datetime_format THEN denied:=TRUE; END;
        IF NOT denied THEN RAISE EXCEPTION 'invalid period accepted: %',p; END IF;
    END LOOP;
    result:=public.run_class_agit_share_action_v1(c,e,'publish',payload);
    IF result->'share'->>'starts_at' IS NULL OR jsonb_array_length(result->'published_items')<>13 THEN RAISE EXCEPTION 'frozen publish failed'; END IF;
    PERFORM set_config('test.frozen_payload',payload::TEXT,TRUE);
END; $$;
RESET ROLE;

DO $$ DECLARE r TEXT; BEGIN
    FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
        IF has_function_privilege(r,'public.read_public_class_agit_v1(text,integer,text,integer)','EXECUTE')
            OR has_function_privilege(r,'public.take_class_agit_public_read_budget_v1(text)','EXECUTE') THEN RAISE EXCEPTION 'gateway bypass role %',r; END IF;
    END LOOP;
    FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
        IF has_table_privilege(r,'public.class_agit_published_items','SELECT') OR has_table_privilege(r,'public.class_agit_publication_slots','SELECT')
            OR has_table_privilege(r,'public.class_agit_publication_catalog','SELECT') THEN RAISE EXCEPTION 'private table exposed: %',r; END IF;
    END LOOP;
    IF to_regprocedure('public.class_agit_visible_works_v1(uuid,uuid)') IS NOT NULL THEN RAISE EXCEPTION 'old reader survived'; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.read_public_class_agit_v1(text,integer,text,integer)'::regprocedure AND provolatile='s') THEN RAISE EXCEPTION 'read snapshot is not stable'; END IF;
END; $$;

-- Persist hashes before ordinary edits; neither bodies nor layout metadata may change.
SELECT set_config('test.frozen_internal',(SELECT md5(jsonb_agg(to_jsonb(i) ORDER BY work_no)::TEXT) FROM public.class_agit_published_items i WHERE exhibition_id=current_setting('test.frozen_ex')::UUID),TRUE);
SELECT set_config('test.frozen_external',(SELECT md5(jsonb_agg(to_jsonb(i) ORDER BY position)::TEXT) FROM public.class_agit_external_items i WHERE share_id=current_setting('test.frozen_ex')::UUID),TRUE);
UPDATE public.student_posts SET title='수정한 제목',content='발행 이후 완전히 바뀐 원본',updated_at=clock_timestamp() WHERE id=(current_setting('test.frozen_posts')::JSONB->>0)::UUID;
UPDATE public.students SET name='수정한 실명' WHERE auth_id=current_setting('test.frozen_auth')::UUID;
SAVEPOINT mission_format;
UPDATE public.writing_missions SET title='수정한 미션 제목',input_template='report' WHERE id=(SELECT mission_id FROM public.student_posts WHERE id=(current_setting('test.frozen_posts')::JSONB->>0)::UUID);
DO $$ BEGIN
    IF current_setting('test.frozen_internal') IS DISTINCT FROM (SELECT md5(jsonb_agg(to_jsonb(i) ORDER BY work_no)::TEXT) FROM public.class_agit_published_items i WHERE exhibition_id=current_setting('test.frozen_ex')::UUID)
        OR current_setting('test.frozen_external') IS DISTINCT FROM (SELECT md5(jsonb_agg(to_jsonb(i) ORDER BY position)::TEXT) FROM public.class_agit_external_items i WHERE share_id=current_setting('test.frozen_ex')::UUID)
        THEN RAISE EXCEPTION 'ordinary edit changed frozen edition'; END IF;
END; $$;

-- Instrument the original reader to fail. Every public/student/teacher viewing path must still work.
SAVEPOINT no_source_reads;
CREATE OR REPLACE FUNCTION public.class_agit_current_source_v1(p_class_id UUID,p_post_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'source reader called during exhibition viewing'; END; $$;
SET LOCAL ROLE service_role;
DO $$ DECLARE result JSONB; BEGIN
    IF public.take_class_agit_public_read_budget_v1(repeat('f',64))->>'allowed'<>'true' THEN RAISE EXCEPTION 'budget failed'; END IF;
    result:=public.read_public_class_agit_v1(repeat('f',64),2);
    IF result->>'total_count'<>'13' OR jsonb_array_length(result->'items')<>1 OR result::TEXT ~ 'blocks|비공개 실명|수정한 실명|post_id|class_id' THEN RAISE EXCEPTION 'frozen room budget/privacy'; END IF;
    result:=public.read_public_class_agit_v1(repeat('f',64),1,'published-1',1);
    IF result->'work'->>'title'<>'용량 작품 1' OR char_length(result->'work'->'blocks'->>0)<>20000 THEN RAISE EXCEPTION 'external content changed'; END IF;
    IF public.read_public_class_agit_v1(repeat('f',64),1,'published-1',2)->>'error'<>'changed' THEN RAISE EXCEPTION 'stale edition allowed'; END IF;
END; $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.frozen_auth'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.frozen_auth'),'role','authenticated')::TEXT,TRUE);
DO $$ DECLARE e UUID:=current_setting('test.frozen_ex')::UUID; c UUID:=current_setting('test.frozen_class')::UUID; result JSONB; BEGIN
    IF jsonb_array_length(public.get_my_class_agit_exhibitions_v1()->'exhibitions')<>1 THEN RAISE EXCEPTION 'student listing'; END IF;
    IF public.get_my_class_agit_room_v1(e,2)->>'total_count'<>'13' THEN RAISE EXCEPTION 'student room'; END IF;
    result:=public.get_my_class_agit_work_v1(e,1,'published-1');
    IF result->'work'->>'title'<>'용량 작품 1' OR result->'work'->>'author'<>'비공개 실명' THEN RAISE EXCEPTION 'internal frozen title/author'; END IF;
    IF jsonb_array_length(public.get_class_agit_publication_v1(c,e,1)->'exhibition'->'works')<>12 THEN RAISE EXCEPTION 'legacy publication'; END IF;
END; $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT no_source_reads;
RELEASE SAVEPOINT no_source_reads;
ROLLBACK TO SAVEPOINT mission_format;
RELEASE SAVEPOINT mission_format;

-- Privacy loss removes stable IDs and reflows only small slots. Restoration never revives them.
SAVEPOINT privacy;
UPDATE public.student_posts SET is_submitted=FALSE,is_confirmed=FALSE WHERE id=(current_setting('test.frozen_posts')::JSONB->>0)::UUID;
SET LOCAL ROLE service_role;
DO $$ DECLARE result JSONB; BEGIN
    result:=public.read_public_class_agit_v1(repeat('f',64),1);
    IF result->>'total_count'<>'12' OR jsonb_array_length(result->'rooms')<>1 OR result->'items'->0->>'id'<>'published-2' THEN RAISE EXCEPTION 'withdraw reflow'; END IF;
    IF public.read_public_class_agit_v1(repeat('f',64),1,'published-1',1)->>'error'<>'unavailable' THEN RAISE EXCEPTION 'withdrawn detail readable'; END IF;
END; $$;
RESET ROLE;
UPDATE public.student_posts SET is_submitted=TRUE,is_confirmed=TRUE WHERE id=(current_setting('test.frozen_posts')::JSONB->>0)::UUID;
DO $$ BEGIN IF public.read_public_class_agit_v1(repeat('f',64),0)->>'total_count'<>'12' THEN RAISE EXCEPTION 'withdraw auto revived'; END IF; END; $$;
UPDATE public.students SET is_active=FALSE WHERE auth_id=current_setting('test.frozen_auth')::UUID;
DO $$ BEGIN IF public.read_public_class_agit_v1(repeat('f',64),0)->>'total_count'<>'0' THEN RAISE EXCEPTION 'student deactivation'; END IF; END; $$;
ROLLBACK TO SAVEPOINT privacy;
RELEASE SAVEPOINT privacy;

-- Time boundary checks are server-side, independent of browser clocks or a scheduler.
SAVEPOINT period;
UPDATE public.class_agit_external_shares SET starts_at=now()+INTERVAL '1 day',expires_at=now()+INTERVAL '2 days' WHERE id=current_setting('test.frozen_ex')::UUID;
DO $$ BEGIN
    IF public.read_public_class_agit_v1(repeat('f',64),0)->>'error'<>'unavailable' OR public.take_class_agit_public_read_budget_v1(repeat('f',64))->>'error'<>'unavailable' THEN RAISE EXCEPTION 'scheduled share open early'; END IF;
END; $$;
UPDATE public.class_agit_external_shares SET starts_at=now()-INTERVAL '1 day',expires_at=now() WHERE id=current_setting('test.frozen_ex')::UUID;
DO $$ BEGIN IF public.read_public_class_agit_v1(repeat('f',64),0)->>'error'<>'unavailable' THEN RAISE EXCEPTION 'expired share readable'; END IF; END; $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE denied BOOLEAN:=FALSE; BEGIN
    BEGIN PERFORM public.run_class_agit_share_action_v1(current_setting('test.frozen_class')::UUID,current_setting('test.frozen_ex')::UUID,'extend',
        jsonb_build_object('expected_revision',1,'expires_at',now()+INTERVAL '1 hour')); EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'expired share renewed without publication'; END IF;
END; $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT period;
RELEASE SAVEPOINT period;

SET LOCAL ROLE authenticated;
DO $$ DECLARE c UUID:=current_setting('test.frozen_class')::UUID; e UUID:=current_setting('test.frozen_ex')::UUID; result JSONB; denied BOOLEAN:=FALSE; BEGIN
    BEGIN PERFORM public.run_class_agit_share_action_v1(c,e,'extend',jsonb_build_object('expected_revision',1,'expires_at',now()+INTERVAL '721 hours'));
        EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'rolling extension exceeded original 30 days'; END IF;
    result:=public.run_class_agit_share_action_v1(c,e,'rotate',jsonb_build_object('expected_revision',1,'token',repeat('e',64)));
    IF (result->'share'->>'expires_at')::TIMESTAMPTZ<>now()+INTERVAL '720 hours' OR (result->'share'->>'starts_at')::TIMESTAMPTZ<>now() THEN RAISE EXCEPTION 'rotation changed exhibition window'; END IF;
END; $$;
RESET ROLE;
DO $$ BEGIN
    IF public.read_public_class_agit_v1(repeat('f',64),0)->>'error'<>'unavailable' OR public.read_public_class_agit_v1(repeat('e',64),0)->>'total_count'<>'13' THEN RAISE EXCEPTION 'rotation gate'; END IF;
END; $$;

SAVEPOINT batch_recall;
SELECT set_config('test.frozen_revisions',(SELECT jsonb_object_agg(scope,visibility_revision)::TEXT FROM public.class_agit_publication_catalog WHERE class_id=current_setting('test.frozen_class')::UUID AND exhibition_id=current_setting('test.frozen_ex')::UUID),TRUE);
UPDATE public.student_posts SET is_submitted=FALSE,is_confirmed=FALSE WHERE class_id=current_setting('test.frozen_class')::UUID
    AND id IN ((current_setting('test.frozen_posts')::JSONB->>0)::UUID,(current_setting('test.frozen_posts')::JSONB->>1)::UUID);
DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM public.class_agit_publication_catalog WHERE class_id=current_setting('test.frozen_class')::UUID AND exhibition_id=current_setting('test.frozen_ex')::UUID
        AND (total_count<>11 OR visibility_revision<>(current_setting('test.frozen_revisions')::JSONB->>scope)::INTEGER+1))
        THEN RAISE EXCEPTION 'batch withdrawal did not rebuild each catalog exactly once'; END IF;
END; $$;
ROLLBACK TO SAVEPOINT batch_recall;
RELEASE SAVEPOINT batch_recall;

SAVEPOINT atomic_recall;
CREATE OR REPLACE FUNCTION public.class_agit_refresh_catalog_v1(p_class_id UUID,p_exhibition_id UUID,p_scope TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'synthetic catalog failure'; END; $$;
DO $$ DECLARE denied BOOLEAN:=FALSE; BEGIN
    BEGIN UPDATE public.student_posts SET is_submitted=FALSE,is_confirmed=FALSE WHERE id=(current_setting('test.frozen_posts')::JSONB->>1)::UUID;
        EXCEPTION WHEN raise_exception THEN denied:=TRUE; END;
    IF NOT denied OR NOT (SELECT is_submitted FROM public.student_posts WHERE id=(current_setting('test.frozen_posts')::JSONB->>1)::UUID)
        OR public.read_public_class_agit_v1(repeat('e',64),0)->>'total_count'<>'13'
        THEN RAISE EXCEPTION 'source mutation and publication revocation were not atomic'; END IF;
END; $$;
ROLLBACK TO SAVEPOINT atomic_recall;
RELEASE SAVEPOINT atomic_recall;

-- The writing core currently forbids provenance reassignment even for the owner.
-- A rejected change must not leave a half-revoked publication behind.
DO $$ DECLARE denied BOOLEAN:=FALSE; BEGIN
    BEGIN UPDATE public.student_posts SET mission_id=(SELECT mission_id FROM public.student_posts WHERE id=(current_setting('test.frozen_posts')::JSONB->>12)::UUID)
        WHERE id=(current_setting('test.frozen_posts')::JSONB->>1)::UUID;
        EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied OR public.read_public_class_agit_v1(repeat('e',64),0)->>'total_count'<>'13' THEN RAISE EXCEPTION 'provenance guard/atomicity'; END IF;
END; $$;

SAVEPOINT mission_delete;
DELETE FROM public.writing_missions WHERE id=(SELECT mission_id FROM public.student_posts WHERE id=(current_setting('test.frozen_posts')::JSONB->>12)::UUID);
DO $$ BEGIN
    IF public.read_public_class_agit_v1(repeat('e',64),0)->>'total_count'<>'12'
        OR public.read_public_class_agit_v1(repeat('e',64),2,'published-13',1)->>'error'<>'unavailable' THEN RAISE EXCEPTION 'deleted mission readable'; END IF;
END; $$;
ROLLBACK TO SAVEPOINT mission_delete;
RELEASE SAVEPOINT mission_delete;
