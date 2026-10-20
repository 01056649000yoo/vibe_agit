-- Synthetic data only; the runner wraps this file in a rollback transaction.
-- 우리반 아지트: 보고서가 관찰·조사 양식(머리말·칸 날짜·사진 설명·참고 자료)대로 문단 목록에 담긴다(20261403).
-- 정본 함수는 순수 계산이라 글 한 편을 만들고 structured_content 를 바꿔 끼워 여러 경우를 본다.
DO $$
DECLARE t UUID:=gen_random_uuid(); c UUID:=gen_random_uuid(); s UUID:=gen_random_uuid(); st UUID:=gen_random_uuid(); m UUID; p UUID:=gen_random_uuid();
BEGIN
    PERFORM set_config('app.bypass_profile_protection','true',TRUE);
    INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) SELECT x,'rf-'||x||'@example.invalid','{}','{}' FROM unnest(ARRAY[t,st]) x;
    INSERT INTO public.profiles(id,role,is_approved) VALUES(t,'TEACHER',TRUE),(st,'STUDENT',TRUE) ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,is_approved=TRUE;
    INSERT INTO public.teachers(id,name,school_name) VALUES(t,'합성 교사','시험 학교');
    INSERT INTO public.classes(id,teacher_id,name,enabled_modules) VALUES(c,t,'양식 합성 학급',ARRAY['__configured__','class-agit']);
    INSERT INTO public.students(id,class_id,name,student_code,auth_id) VALUES(s,c,'합성 학생',left(s::TEXT,8)||'FRM',st);
    INSERT INTO public.writing_missions(class_id,teacher_id,title,guide,genre,mission_type,input_template,min_chars,min_paragraphs,base_reward,bonus_reward)
        VALUES(c,t,'양식 보고서 과제','합성 안내','글쓰기','report','report',1,1,0,0) RETURNING id INTO m;
    INSERT INTO public.student_posts(id,class_id,student_id,mission_id,title,content,is_submitted,is_confirmed,structured_content)
    VALUES(p,c,s,m,'강낭콩 관찰','합성 본문',TRUE,TRUE,jsonb_build_object('template','report','version',1,'sections',jsonb_build_array(
        jsonb_build_object('id','a','heading','까닭','body','첫 칸 글'),jsonb_build_object('id','b','heading','내용','body','둘째 칸 글'))));
    PERFORM set_config('test.rf_post',p::TEXT,TRUE); PERFORM set_config('test.rf_mission',m::TEXT,TRUE);
    PERFORM set_config('app.bypass_profile_protection','false',TRUE);
END; $$;

CREATE FUNCTION pg_temp.src(p_structured JSONB, p_photos JSONB DEFAULT NULL) RETURNS JSONB LANGUAGE sql AS $$
    SELECT public.class_agit_source_data_v1(jsonb_populate_record(po, jsonb_build_object('structured_content', p_structured)), mi, '합성 학생', p_photos)
    FROM public.student_posts po, public.writing_missions mi
    WHERE po.id = current_setting('test.rf_post')::UUID AND mi.id = current_setting('test.rf_mission')::UUID;
$$;

DO $$
DECLARE r JSONB; pid UUID:=current_setting('test.rf_post')::UUID; marker TEXT:=public.class_agit_photo_marker_v1('11111111-1111-4111-8111-111111111111');
    obs JSONB; res JSONB; legacy JSONB; expected JSONB;
