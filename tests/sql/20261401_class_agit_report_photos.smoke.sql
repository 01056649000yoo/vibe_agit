-- Synthetic data only; the runner wraps this file in a rollback transaction.
-- 우리반 아지트: 보고서 사진을 담는다 — 선생님 확인 + 복사본 + 문단 목록 속 사진 자리표(20261401).
DO $$
DECLARE t UUID:=gen_random_uuid(); o UUID:=gen_random_uuid(); c UUID:=gen_random_uuid(); oc UUID:=gen_random_uuid();
    s UUID; st UUID:=gen_random_uuid(); m UUID; p UUID:=gen_random_uuid(); p2 UUID:=gen_random_uuid();
BEGIN
    PERFORM set_config('app.bypass_profile_protection','true',TRUE);
    INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) SELECT x,'rp-'||x||'@example.invalid','{}','{}' FROM unnest(ARRAY[t,o,st]) x;
    INSERT INTO public.profiles(id,role,is_approved) VALUES(t,'TEACHER',TRUE),(o,'TEACHER',TRUE),(st,'STUDENT',TRUE)
        ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,is_approved=TRUE;
    INSERT INTO public.teachers(id,name,school_name) VALUES(t,'합성 교사','시험 학교'),(o,'다른 합성 교사','시험 학교');
    INSERT INTO public.classes(id,teacher_id,name,enabled_modules) VALUES(c,t,'사진 합성 학급',ARRAY['__configured__','class-agit']),
        (oc,o,'다른 사진 합성 학급',ARRAY['__configured__','class-agit']);
    UPDATE public.class_agit_rollout SET mode='pilot' WHERE singleton;
    DELETE FROM public.class_agit_pilot_classes;
    INSERT INTO public.class_agit_pilot_classes(class_id) VALUES(c),(oc);
    s:=gen_random_uuid();
    INSERT INTO public.students(id,class_id,name,student_code,auth_id) VALUES(s,c,'합성 학생',left(s::TEXT,8)||'PHO',st);
    INSERT INTO public.writing_missions(class_id,teacher_id,title,guide,genre,mission_type,input_template,min_chars,min_paragraphs,base_reward,bonus_reward)
        VALUES(c,t,'사진 보고서 과제','합성 안내','글쓰기','report','report',1,1,0,0) RETURNING id INTO m;
    -- 글 1: 사진 칸 a(사진)·b(글)·c(사진), 칸 a 본문에는 사진 자리표를 흉내 낸 제어 문자 문자열을 넣어 본다
    INSERT INTO public.student_posts(id,class_id,student_id,mission_id,title,content,is_submitted,is_confirmed,structured_content)
    VALUES(p,c,s,m,'사진 보고서','합성 본문',TRUE,TRUE,jsonb_build_object('template','report','version',1,'sections',jsonb_build_array(
        jsonb_build_object('id','a','heading','까닭','body','첫 관찰'||E'\x1f'||'photo:00000000-0000-4000-8000-000000000000',
            'image',jsonb_build_object('path',p||'/f1/img1.jpg','caption','화단 사진','width',400,'height',300,'bytes',2000,'mimeType','image/jpeg')),
        jsonb_build_object('id','b','heading','내용','body','둘째 칸 글','image',NULL),
        jsonb_build_object('id','c','heading','결과','body','셋째 칸 글',
            'image',jsonb_build_object('path',p||'/f2/img2.webp','caption','잎 사진','width',400,'height',300,'bytes',2000,'mimeType','image/webp')))));
    PERFORM set_config('test.rp_teacher',t::TEXT,TRUE); PERFORM set_config('test.rp_other',o::TEXT,TRUE);
    PERFORM set_config('test.rp_class',c::TEXT,TRUE); PERFORM set_config('test.rp_other_class',oc::TEXT,TRUE);
    PERFORM set_config('test.rp_post',p::TEXT,TRUE); PERFORM set_config('test.rp_student',st::TEXT,TRUE);
    PERFORM set_config('app.bypass_profile_protection','false',TRUE);
END; $$;

