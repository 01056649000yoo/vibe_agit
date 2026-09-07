-- 합성 자료만 사용. 실행기가 전체를 ROLLBACK하거나 격리 DB를 제거한다.
-- 번호가 진짜 값이 되는지, 이름을 고쳐도 기록이 이어지는지 본다.
DO $$
DECLARE
    t UUID:=gen_random_uuid(); c UUID:=gen_random_uuid(); camp UUID:=gen_random_uuid();
    a1 UUID:=gen_random_uuid(); a2 UUID:=gen_random_uuid(); a3 UUID:=gen_random_uuid();
    s1 UUID:=gen_random_uuid(); s2 UUID:=gen_random_uuid(); s3 UUID:=gen_random_uuid();
    sp UUID:=gen_random_uuid(); post1 UUID:=gen_random_uuid(); bk UUID:=gen_random_uuid();
    s_new UUID; r JSONB; got TEXT; denied BOOLEAN;
BEGIN
    PERFORM set_config('app.bypass_profile_protection','true',TRUE);
    INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES
        (t,'no-'||t||'@example.invalid','{}','{}'),(a1,'no-'||a1||'@example.invalid','{}','{}'),
        (a2,'no-'||a2||'@example.invalid','{}','{}'),(a3,'no-'||a3||'@example.invalid','{}','{}');
    INSERT INTO public.profiles(id,role,is_approved) VALUES
        (t,'TEACHER',TRUE),(a1,'STUDENT',TRUE),(a2,'STUDENT',TRUE),(a3,'STUDENT',TRUE)
        ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,is_approved=TRUE;
    INSERT INTO public.teachers(id,name,school_name) VALUES(t,'합성 교사','시험 학교');
    INSERT INTO public.classes(id,teacher_id,name,enabled_modules)
        VALUES(c,t,'번호 합성 학급',ARRAY['__configured__','reading-log']);

    -- 등록한 순서대로 1·2·3번이 붙어야 한다(선생님이 보던 순서가 갑자기 바뀌면 안 된다).
    INSERT INTO public.students(id,class_id,name,student_code,auth_id,created_at) VALUES
        (s1,c,'최윤',   left(s1::TEXT,8)||'N01',a1, now()-INTERVAL '3 hours'),
        (s2,c,'박별하', left(s2::TEXT,8)||'N02',a2, now()-INTERVAL '2 hours'),
        (s3,c,'김가온', left(s3::TEXT,8)||'N03',a3, now()-INTERVAL '1 hour');
    PERFORM set_config('app.bypass_profile_protection','false',TRUE);

    SELECT string_agg(student_no::TEXT,',' ORDER BY created_at) INTO got
      FROM public.students WHERE class_id=c AND deleted_at IS NULL;
    IF got <> '1,2,3' THEN RAISE EXCEPTION '새 학생 번호가 등록순 1,2,3 이어야 하는데 % 입니다', got; END IF;

    PERFORM set_config('request.jwt.claim.sub',t::TEXT,TRUE);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',t::TEXT,'role','authenticated')::TEXT,TRUE);

    -- 1) 가나다순 다시 매기기: 김가온 1 · 박별하 2 · 최윤 3
    r := public.renumber_class_students_v1(c,'name');
    SELECT string_agg(name||':'||student_no,' ' ORDER BY student_no) INTO got
      FROM public.students WHERE class_id=c AND deleted_at IS NULL;
    IF got <> '김가온:1 박별하:2 최윤:3'
    THEN RAISE EXCEPTION '가나다순 번호가 어긋납니다: %', got; END IF;

    -- 2) 번호 맞바꾸기: 한 줄씩 고치면 겹쳐서 막히므로 한꺼번에 받아야 한다.
    r := public.set_class_student_numbers_v1(c, jsonb_build_array(
        jsonb_build_object('id',s3,'no',3), jsonb_build_object('id',s1,'no',1)));
    SELECT string_agg(name||':'||student_no,' ' ORDER BY student_no) INTO got
      FROM public.students WHERE class_id=c AND deleted_at IS NULL;
    IF got <> '최윤:1 박별하:2 김가온:3'
    THEN RAISE EXCEPTION '번호 맞바꾸기가 어긋납니다: %', got; END IF;

    -- 3) 남의 번호를 조용히 빼앗지 않는다.
    denied := FALSE;
    BEGIN PERFORM public.set_class_student_numbers_v1(c, jsonb_build_array(jsonb_build_object('id',s1,'no',2)));
    EXCEPTION WHEN unique_violation THEN denied := TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION '이미 쓰는 번호를 그대로 받아들였습니다'; END IF;

    -- 4) 한 학생을 지웠다가 되살리면 빈 번호를 받는다(맨 뒤로 밀리지 않는다).
    UPDATE public.students SET deleted_at=now() WHERE id=s2;
    INSERT INTO public.students(class_id,name,student_code,created_at)
        VALUES(c,'새로 온 학생',left(gen_random_uuid()::TEXT,8)||'N04',now()) RETURNING id INTO s_new;
    SELECT student_no INTO got FROM public.students WHERE id=s_new;
    IF got <> '2' THEN RAISE EXCEPTION '빈 2번을 받아야 하는데 %번을 받았습니다', got; END IF;
    UPDATE public.students SET deleted_at=NULL WHERE id=s2;
    SELECT student_no INTO got FROM public.students WHERE id=s2;
    IF got <> '4' THEN RAISE EXCEPTION '되살린 학생은 남은 4번을 받아야 하는데 %번입니다', got; END IF;

    -- 5) 이름 고치기: 기록은 학생 id 로 이어지고, 마라톤 명단의 사본까지 함께 고친다.
    PERFORM set_config('app.bypass_profile_protection','true',TRUE);
    INSERT INTO public.reading_marathon_campaigns(id,class_id,title,target_distance_m,meters_per_page,status,started_at,
            teacher_id,competition_type,medal_requirement_type,medal_requirement_value)
        VALUES(camp,c,'합성 마라톤',100000,10,'active',now()-INTERVAL '1 day',t,'individual','none',0);
    INSERT INTO public.reading_marathon_participants(campaign_id,class_id,student_id,name_snapshot)
        VALUES(camp,c,s1,'최윤');
    -- 실명을 복사해 두는 나머지 두 곳도 만들어 둔다(이웃 아지트 공유글·글꽃 책방 작품).
    INSERT INTO public.neighbor_spaces(id,name,host_class_id,status,created_by)
        VALUES(sp,'합성 이웃 공간',c,'active',t);
    INSERT INTO public.student_posts(id,class_id,student_id,title,content,writing_context,self_writing_type,
            is_submitted,published_at,char_count)
        VALUES(post1,c,s1,'합성 글','본문','self','reading_log',TRUE,now(),100);
    -- 이웃 공유는 학급 공개 글이면서 공간에 참여 중일 때만 실린다.
    UPDATE public.student_posts SET visibility='class' WHERE id=post1;
    INSERT INTO public.neighbor_space_classes(space_id,class_id,role,status,public_class_name,student_access_enabled,joined_at)
        VALUES(sp,c,'host','active','합성 학급',TRUE,now());
    INSERT INTO public.neighbor_shared_posts(space_id,class_id,post_id,student_id,public_author_name,status,
            reviewed_at,reviewed_by,published_at)
        VALUES(sp,c,post1,s1,'최윤','published',now(),t,now());
    INSERT INTO public.class_agit_books(id,class_id,title) VALUES(bk,c,'합성 문집');
    INSERT INTO public.class_agit_book_items(class_id,book_id,post_id,student_id,position,source_revision,snapshot)
        VALUES(c,bk,post1,s1,1,repeat('a',64),jsonb_build_object('title','합성 글','author','최윤','blocks','[]'::JSONB));
    PERFORM set_config('app.bypass_profile_protection','false',TRUE);

    r := public.rename_class_student_v1(s1,'최윤슬');
    SELECT name INTO got FROM public.students WHERE id=s1;
    IF got <> '최윤슬' THEN RAISE EXCEPTION '이름이 바뀌지 않았습니다: %', got; END IF;
    SELECT name_snapshot INTO got FROM public.reading_marathon_participants
     WHERE campaign_id=camp AND student_id=s1;
    IF got <> '최윤슬' THEN RAISE EXCEPTION '마라톤 명단에 옛 이름이 남았습니다: %', got; END IF;
    SELECT public_author_name INTO got FROM public.neighbor_shared_posts WHERE student_id=s1;
    IF got <> '최윤슬' THEN RAISE EXCEPTION '이웃 아지트 공유글에 옛 이름이 남았습니다: %', got; END IF;
    SELECT snapshot->>'author' INTO got FROM public.class_agit_book_items WHERE student_id=s1;
    IF got <> '최윤슬' THEN RAISE EXCEPTION '글꽃 책방 작품에 옛 이름이 남았습니다: %', got; END IF;
    -- 번호는 그대로여야 한다(이름을 고쳤다고 자리가 바뀌면 안 된다).
    SELECT student_no INTO got FROM public.students WHERE id=s1;
    IF got <> '1' THEN RAISE EXCEPTION '이름을 고쳤더니 번호가 %번으로 바뀌었습니다', got; END IF;

    -- 6) 빈 이름·너무 긴 이름은 막는다.
    denied := FALSE;
    BEGIN PERFORM public.rename_class_student_v1(s1,'   ');
    EXCEPTION WHEN OTHERS THEN denied := TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION '빈 이름을 받아들였습니다'; END IF;

    RAISE NOTICE '학급 번호: 등록순 부여·가나다순 재부여·맞바꾸기·중복 거절·되살리기 빈자리·이름 고치기와 마라톤 사본 동기화 통과';