BEGIN
    obs:=jsonb_build_object('template','report','version',1,
        'meta',jsonb_build_object('kind','observation','target','강낭콩','period','10월 1일 ~ 10월 20일','method','눈, 돋보기'),
        'sections',jsonb_build_array(
            jsonb_build_object('id','a','heading','관찰한 까닭','body','궁금해서 관찰했다.'),
            jsonb_build_object('id','b','heading','관찰한 모습','date','10월 3일','source','식물도감 12쪽','body',E'잎이 두 장 나왔다.\n\n색은 연두색이다.',
                'image',jsonb_build_object('path',pid||'/f1/leaf.jpg','caption','잎 두 장','width',400,'height',300,'bytes',2000,'mimeType','image/jpeg')),
            jsonb_build_object('id','c','heading','알게 된 점','body','쑥쑥 자란다.'||E'\x1f','source','  식물도감   12쪽 '||E'\x1f')));
    -- 관찰 보고서(사진 확인 전): 머리말 → 문단(첫 문단 앞에 칸 날짜) → 참고 자료. 사진 자리표·설명은 없다.
    r:=pg_temp.src(obs);
    expected:='["관찰 대상: 강낭콩 · 관찰 기간·날짜: 10월 1일 ~ 10월 20일 · 관찰 방법·도구: 눈, 돋보기","궁금해서 관찰했다.","[10월 3일] 잎이 두 장 나왔다.","색은 연두색이다.","쑥쑥 자란다.","참고 자료: ① 식물도감 12쪽"]'::JSONB;
    IF r IS NULL OR r->'blocks'<>expected THEN RAISE EXCEPTION 'observation blocks %',r->'blocks'; END IF;
    IF r->>'kindLabel'<>'관찰 보고서' OR r->>'format'<>'prose' THEN RAISE EXCEPTION 'label % %',r->>'kindLabel',r->>'format'; END IF;
    IF r->>'excerpt'<>'궁금해서 관찰했다. 잎이 두 장 나왔다. 색은 연두색이다. 쑥쑥 자란다.' THEN RAISE EXCEPTION 'excerpt must be student paragraphs only: %',r->>'excerpt'; END IF;
    IF r::TEXT LIKE E'%\\u001f%' THEN RAISE EXCEPTION 'control char kept'; END IF;
    IF r->>'content' <> (SELECT string_agg(b,E'\n\n' ORDER BY o) FROM jsonb_array_elements_text(expected) WITH ORDINALITY x(b,o)) THEN RAISE EXCEPTION 'content %',r->>'content'; END IF;

    -- 같은 글에서 선생님이 확인한 사진: 자리표 → ▲ 사진 설명 → 문단. 사진 경로가 다르면(학생이 바꿨으면) 쓰지 않는다.
    r:=pg_temp.src(obs, jsonb_build_object('b',jsonb_build_object('id','11111111-1111-4111-8111-111111111111','path',pid||'/f1/leaf.jpg')));
    IF r->'blocks'<>jsonb_build_array(expected->0,expected->1,marker,'▲ 잎 두 장',expected->2,expected->3,expected->4,expected->5) THEN
        RAISE EXCEPTION 'photo order %',r->'blocks'; END IF;
    r:=pg_temp.src(obs, jsonb_build_object('b',jsonb_build_object('id','11111111-1111-4111-8111-111111111111','path',pid||'/f1/other.jpg')));
    IF r->'blocks'<>expected THEN RAISE EXCEPTION 'changed photo must be ignored %',r->'blocks'; END IF;

    -- 조사 보고서: 조사 칸 이름·순서, kindLabel
    res:=jsonb_build_object('template','report','version',1,
        'meta',jsonb_build_object('kind','research','topic','전통 음식','method','책, 인터넷','target','넣어도 무시'),
        'sections',jsonb_build_array(jsonb_build_object('id','a','heading','조사한 내용','body','비빔밥은 전주가 유명하다.')));
    -- 조사 보고서에 관찰 칸(target)이 섞여 와도 머리말 줄은 그 양식의 칸만 쓴다(무시)
    r:=pg_temp.src(res);
    IF r->'blocks'<>'["조사 주제: 전통 음식 · 조사 방법: 책, 인터넷","비빔밥은 전주가 유명하다."]'::JSONB OR r->>'kindLabel'<>'조사 보고서' THEN RAISE EXCEPTION 'research %',r; END IF;

    -- 본문이 빈 줄로 시작해도 칸 날짜는 첫 문단에 붙는다
    r:=pg_temp.src(jsonb_build_object('template','report','version',1,'meta',jsonb_build_object('kind','observation','target','콩'),
        'sections',jsonb_build_array(jsonb_build_object('id','a','heading','모습','date','10월 3일','body',E'\n\n  싹이 났다.'))));
    IF r IS NULL OR r->'blocks'->>1 <> '[10월 3일] 싹이 났다.' THEN RAISE EXCEPTION 'leading blank date %',r->'blocks'; END IF;
    -- 본문이 글자가 아니면(숫자·객체) 거절
    IF pg_temp.src(jsonb_build_object('template','report','version',1,'sections',jsonb_build_array(jsonb_build_object('id','a','heading','칸','body',123)))) IS NOT NULL THEN
        RAISE EXCEPTION 'non-string body accepted'; END IF;
    -- 예전 보고서(meta 없음): 문단만, 칸의 date·source 는 무시, 라벨은 그대로 '보고서'
    legacy:=jsonb_build_object('template','report','version',1,'sections',jsonb_build_array(
        jsonb_build_object('id','a','heading','칸','body','예전 글','date','10월 3일','source','책'),jsonb_build_object('id','b','heading','칸2','body','둘째')));
    r:=pg_temp.src(legacy);
    IF r->'blocks'<>'["예전 글","둘째"]'::JSONB OR r->>'kindLabel'<>'보고서' THEN RAISE EXCEPTION 'legacy changed %',r; END IF;

    -- 잘못된 머리말은 담지 않는다: 종류 없음/모르는 종류/모르는 칸/글자 아닌 값/100자 초과/객체 아님
    FOR r IN SELECT pg_temp.src(jsonb_set(obs,'{meta}',v)) FROM unnest(ARRAY[
        '{"target":"강낭콩"}'::JSONB,'{"kind":"novel","target":"x"}','{"kind":"observation","zzz":"x"}','{"kind":"observation","target":5}',
        jsonb_build_object('kind','observation','target',repeat('가',101)),'"문자열"','[]','null']) v LOOP
        IF r IS NOT NULL THEN RAISE EXCEPTION 'bad meta accepted %',r->'blocks'; END IF;
    END LOOP;
    -- 최상위에 모르는 키가 있으면 담지 않는다(허용 목록 방식 그대로)
    IF pg_temp.src(obs||'{"extra":1}') IS NOT NULL THEN RAISE EXCEPTION 'unknown top-level key accepted'; END IF;
    -- 머리말·사진 설명·출처만 있고 학생이 쓴 글이 없으면 담지 않는다
    IF pg_temp.src(jsonb_set(obs,'{sections}',jsonb_build_array(jsonb_build_object('id','a','heading','칸','body','   ','source','책 한 권','date','10월 3일')))) IS NOT NULL THEN
        RAISE EXCEPTION 'header-only report accepted'; END IF;
    -- 칸 수 13개는 담지 않는다(12칸 한도)
    IF pg_temp.src(jsonb_set(obs,'{sections}',(SELECT jsonb_agg(jsonb_build_object('id','s'||i,'heading','칸','body','글 '||i)) FROM generate_series(1,13) i))) IS NOT NULL THEN
        RAISE EXCEPTION '13 sections accepted'; END IF;
    -- 원글 버전: 머리말만 바뀌어도 달라진다(원글이 바뀐 작품을 알아보게)
    IF (pg_temp.src(obs)->>'source_revision') = (pg_temp.src(jsonb_set(obs,'{meta,target}','"완두콩"'))->>'source_revision') THEN
        RAISE EXCEPTION 'revision must change when meta changes'; END IF;
END; $$;
