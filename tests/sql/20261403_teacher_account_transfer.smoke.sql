-- Synthetic data only; the runner wraps this file in a rollback transaction.
-- 교사 계정 이관(20261403): 관리자만, 사전 점검은 아무것도 바꾸지 않고, 실행은 소유만 옮기며 이력은 둔다.

-- ① 분류가 빠진 열이 없어야 한다 — 새 표가 생기면 옮길지 둘지 `teacher_transfer_targets_v1` 에 한 줄로 정한다.
DO $$
DECLARE missing TEXT;
BEGIN
    SELECT string_agg(schema_name||'.'||table_name||'.'||column_name, ', ') INTO missing FROM public.teacher_transfer_unclassified_v1();
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION '교사 계정 이관 분류가 빠진 열이 있습니다(teacher_transfer_targets_v1 에 move/keep 로 추가): %', missing;
    END IF;
END; $$;

DO $$
DECLARE admin UUID:=gen_random_uuid(); o UUID:=gen_random_uuid(); n UUID:=gen_random_uuid(); x UUID:=gen_random_uuid(); n2 UUID:=gen_random_uuid();
    c_o UUID:=gen_random_uuid(); c_o2 UUID:=gen_random_uuid(); c_x UUID:=gen_random_uuid(); st UUID:=gen_random_uuid(); m UUID; p UUID:=gen_random_uuid();
    s_id UUID:=gen_random_uuid(); post_id UUID;
BEGIN
    PERFORM set_config('app.bypass_profile_protection','true',TRUE);
    INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) SELECT u,'tr-'||u||'@example.invalid','{}','{}' FROM unnest(ARRAY[admin,o,n,x,n2]) u;
    INSERT INTO public.profiles(id,email,role,is_approved) VALUES
        (admin,'tr-admin@example.invalid','ADMIN',TRUE),(o,'old-teacher@example.invalid','TEACHER',TRUE),(n,'new-teacher@example.invalid','TEACHER',TRUE),
        (x,'other-teacher@example.invalid','TEACHER',TRUE),(n2,'unready-teacher@example.invalid','TEACHER',TRUE)
        ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email,role=EXCLUDED.role,is_approved=TRUE;
    UPDATE public.profiles SET frequent_tags='["#옛태그"]'::JSONB WHERE id=o;
    -- n2 는 교사 정보(teachers 행)가 없다 = 아직 교사 정보를 입력하지 않은 새 계정
    INSERT INTO public.teachers(id,name,school_name) VALUES(o,'옛 합성 교사','시험 학교'),(n,'새 합성 교사','시험 학교'),(x,'다른 합성 교사','시험 학교');
    INSERT INTO public.classes(id,teacher_id,name,enabled_modules) VALUES(c_o,o,'옛 교사 학급 1',ARRAY['__configured__']),(c_o2,o,'옛 교사 학급 2',ARRAY['__configured__']),(c_x,x,'다른 교사 학급',ARRAY['__configured__']);
    INSERT INTO public.students(id,class_id,name,student_code,auth_id) VALUES(s_id,c_o,'합성 학생',left(md5(random()::TEXT),8)||'TRN',NULL);
    INSERT INTO public.writing_missions(class_id,teacher_id,title,guide,genre,mission_type,input_template,min_chars,min_paragraphs,base_reward,bonus_reward)
        VALUES(c_o,o,'옛 교사 과제','합성 안내','글쓰기','글쓰기','freeform',1,1,0,0),(c_x,x,'다른 교사 과제','합성 안내','글쓰기','글쓰기','freeform',1,1,0,0);
    INSERT INTO public.ai_prompt_presets(teacher_id,kind,name,content,is_active) VALUES(o,'feedback','옛 피드백 틀','합성 내용',TRUE);
    -- 운영에서 행이 가장 많은 표: 교사 댓글(작성 교사를 바꾸지 못하게 막는 보호 규칙이 있다)·점수 기록. 이관은 알림·활동 기록을 다시 만들면 안 된다.
    SELECT id INTO m FROM public.writing_missions WHERE class_id=c_o AND teacher_id=o LIMIT 1;
    INSERT INTO public.student_posts(class_id,student_id,mission_id,title,content,is_submitted,is_confirmed)
        VALUES(c_o,s_id,m,'합성 글','합성 본문',TRUE,TRUE) RETURNING id INTO post_id;
    INSERT INTO public.post_comments(post_id,student_id,content,teacher_id,class_id) VALUES(post_id,s_id,'선생님 댓글',o,c_o);
    INSERT INTO public.point_logs(student_id,amount,reason,mission_id,post_id,class_id,teacher_id,activity_type) VALUES(s_id,10,'합성 점수',m,post_id,c_o,o,'writing_reward');
    PERFORM set_config('test.tr_events',((SELECT count(*) FROM public.student_notification_events)||','||(SELECT count(*) FROM public.writing_activity_events)),TRUE);
    PERFORM set_config('test.tr_admin',admin::TEXT,TRUE); PERFORM set_config('test.tr_old',o::TEXT,TRUE); PERFORM set_config('test.tr_new',n::TEXT,TRUE);
    PERFORM set_config('test.tr_other',x::TEXT,TRUE); PERFORM set_config('test.tr_unready',n2::TEXT,TRUE);
    PERFORM set_config('test.tr_class',c_o::TEXT,TRUE); PERFORM set_config('test.tr_class_x',c_x::TEXT,TRUE);
    PERFORM set_config('app.bypass_profile_protection','false',TRUE);
