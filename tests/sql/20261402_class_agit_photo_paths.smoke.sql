-- Synthetic data only; the runner wraps this file in a rollback transaction.
-- 사진 자리표의 사진ID → 복사본 경로: 읽을 수 있는 사람에게만 경로를 준다(20261402).
DO $$
DECLARE t UUID:=gen_random_uuid(); o UUID:=gen_random_uuid(); st UUID:=gen_random_uuid(); c UUID:=gen_random_uuid(); oc UUID:=gen_random_uuid();
    s UUID:=gen_random_uuid(); m UUID; p UUID:=gen_random_uuid(); ph UUID:=gen_random_uuid();
BEGIN
    PERFORM set_config('app.bypass_profile_protection','true',TRUE);
    INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) SELECT x,'pp-'||x||'@example.invalid','{}','{}' FROM unnest(ARRAY[t,o,st]) x;
    INSERT INTO public.profiles(id,role,is_approved) VALUES(t,'TEACHER',TRUE),(o,'TEACHER',TRUE),(st,'STUDENT',TRUE)
        ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,is_approved=TRUE;
    INSERT INTO public.teachers(id,name,school_name) VALUES(t,'합성 교사','시험 학교'),(o,'다른 합성 교사','시험 학교');
    INSERT INTO public.classes(id,teacher_id,name,enabled_modules) VALUES(c,t,'경로 합성 학급',ARRAY['__configured__','class-agit']),
        (oc,o,'다른 경로 합성 학급',ARRAY['__configured__','class-agit']);
    UPDATE public.class_agit_rollout SET mode='pilot' WHERE singleton;
    DELETE FROM public.class_agit_pilot_classes;
    INSERT INTO public.class_agit_pilot_classes(class_id) VALUES(c),(oc);
    INSERT INTO public.students(id,class_id,name,student_code,auth_id) VALUES(s,c,'합성 학생',left(s::TEXT,8)||'PTH',st);
    INSERT INTO public.writing_missions(class_id,teacher_id,title,guide,genre,mission_type,input_template,min_chars,min_paragraphs,base_reward,bonus_reward)
        VALUES(c,t,'과제','합성 안내','글쓰기','report','report',1,1,0,0) RETURNING id INTO m;
    INSERT INTO public.student_posts(id,class_id,student_id,mission_id,title,content,is_submitted,is_confirmed,structured_content)
    VALUES(p,c,s,m,'사진 보고서','합성',TRUE,TRUE,jsonb_build_object('template','report','version',1,'sections',jsonb_build_array(
        jsonb_build_object('id','a','heading','칸','body','본문','image',jsonb_build_object('path',p||'/f1/img1.jpg','caption','사진','width',400,'height',300,'bytes',2000,'mimeType','image/jpeg')),
        jsonb_build_object('id','b','heading','칸','body','둘째','image',NULL))));
    -- 복사까지 끝난 사진 한 장(Edge 함수가 한 일을 흉내)
    INSERT INTO public.class_agit_item_photos(id,class_id,post_id,section_id,source_path,copy_path,mime_type,width,height,bytes,status,checked_by,copied_at)
    VALUES(ph,c,p,'a',p||'/f1/img1.jpg',c::TEXT||'/'||ph::TEXT||'.jpg','image/jpeg',400,300,2000,'copied',t,now());
    PERFORM set_config('test.pp_teacher',t::TEXT,TRUE); PERFORM set_config('test.pp_other',o::TEXT,TRUE); PERFORM set_config('test.pp_student',st::TEXT,TRUE);
    PERFORM set_config('test.pp_photo',ph::TEXT,TRUE); PERFORM set_config('test.pp_class',c::TEXT,TRUE);
    PERFORM set_config('app.bypass_profile_protection','false',TRUE);
END; $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.pp_teacher'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.pp_teacher'),'role','authenticated')::TEXT,TRUE);
DO $$
DECLARE ph UUID:=current_setting('test.pp_photo')::UUID; r JSONB; denied BOOLEAN;
BEGIN
    -- 담당 교사에게는 경로를 준다
    r:=public.get_class_agit_photo_paths_v1(ARRAY[ph,gen_random_uuid()]);
    IF jsonb_array_length(r->'photos')<>1 OR r->'photos'->0->>'path'<>current_setting('test.pp_class')||'/'||ph::TEXT||'.jpg' OR r->'photos'->0->>'id'<>ph::TEXT THEN
        RAISE EXCEPTION 'teacher paths %',r; END IF;
    -- 개수 제한
    denied:=FALSE; BEGIN PERFORM public.get_class_agit_photo_paths_v1(ARRAY[]::UUID[]); EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'empty list accepted'; END IF;
    -- 다른 학급 교사는 빈 목록
    PERFORM set_config('request.jwt.claim.sub',current_setting('test.pp_other'),TRUE);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.pp_other'),'role','authenticated')::TEXT,TRUE);
    IF jsonb_array_length(public.get_class_agit_photo_paths_v1(ARRAY[ph])->'photos')<>0 THEN RAISE EXCEPTION 'other class teacher got a path'; END IF;
    -- 학생: 아직 공개된 전시·책에 이 사진이 없으므로 빈 목록
    PERFORM set_config('request.jwt.claim.sub',current_setting('test.pp_student'),TRUE);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.pp_student'),'role','authenticated')::TEXT,TRUE);
    IF jsonb_array_length(public.get_class_agit_photo_paths_v1(ARRAY[ph])->'photos')<>0 THEN RAISE EXCEPTION 'student got an unpublished photo path'; END IF;
END; $$;
-- 로그인 없이는 부를 수 없다
RESET ROLE;
SET LOCAL ROLE anon;
DO $$
DECLARE denied BOOLEAN:=FALSE;
BEGIN
    BEGIN PERFORM public.get_class_agit_photo_paths_v1(ARRAY[gen_random_uuid()]); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'anon called the photo path function'; END IF;
END; $$;
