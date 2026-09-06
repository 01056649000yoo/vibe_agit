-- 합성 자료만 사용. 실행기가 전체를 ROLLBACK하거나 격리 DB를 제거한다.
-- 승인 대기 학급이 공간의 다른 학급 자료를 받지 못하는지 확인한다.
DO $$
DECLARE
    host_t UUID:=gen_random_uuid(); guest_t UUID:=gen_random_uuid(); wait_t UUID:=gen_random_uuid();
    host_c UUID:=gen_random_uuid(); guest_c UUID:=gen_random_uuid(); wait_c UUID:=gen_random_uuid();
    stu UUID:=gen_random_uuid(); stu_auth UUID:=gen_random_uuid();
    sp UUID:=gen_random_uuid(); r JSONB;
BEGIN
    PERFORM set_config('app.bypass_profile_protection','true',TRUE);
    INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES
        (host_t,'pend-'||host_t||'@example.invalid','{}','{}'),
        (guest_t,'pend-'||guest_t||'@example.invalid','{}','{}'),
        (wait_t,'pend-'||wait_t||'@example.invalid','{}','{}'),
        (stu_auth,'pend-'||stu_auth||'@example.invalid','{}','{}');
    INSERT INTO public.profiles(id,role,is_approved) VALUES
        (host_t,'TEACHER',TRUE),(guest_t,'TEACHER',TRUE),(wait_t,'TEACHER',TRUE),(stu_auth,'STUDENT',TRUE)
        ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,is_approved=TRUE;
    INSERT INTO public.teachers(id,name,school_name) VALUES
        (host_t,'호스트 교사','시험 학교'),(guest_t,'게스트 교사','시험 학교'),(wait_t,'대기 교사','다른 학교');
    INSERT INTO public.classes(id,teacher_id,name,enabled_modules) VALUES
        (host_c,host_t,'호스트 학급',ARRAY['__configured__','neighbor-agit']),
        (guest_c,guest_t,'게스트 학급',ARRAY['__configured__','neighbor-agit']),
        (wait_c,wait_t,'대기 학급',ARRAY['__configured__','neighbor-agit']);
    INSERT INTO public.students(id,class_id,name,student_code,auth_id)
        VALUES(stu,guest_c,'김보람',left(stu::TEXT,8)||'PND',stu_auth);
    -- 세 학급 모두 이웃 기능 대상으로 등록해 다른 관문에 먼저 막히지 않게 한다.
    UPDATE public.neighbor_rollout_state SET mode='limited_beta';
    INSERT INTO public.neighbor_limited_classes(class_id,enabled_by) VALUES(host_c,host_t),(guest_c,host_t),(wait_c,host_t)
        ON CONFLICT DO NOTHING;
    INSERT INTO public.neighbor_spaces(id,name,host_class_id,status,created_by)
        VALUES(sp,'합성 이웃 공간',host_c,'active',host_t);
    INSERT INTO public.neighbor_space_classes(space_id,class_id,role,status,public_class_name,student_access_enabled,joined_at) VALUES
        (sp,host_c,'host','active','호스트 학급',TRUE,now()),
        (sp,guest_c,'guest','active','게스트 학급',TRUE,now()),
        (sp,wait_c,'guest','pending','대기 학급',FALSE,NULL);
    PERFORM set_config('app.bypass_profile_protection','false',TRUE);

    -- 승인 대기 교사로 조회한다.
    PERFORM set_config('request.jwt.claim.sub',wait_t::TEXT,TRUE);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',wait_t::TEXT,'role','authenticated')::TEXT,TRUE);
    r := public.get_neighbor_teacher_workspace_v1(wait_c);

    IF r->'space'->>'my_status' <> 'pending' THEN RAISE EXCEPTION 'pending status not reported: %', r->'space'; END IF;
    IF r->'space'->>'name' IS NULL THEN RAISE EXCEPTION 'pending teacher cannot see which space they applied to'; END IF;
    -- 핵심: 다른 학급 자료가 하나도 없어야 한다.
    IF jsonb_array_length(COALESCE(r->'memberships','[]'::JSONB)) <> 0
    THEN RAISE EXCEPTION 'pending class received the member roster: %', r->'memberships'; END IF;
    IF jsonb_array_length(COALESCE(r->'public_posts','[]'::JSONB)) <> 0
    THEN RAISE EXCEPTION 'pending class received published posts'; END IF;
    IF jsonb_array_length(COALESCE(r->'review_posts','[]'::JSONB)) <> 0
    THEN RAISE EXCEPTION 'pending class received review posts'; END IF;
    IF jsonb_array_length(COALESCE(r->'activities','[]'::JSONB)) <> 0
    THEN RAISE EXCEPTION 'pending class received the activity list'; END IF;
    -- 다른 학급의 내부 식별자가 응답 어디에도 없어야 한다.
    IF r::TEXT LIKE '%'||host_c::TEXT||'%' OR r::TEXT LIKE '%'||guest_c::TEXT||'%'
    THEN RAISE EXCEPTION 'pending class received another class id'; END IF;

    -- 승인하면 정상적으로 열린다(기능을 망가뜨리지 않았는지).
    PERFORM set_config('app.bypass_profile_protection','true',TRUE);
    UPDATE public.neighbor_space_classes SET status='active', joined_at=now() WHERE space_id=sp AND class_id=wait_c;
    PERFORM set_config('app.bypass_profile_protection','false',TRUE);
    r := public.get_neighbor_teacher_workspace_v1(wait_c);
    IF r->'space'->>'my_status' <> 'active' THEN RAISE EXCEPTION 'approval did not open the space'; END IF;
    IF jsonb_array_length(COALESCE(r->'memberships','[]'::JSONB)) < 3
    THEN RAISE EXCEPTION 'approved class should see the roster: %', r->'memberships'; END IF;

    RAISE NOTICE 'Pending membership: roster/posts/activities withheld before approval and restored after it';
END; $$;