END; $$;

-- ② 관리자가 아니면 못 부른다(다른 교사·로그인 전)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.tr_other'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.tr_other'),'role','authenticated')::TEXT,TRUE);
DO $$
DECLARE denied BOOLEAN:=FALSE; o UUID:=current_setting('test.tr_old')::UUID; n UUID:=current_setting('test.tr_new')::UUID;
BEGIN
    BEGIN PERFORM public.admin_transfer_teacher_account_v1(o,n,FALSE,NULL); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'non-admin previewed a transfer'; END IF;
    denied:=FALSE; BEGIN PERFORM public.admin_transfer_teacher_account_v1(o,n,TRUE,'old-teacher@example.invalid'); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'non-admin applied a transfer'; END IF;
    denied:=FALSE; BEGIN PERFORM public.admin_find_teachers_v1('합성'); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'non-admin searched teachers'; END IF;
    denied:=FALSE; BEGIN PERFORM public.admin_list_teacher_transfers_v1(); EXCEPTION WHEN insufficient_privilege THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'non-admin listed transfers'; END IF;
END; $$;

-- ③ 관리자: 사전 점검은 아무것도 바꾸지 않는다
SELECT set_config('request.jwt.claim.sub',current_setting('test.tr_admin'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.tr_admin'),'role','authenticated')::TEXT,TRUE);
DO $$
DECLARE o UUID:=current_setting('test.tr_old')::UUID; n UUID:=current_setting('test.tr_new')::UUID; n2 UUID:=current_setting('test.tr_unready')::UUID; x UUID:=current_setting('test.tr_other')::UUID;
    r JSONB; denied BOOLEAN;
BEGIN
    -- 교사 찾기
    r:=public.admin_find_teachers_v1('옛 합성');
    IF jsonb_array_length(r->'teachers')<>1 OR (r->'teachers'->0->>'class_count')::INTEGER<>2 THEN RAISE EXCEPTION 'find teachers %',r; END IF;
    -- 점검
    r:=public.admin_transfer_teacher_account_v1(o,n,FALSE,NULL);
    IF (r->>'applied')::BOOLEAN OR NOT (r->>'can_apply')::BOOLEAN OR jsonb_array_length(r->'conflicts')<>0 THEN RAISE EXCEPTION 'preview result %',r; END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'moved') m WHERE m->>'table'='public.classes' AND m->>'column'='teacher_id' AND (m->>'rows')::INTEGER=2) THEN RAISE EXCEPTION 'classes not counted %',r->'moved'; END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'moved') m WHERE m->>'table'='public.writing_missions' AND (m->>'rows')::INTEGER=1) THEN RAISE EXCEPTION 'missions not counted'; END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'moved') m WHERE m->>'table'='public.ai_prompt_presets' AND (m->>'rows')::INTEGER=1) THEN RAISE EXCEPTION 'presets not counted'; END IF;
    -- 점검 뒤에도 아무것도 바뀌지 않았다(옛 계정 소유 그대로, 기록 없음)
    IF (SELECT count(*) FROM public.classes WHERE teacher_id=o)<>2 OR (SELECT count(*) FROM public.classes WHERE teacher_id=n)<>0 THEN RAISE EXCEPTION 'preview changed ownership'; END IF;
    IF (public.admin_list_teacher_transfers_v1()->'transfers')<>'[]'::JSONB THEN RAISE EXCEPTION 'preview wrote a transfer record'; END IF;
    -- 사전 조건
    denied:=FALSE; BEGIN PERFORM public.admin_transfer_teacher_account_v1(o,o,FALSE,NULL); EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'same account accepted'; END IF;
    denied:=FALSE; BEGIN PERFORM public.admin_transfer_teacher_account_v1(o,n2,FALSE,NULL); EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'new account without teacher info accepted'; END IF;
    denied:=FALSE; BEGIN PERFORM public.admin_transfer_teacher_account_v1(o,current_setting('test.tr_admin')::UUID,FALSE,NULL); EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'admin account accepted as target'; END IF;
    -- 확인 문구가 옛 계정 이메일과 다르면 실행을 거절한다
    denied:=FALSE; BEGIN PERFORM public.admin_transfer_teacher_account_v1(o,n,TRUE,'wrong@example.invalid'); EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'wrong confirmation accepted'; END IF;
    IF (SELECT count(*) FROM public.classes WHERE teacher_id=o)<>2 THEN RAISE EXCEPTION 'rejected apply changed data'; END IF;