-- 선생님: 확인 전에는 글만 담긴다. 사진이 든 칸 번호는 알려 준다.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.rp_teacher'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.rp_teacher'),'role','authenticated')::TEXT,TRUE);
DO $$
DECLARE c UUID:=current_setting('test.rp_class')::UUID; p UUID:=current_setting('test.rp_post')::UUID; src JSONB; r JSONB; denied BOOLEAN; ids UUID[]; rev TEXT;
BEGIN
    src:=(public.get_class_agit_source_v1(c,p)->'source');
    IF src->'blocks'<>'["첫 관찰photo:00000000-0000-4000-8000-000000000000","둘째 칸 글","셋째 칸 글"]'::JSONB THEN
        RAISE EXCEPTION 'control char not stripped / text-only blocks wrong %',src->'blocks'; END IF;
    IF src::TEXT LIKE E'%\\u001f%' THEN RAISE EXCEPTION 'student text kept a marker control char'; END IF;
    IF src->'photo_sections'<>'["a","c"]'::JSONB OR (src->>'photos_included')::INTEGER<>0 THEN RAISE EXCEPTION 'photo sections %',src; END IF;
    rev:=src->>'source_revision';
    -- 확인 문구 판이 다르거나 사진 없는 칸·너무 많은 칸은 거절
    denied:=FALSE; BEGIN PERFORM public.confirm_class_agit_photo_use_v1(c,p,ARRAY['a'],2::SMALLINT); EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'wrong statement version accepted'; END IF;
    denied:=FALSE; BEGIN PERFORM public.confirm_class_agit_photo_use_v1(c,p,ARRAY['b'],1::SMALLINT); EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'section without photo accepted'; END IF;
    denied:=FALSE; BEGIN PERFORM public.confirm_class_agit_photo_use_v1(c,p,ARRAY['a','a'],1::SMALLINT); EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'duplicate sections accepted'; END IF;
    -- 확인(칸 a 와 c) → 대기
    r:=public.confirm_class_agit_photo_use_v1(c,p,ARRAY['a','c'],1::SMALLINT);
    IF jsonb_array_length(r->'photos')<>2 OR EXISTS (SELECT 1 FROM jsonb_array_elements(r->'photos') x WHERE x->>'status'<>'pending') THEN RAISE EXCEPTION 'confirm result %',r; END IF;
    SELECT array_agg((x->>'id')::UUID) INTO ids FROM jsonb_array_elements(r->'photos') x;
    PERFORM set_config('test.rp_photo_ids',array_to_json(ids)::TEXT,TRUE);
    -- 복사 전에는 사진이 안 담긴다(원글 버전도 그대로)
    src:=(public.get_class_agit_source_v1(c,p)->'source');
    IF (src->>'photos_included')::INTEGER<>0 OR src->>'source_revision'<>rev THEN RAISE EXCEPTION 'pending photo leaked into source'; END IF;
    -- 복사할 일 받아 가기(내 학급 것만)
    r:=public.claim_class_agit_photo_copy_v1(c,ids);
    IF jsonb_array_length(r->'photos')<>2 THEN RAISE EXCEPTION 'claim %',r; END IF;
    -- 다시 확인해도 같은 사진이 중복되지 않는다(행 수는 서비스 구간에서 센다)
    r:=public.confirm_class_agit_photo_use_v1(c,p,ARRAY['a'],1::SMALLINT);
END; $$;
-- 다른 학급 교사는 확인도 복사 받기도 못 한다
SELECT set_config('request.jwt.claim.sub',current_setting('test.rp_other'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.rp_other'),'role','authenticated')::TEXT,TRUE);
DO $$
DECLARE c UUID:=current_setting('test.rp_class')::UUID; p UUID:=current_setting('test.rp_post')::UUID; denied BOOLEAN; ids UUID[]:=ARRAY(SELECT jsonb_array_elements_text(current_setting('test.rp_photo_ids')::JSONB)::UUID);
BEGIN
    denied:=FALSE; BEGIN PERFORM public.confirm_class_agit_photo_use_v1(c,p,ARRAY['a'],1::SMALLINT); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'other class teacher confirmed photos'; END IF;
    denied:=FALSE; BEGIN PERFORM public.claim_class_agit_photo_copy_v1(c,ids); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'other class teacher claimed copy'; END IF;
    denied:=FALSE; BEGIN PERFORM public.finish_class_agit_photo_copy_v1(ids[1],TRUE); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'finish must be service-only'; END IF;
    denied:=FALSE; BEGIN PERFORM public.class_agit_orphan_photo_paths_v1(); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'orphan list must be service-only'; END IF;
END; $$;

-- 서비스(Edge 함수)가 복사를 마쳤다고 기록
RESET ROLE;
DO $$
DECLARE ids UUID[]:=ARRAY(SELECT jsonb_array_elements_text(current_setting('test.rp_photo_ids')::JSONB)::UUID);
BEGIN
    IF (SELECT count(*) FROM public.class_agit_item_photos WHERE post_id=current_setting('test.rp_post')::UUID)<>2 THEN RAISE EXCEPTION 'duplicate photo rows'; END IF;
    PERFORM public.finish_class_agit_photo_copy_v1(ids[1],TRUE);
    PERFORM public.finish_class_agit_photo_copy_v1(ids[2],TRUE);
    IF (SELECT count(*) FROM public.class_agit_item_photos WHERE status='copied')<>2 THEN RAISE EXCEPTION 'copy not recorded'; END IF;
    PERFORM set_config('test.rp_marker_a',(SELECT E'\x1fphoto:'||id::TEXT FROM public.class_agit_item_photos WHERE post_id=current_setting('test.rp_post')::UUID AND section_id='a'),TRUE);
    PERFORM set_config('test.rp_marker_c',(SELECT E'\x1fphoto:'||id::TEXT FROM public.class_agit_item_photos WHERE post_id=current_setting('test.rp_post')::UUID AND section_id='c'),TRUE);
    PERFORM set_config('test.rp_copy_a',(SELECT copy_path FROM public.class_agit_item_photos WHERE post_id=current_setting('test.rp_post')::UUID AND section_id='a'),TRUE);
END; $$;

-- 복사 뒤: 사진 자리표가 칸 순서대로 문단 목록에 들어가고, 글 문단 수·발췌에는 영향이 없다
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.rp_teacher'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.rp_teacher'),'role','authenticated')::TEXT,TRUE);
DO $$
DECLARE c UUID:=current_setting('test.rp_class')::UUID; p UUID:=current_setting('test.rp_post')::UUID; src JSONB; r JSONB; ids UUID[]:=ARRAY(SELECT jsonb_array_elements_text(current_setting('test.rp_photo_ids')::JSONB)::UUID);
    marker_a TEXT; marker_c TEXT; copy_a TEXT; ex UUID:=gen_random_uuid(); items JSONB; res JSONB; book UUID:=gen_random_uuid(); bres JSONB;
