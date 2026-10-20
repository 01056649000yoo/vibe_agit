-- Synthetic data only; the runner wraps this file in a rollback transaction.
-- 우리반 아지트: 편지·보고서를 담을 수 있고, 일기·meeting 은 담지 않는다(20261400).
-- 2026-10-20 갱신: 20261401 이 사진 보고서도 후보로 올린다(선생님이 확인한 사진이 없으면 글만 담긴다). 사진 자체는 20261401 스모크가 본다.
-- `migrate:check` 는 이 마이그레이션만 올린 상태, `smoke:all` 은 20261401 까지 올린 상태로 돌려서 사진 보고서 기대는 두 상태를 모두 받는다.
DO $$
DECLARE t UUID:=gen_random_uuid(); c UUID:=gen_random_uuid(); s UUID; m UUID; p UUID;
    types TEXT[]:=ARRAY['freeform','poem','letter','report','report','meeting'];
    i INTEGER; posts JSONB:='{}'; missions JSONB:='{}'; st JSONB; ct TEXT;
BEGIN
    PERFORM set_config('app.bypass_profile_protection','true',TRUE);
    INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES(t,'letter-report-'||t||'@example.invalid','{}','{}');
    INSERT INTO public.profiles(id,role,is_approved) VALUES(t,'TEACHER',TRUE) ON CONFLICT(id) DO UPDATE SET role='TEACHER',is_approved=TRUE;
    INSERT INTO public.teachers(id,name,school_name) VALUES(t,'합성 교사','시험 학교');
    INSERT INTO public.classes(id,teacher_id,name,enabled_modules) VALUES(c,t,'편지 보고서 합성 학급',ARRAY['__configured__','class-agit']);
    UPDATE public.class_agit_rollout SET mode='pilot' WHERE singleton;
    DELETE FROM public.class_agit_pilot_classes;
    INSERT INTO public.class_agit_pilot_classes(class_id) VALUES(c);
    s:=gen_random_uuid();
    INSERT INTO public.students(id,class_id,name,student_code) VALUES(s,c,'합성 학생',left(s::TEXT,8)||'LRP');
    -- i: 1 일반 / 2 시 / 3 편지 / 4 보고서(글만) / 5 보고서(사진 있음) / 6 meeting
    FOR i IN 1..6 LOOP
        INSERT INTO public.writing_missions(class_id,teacher_id,title,guide,genre,mission_type,input_template,min_chars,min_paragraphs,base_reward,bonus_reward)
        VALUES(c,t,'과제 '||i,'합성 안내','글쓰기',CASE WHEN types[i]='freeform' THEN '글쓰기' ELSE types[i] END,types[i],1,1,0,0) RETURNING id INTO m;
        p:=gen_random_uuid();   -- 보고서 사진 경로는 `글ID/폴더/파일.jpg` 모양이라야 서버 검증을 지난다
        st:=CASE i
            WHEN 2 THEN '{"template":"poem","version":1,"stanzas":["첫 연\n둘째 행","다음 연"]}'::JSONB
            WHEN 3 THEN '{"template":"letter","version":1,"recipient":"선생님","greeting":"안녕하세요.","body":"오늘 배운 것을 말씀드려요.\n\n재미있었어요.","closing":"감사합니다."}'::JSONB
            WHEN 4 THEN '{"template":"report","version":1,"sections":[{"id":"a","heading":"까닭","body":"화단이 궁금했다.","image":null},{"id":"b","heading":"내용","body":"키가 11cm 자랐다.\n\n잎이 네 장 났다.","image":null},{"id":"c","heading":"빈 칸","body":"","image":null}]}'::JSONB
            WHEN 5 THEN ('{"template":"report","version":1,"sections":[{"id":"a","heading":"까닭","body":"사진을 찍었다.","image":{"path":"'||p||'/a1/p1.jpg","caption":"화단 사진","width":400,"height":300,"bytes":1000,"mimeType":"image/jpeg"}},{"id":"b","heading":"내용","body":"잎이 났다.","image":null}]}')::JSONB
            ELSE NULL END;
        ct:=CASE i
            WHEN 3 THEN E'선생님에게\n\n안녕하세요.\n\n오늘 배운 것을 말씀드려요.\n\n재미있었어요.\n\n감사합니다.'
            WHEN 4 THEN E'까닭\n화단이 궁금했다.\n\n내용\n키가 11cm 자랐다.\n\n잎이 네 장 났다.'
            WHEN 5 THEN E'까닭\n사진을 찍었다.\n\n내용\n잎이 났다.'
            ELSE E'첫 문단\n\n둘째 문단' END;
        INSERT INTO public.student_posts(id,class_id,student_id,mission_id,title,content,is_submitted,is_confirmed,structured_content)
        VALUES(p,c,s,m,'합성 작품 '||i,ct,TRUE,TRUE,st);
        posts:=posts||jsonb_build_object(i::TEXT,p); missions:=missions||jsonb_build_object(i::TEXT,m);
    END LOOP;
    PERFORM set_config('test.lr_teacher',t::TEXT,TRUE); PERFORM set_config('test.lr_class',c::TEXT,TRUE);
    PERFORM set_config('test.lr_posts',posts::TEXT,TRUE); PERFORM set_config('test.lr_missions',missions::TEXT,TRUE);
    PERFORM set_config('app.bypass_profile_protection','false',TRUE);