END; $$;

-- ④ 충돌이 있으면 점검이 알려 준다(연구소 교사 프로필은 user_id 가 유일 — 새 계정이 이미 가지고 있으면 옮길 수 없다)
RESET ROLE;
DO $$
DECLARE o UUID:=current_setting('test.tr_old')::UUID; n UUID:=current_setting('test.tr_new')::UUID;
BEGIN
    INSERT INTO writing_helper.teacher_profiles(user_id,name) VALUES(o,'옛 연구소 프로필'),(n,'새 연구소 프로필');
END; $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.tr_admin'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.tr_admin'),'role','authenticated')::TEXT,TRUE);
DO $$
DECLARE o UUID:=current_setting('test.tr_old')::UUID; n UUID:=current_setting('test.tr_new')::UUID; r JSONB; failed BOOLEAN:=FALSE;
BEGIN
    r:=public.admin_transfer_teacher_account_v1(o,n,FALSE,NULL);
    IF (r->>'can_apply')::BOOLEAN OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'conflicts') c WHERE c->>'table'='writing_helper.teacher_profiles') THEN
        RAISE EXCEPTION 'conflict not reported %',r->'conflicts'; END IF;
    -- 충돌 점검 뒤에도 다른 열은 바뀌지 않았다
    IF (SELECT count(*) FROM public.classes WHERE teacher_id=o)<>2 THEN RAISE EXCEPTION 'conflict preview changed data'; END IF;
    -- 충돌이 있는 채로 실행하면 전체가 취소된다(한 행도 안 옮겨진다)
    BEGIN PERFORM public.admin_transfer_teacher_account_v1(o,n,TRUE,'old-teacher@example.invalid'); EXCEPTION WHEN unique_violation THEN failed:=TRUE; END;
    IF NOT failed THEN RAISE EXCEPTION 'apply with a conflict must fail'; END IF;
END; $$;

