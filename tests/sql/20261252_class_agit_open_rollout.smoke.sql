-- 합성 자료만 사용. 실행기가 전체를 ROLLBACK하거나 격리 DB를 제거한다.
DO $$
DECLARE admin UUID:=gen_random_uuid(); t1 UUID:=gen_random_uuid(); t2 UUID:=gen_random_uuid(); pending UUID:=gen_random_uuid();
 ca UUID:=gen_random_uuid(); c1 UUID:=gen_random_uuid(); c2 UUID:=gen_random_uuid(); cp UUID:=gen_random_uuid(); cdel UUID:=gen_random_uuid();
 r JSONB; denied BOOLEAN;
BEGIN
 PERFORM set_config('app.bypass_profile_protection','true',TRUE);
 INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES
  (admin,'open-'||admin||'@example.invalid','{}','{}'),(t1,'open-'||t1||'@example.invalid','{}','{}'),
  (t2,'open-'||t2||'@example.invalid','{}','{}'),(pending,'open-'||pending||'@example.invalid','{}','{}');
 INSERT INTO public.profiles(id,role,is_approved) VALUES(admin,'ADMIN',TRUE),(t1,'TEACHER',TRUE),(t2,'TEACHER',TRUE),(pending,'TEACHER',FALSE)
  ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,is_approved=EXCLUDED.is_approved;
 INSERT INTO public.teachers(id,name,school_name) VALUES(admin,'합성 관리자','시험 학교'),(t1,'교사 하나','시험 학교'),(t2,'교사 둘','시험 학교'),(pending,'미승인 교사','시험 학교');
 INSERT INTO public.classes(id,teacher_id,name,enabled_modules) VALUES
  (ca,admin,'관리자 학급',ARRAY['__configured__','class-agit']),(c1,t1,'교사1 학급',ARRAY['__configured__','class-agit']),
  (c2,t2,'교사2 학급',ARRAY['__configured__']),(cp,pending,'미승인 학급',ARRAY['__configured__','class-agit']);
 INSERT INTO public.classes(id,teacher_id,name,enabled_modules,deleted_at) VALUES(cdel,t1,'삭제 학급',ARRAY['__configured__','class-agit'],now());
 DELETE FROM public.class_agit_pilot_classes;
 PERFORM set_config('app.bypass_profile_protection','false',TRUE);

 -- internal: 관리자 학급만 열린다.
 UPDATE public.class_agit_rollout SET mode='internal' WHERE singleton;
 IF NOT public.class_agit_class_is_allowed_v1(ca) OR public.class_agit_class_is_allowed_v1(c1)
 THEN RAISE EXCEPTION 'internal stage changed'; END IF;

 -- pilot: 지정한 학급만 열린다.
 UPDATE public.class_agit_rollout SET mode='pilot' WHERE singleton;
 INSERT INTO public.class_agit_pilot_classes(class_id) VALUES(c1);
 IF NOT public.class_agit_class_is_allowed_v1(c1) OR public.class_agit_class_is_allowed_v1(c2)
 THEN RAISE EXCEPTION 'pilot stage changed'; END IF;

 -- open: 승인된 교사·관리자의 학급은 지정 없이 열린다. 미승인·삭제 학급은 계속 막힌다.
 UPDATE public.class_agit_rollout SET mode='open' WHERE singleton;
 IF NOT public.class_agit_class_is_allowed_v1(c1) OR NOT public.class_agit_class_is_allowed_v1(c2)
    OR NOT public.class_agit_class_is_allowed_v1(ca)
 THEN RAISE EXCEPTION 'open stage did not open approved teachers'; END IF;
 IF public.class_agit_class_is_allowed_v1(cp) THEN RAISE EXCEPTION 'open stage let an unapproved teacher in'; END IF;
 IF public.class_agit_class_is_allowed_v1(cdel) THEN RAISE EXCEPTION 'open stage let a deleted class in'; END IF;
 -- 학급 모듈은 여전히 교사가 켜야 학생에게 열린다.
 IF NOT public.class_agit_class_is_open_v1(c1) THEN RAISE EXCEPTION 'module-on class should be open'; END IF;
 IF public.class_agit_class_is_open_v1(c2) THEN RAISE EXCEPTION 'open stage bypassed the per-class module switch'; END IF;

 -- disabled: 전부 막는다.
 UPDATE public.class_agit_rollout SET mode='disabled' WHERE singleton;
 IF public.class_agit_class_is_allowed_v1(c1) OR public.class_agit_class_is_allowed_v1(ca)
 THEN RAISE EXCEPTION 'disabled stage changed'; END IF;

 PERFORM set_config('test.open_admin',admin::TEXT,TRUE); PERFORM set_config('test.open_t1',t1::TEXT,TRUE);
 PERFORM set_config('test.open_c1',c1::TEXT,TRUE);