END; $$;
-- 외부 검토(방어적 코드 리뷰)에서 나온 입력들: 사진 판정은 image 값이 비어 있지 않으면 모두 사진, 칸 구조가 없는 보고서는 제외
DO $$
DECLARE ps JSONB:=current_setting('test.lr_posts')::JSONB; ms JSONB:=current_setting('test.lr_missions')::JSONB;
    post public.student_posts; mission public.writing_missions; tweaked public.student_posts; r JSONB; big TEXT;
BEGIN
    IF NOT public.class_agit_report_has_photo_v1('{"sections":[{"image":{"caption":"설명만"}}]}') THEN RAISE EXCEPTION 'caption-only image must count as photo'; END IF;
    IF NOT public.class_agit_report_has_photo_v1('{"sections":[{"image":"https://example.invalid/a.jpg"}]}') THEN RAISE EXCEPTION 'string image must count as photo'; END IF;
    IF public.class_agit_report_has_photo_v1('{"sections":[{"image":null},{"image":{}},{"body":"글"}]}') THEN RAISE EXCEPTION 'empty images are not photos'; END IF;
    IF public.class_agit_report_has_photo_v1('{"sections":"x"}') OR public.class_agit_report_has_photo_v1(NULL) THEN RAISE EXCEPTION 'malformed must not be a photo (and must not throw)'; END IF;
    SELECT * INTO post FROM public.student_posts WHERE id=(ps->>'4')::UUID;
    SELECT * INTO mission FROM public.writing_missions WHERE id=(ms->>'4')::UUID;
    -- 칸 구조 없는 보고서는 본문에 칸 제목이 섞여 있을 수 있어 제외
    FOREACH big IN ARRAY ARRAY['null','{}','{"template":"report"}','{"template":"report","sections":"x"}','{"template":"report","sections":[1]}'] LOOP
        tweaked:=jsonb_populate_record(NULL::public.student_posts,to_jsonb(post)||jsonb_build_object('structured_content',big::JSONB));
        IF public.class_agit_source_data_v1(tweaked,mission,'합성 학생') IS NOT NULL THEN RAISE EXCEPTION 'malformed report accepted: %',big; END IF;
    END LOOP;
    -- 공백을 잔뜩 끼운 본문으로 길이 검사를 피할 수 없다: 돌려주는 content 는 검사를 지난 문단에서 다시 만든다
    big:='가'||E'\n'||repeat(' ',100000)||E'\n'||'나';
    tweaked:=jsonb_populate_record(NULL::public.student_posts,to_jsonb(post)||jsonb_build_object('structured_content',
        jsonb_build_object('template','report','version',1,'sections',jsonb_build_array(jsonb_build_object('id','a','heading','칸','body',big)))));
    r:=public.class_agit_source_data_v1(tweaked,mission,'합성 학생');
    IF r IS NOT NULL AND char_length(r->>'content')>20000 THEN RAISE EXCEPTION 'content bypassed the length check'; END IF;
END; $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.lr_teacher'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.lr_teacher'),'role','authenticated')::TEXT,TRUE);
DO $$
DECLARE c UUID:=current_setting('test.lr_class')::UUID; ps JSONB:=current_setting('test.lr_posts')::JSONB; ms JSONB:=current_setting('test.lr_missions')::JSONB;
    r JSONB; src JSONB; ids UUID[]; n INTEGER; photo_ready BOOLEAN;