BEGIN
    marker_a:=current_setting('test.rp_marker_a'); marker_c:=current_setting('test.rp_marker_c'); copy_a:=current_setting('test.rp_copy_a');
    src:=(public.get_class_agit_source_v1(c,p)->'source');
    IF src->'blocks'<>jsonb_build_array(marker_a,'첫 관찰photo:00000000-0000-4000-8000-000000000000','둘째 칸 글',marker_c,'셋째 칸 글') THEN
        RAISE EXCEPTION 'blocks with photos %',src->'blocks'; END IF;
    IF (src->>'photos_included')::INTEGER<>2 OR position(E'\x1f' IN src->>'excerpt')>0 OR position(E'\x1f' IN src->>'content')>0 THEN RAISE EXCEPTION 'excerpt/content polluted'; END IF;
    -- 담당 교사는 복사본을 읽을 수 있다(저장소 정책이 쓰는 함수)
    IF NOT public.can_read_class_agit_photo_v1(copy_a) THEN RAISE EXCEPTION 'teacher cannot read copied photo'; END IF;
    -- 전시 초안에 저장 → 스냅샷에 자리표가 그대로 고정된다
    PERFORM public.run_class_agit_action_v1(c,'create',jsonb_build_object('exhibition_id',ex));
    items:=jsonb_build_array(jsonb_build_object('sourceId',src->>'id','sourceRevision',src->>'source_revision','publicAlias','새싹 작가','classAcknowledged',TRUE));
    res:=public.run_class_agit_action_v1(c,'save',jsonb_build_object('exhibition_id',ex,'expected_revision',1,'title','사진 전시','introduction','시험','items',items));
    IF res->'draft'->'items'->0->'blocks'<>src->'blocks' THEN RAISE EXCEPTION 'draft blocks lost photo markers %',res->'draft'->'items'->0->'blocks'; END IF;
    -- 책에도 같은 방식으로
    PERFORM public.run_class_agit_book_action_v1(c,'create',jsonb_build_object('book_id',book));
    PERFORM public.run_class_agit_book_action_v1(c,'save',jsonb_build_object('book_id',book,'title','사진 문집','issue_date',current_date,'expected_revision',1,
        'items',jsonb_build_array(jsonb_build_object('sourceId',src->>'id','sourceRevision',src->>'source_revision','classAcknowledged',TRUE))));
    bres:=public.get_class_agit_book_preview_v1(c,book,2);
    IF bres::TEXT NOT LIKE '%'||replace(marker_a,E'\x1f','%')||'%' AND bres::TEXT NOT LIKE '%둘째 칸 글%' THEN RAISE EXCEPTION 'book preview lost content'; END IF;
    -- 학생은 아직 공개되지 않은 전시·책이라 읽을 수 없다
    PERFORM set_config('request.jwt.claim.sub',current_setting('test.rp_student'),TRUE);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.rp_student'),'role','authenticated')::TEXT,TRUE);
    IF public.can_read_class_agit_photo_v1(copy_a) THEN RAISE EXCEPTION 'student read an unpublished photo'; END IF;
    -- 다른 학급 교사는 못 읽는다
    PERFORM set_config('request.jwt.claim.sub',current_setting('test.rp_other'),TRUE);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.rp_other'),'role','authenticated')::TEXT,TRUE);
    IF public.can_read_class_agit_photo_v1(copy_a) THEN RAISE EXCEPTION 'other class teacher read the photo'; END IF;
