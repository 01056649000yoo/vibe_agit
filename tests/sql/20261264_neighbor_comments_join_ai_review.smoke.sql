-- 합성 자료만 사용. 실행기가 전체를 ROLLBACK하거나 격리 DB를 제거한다.
-- 이웃 학급으로 가는 댓글이 우리 반 댓글과 같은 검사를 지나는지 본다.
DO $$
DECLARE
    ht UUID:=gen_random_uuid(); gt UUID:=gen_random_uuid();
    hc UUID:=gen_random_uuid(); gc UUID:=gen_random_uuid();
    hs UUID:=gen_random_uuid(); gs UUID:=gen_random_uuid();
    ha UUID:=gen_random_uuid(); ga UUID:=gen_random_uuid();
    sp UUID:=gen_random_uuid(); post UUID:=gen_random_uuid(); shared UUID:=gen_random_uuid();
    r JSONB; got TEXT; claimed JSONB; cid UUID; tok UUID;
BEGIN
    PERFORM set_config('app.bypass_profile_protection','true',TRUE);
    INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES
        (ht,'nc-'||ht||'@example.invalid','{}','{}'),(gt,'nc-'||gt||'@example.invalid','{}','{}'),
        (ha,'nc-'||ha||'@example.invalid','{}','{}'),(ga,'nc-'||ga||'@example.invalid','{}','{}');
    INSERT INTO public.profiles(id,role,is_approved) VALUES
        (ht,'TEACHER',TRUE),(gt,'TEACHER',TRUE),(ha,'STUDENT',TRUE),(ga,'STUDENT',TRUE)
        ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,is_approved=TRUE;
    INSERT INTO public.teachers(id,name,school_name) VALUES(ht,'호스트 교사','가 학교'),(gt,'이웃 교사','나 학교');
    INSERT INTO public.classes(id,teacher_id,name,enabled_modules) VALUES
        (hc,ht,'호스트 학급',ARRAY['__configured__','neighbor-agit']),
        (gc,gt,'이웃 학급',ARRAY['__configured__','neighbor-agit']);
    INSERT INTO public.students(id,class_id,name,student_code,auth_id) VALUES
        (hs,hc,'글쓴이',left(hs::TEXT,8)||'NC1',ha),(gs,gc,'댓글쓴이',left(gs::TEXT,8)||'NC2',ga);
    UPDATE public.neighbor_rollout_state SET mode='limited_beta';
    INSERT INTO public.neighbor_limited_classes(class_id,enabled_by) VALUES(hc,ht),(gc,ht) ON CONFLICT DO NOTHING;
    INSERT INTO public.neighbor_spaces(id,name,host_class_id,status,created_by) VALUES(sp,'합성 공간',hc,'active',ht);
    INSERT INTO public.neighbor_space_classes(space_id,class_id,role,status,public_class_name,student_access_enabled,joined_at) VALUES
        (sp,hc,'host','active','호스트 학급',TRUE,now()),(sp,gc,'guest','active','이웃 학급',TRUE,now());
    INSERT INTO public.student_posts(id,class_id,student_id,title,content,writing_context,self_writing_type,
            is_submitted,published_at,char_count,visibility)
        VALUES(post,hc,hs,'합성 글','본문','self','reading_log',TRUE,now(),100,'class');
    INSERT INTO public.neighbor_shared_posts(id,space_id,class_id,post_id,student_id,public_author_name,status,
            reviewed_at,reviewed_by,published_at)
        VALUES(shared,sp,hc,post,hs,'글쓴이','published',now(),ht,now());
    PERFORM set_config('app.bypass_profile_protection','false',TRUE);

    -- 이웃 학급 학생으로 댓글을 단다.
    PERFORM set_config('request.jwt.claim.sub',ga::TEXT,TRUE);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ga::TEXT,'role','authenticated')::TEXT,TRUE);
    r := public.save_neighbor_comment_v1(sp,shared,'글 잘 읽었어요!');

    -- 1) 바로 보이지 않고 검사를 기다려야 한다.
    IF r->>'status' <> 'pending' THEN RAISE EXCEPTION '이웃 댓글이 검사 없이 게시됐습니다: %', r; END IF;
    IF (r->>'pending_review')::BOOLEAN IS NOT TRUE THEN RAISE EXCEPTION '검사 중임을 화면에 알려 주지 않습니다: %', r; END IF;
    IF (r->>'comment_count')::INTEGER <> 0 THEN RAISE EXCEPTION '검사 전 댓글이 개수에 잡혔습니다: %', r; END IF;

    -- 2) 상대 학급 화면에도 아직 안 보인다.
    PERFORM set_config('request.jwt.claim.sub',ha::TEXT,TRUE);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ha::TEXT,'role','authenticated')::TEXT,TRUE);
    r := public.get_neighbor_shared_post_v1(sp,shared);
    IF jsonb_array_length(COALESCE(r->'comments','[]'::JSONB)) <> 0
    THEN RAISE EXCEPTION '검사 전 댓글이 상대 학급에 보입니다: %', r->'comments'; END IF;

    PERFORM set_config('test.nc_shared',shared::TEXT,TRUE);
    PERFORM set_config('test.nc_space',sp::TEXT,TRUE);
    PERFORM set_config('test.nc_host_auth',ha::TEXT,TRUE);