BEGIN
    -- 미션 목록: 일반·시·편지·보고서는 지원, meeting 은 미지원. 사진 보고서도 이제 센다(글만 담김).
    photo_ready:=to_regprocedure('public.confirm_class_agit_photo_use_v1(uuid,uuid,text[],smallint)') IS NOT NULL;
    r:=public.get_class_agit_missions_v1(c);
    IF (SELECT count(*) FROM jsonb_array_elements(r->'items') x WHERE (x->>'supported')::BOOLEAN) <> 5 THEN RAISE EXCEPTION 'supported mission count'; END IF;
    IF (SELECT (x->>'supported')::BOOLEAN FROM jsonb_array_elements(r->'items') x WHERE x->>'id'=ms->>'6') IS NOT FALSE THEN RAISE EXCEPTION 'meeting must stay unsupported'; END IF;
    IF (SELECT (x->>'review_count')::INTEGER FROM jsonb_array_elements(r->'items') x WHERE x->>'id'=ms->>'3') <> 1 THEN RAISE EXCEPTION 'letter review count'; END IF;
    IF (SELECT (x->>'review_count')::INTEGER FROM jsonb_array_elements(r->'items') x WHERE x->>'id'=ms->>'4') <> 1 THEN RAISE EXCEPTION 'report (text) review count'; END IF;
    IF (SELECT (x->>'review_count')::INTEGER FROM jsonb_array_elements(r->'items') x WHERE x->>'id'=ms->>'5') <> (CASE WHEN photo_ready THEN 1 ELSE 0 END) THEN RAISE EXCEPTION 'photo report count (photo support %)',photo_ready; END IF;
    -- 후보 목록: 일반·시·편지·보고서(글만)·보고서(사진) 5편. meeting 은 빠진다.
    r:=public.get_class_agit_candidates_v2(c);
    IF jsonb_array_length(r->'items')<>(CASE WHEN photo_ready THEN 5 ELSE 4 END) THEN RAISE EXCEPTION 'candidate count %',jsonb_array_length(r->'items'); END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(r->'items') x WHERE x->>'id'=ps->>'6') THEN RAISE EXCEPTION 'meeting listed'; END IF;
    -- 학생 목록의 검토 수도 같은 기준(5편)
    r:=public.get_class_agit_students_v1(c);
    IF (r->'items'->0->>'review_count')::INTEGER<>(CASE WHEN photo_ready THEN 5 ELSE 4 END) THEN RAISE EXCEPTION 'student review count'; END IF;
    -- 편지: 일반 글과 같은 문단 목록, 머리표만 편지
    r:=public.get_class_agit_sources_v1(c,ARRAY[(ps->>'3')::UUID]);
    src:=r->'items'->0->'source';
    IF src IS NULL OR src->>'format'<>'prose' OR src->>'kindLabel'<>'편지' OR src->'structured_content'<>'null'::JSONB THEN RAISE EXCEPTION 'letter source %',src; END IF;
    IF jsonb_array_length(src->'blocks')<>5 OR src->'blocks'->>0<>'선생님에게' OR src->'blocks'->>4<>'감사합니다.' THEN RAISE EXCEPTION 'letter blocks %',src->'blocks'; END IF;
    -- 보고서(글만): 칸 제목(까닭·내용)은 빠지고 학생이 쓴 내용만, 빈 칸은 건너뜀
    r:=public.get_class_agit_sources_v1(c,ARRAY[(ps->>'4')::UUID]);
    src:=r->'items'->0->'source';
    IF src IS NULL OR src->>'format'<>'prose' OR src->>'kindLabel'<>'보고서' THEN RAISE EXCEPTION 'report source %',src; END IF;
    IF src->'blocks'<>'["화단이 궁금했다.","키가 11cm 자랐다.","잎이 네 장 났다."]'::JSONB THEN RAISE EXCEPTION 'report blocks %',src->'blocks'; END IF;
    IF src::TEXT LIKE '%까닭%' THEN RAISE EXCEPTION 'report heading leaked into blocks'; END IF;
    -- 사진 보고서: 사진 지원(20261401) 전에는 담지 않고, 지원 뒤에는 확인한 사진이 없으면 글만 담긴다(자리표 없음)
    r:=public.get_class_agit_sources_v1(c,ARRAY[(ps->>'5')::UUID]);
    src:=r->'items'->0->'source';
    IF NOT photo_ready THEN
        IF src IS NOT NULL AND src<>'null'::JSONB THEN RAISE EXCEPTION 'photo report accepted before photo support'; END IF;
    ELSIF src IS NULL OR src->'blocks'<>'["사진을 찍었다.","잎이 났다."]'::JSONB OR src->'photo_sections'<>'["a"]'::JSONB OR (src->>'photos_included')::INTEGER<>0 THEN
        RAISE EXCEPTION 'photo report text-only source %',src; END IF;
    -- meeting: 담을 수 없다
    r:=public.get_class_agit_sources_v1(c,ARRAY[(ps->>'6')::UUID]);
    IF r->'items'->0->'source'<>'null'::JSONB THEN RAISE EXCEPTION 'meeting must be excluded'; END IF;
    -- 시·일반 글은 전과 같다
    r:=public.get_class_agit_sources_v1(c,ARRAY[(ps->>'2')::UUID,(ps->>'1')::UUID]);
    IF r->'items'->0->'source'->>'format'<>'poem' OR r->'items'->0->'source'->>'kindLabel'<>'시' THEN RAISE EXCEPTION 'poem regression'; END IF;
    IF r->'items'->1->'source'->>'format'<>'prose' OR r->'items'->1->'source'->>'kindLabel'<>'글' THEN RAISE EXCEPTION 'prose regression'; END IF;
    -- 실제로 전시 초안에 저장하면 서버가 만든 문단 목록·머리표로 담긴다(클라이언트가 보낸 내용은 쓰지 않는다)
    DECLARE v_ex UUID:=gen_random_uuid(); v_items JSONB:='[]'; v_res JSONB; v_src JSONB; k INTEGER;
    BEGIN
        PERFORM public.run_class_agit_action_v1(c,'create',jsonb_build_object('exhibition_id',v_ex));
        FOREACH k IN ARRAY ARRAY[3,4] LOOP
            v_src:=public.get_class_agit_source_v1(c,(ps->>k::TEXT)::UUID)->'source';
            v_items:=v_items||jsonb_build_array(jsonb_build_object('sourceId',v_src->>'id','sourceRevision',v_src->>'source_revision',
                'publicAlias','새싹 작가','classAcknowledged',TRUE,'title','위조 제목','blocks',jsonb_build_array('위조 본문')));
        END LOOP;
        v_res:=public.run_class_agit_action_v1(c,'save',jsonb_build_object('exhibition_id',v_ex,'expected_revision',1,'title','편지·보고서 전시','introduction','시험','items',v_items));
        IF jsonb_array_length(v_res->'draft'->'items')<>2 OR v_res::TEXT LIKE '%위조%' THEN RAISE EXCEPTION 'letter/report save failed %',v_res->'draft'; END IF;
        IF v_res->'draft'->'items'->0->>'kindLabel'<>'편지' OR v_res->'draft'->'items'->1->>'kindLabel'<>'보고서' THEN RAISE EXCEPTION 'saved kind label %',v_res->'draft'->'items'; END IF;
        IF v_res->'draft'->'items'->1->'blocks'<>'["화단이 궁금했다.","키가 11cm 자랐다.","잎이 네 장 났다."]'::JSONB THEN RAISE EXCEPTION 'saved report blocks %',v_res->'draft'->'items'->1->'blocks'; END IF;
    END;
    -- 책(문집)에도 같은 글이 같은 문단 목록으로 담긴다
    DECLARE v_book UUID:=gen_random_uuid(); v_bitems JSONB:='[]'; v_bres JSONB; v_bsrc JSONB; kk INTEGER;
    BEGIN
        PERFORM public.run_class_agit_book_action_v1(c,'create',jsonb_build_object('book_id',v_book));
        FOREACH kk IN ARRAY ARRAY[3,4] LOOP
            v_bsrc:=public.get_class_agit_source_v1(c,(ps->>kk::TEXT)::UUID)->'source';
            v_bitems:=v_bitems||jsonb_build_array(jsonb_build_object('sourceId',v_bsrc->>'id','sourceRevision',v_bsrc->>'source_revision','classAcknowledged',TRUE));
        END LOOP;
        PERFORM public.run_class_agit_book_action_v1(c,'save',jsonb_build_object('book_id',v_book,'title','편지·보고서 문집','issue_date',current_date,'items',v_bitems,'expected_revision',1));
        v_bres:=public.get_class_agit_book_preview_v1(c,v_book,2);
        IF v_bres::TEXT NOT LIKE '%선생님에게%' OR v_bres::TEXT NOT LIKE '%화단이 궁금했다.%' OR v_bres::TEXT LIKE '%까닭%' THEN
            RAISE EXCEPTION 'book preview content %',left(v_bres::TEXT,400); END IF;
    END;
    -- 내부 도우미는 직접 부를 수 없다
    BEGIN
        PERFORM public.class_agit_exhibitable_format_v1('letter');
        RAISE EXCEPTION 'helper must not be executable';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;
