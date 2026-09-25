-- 실제 역할 RPC를 호출하고 시험 자료는 실행기가 전부 롤백한다.
DO $$
DECLARE
    ht UUID; gt UUID; hc UUID; gc UUID; sp UUID; r JSONB;
    topic UUID; mid UUID; sid UUID; saved_count INTEGER; scenario INTEGER; archived_time TIMESTAMPTZ;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.neighbor_activities a
    JOIN public.neighbor_activity_classes l ON l.activity_id=a.id
    JOIN public.writing_missions m ON m.id=l.mission_id AND m.class_id=l.class_id
    WHERE a.activity_type='topic' AND a.status='closed'
      AND (m.is_archived IS DISTINCT FROM TRUE OR m.archived_at IS NULL)
  ) THEN RAISE EXCEPTION '기존 종료 주제 보관 누락 보정 실패'; END IF;
  FOR scenario IN 1..6 LOOP
    ht:=gen_random_uuid(); gt:=gen_random_uuid(); hc:=gen_random_uuid(); gc:=gen_random_uuid(); sp:=gen_random_uuid();
    PERFORM set_config('app.bypass_profile_protection','true',TRUE);
    INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES
        (ht,'nt-'||ht||'@example.invalid','{}','{}'),(gt,'nt-'||gt||'@example.invalid','{}','{}');
    INSERT INTO public.profiles(id,role,is_approved) VALUES(ht,'TEACHER',TRUE),(gt,'TEACHER',TRUE)
        ON CONFLICT(id) DO UPDATE SET role='TEACHER',is_approved=TRUE;
    INSERT INTO public.teachers(id,name,school_name) VALUES(ht,'가 교사','가 학교'),(gt,'나 교사','나 학교');
    INSERT INTO public.classes(id,teacher_id,name,enabled_modules) VALUES
        (hc,ht,'가 학급',ARRAY['__configured__','neighbor-agit']),
        (gc,gt,'나 학급',ARRAY['__configured__','neighbor-agit']);
    UPDATE public.neighbor_rollout_state SET mode='limited_beta';
    INSERT INTO public.neighbor_limited_classes(class_id,enabled_by) VALUES(hc,ht),(gc,ht) ON CONFLICT DO NOTHING;
    INSERT INTO public.neighbor_spaces(id,name,host_class_id,status,created_by) VALUES(sp,'합성 공간',hc,'active',ht);
    INSERT INTO public.neighbor_space_classes(space_id,class_id,role,status,public_class_name,student_access_enabled,joined_at) VALUES
        (sp,hc,'host','active','가 학급',TRUE,now()),(sp,gc,'guest','active','나 학급',TRUE,now());
    PERFORM set_config('app.bypass_profile_protection','false',TRUE);

    PERFORM set_config('request.jwt.claim.sub',ht::TEXT,TRUE);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ht::TEXT,'role','authenticated')::TEXT,TRUE);


    r := public.run_neighbor_teacher_action_v1(hc,'create_activity', jsonb_build_object(
      'space_id',sp,'type','topic','title','자동 보관 시험','prompt','함께 씁니다.',
      'min_chars',10,'min_paragraphs',1,'base_reward',10));
    topic := (r#>>'{action_result,activity_id}')::UUID;
    PERFORM set_config('request.jwt.claim.sub',gt::TEXT,TRUE);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',gt::TEXT,'role','authenticated')::TEXT,TRUE);
    PERFORM public.run_neighbor_teacher_action_v1(gc,'review_activity',jsonb_build_object(
      'space_id',sp,'activity_id',topic,'approve',TRUE));
    SELECT mission_id INTO mid FROM public.neighbor_activity_classes WHERE activity_id=topic AND class_id=hc;
    INSERT INTO public.students(class_id,name,student_code,is_active)
    VALUES(hc,'보관 시험 학생',upper(substr(replace(hc::TEXT,'-',''),1,12)),TRUE) RETURNING id INTO sid;
    INSERT INTO public.student_posts(class_id,student_id,mission_id,title,content,is_submitted)
    VALUES(hc,sid,mid,'남아 있어야 할 글','자동 보관 뒤에도 원글은 유지됩니다.',TRUE);
    IF EXISTS(SELECT 1 FROM public.writing_missions WHERE id=mid AND is_archived) THEN
      RAISE EXCEPTION '진행 중 과제를 미리 보관했습니다';
    END IF;
    PERFORM set_config('request.jwt.claim.sub',ht::TEXT,TRUE);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ht::TEXT,'role','authenticated')::TEXT,TRUE);
    CASE scenario
      WHEN 1 THEN PERFORM public.close_neighbor_activity_v1(sp,hc,topic);
      WHEN 2 THEN
        UPDATE public.neighbor_activities SET writing_close_at=NOW()-INTERVAL '1 minute' WHERE id=topic;
        PERFORM public.close_due_neighbor_activities_v1();
      WHEN 3 THEN PERFORM public.close_neighbor_space_v1(sp);
      WHEN 4 THEN
        PERFORM set_config('request.jwt.claim.sub',gt::TEXT,TRUE);
        PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',gt::TEXT,'role','authenticated')::TEXT,TRUE);
        PERFORM public.leave_neighbor_space_v1(sp,gc);
      WHEN 5 THEN PERFORM public.delete_neighbor_activity_v1(sp,hc,topic);
      WHEN 6 THEN UPDATE public.neighbor_spaces SET status='closed',closed_at=NOW() WHERE id=sp;
    END CASE;
    SELECT count(*) INTO saved_count FROM public.writing_missions
    WHERE class_id IN(hc,gc) AND title='자동 보관 시험' AND is_archived AND archived_at IS NOT NULL;
    IF saved_count<>2 THEN RAISE EXCEPTION '경로 %: 두 반 과제 보관·날짜 누락 (%)',scenario,saved_count; END IF;
    SELECT archived_at INTO archived_time FROM public.writing_missions WHERE id=mid;
    UPDATE public.neighbor_activities SET status='closed' WHERE id=topic;
    IF (SELECT archived_at FROM public.writing_missions WHERE id=mid) IS DISTINCT FROM archived_time THEN
      RAISE EXCEPTION '경로 %: 반복 종료로 보관 날짜 변경',scenario;
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.student_posts WHERE class_id=hc AND mission_id=mid AND student_id=sid AND is_submitted) THEN
      RAISE EXCEPTION '경로 %: 원글 유실',scenario;
    END IF;
    PERFORM set_config('request.jwt.claim.sub',ht::TEXT,TRUE);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ht::TEXT,'role','authenticated')::TEXT,TRUE);
    r:=public.get_teacher_archived_missions_page(hc,50,0);
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'items') x
                  WHERE x->>'id'=mid::TEXT AND (x->>'submittedCount')::INTEGER=1 AND x->>'archived_at' IS NOT NULL) THEN
      RAISE EXCEPTION '경로 %: 실제 보관함 RPC에 제출 글이 없습니다',scenario;
    END IF;
  END LOOP;
END $$;