-- ⑤ 충돌을 치운 뒤 실행: 소유만 옮기고 이력은 둔다
RESET ROLE;
DO $$ BEGIN DELETE FROM writing_helper.teacher_profiles WHERE user_id=current_setting('test.tr_new')::UUID; END; $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.tr_admin'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.tr_admin'),'role','authenticated')::TEXT,TRUE);
DO $$
DECLARE o UUID:=current_setting('test.tr_old')::UUID; n UUID:=current_setting('test.tr_new')::UUID; r JSONB; denied BOOLEAN:=FALSE;
BEGIN
    r:=public.admin_transfer_teacher_account_v1(o,n,TRUE,' Old-Teacher@example.invalid ');   -- 대소문자·공백은 무시
    IF NOT (r->>'applied')::BOOLEAN THEN RAISE EXCEPTION 'apply result %',r; END IF;
    -- 이관 기록이 남고, 목록에 보인다
    IF (public.admin_list_teacher_transfers_v1()->'transfers'->0->>'old_email')<>'old-teacher@example.invalid' THEN RAISE EXCEPTION 'transfer not recorded'; END IF;
    -- 같은 옛 계정은 두 번 이관할 수 없다
    BEGIN PERFORM public.admin_transfer_teacher_account_v1(o,n,FALSE,NULL); EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'second transfer of the same old account accepted'; END IF;
END; $$;
-- 행 수는 서비스 권한으로 센다(표 접근 정책 때문에 관리자 역할로는 일부 표가 보이지 않는다)
RESET ROLE;
DO $$
DECLARE o UUID:=current_setting('test.tr_old')::UUID; n UUID:=current_setting('test.tr_new')::UUID; x UUID:=current_setting('test.tr_other')::UUID;
BEGIN
    IF (SELECT count(*) FROM public.classes WHERE teacher_id=n)<>2 OR (SELECT count(*) FROM public.classes WHERE teacher_id=o)<>0 THEN RAISE EXCEPTION 'classes not moved'; END IF;
    IF (SELECT count(*) FROM public.writing_missions WHERE teacher_id=n)<>1 OR (SELECT count(*) FROM public.ai_prompt_presets WHERE teacher_id=n)<>1 THEN RAISE EXCEPTION 'owned rows not moved'; END IF;
    IF (SELECT count(*) FROM writing_helper.teacher_profiles WHERE user_id=n)<>1 THEN RAISE EXCEPTION 'lab profile not moved'; END IF;
    -- 보호 규칙이 있는 댓글·점수 기록도 옮겨지고, 알림·활동 기록은 새로 생기지 않는다
    IF (SELECT count(*) FROM public.post_comments WHERE teacher_id=n)<>1 OR (SELECT count(*) FROM public.post_comments WHERE teacher_id=o)<>0 THEN RAISE EXCEPTION 'teacher comments not moved'; END IF;
    IF (SELECT count(*) FROM public.point_logs WHERE teacher_id=n)<>1 THEN RAISE EXCEPTION 'point logs not moved'; END IF;
    IF ((SELECT count(*) FROM public.student_notification_events)||','||(SELECT count(*) FROM public.writing_activity_events)) <> current_setting('test.tr_events') THEN
        RAISE EXCEPTION 'transfer created notifications or activity events (before % after %)',current_setting('test.tr_events'),
            ((SELECT count(*) FROM public.student_notification_events)||','||(SELECT count(*) FROM public.writing_activity_events)); END IF;
    -- 다른 교사 자료는 그대로
    IF (SELECT count(*) FROM public.classes WHERE teacher_id=x)<>1 OR (SELECT count(*) FROM public.writing_missions WHERE teacher_id=x)<>1 THEN RAISE EXCEPTION 'other teacher data touched'; END IF;
    -- 학생은 학급에 묶여 그대로 따라온다
    IF (SELECT count(*) FROM public.students s JOIN public.classes c ON c.id=s.class_id WHERE c.teacher_id=n)<>1 THEN RAISE EXCEPTION 'students did not follow the class'; END IF;
    -- 새 계정은 비어 있던 개인 설정을 이어받는다
    IF (SELECT frequent_tags FROM public.profiles WHERE id=n)<>'["#옛태그"]'::JSONB THEN RAISE EXCEPTION 'settings not inherited'; END IF;
    -- 옛 계정은 지워지지 않고 승인이 취소되어 로그인이 막힌다
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=o AND is_approved IS NOT TRUE AND approval_revoked_at IS NOT NULL) THEN RAISE EXCEPTION 'old account must be kept but revoked'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.teachers WHERE id=o) THEN RAISE EXCEPTION 'old teacher info must be kept'; END IF;
END; $$;