END; $$;

-- 3) 같은 작업기(service_role)가 이웃 댓글도 집어 간다. 작업기는 표 이름을 모른다.
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',TRUE);
DO $$
DECLARE claimed JSONB; r JSONB;
BEGIN
    claimed := public.claim_next_comment_ai_review_v2();
    IF (claimed->>'claimed')::BOOLEAN IS NOT TRUE
    THEN RAISE EXCEPTION '작업기가 이웃 댓글을 집지 못했습니다: %', claimed; END IF;
    IF claimed->>'source' <> 'neighbor'
    THEN RAISE EXCEPTION '집어 간 댓글이 이웃 것이 아닙니다: %', claimed; END IF;
    IF claimed->>'content' IS NULL OR claimed->>'content' = ''
    THEN RAISE EXCEPTION '작업기에 본문이 전달되지 않았습니다: %', claimed; END IF;

    -- 통과 판정 → 그때 비로소 보인다.
    r := public.complete_comment_ai_review_v2((claimed->>'comment_id')::UUID,
            (claimed->>'review_token')::UUID, TRUE, NULL, 'ai');
    IF r->>'status' <> 'visible' THEN RAISE EXCEPTION '통과했는데 공개되지 않았습니다: %', r; END IF;
    PERFORM set_config('test.nc_comment',claimed->>'comment_id',TRUE);
END; $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','',TRUE);

DO $$
DECLARE r JSONB;
BEGIN
    PERFORM set_config('request.jwt.claim.sub',current_setting('test.nc_host_auth'),TRUE);
    PERFORM set_config('request.jwt.claims',
        jsonb_build_object('sub',current_setting('test.nc_host_auth'),'role','authenticated')::TEXT,TRUE);
    r := public.get_neighbor_shared_post_v1(current_setting('test.nc_space')::UUID,
                                            current_setting('test.nc_shared')::UUID);
    IF jsonb_array_length(COALESCE(r->'comments','[]'::JSONB)) <> 1
    THEN RAISE EXCEPTION '검사를 통과한 댓글이 안 보입니다: %', r->'comments'; END IF;
END; $$;

-- 4) 걸러진 댓글은 끝까지 보이지 않는다.
--    표를 직접 되돌리는 것은 관리 역할로 한다(전용 표는 브라우저·작업기 모두 직접 못 읽는다).
UPDATE public.neighbor_comments SET status='pending', ai_review_attempts=0,
    ai_review_enqueued_at=now(), ai_review_next_at=now(), ai_review_token=NULL
 WHERE id=current_setting('test.nc_comment')::UUID;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',TRUE);
DO $$
DECLARE r JSONB;
BEGIN
    r := public.claim_next_comment_ai_review_v2();
    r := public.complete_comment_ai_review_v2((r->>'comment_id')::UUID,(r->>'review_token')::UUID,
            FALSE,'친구를 놀리는 말', 'ai');
    IF r->>'status' <> 'blocked' THEN RAISE EXCEPTION '부적절 판정이 반영되지 않았습니다: %', r; END IF;
END; $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','',TRUE);

DO $$
DECLARE r JSONB;
BEGIN
    PERFORM set_config('request.jwt.claim.sub',current_setting('test.nc_host_auth'),TRUE);
    PERFORM set_config('request.jwt.claims',
        jsonb_build_object('sub',current_setting('test.nc_host_auth'),'role','authenticated')::TEXT,TRUE);
    r := public.get_neighbor_shared_post_v1(current_setting('test.nc_space')::UUID,
                                            current_setting('test.nc_shared')::UUID);
    IF jsonb_array_length(COALESCE(r->'comments','[]'::JSONB)) <> 0
    THEN RAISE EXCEPTION '걸러진 댓글이 상대 학급에 보입니다: %', r->'comments'; END IF;
    RAISE NOTICE '이웃 댓글: 검사 대기·상대 학급 비노출·같은 작업기 처리·통과 시 공개·차단 시 계속 비공개 통과';
END; $$;
