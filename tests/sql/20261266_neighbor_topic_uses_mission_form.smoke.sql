-- 합성 자료만 사용. 실행기가 전체를 ROLLBACK하거나 격리 DB를 제거한다.
-- 함께 쓰는 주제가 고른 글 종류·양식 그대로 두 학급 과제를 만드는지 본다.
DO $$
DECLARE
    ht UUID:=gen_random_uuid(); gt UUID:=gen_random_uuid();
    hc UUID:=gen_random_uuid(); gc UUID:=gen_random_uuid();
    sp UUID:=gen_random_uuid(); r JSONB; got TEXT; n INTEGER;
BEGIN
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

    -- 1) 자유 글쓰기 종류: 글 종류·길잡이 질문·분량이 두 학급 과제에 그대로 들어간다.
    r := public.run_neighbor_teacher_action_v1(hc,'create_activity', jsonb_build_object(
        'space_id',sp,'type','topic','title','가을 풍경','prompt','보고 느낀 것을 자세히 씁니다.',
        'genre','생활문','guide_questions',jsonb_build_array('무엇을 보았나요?','어떤 느낌이 들었나요?'),
        'min_chars',300,'min_paragraphs',3));

    SELECT count(*) INTO n FROM public.writing_missions m
     WHERE m.class_id IN (hc,gc) AND m.title='가을 풍경';
    IF n <> 2 THEN RAISE EXCEPTION '두 학급 모두에 과제가 만들어져야 하는데 %개입니다', n; END IF;

    SELECT string_agg(DISTINCT m.genre||'/'||m.mission_type||'/'||m.input_template||'/'
                      ||m.min_chars||'자/'||m.min_paragraphs||'문단/질문'
                      ||jsonb_array_length(m.guide_questions), ' ') INTO got
      FROM public.writing_missions m WHERE m.class_id IN (hc,gc) AND m.title='가을 풍경';
    IF got <> '생활문/생활문/freeform/300자/3문단/질문2'
    THEN RAISE EXCEPTION '고른 양식이 과제에 안 들어갔습니다: %', got; END IF;

    -- 같은 종류 활동은 한 번에 하나만 열 수 있다(기존 규칙). 다음 시험 전에 닫는다.
    UPDATE public.neighbor_activities SET status='closed', closed_at=now() WHERE space_id=sp;

    -- 2) 전용 틀 종류(시): mission_type·input_template 가 그 틀 id 로 들어가 학생이 시 편집기를 받는다.
    r := public.run_neighbor_teacher_action_v1(hc,'create_activity', jsonb_build_object(
        'space_id',sp,'type','topic','title','가을 시','prompt','짧은 시를 씁니다.',
        'genre','시','mission_type_id','poem','guide_questions','[]'::JSONB,
        'min_chars',50,'min_paragraphs',1));
    SELECT string_agg(DISTINCT m.genre||'/'||m.mission_type||'/'||m.input_template,' ') INTO got
      FROM public.writing_missions m WHERE m.class_id IN (hc,gc) AND m.title='가을 시';
    IF got <> '시/poem/poem' THEN RAISE EXCEPTION '전용 틀이 과제에 안 들어갔습니다: %', got; END IF;
    UPDATE public.neighbor_activities SET status='closed', closed_at=now() WHERE space_id=sp;

    RAISE NOTICE '함께 쓰는 주제: 글 종류·길잡이 질문·분량·전용 틀이 두 학급 과제에 그대로 들어간다';
END; $$;

-- 3) 값을 안 보내면 예전과 똑같이 만들어진다(옛 화면이 남아 있어도 깨지지 않는다).
DO $$
DECLARE t UUID; c UUID; sp UUID; got TEXT;
BEGIN
    SELECT cl.teacher_id, cl.id INTO t, c FROM public.classes cl WHERE cl.name='가 학급';
    SELECT id INTO sp FROM public.neighbor_spaces WHERE name='합성 공간';
    PERFORM set_config('request.jwt.claim.sub',t::TEXT,TRUE);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',t::TEXT,'role','authenticated')::TEXT,TRUE);
    PERFORM public.run_neighbor_teacher_action_v1(c,'create_activity', jsonb_build_object(
        'space_id',sp,'type','topic','title','옛 화면 주제','prompt','안내문만 보냅니다.'));
    SELECT DISTINCT m.genre||'/'||m.mission_type||'/'||m.input_template||'/'||m.min_chars INTO got
      FROM public.writing_missions m WHERE m.class_id=c AND m.title='옛 화면 주제';
    IF got <> '글쓰기/글쓰기/freeform/50'
    THEN RAISE EXCEPTION '값을 안 보냈을 때 예전 기본값이 아닙니다: %', got; END IF;
    RAISE NOTICE '함께 쓰는 주제: 값을 안 보내면 예전 기본값 그대로';
END; $$;
