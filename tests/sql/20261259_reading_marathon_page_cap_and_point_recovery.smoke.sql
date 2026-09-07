-- 합성 자료만 사용. 실행기가 전체를 ROLLBACK하거나 격리 DB를 제거한다.
-- 4,040쪽 전집 같은 책이 거리로 잡히지 않는지, 확인을 취소하면 포인트가 회수되는지 본다.
DO $$
DECLARE
    t UUID:=gen_random_uuid(); a UUID:=gen_random_uuid(); c UUID:=gen_random_uuid(); s UUID:=gen_random_uuid();
    camp UUID:=gen_random_uuid(); big_book UUID:=gen_random_uuid(); ok_book UUID:=gen_random_uuid();
    big_post UUID; ok_post UUID; big_item UUID:=gen_random_uuid(); ok_item UUID:=gen_random_uuid();
    r JSONB; dist INTEGER; pts INTEGER; before_pts INTEGER; cap INTEGER;
BEGIN
    cap := public.reading_marathon_max_pages_v1();
    IF cap NOT BETWEEN 200 AND 2000 THEN RAISE EXCEPTION '쪽수 상한이 비상식적입니다: %', cap; END IF;

    PERFORM set_config('app.bypass_profile_protection','true',TRUE);
    INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data)
        VALUES(t,'mr-'||t||'@example.invalid','{}','{}'),(a,'mr-'||a||'@example.invalid','{}','{}');
    INSERT INTO public.profiles(id,role,is_approved) VALUES(t,'TEACHER',TRUE),(a,'STUDENT',TRUE)
        ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,is_approved=TRUE;
    INSERT INTO public.teachers(id,name,school_name) VALUES(t,'합성 교사','시험 학교');
    INSERT INTO public.classes(id,teacher_id,name,enabled_modules)
        VALUES(c,t,'마라톤 합성 학급',ARRAY['__configured__','reading-log']);
    INSERT INTO public.students(id,class_id,name,student_code,auth_id)
        VALUES(s,c,'합성 학생',left(s::TEXT,8)||'MRT',a);

    INSERT INTO public.book_catalog(id,source,source_key,title,page_count)
        VALUES(big_book,'manual','big-'||big_book,'거대한 전집', cap + 3040),
              (ok_book,'manual','ok-'||ok_book,'보통 그림책', 120);
    INSERT INTO public.reading_marathon_campaigns(id,class_id,title,target_distance_m,meters_per_page,status,started_at,teacher_id,
            competition_type,medal_requirement_type,medal_requirement_value)
        VALUES(camp,c,'합성 마라톤',100000,10,'active',NOW()-INTERVAL '5 days',t,'individual','none',0);
    INSERT INTO public.reading_marathon_participants(campaign_id,class_id,student_id,name_snapshot) VALUES(camp,c,s,'합성 학생');

    FOR i IN 1..2 LOOP
        INSERT INTO public.student_posts(class_id,student_id,title,content,writing_context,self_writing_type,
                is_submitted,published_at,created_at,char_count,awarded_base_reward,awarded_min_chars)
            -- 일일 보상 한도가 1회라 두 편을 다른 날로 둔다.
            VALUES(c,s,CASE WHEN i=1 THEN '전집 독서록' ELSE '그림책 독서록' END,'본문','self','reading_log',TRUE,
                   NOW()-(i||' days')::INTERVAL, NOW()-(i||' days')::INTERVAL, 200,10,0)
            RETURNING id INTO big_post;
        IF i=1 THEN
            INSERT INTO public.student_library_items(id,class_id,student_id,book_id) VALUES(big_item,c,s,big_book);
            INSERT INTO public.reading_log_entries(post_id,class_id,student_id,library_item_id) VALUES(big_post,c,s,big_item);
        ELSE
            ok_post := big_post;
            INSERT INTO public.student_library_items(id,class_id,student_id,book_id) VALUES(ok_item,c,s,ok_book);
            INSERT INTO public.reading_log_entries(post_id,class_id,student_id,library_item_id) VALUES(ok_post,c,s,ok_item);
        END IF;
    END LOOP;
    SELECT post.id INTO big_post FROM public.student_posts post
        WHERE post.class_id=c AND post.title='전집 독서록' LIMIT 1;
    PERFORM set_config('app.bypass_profile_protection','false',TRUE);
    PERFORM set_config('request.jwt.claim.sub',t::TEXT,TRUE);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',t::TEXT,'role','authenticated')::TEXT,TRUE);

    -- 두 독서록을 모두 확인한다.
    PERFORM public.save_teacher_self_writing_review_v2(big_post,'','accepted');
    r := public.save_teacher_self_writing_review_v2(ok_post,'','accepted');

    -- 1) 상한을 넘는 전집은 거리에 들어가지 않고, 보통 책만 잡힌다.
    SELECT COALESCE(sum(distance_m),0) INTO dist FROM public.reading_marathon_contributions WHERE campaign_id=camp;
    IF dist <> 1200 THEN RAISE EXCEPTION '거리는 보통 책 120쪽×10m=1200m 이어야 하는데 %m 입니다', dist; END IF;
    IF EXISTS(SELECT 1 FROM public.reading_marathon_contributions WHERE campaign_id=camp AND page_count > cap)
    THEN RAISE EXCEPTION '상한을 넘는 책이 거리로 잡혔습니다'; END IF;

    -- 2) 교사 화면의 `쪽수 확인` 목록에 이유와 함께 뜬다.
    r := public.get_reading_marathon_snapshot(c);
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'pending_books') x WHERE x->>'reason'='too_long')
    THEN RAISE EXCEPTION '상한 초과 책이 교사 확인 목록에 없습니다: %', r->'pending_books'; END IF;

    -- 3) 확인을 취소하면 포인트가 회수된다.
    SELECT COALESCE(sum(amount),0) INTO before_pts FROM public.point_logs
        WHERE student_id=s AND post_id=ok_post AND activity_type='writing_reward';
    IF before_pts <= 0 THEN RAISE EXCEPTION '확인 보상이 지급되지 않아 회수를 시험할 수 없습니다'; END IF;
    PERFORM public.save_teacher_self_writing_review_v2(ok_post,'쪽수를 다시 확인해 주세요.','revision_requested');
    SELECT COALESCE(sum(amount),0) INTO pts FROM public.point_logs
        WHERE student_id=s AND post_id=ok_post AND activity_type='writing_reward';
    IF pts <> 0 THEN RAISE EXCEPTION '확인 취소 뒤 포인트 순합이 0이어야 하는데 %P 입니다', pts; END IF;

    -- 4) 같은 동작을 되풀이해도 두 번 깎지 않는다.
    PERFORM public.save_teacher_self_writing_review_v2(ok_post,'다시 확인이 필요합니다.','revision_requested');
    SELECT COALESCE(sum(amount),0) INTO pts FROM public.point_logs
        WHERE student_id=s AND post_id=ok_post AND activity_type='writing_reward';
    IF pts <> 0 THEN RAISE EXCEPTION '되풀이 취소가 포인트를 더 깎았습니다: %P', pts; END IF;

    -- 5) 확인 취소로 마라톤 거리도 함께 줄어든다.
    SELECT COALESCE(sum(distance_m),0) INTO dist FROM public.reading_marathon_contributions WHERE campaign_id=camp;
    IF dist <> 0 THEN RAISE EXCEPTION '확인을 취소했는데 거리가 %m 남았습니다', dist; END IF;

    -- 6) 다시 확인하면 포인트와 거리가 정상 복구된다.
    PERFORM public.save_teacher_self_writing_review_v2(ok_post,'','accepted');
    SELECT COALESCE(sum(amount),0) INTO pts FROM public.point_logs
        WHERE student_id=s AND post_id=ok_post AND activity_type='writing_reward';
    IF pts <> before_pts THEN RAISE EXCEPTION '다시 확인했는데 포인트가 %P (원래 %P)', pts, before_pts; END IF;
    SELECT COALESCE(sum(distance_m),0) INTO dist FROM public.reading_marathon_contributions WHERE campaign_id=camp;
    IF dist <> 1200 THEN RAISE EXCEPTION '다시 확인했는데 거리가 %m 입니다', dist; END IF;

    RAISE NOTICE '독서마라톤: 상한 초과 책 제외·교사 확인 목록 노출·확인 취소 시 포인트/거리 동시 회수·되풀이 안전·재확인 복구 통과';
END; $$;