END; $$;

-- 7) 남의 학급 명단은 건드릴 수 없다(브라우저 역할로 확인한다).
DO $$
DECLARE t2 UUID:=gen_random_uuid(); c2 UUID:=gen_random_uuid();
BEGIN
    PERFORM set_config('app.bypass_profile_protection','true',TRUE);
    INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES(t2,'no2-'||t2||'@example.invalid','{}','{}');
    INSERT INTO public.profiles(id,role,is_approved) VALUES(t2,'TEACHER',TRUE)
        ON CONFLICT(id) DO UPDATE SET role='TEACHER',is_approved=TRUE;
    INSERT INTO public.teachers(id,name,school_name) VALUES(t2,'남의 교사','다른 학교');
    INSERT INTO public.classes(id,teacher_id,name,enabled_modules) VALUES(c2,t2,'남의 학급',ARRAY['__configured__']);
    PERFORM set_config('app.bypass_profile_protection','false',TRUE);
    PERFORM set_config('test.no_other_teacher',t2::TEXT,TRUE);
    PERFORM set_config('test.no_victim_class',
        (SELECT id::TEXT FROM public.classes WHERE name='번호 합성 학급' LIMIT 1),TRUE);
    PERFORM set_config('test.no_victim_student',
        (SELECT s.id::TEXT FROM public.students s JOIN public.classes cl ON cl.id=s.class_id
          WHERE cl.name='번호 합성 학급' AND s.deleted_at IS NULL ORDER BY s.student_no LIMIT 1),TRUE);
END; $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.no_other_teacher'),TRUE);
SELECT set_config('request.jwt.claims',
    jsonb_build_object('sub',current_setting('test.no_other_teacher'),'role','authenticated')::TEXT,TRUE);
DO $$
DECLARE victim UUID:=current_setting('test.no_victim_class')::UUID; denied BOOLEAN:=FALSE;
BEGIN
    BEGIN PERFORM public.renumber_class_students_v1(victim,'name');
    EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION '누출: 남의 학급 번호를 다시 매겼습니다'; END IF;

    denied:=FALSE;
    BEGIN PERFORM public.rename_class_student_v1(current_setting('test.no_victim_student')::UUID,'침입');
    EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION '누출: 남의 학급 학생 이름을 고쳤습니다'; END IF;

    RAISE NOTICE '학급 번호: 남의 학급 명단은 번호도 이름도 고칠 수 없다';
END; $$;
RESET ROLE;