END; $$;

-- 원본 사진이 바뀌면(다른 경로) 확인한 사진은 더 이상 담기지 않는다 + 원글 버전이 바뀐다
RESET ROLE;
DO $$
DECLARE c UUID:=current_setting('test.rp_class')::UUID; p UUID:=current_setting('test.rp_post')::UUID; before_rev TEXT; after_src JSONB;
BEGIN
    before_rev:=(SELECT public.class_agit_current_source_v1(c,p)->>'source_revision');
    UPDATE public.student_posts SET structured_content=jsonb_set(structured_content,'{sections,0,image,path}',to_jsonb(p::TEXT||'/f9/other.jpg')) WHERE id=p;
    after_src:=public.class_agit_current_source_v1(c,p);
    IF (after_src->>'photos_included')::INTEGER<>1 OR after_src->>'source_revision'=before_rev THEN RAISE EXCEPTION 'replaced photo still included %',after_src->>'photos_included'; END IF;
    IF after_src->'blocks'->>0 LIKE E'%photo:%' AND after_src->'blocks'->>0 = (SELECT E'\x1fphoto:'||id::TEXT FROM public.class_agit_item_photos WHERE post_id=p AND section_id='a') THEN
        RAISE EXCEPTION 'old confirmation applied to a replaced photo'; END IF;
END; $$;

-- 외부 검토(방어적 코드 리뷰)에서 나온 입력들
DO $$
DECLARE c UUID:=current_setting('test.rp_class')::UUID; p UUID:=current_setting('test.rp_post')::UUID; id_a UUID; marker TEXT; snap JSONB; orphans INTEGER;
    dup_post public.student_posts; mission public.writing_missions; student_name TEXT:='합성 학생';
BEGIN
    -- JSONB 를 글자로 바꾸면 제어 문자가 이스케이프돼 raw LIKE 가 항상 거짓이 된다 → 전용 도우미는 구조 비교·이스케이프 비교를 쓴다.
    id_a:=gen_random_uuid(); marker:=E'\x1fphoto:'||id_a::TEXT;
    snap:=jsonb_build_object('blocks',jsonb_build_array('글',marker));
    IF snap::TEXT LIKE '%'||marker||'%' THEN RAISE EXCEPTION 'premise changed: raw LIKE now matches'; END IF;
    IF NOT public.class_agit_json_has_photo_v1(snap,id_a) OR NOT public.class_agit_blocks_have_photo_v1(snap->'blocks',id_a) THEN RAISE EXCEPTION 'marker helper misses an escaped marker'; END IF;
    IF public.class_agit_json_has_photo_v1(snap,gen_random_uuid()) OR public.class_agit_blocks_have_photo_v1('"x"'::JSONB,id_a) THEN RAISE EXCEPTION 'marker helper false positive'; END IF;
    -- 같은 칸 id 가 둘이거나 80자를 넘으면 담지 않는다
    SELECT * INTO dup_post FROM public.student_posts WHERE id=p;
    SELECT * INTO mission FROM public.writing_missions WHERE id=dup_post.mission_id;
    dup_post.structured_content:=jsonb_build_object('template','report','version',1,'sections',jsonb_build_array(
        jsonb_build_object('id','x','body','첫 칸','image',NULL),jsonb_build_object('id','x','body','둘째 칸','image',NULL)));
    IF public.class_agit_source_data_v1(dup_post,mission,student_name) IS NOT NULL THEN RAISE EXCEPTION 'duplicate section ids accepted'; END IF;
    dup_post.structured_content:=jsonb_build_object('template','report','version',1,'sections',jsonb_build_array(
        jsonb_build_object('id',repeat('가',81),'body','긴 아이디 칸','image',NULL)));
    IF public.class_agit_source_data_v1(dup_post,mission,student_name) IS NOT NULL THEN RAISE EXCEPTION 'overlong section id accepted'; END IF;
    -- 고아 청소: 전시·책에 담긴 사진은 하루가 지나도 지우지 않고, 담김이 사라지면 목록에 오른다
    UPDATE public.class_agit_item_photos SET checked_at=now()-INTERVAL '2 days' WHERE post_id=p;
    SELECT count(*) INTO orphans FROM public.class_agit_orphan_photo_paths_v1();
    IF orphans<>0 THEN RAISE EXCEPTION 'referenced photos listed as orphans (%)',orphans; END IF;
    DELETE FROM public.class_agit_items WHERE post_id=p;
    DELETE FROM public.class_agit_book_items WHERE post_id=p;
    SELECT count(*) INTO orphans FROM public.class_agit_orphan_photo_paths_v1();
    IF orphans<>2 THEN RAISE EXCEPTION 'unreferenced photos not listed as orphans (%)',orphans; END IF;
END; $$;