-- ⑥ 외부 검토(방어적 코드 리뷰)에서 나온 입력들
-- (a) 이메일 기록이 없는 옛 계정은 확인 문구를 받을 수 없어 실행하지 않는다(빈 문구로 통과하면 안 된다)
DO $$
DECLARE x UUID:=current_setting('test.tr_other')::UUID; n UUID:=current_setting('test.tr_new')::UUID;
BEGIN
    UPDATE public.profiles SET email=NULL WHERE id=x;
    UPDATE public.teachers SET email=NULL WHERE id=x;
END; $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.tr_admin'),TRUE);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.tr_admin'),'role','authenticated')::TEXT,TRUE);
DO $$
DECLARE x UUID:=current_setting('test.tr_other')::UUID; n UUID:=current_setting('test.tr_new')::UUID; denied BOOLEAN:=FALSE; r JSONB;
BEGIN
    BEGIN PERFORM public.admin_transfer_teacher_account_v1(x,n,TRUE,NULL); EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'apply without any email accepted (NULL confirm)'; END IF;
    denied:=FALSE;
    BEGIN PERFORM public.admin_transfer_teacher_account_v1(x,n,TRUE,''); EXCEPTION WHEN invalid_parameter_value THEN denied:=TRUE; END;
    IF NOT denied THEN RAISE EXCEPTION 'apply without any email accepted (empty confirm)'; END IF;
    -- 점검은 되고, 활동 상태 경고 값이 함께 온다
    r:=public.admin_transfer_teacher_account_v1(x,n,FALSE,NULL);
    IF NOT ((r->'old') ? 'recently_active' AND (r->'old') ? 'approved' AND (r->'old') ? 'last_login_at') THEN RAISE EXCEPTION 'old account warnings missing %',r->'old'; END IF;
    IF (r->'old'->>'approved')::BOOLEAN IS NOT TRUE THEN RAISE EXCEPTION 'an approved old account must be flagged as approved'; END IF;
END; $$;
RESET ROLE;
DO $$
BEGIN
    IF (SELECT count(*) FROM public.classes WHERE teacher_id=current_setting('test.tr_other')::UUID)<>1 THEN RAISE EXCEPTION 'rejected apply moved another teacher''s class'; END IF;
END; $$;
-- (b) replica 모드는 외래키 검사를 끄므로, 옮길 열의 부모 표에 새 계정이 있는지 직접 확인한다
DO $$
DECLARE x UUID:=current_setting('test.tr_other')::UUID; n UUID:=current_setting('test.tr_new')::UUID; missing TEXT;
BEGIN
    CREATE TABLE public.zz_transfer_probe(teacher_id UUID REFERENCES writing_helper.teacher_profiles(user_id));
    -- x 는 연구소 교사 프로필이 없다 → 부모에 없음
    missing:=public.teacher_transfer_missing_parent_v1('public','zz_transfer_probe','teacher_id',x);
    IF missing IS DISTINCT FROM 'writing_helper.teacher_profiles.user_id' THEN RAISE EXCEPTION 'missing parent not detected: %',missing; END IF;
    -- n 은 위 이관으로 연구소 교사 프로필을 이어받았다 → 있음
    IF public.teacher_transfer_missing_parent_v1('public','zz_transfer_probe','teacher_id',n) IS NOT NULL THEN RAISE EXCEPTION 'existing parent reported missing'; END IF;
    -- 외래키가 없는 열·없는 표는 NULL
    IF public.teacher_transfer_missing_parent_v1('public','classes','name',x) IS NOT NULL OR public.teacher_transfer_missing_parent_v1('public','no_such_table','x',x) IS NOT NULL THEN RAISE EXCEPTION 'non-FK column must pass'; END IF;
END; $$;