END; $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.open_t1'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.open_t1'),'role','authenticated')::TEXT,TRUE);
DO $$ DECLARE denied BOOLEAN:=FALSE; BEGIN
 -- 교사는 공개 단계를 바꿀 수 없다.
 BEGIN PERFORM public.manage_class_agit_rollout_v1(jsonb_build_object('mode','open','external_enabled',FALSE,'class_ids','[]'::JSONB,'expected_revision',1));
 EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
 IF NOT denied THEN RAISE EXCEPTION 'teacher changed the rollout stage'; END IF;
END; $$;

SELECT set_config('request.jwt.claim.sub',current_setting('test.open_admin'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.open_admin'),'role','authenticated')::TEXT,TRUE);
DO $$ DECLARE r JSONB; rev INTEGER; denied BOOLEAN; BEGIN
 r:=public.manage_class_agit_rollout_v1();
 rev:=(r->'settings'->>'revision')::INTEGER;
 -- 관리자는 open 으로 바꿀 수 있고 시범 목록 없이도 통과한다.
 r:=public.manage_class_agit_rollout_v1(jsonb_build_object('mode','open','external_enabled',FALSE,'class_ids','[]'::JSONB,'expected_revision',rev));
 IF r->'settings'->>'mode'<>'open' OR (r->'settings'->>'external_enabled')::BOOLEAN THEN RAISE EXCEPTION 'admin could not switch to open'; END IF;
 rev:=(r->'settings'->>'revision')::INTEGER;
 -- pilot 은 여전히 학급을 골라야 한다.
 denied:=FALSE;
 BEGIN PERFORM public.manage_class_agit_rollout_v1(jsonb_build_object('mode','pilot','external_enabled',FALSE,'class_ids','[]'::JSONB,'expected_revision',rev));
 EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE; END;
 IF NOT denied THEN RAISE EXCEPTION 'pilot without classes accepted'; END IF;
 -- 없는 단계는 거부한다.
 denied:=FALSE;
 BEGIN PERFORM public.manage_class_agit_rollout_v1(jsonb_build_object('mode','everyone','external_enabled',FALSE,'class_ids','[]'::JSONB,'expected_revision',rev));
 EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE; END;
 IF NOT denied THEN RAISE EXCEPTION 'unknown stage accepted'; END IF;
 -- 되돌리기: open 에서 pilot 으로 다시 갈 수 있다.
 r:=public.manage_class_agit_rollout_v1(jsonb_build_object('mode','pilot','external_enabled',FALSE,
    'class_ids',jsonb_build_array(current_setting('test.open_c1')),'expected_revision',rev));
 IF r->'settings'->>'mode'<>'pilot' OR jsonb_array_length(r->'class_ids')<>1 THEN RAISE EXCEPTION 'rollback to pilot failed'; END IF;
 RAISE NOTICE 'Open rollout: stage matrix, per-class module switch, admin-only control and pilot rollback passed';
END; $$;
RESET ROLE;
