-- 모두의 아지트 전체 흐름 시뮬레이션 (2026-09-23)
--
-- 가상의 교사 4명·학급 4개(참여 3 + 공개 대상이 아닌 1)·학생 10명을 만들어, 실제 화면이 부르는
-- RPC 를 실제 역할(교사·학생·AI 검사기)로 차례로 부른다. **한 트랜잭션 안에서 돌리고 끝에 모두 되돌린다**
-- (scripts/run-neighbor-simulation.sh 가 BEGIN … ROLLBACK 으로 감싼다). 운영 자료는 남지 않는다.
--
-- 결과는 public.zz_sim_log 에 한 줄씩 쌓고 마지막에 표로 보여 준다. 한 단계가 실패해도 다음 단계로 간다.
-- 기대한 거절(권한 없음 등)은 "막혔으면 통과" 로 센다.

-- ───────────────────────── 0. 도우미 (롤백과 함께 사라진다) ─────────────────────────
CREATE TABLE public.zz_sim_log (n SERIAL PRIMARY KEY, step TEXT, ok BOOLEAN, detail TEXT);
GRANT ALL ON public.zz_sim_log TO authenticated, service_role;
GRANT ALL ON SEQUENCE public.zz_sim_log_n_seq TO authenticated, service_role;

CREATE FUNCTION public.zz_sim_check(p_step TEXT, p_ok BOOLEAN, p_detail TEXT DEFAULT '')
RETURNS VOID LANGUAGE sql AS $$
    INSERT INTO public.zz_sim_log (step, ok, detail) VALUES (p_step, COALESCE(p_ok, FALSE), COALESCE(p_detail, ''));
$$;
CREATE FUNCTION public.zz_sim(p_key TEXT) RETURNS UUID LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('sim.' || p_key, TRUE), '')::UUID;
$$;
-- 요청 주체를 바꾼다(역할 전환은 바깥에서 SET LOCAL ROLE 로 한다).
CREATE FUNCTION public.zz_sim_login(p_key TEXT, p_role TEXT DEFAULT 'authenticated') RETURNS VOID LANGUAGE sql AS $$
    SELECT set_config('request.jwt.claim.sub', COALESCE(current_setting('sim.' || p_key, TRUE), ''), TRUE),
           set_config('request.jwt.claims', jsonb_build_object(
               'sub', COALESCE(current_setting('sim.' || p_key, TRUE), ''), 'role', p_role)::TEXT, TRUE);
$$;
-- 기대한 거절: 문장이 막히면 통과.
CREATE FUNCTION public.zz_sim_expect_denied(p_step TEXT, p_sql TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION WHEN OTHERS THEN
        PERFORM public.zz_sim_check(p_step, TRUE, '막힘: ' || SQLERRM);
        RETURN;
    END;
    PERFORM public.zz_sim_check(p_step, FALSE, '막혀야 하는데 통과했습니다');
END;
$$;
-- AI 댓글 검사기 흉내: 실제 작업기와 같은 claim → complete 를 부른다. 다른 댓글이 잡히면 되돌려 둔다.
CREATE FUNCTION public.zz_sim_ai(p_comment UUID, p_ok BOOLEAN, p_reason TEXT DEFAULT NULL) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE
    v JSONB;
BEGIN
    FOR i IN 1..30 LOOP
        v := public.claim_next_comment_ai_review_v2();
        IF (v->>'claimed')::BOOLEAN IS NOT TRUE THEN
            RETURN FALSE;
        END IF;
        IF (v->>'comment_id')::UUID = p_comment THEN
            PERFORM public.complete_comment_ai_review_v2(p_comment, (v->>'review_token')::UUID, p_ok, p_reason, 'ai');
            RETURN TRUE;
        END IF;
        PERFORM public.fail_comment_ai_review_v2((v->>'comment_id')::UUID, (v->>'review_token')::UUID, 'simulation_skip');
    END LOOP;
    RETURN FALSE;
EXCEPTION WHEN OTHERS THEN
    PERFORM public.zz_sim_check('AI 검사기 오류', FALSE, SQLERRM);
    RETURN FALSE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.zz_sim_check(TEXT, BOOLEAN, TEXT), public.zz_sim(TEXT), public.zz_sim_login(TEXT, TEXT),
    public.zz_sim_expect_denied(TEXT, TEXT), public.zz_sim_ai(UUID, BOOLEAN, TEXT) TO authenticated, service_role;

-- ───────────────────────── 1. 가상 교사·학급·학생 만들기 ─────────────────────────
DO $$
DECLARE
    v_admin UUID;
    v_teacher UUID;
    v_class UUID;
    v_student UUID;
    v_auth UUID;
    v_mission UUID;
    v_item RECORD;
    v_n INTEGER;
BEGIN
    SELECT id INTO v_admin FROM public.profiles WHERE role = 'ADMIN' ORDER BY created_at LIMIT 1;
    PERFORM set_config('sim.admin', v_admin::TEXT, TRUE);
    PERFORM set_config('app.bypass_profile_protection', 'true', TRUE);

    FOR v_item IN SELECT * FROM (VALUES
        ('a', '[시뮬] 햇살반', 3, TRUE),
        ('b', '[시뮬] 바다반', 3, TRUE),
        ('c', '[시뮬] 별빛반', 3, TRUE),
        ('d', '[시뮬] 외부반', 1, FALSE)   -- 공개 대상이 아닌 학급(접근이 막혀야 한다)
    ) AS t(k, class_name, students, released)
    LOOP
        INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
            is_super_admin, is_sso_user, is_anonymous, created_at, updated_at)
        VALUES (gen_random_uuid(), 'authenticated', 'authenticated', format('sim-teacher-%s@internal.invalid', v_item.k),
            '{"provider":"simulation"}', '{"fixture":"neighbor-simulation"}', FALSE, FALSE, FALSE, NOW(), NOW())
        RETURNING id INTO v_teacher;
        INSERT INTO public.profiles (id, email, full_name, role, is_approved, email_verified, api_mode)
        VALUES (v_teacher, format('sim-teacher-%s@internal.invalid', v_item.k), '시뮬 교사 ' || upper(v_item.k),
            'TEACHER', TRUE, FALSE, 'SYSTEM');
        INSERT INTO public.teachers (id, name, school_name, email)
        VALUES (v_teacher, '시뮬 교사 ' || upper(v_item.k), '시뮬레이션초', format('sim-teacher-%s@internal.invalid', v_item.k));
        INSERT INTO public.classes (teacher_id, name, enabled_modules)
        VALUES (v_teacher, v_item.class_name, ARRAY['neighbor-agit'])
        RETURNING id INTO v_class;
        IF v_item.released THEN
            INSERT INTO public.neighbor_limited_classes (class_id, enabled_by) VALUES (v_class, v_admin);
        END IF;
        PERFORM set_config('sim.t_' || v_item.k, v_teacher::TEXT, TRUE);
        PERFORM set_config('sim.c_' || v_item.k, v_class::TEXT, TRUE);

        -- 우리 반 과제 하나(이웃 글 마당에 쓸 제출 글이 이 과제에 달린다).
        INSERT INTO public.writing_missions (class_id, teacher_id, title, guide, min_chars, min_paragraphs)
        VALUES (v_class, v_teacher, '우리 동네 자랑', '우리 동네의 좋은 점을 소개해요.', 10, 1)
        RETURNING id INTO v_mission;

        FOR v_n IN 1..v_item.students LOOP
            INSERT INTO auth.users (id, aud, role, raw_app_meta_data, is_super_admin, is_sso_user, is_anonymous, created_at, updated_at)
            VALUES (gen_random_uuid(), 'authenticated', 'authenticated', '{"provider":"anonymous"}', FALSE, FALSE, TRUE, NOW(), NOW())
            RETURNING id INTO v_auth;
            INSERT INTO public.students (class_id, name, student_code, auth_id, is_active)
            VALUES (v_class, format('%s학생%s', upper(v_item.k), v_n), format('SIM%s%s', upper(v_item.k), v_n), v_auth, TRUE)
            RETURNING id INTO v_student;
            PERFORM set_config(format('sim.s_%s%s', v_item.k, v_n), v_student::TEXT, TRUE);
            PERFORM set_config(format('sim.u_%s%s', v_item.k, v_n), v_auth::TEXT, TRUE);
            -- 과제 제출 글 한 편씩.
            INSERT INTO public.student_posts (mission_id, student_id, class_id, title, content, char_count, paragraph_count,
                is_submitted, first_submitted_at, writing_context, visibility)
            VALUES (v_mission, v_student, v_class, format('%s학생%s의 동네 자랑', upper(v_item.k), v_n),
                '우리 동네에는 커다란 느티나무가 있어요. 여름이면 그늘 아래에서 친구들과 놀아요.', 40, 1,
                TRUE, NOW(), 'assignment', 'class');
        END LOOP;
    END LOOP;
    PERFORM public.zz_sim_check('0 준비: 가상 교사 4·학급 4·학생 10·제출 글 10', TRUE,
        (SELECT count(*)::TEXT FROM public.students WHERE student_code LIKE 'SIM%') || '명');
END;
$$;

-- ───────────────────────── 2. 공간 만들기·초대·참여 ─────────────────────────
SET LOCAL ROLE authenticated;
SELECT public.zz_sim_login('t_a');
DO $$
DECLARE r JSONB;
BEGIN
    r := public.run_neighbor_teacher_action_v1(public.zz_sim('c_a'), 'create_space',
        jsonb_build_object('name', '시뮬 글마을', 'public_class_name', '햇살반', 'description', '세 반이 글로 만나요'));
    PERFORM set_config('sim.space', r#>>'{workspace,space,id}', TRUE);
    PERFORM public.zz_sim_check('1 호스트(햇살반)가 공간을 만든다', r#>>'{workspace,space,my_role}' = 'host', r#>>'{workspace,space,name}');
    r := public.run_neighbor_teacher_action_v1(public.zz_sim('c_a'), 'create_invite', jsonb_build_object('space_id', public.zz_sim('space')));
    PERFORM set_config('sim.invite1', r#>>'{action_result,invite_key}', TRUE);
    PERFORM public.zz_sim_check('2 초대키를 만든다', length(r#>>'{action_result,invite_key}') > 0, '키 길이 ' || length(r#>>'{action_result,invite_key}'));
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('1~2 공간·초대', FALSE, SQLERRM);
END $$;

SELECT public.zz_sim_login('t_b');
DO $$
DECLARE r JSONB;
BEGIN
    r := public.run_neighbor_teacher_action_v1(public.zz_sim('c_b'), 'join_space',
        jsonb_build_object('invite_key', current_setting('sim.invite1'), 'public_class_name', '바다반'));
    PERFORM public.zz_sim_check('3 바다반이 초대키로 참여 신청', r#>>'{workspace,space,my_status}' = 'pending', r#>>'{workspace,space,my_status}');
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('3 바다반 참여 신청', FALSE, SQLERRM);
END $$;

SELECT public.zz_sim_login('t_c');
DO $$
DECLARE r JSONB;
BEGIN
    -- 틀린·쓴 키는 오류가 아니라 action_result.success = false 로 돌아온다(시도 횟수 제한).
    r := public.run_neighbor_teacher_action_v1(public.zz_sim('c_c'), 'join_space',
        jsonb_build_object('invite_key', current_setting('sim.invite1'), 'public_class_name', '별빛반'));
    PERFORM public.zz_sim_check('4 쓴 초대키로는 참여 신청이 안 된다(별빛반)',
        (r#>>'{action_result,success}')::BOOLEAN IS FALSE AND r#>>'{workspace,space,id}' IS NULL, r->>'action_result');
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('4 쓴 초대키로는 참여 신청이 안 된다', TRUE, '막힘: ' || SQLERRM);
END $$;

SELECT public.zz_sim_login('t_a');
DO $$
DECLARE w JSONB; b JSONB; v_inbox INTEGER;
BEGIN
    w := public.get_neighbor_teacher_workspace_v1(public.zz_sim('c_a'));
    b := public.get_neighbor_teacher_badge_v1(public.zz_sim('c_a'));
    -- 준비 중(2학급 전)에는 검토함 대신 준비 화면이 신청을 보여 주지만, 수는 같아야 한다.
    v_inbox := COALESCE((w#>>'{notifications,pending_approvals}')::INT, 0) + COALESCE((w#>>'{notifications,blocked_comments}')::INT, 0)
        + COALESCE((w#>>'{notifications,pending_joins}')::INT, 0);
    PERFORM public.zz_sim_check('5 호스트 메뉴 숫자 = 검토함 수(참여 신청 1)', (b->>'count')::INT = 1 AND v_inbox = 1,
        format('메뉴 %s · 화면 %s', b->>'count', v_inbox));
    w := public.run_neighbor_teacher_action_v1(public.zz_sim('c_a'), 'review_join',
        jsonb_build_object('space_id', public.zz_sim('space'), 'target_class_id', public.zz_sim('c_b'), 'approve', TRUE));
    PERFORM public.zz_sim_check('6 호스트가 바다반을 승인', (SELECT count(*) FROM jsonb_array_elements(w#>'{workspace,memberships}') m WHERE m->>'status' = 'active') = 2);
    w := public.run_neighbor_teacher_action_v1(public.zz_sim('c_a'), 'create_invite', jsonb_build_object('space_id', public.zz_sim('space')));
    PERFORM set_config('sim.invite2', w#>>'{action_result,invite_key}', TRUE);
    PERFORM public.zz_sim_check('7 두 번째 초대키', length(w#>>'{action_result,invite_key}') > 0);
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('5~7 승인·두 번째 초대', FALSE, SQLERRM);
END $$;

SELECT public.zz_sim_login('t_c');
DO $$
DECLARE r JSONB;
BEGIN
    r := public.run_neighbor_teacher_action_v1(public.zz_sim('c_c'), 'join_space',
        jsonb_build_object('invite_key', current_setting('sim.invite2'), 'public_class_name', '별빛반'));
    PERFORM public.zz_sim_check('8 별빛반 참여 신청', r#>>'{workspace,space,my_status}' = 'pending');
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('8 별빛반 참여 신청', FALSE, SQLERRM);
END $$;

SELECT public.zz_sim_login('t_a');
DO $$
DECLARE r JSONB;
BEGIN
    r := public.run_neighbor_teacher_action_v1(public.zz_sim('c_a'), 'review_join',
        jsonb_build_object('space_id', public.zz_sim('space'), 'target_class_id', public.zz_sim('c_c'), 'approve', TRUE));
    PERFORM public.zz_sim_check('9 별빛반 승인 → 참여 3학급', (SELECT count(*) FROM jsonb_array_elements(r#>'{workspace,memberships}') m WHERE m->>'status' = 'active') = 3);
    PERFORM public.zz_sim_check('9-1 처리 뒤 메뉴 숫자 0', (public.get_neighbor_teacher_badge_v1(public.zz_sim('c_a'))->>'count')::INT = 0);
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('9 별빛반 승인', FALSE, SQLERRM);
END $$;

SELECT public.zz_sim_login('t_b');
SELECT public.zz_sim_expect_denied('10 게스트(바다반)는 초대키를 못 만든다',
    format($q$SELECT public.run_neighbor_teacher_action_v1(%L, 'create_invite', jsonb_build_object('space_id', %L))$q$, public.zz_sim('c_b'), public.zz_sim('space')));
SELECT public.zz_sim_expect_denied('11 게스트(바다반)는 공간을 못 닫는다',
    format($q$SELECT public.run_neighbor_teacher_action_v1(%L, 'close_space', jsonb_build_object('space_id', %L))$q$, public.zz_sim('c_b'), public.zz_sim('space')));
SELECT public.zz_sim_login('t_d');
SELECT public.zz_sim_expect_denied('12 공개 대상이 아닌 학급(외부반) 교사는 못 들어온다',
    format($q$SELECT public.get_neighbor_teacher_workspace_v1(%L)$q$, public.zz_sim('c_d')));

-- 각 반 교사가 우리 반 학생 입장을 연다.
SELECT public.zz_sim_login('t_a');
DO $$ BEGIN
    PERFORM public.run_neighbor_teacher_action_v1(public.zz_sim('c_a'), 'set_access', jsonb_build_object('space_id', public.zz_sim('space'), 'enabled', TRUE));
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('13 햇살반 학생 입장 열기', FALSE, SQLERRM);
END $$;
SELECT public.zz_sim_login('t_b');
DO $$ BEGIN
    PERFORM public.run_neighbor_teacher_action_v1(public.zz_sim('c_b'), 'set_access', jsonb_build_object('space_id', public.zz_sim('space'), 'enabled', TRUE));
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('13 바다반 학생 입장 열기', FALSE, SQLERRM);
END $$;
SELECT public.zz_sim_login('t_c');
DO $$ BEGIN
    PERFORM public.run_neighbor_teacher_action_v1(public.zz_sim('c_c'), 'set_access', jsonb_build_object('space_id', public.zz_sim('space'), 'enabled', TRUE));
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('13 별빛반 학생 입장 열기', FALSE, SQLERRM);
END $$;
RESET ROLE;
SELECT public.zz_sim_check('13 세 반 모두 학생 입장 열기',
    (SELECT count(*) FROM public.neighbor_space_classes WHERE space_id = public.zz_sim('space') AND status = 'active' AND student_access_enabled) = 3);
SET LOCAL ROLE authenticated;

-- ───────────────────────── 3. 이웃 글 마당 ─────────────────────────
SELECT public.zz_sim_login('t_a');
DO $$
DECLARE v_items JSONB; v_src JSONB; r JSONB; v_first UUID; v_rest JSONB;
BEGIN
    v_items := public.get_neighbor_teacher_share_candidates_v1(public.zz_sim('space'), public.zz_sim('c_a'), 500)->'items';
    PERFORM public.zz_sim_check('14 햇살반 교사가 우리 반 제출 글 후보를 본다(3편)', jsonb_array_length(v_items) = 3, jsonb_array_length(v_items) || '편');
    v_first := (v_items->0->>'post_id')::UUID;
    v_src := public.get_neighbor_teacher_source_post_v1(public.zz_sim('space'), public.zz_sim('c_a'), v_first);
    r := public.run_neighbor_teacher_action_v1(public.zz_sim('c_a'), 'publish_gallery_post',
        jsonb_build_object('space_id', public.zz_sim('space'), 'post_id', v_first, 'source_revision', v_src->>'source_revision'));
    PERFORM set_config('sim.shared_a1', r#>>'{action_result,shared_post_id}', TRUE);
    PERFORM public.zz_sim_check('15 전문 확인 후 한 편 공개', r#>>'{action_result,status}' = 'published', r#>>'{action_result,status}');
    SELECT jsonb_agg(item->'post_id') INTO v_rest FROM jsonb_array_elements(v_items) item WHERE (item->>'post_id')::UUID <> v_first;
    r := public.run_neighbor_teacher_action_v1(public.zz_sim('c_a'), 'publish_gallery_posts_bulk',
        jsonb_build_object('space_id', public.zz_sim('space'), 'post_ids', v_rest));
    PERFORM public.zz_sim_check('16 나머지 2편 일괄 공개', (r#>>'{action_result,published}')::INT = 2, r->>'action_result');
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('14~16 햇살반 글 공개', FALSE, SQLERRM);
END $$;

-- 햇살반1 글의 공유 id 를 확정(누가 쓴 글인지 알아야 알림을 본다).
RESET ROLE;
SELECT set_config('sim.shared_a1', shared.id::TEXT, TRUE), set_config('sim.owner_a1', shared.student_id::TEXT, TRUE)
FROM public.neighbor_shared_posts shared WHERE shared.id = public.zz_sim('shared_a1') \gset
SET LOCAL ROLE authenticated;

SELECT public.zz_sim_login('t_b');
DO $$
DECLARE v_items JSONB; r JSONB;
BEGIN
    v_items := public.get_neighbor_teacher_share_candidates_v1(public.zz_sim('space'), public.zz_sim('c_b'), 500)->'items';
    r := public.run_neighbor_teacher_action_v1(public.zz_sim('c_b'), 'publish_gallery_posts_bulk',
        jsonb_build_object('space_id', public.zz_sim('space'), 'post_ids', jsonb_build_array(v_items->0->'post_id')));
    PERFORM public.zz_sim_check('17 바다반도 한 편 공개', (r#>>'{action_result,published}')::INT = 1);
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('17 바다반 공개', FALSE, SQLERRM);
END $$;
-- 다른 반 글은 공개할 수 없다.
RESET ROLE;
SELECT set_config('sim.a_post_2', post.id::TEXT, TRUE) FROM public.student_posts post
WHERE post.class_id = public.zz_sim('c_a') ORDER BY post.created_at DESC LIMIT 1 \gset
SET LOCAL ROLE authenticated;
SELECT public.zz_sim_login('t_b');
SELECT public.zz_sim_expect_denied('18 바다반 교사는 햇살반 글을 공개할 수 없다',
    format($q$SELECT public.run_neighbor_teacher_action_v1(%L, 'publish_gallery_post', jsonb_build_object('space_id', %L, 'post_id', %L, 'source_revision', 'x'))$q$,
        public.zz_sim('c_b'), public.zz_sim('space'), public.zz_sim('a_post_2')));

-- 학생: 홈·피드·상세
SELECT public.zz_sim_login('u_b1');
DO $$
DECLARE h JSONB; f JSONB; d JSONB;
BEGIN
    h := public.get_student_home_bootstrap_v1();
    PERFORM public.zz_sim_check('19 바다반 학생 홈에 모두의 아지트 카드가 보인다',
        (h#>>'{home,neighbor_agit_available}')::BOOLEAN IS TRUE, '새 글 ' || COALESCE(h#>>'{home,neighbor_agit_new_count}', '?'));
    f := public.get_neighbor_space_feed_v1(public.zz_sim('space'), 20, NULL, NULL);
    PERFORM public.zz_sim_check('20 학생 피드에 공개된 글 4편(햇살 3 + 바다 1)', jsonb_array_length(f->'items') = 4,
        jsonb_array_length(f->'items') || '편 · 이름 예: ' || COALESCE(f->'items'->0->>'author_name', '') || '/' || COALESCE(f->'items'->0->>'class_name', ''));
    d := public.get_neighbor_shared_post_v1(public.zz_sim('space'), public.zz_sim('shared_a1'));
    PERFORM public.zz_sim_check('21 글 상세를 연다', length(d->>'content') > 0);
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('19~21 학생 홈·피드·상세', FALSE, SQLERRM);
END $$;

SELECT public.zz_sim_login('u_d1');
SELECT public.zz_sim_expect_denied('22 참여하지 않은 학급 학생은 피드를 못 본다',
    format($q$SELECT public.get_neighbor_space_feed_v1(%L, 20, NULL, NULL)$q$, public.zz_sim('space')));

-- 댓글 → AI 검사 → 알림
SELECT public.zz_sim_login('u_b1');
DO $$
DECLARE r JSONB;
BEGIN
    r := public.save_neighbor_comment_v1(public.zz_sim('space'), public.zz_sim('shared_a1'), '느티나무 그늘 정말 시원하겠다!', 'save');
    PERFORM set_config('sim.cmt_b1', r->>'comment_id', TRUE);
    PERFORM public.zz_sim_check('23 바다반 학생이 댓글을 남긴다(검사 대기)', r->>'status' = 'pending', r->>'status');
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('23 댓글 남기기', FALSE, SQLERRM);
END $$;
RESET ROLE;
SELECT public.zz_sim_check('24 검사 대기 중에는 글쓴이 알림이 없다',
    NOT EXISTS (SELECT 1 FROM public.student_notification_events WHERE event_key = 'neighbor-comment:' || public.zz_sim('cmt_b1')));
SET LOCAL ROLE service_role;
SELECT public.zz_sim_login('admin', 'service_role');
SELECT public.zz_sim_ai(public.zz_sim('cmt_b1'), TRUE) AS ai1 \gset
RESET ROLE;
SELECT public.zz_sim_check('25 AI 검사 통과 → 댓글 보임', :'ai1'::BOOLEAN AND (SELECT status FROM public.neighbor_comments WHERE id = public.zz_sim('cmt_b1')) = 'visible');
SELECT public.zz_sim_check('26 글쓴이(햇살반 학생)에게 "내 글 소식" 알림',
    EXISTS (SELECT 1 FROM public.student_notification_events e WHERE e.student_id = public.zz_sim('owner_a1')
        AND e.module_id = 'feedback' AND e.event_type = 'feedback.neighbor_comment_received'
        AND e.payload->>'actor_class_name' = '바다반'),
    (SELECT e.payload->>'actor_class_name' || ' ' || (e.payload->>'actor_name') FROM public.student_notification_events e
      WHERE e.event_key = 'neighbor-comment:' || public.zz_sim('cmt_b1')));

-- 부적절한 댓글 → 막힘 → 담임이 검토함에서 처리
SET LOCAL ROLE authenticated;
SELECT public.zz_sim_login('u_c1');
DO $$ BEGIN
    PERFORM set_config('sim.cmt_c1', public.save_neighbor_comment_v1(public.zz_sim('space'), public.zz_sim('shared_a1'), '이거 완전 별로다 ㅋㅋ', 'save')->>'comment_id', TRUE);
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('27 별빛반 댓글 남기기', FALSE, SQLERRM);
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT public.zz_sim_login('admin', 'service_role');
SELECT public.zz_sim_ai(public.zz_sim('cmt_c1'), FALSE, '친구를 깎아내리는 말') AS ai2 \gset
RESET ROLE;
SELECT public.zz_sim_check('27 부적절한 댓글은 AI가 막는다', :'ai2'::BOOLEAN AND (SELECT status FROM public.neighbor_comments WHERE id = public.zz_sim('cmt_c1')) = 'blocked');
SELECT public.zz_sim_check('28 막힌 댓글로는 알림이 가지 않는다',
    NOT EXISTS (SELECT 1 FROM public.student_notification_events WHERE event_key = 'neighbor-comment:' || public.zz_sim('cmt_c1')));
SET LOCAL ROLE authenticated;
SELECT public.zz_sim_login('t_c');
DO $$
DECLARE w JSONB; b JSONB;
BEGIN
    w := public.get_neighbor_teacher_workspace_v1(public.zz_sim('c_c'));
    b := public.get_neighbor_teacher_badge_v1(public.zz_sim('c_c'));
    PERFORM public.zz_sim_check('29 별빛반 교사 검토함에 막힌 댓글 1 · 메뉴 숫자도 1',
        jsonb_array_length(w->'blocked_comments') = 1 AND (b->>'count')::INT = 1,
        format('검토함 %s · 메뉴 %s · 사유 %s', jsonb_array_length(w->'blocked_comments'), b->>'count', w->'blocked_comments'->0->>'reason'));
    PERFORM public.review_neighbor_blocked_comment_v1(public.zz_sim('space'), public.zz_sim('c_c'), public.zz_sim('cmt_c1'), 'delete');
    PERFORM public.zz_sim_check('30 교사가 막힌 댓글을 삭제 → 메뉴 숫자 0', (public.get_neighbor_teacher_badge_v1(public.zz_sim('c_c'))->>'count')::INT = 0);
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('29~30 막힌 댓글 처리', FALSE, SQLERRM);
END $$;
SELECT public.zz_sim_login('t_a');
SELECT public.zz_sim_expect_denied('31 다른 반(햇살반) 교사는 별빛반 학생의 막힌 댓글을 처리할 수 없다',
    format($q$SELECT public.review_neighbor_blocked_comment_v1(%L, %L, %L, 'restore')$q$, public.zz_sim('space'), public.zz_sim('c_a'), public.zz_sim('cmt_c1')));

-- 공감(알림 없음), 자기 댓글(알림 없음)
SELECT public.zz_sim_login('u_b2');
DO $$
DECLARE r JSONB;
BEGIN
    r := public.toggle_neighbor_reaction_v1(public.zz_sim('space'), public.zz_sim('shared_a1'));
    PERFORM public.zz_sim_check('32 공감 누르기', r IS NOT NULL, r::TEXT);
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('32 공감 누르기', FALSE, SQLERRM);
END $$;
RESET ROLE;
SELECT public.zz_sim_check('33 공감으로는 알림이 가지 않는다(댓글 알림 1건 그대로)',
    (SELECT count(*) FROM public.student_notification_events WHERE student_id = public.zz_sim('owner_a1') AND module_id = 'feedback') = 1);

-- AI 검사가 두 번 다 실패한 댓글 → 교사 확인으로 넘어간다(20261339, 점검표 D1·D2).
-- 실제 검사 슬롯은 건드리지 않고, 두 번째 시도를 잡은 상태만 댓글에 꾸며 실제 실패 보고 함수를 부른다.
SET LOCAL ROLE authenticated;
SELECT public.zz_sim_login('u_b3');
DO $$
DECLARE r JSONB; d JSONB;
BEGIN
    r := public.save_neighbor_comment_v1(public.zz_sim('space'), public.zz_sim('shared_a1'), '그림이 떠오르는 글이에요!', 'save');
    PERFORM set_config('sim.cmt_b3', r->>'comment_id', TRUE);
    d := public.get_neighbor_shared_post_v1(public.zz_sim('space'), public.zz_sim('shared_a1'));
    PERFORM public.zz_sim_check('F1 다시 열어도 내 댓글이 "검사 중" 임을 안다(my_comment)',
        d#>>'{my_comment,status}' = 'pending' AND d#>>'{my_comment,content}' = '그림이 떠오르는 글이에요!'
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(d->'comments') c WHERE (c->>'is_mine')::BOOLEAN),
        d->>'my_comment');
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('F1 검사 중 댓글 상세', FALSE, SQLERRM);
END $$;
SELECT public.zz_sim_login('u_b1');
DO $$ BEGIN
    PERFORM public.zz_sim_check('F2 남의 검사 중 댓글은 my_comment 로 안 보인다',
        public.get_neighbor_shared_post_v1(public.zz_sim('space'), public.zz_sim('shared_a1'))->'my_comment' = 'null'::JSONB);
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('F2 남의 댓글 상태', FALSE, SQLERRM);
END $$;
RESET ROLE;
SELECT set_config('sim.cmt_b3_token', gen_random_uuid()::TEXT, TRUE);
UPDATE public.neighbor_comments SET ai_review_attempts = 2,
    ai_review_token = public.zz_sim('cmt_b3_token'), ai_review_lease_until = NOW() + INTERVAL '2 minutes'
WHERE id = public.zz_sim('cmt_b3');
SET LOCAL ROLE service_role;
SELECT public.zz_sim_login('admin', 'service_role');
SELECT public.fail_comment_ai_review_v2(public.zz_sim('cmt_b3'), public.zz_sim('cmt_b3_token'), 'timeout') AS fail_b3 \gset
RESET ROLE;
SELECT public.zz_sim_check('F3 두 번째 검사도 실패 → 다시 시도하지 않고 교사 확인(blocked)으로 넘긴다',
    (:'fail_b3'::JSONB->>'will_retry')::BOOLEAN IS FALSE
    AND (SELECT status = 'blocked' AND moderated_by = 'ai_failed' AND ai_review_next_at IS NULL
         FROM public.neighbor_comments WHERE id = public.zz_sim('cmt_b3')),
    (SELECT status || ' · ' || COALESCE(moderated_by, '-') FROM public.neighbor_comments WHERE id = public.zz_sim('cmt_b3')));
SET LOCAL ROLE authenticated;
SELECT public.zz_sim_login('u_b3');
DO $$ BEGIN
    PERFORM public.zz_sim_check('F4 학생 상세의 내 댓글 상태도 "선생님 확인 중"(blocked)',
        public.get_neighbor_shared_post_v1(public.zz_sim('space'), public.zz_sim('shared_a1'))#>>'{my_comment,status}' = 'blocked');
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('F4 학생 상세', FALSE, SQLERRM);
END $$;
SELECT public.zz_sim_login('t_b');
DO $$
DECLARE w JSONB; b JSONB; item JSONB;
BEGIN
    w := public.get_neighbor_teacher_workspace_v1(public.zz_sim('c_b'));
    b := public.get_neighbor_teacher_badge_v1(public.zz_sim('c_b'));
    SELECT x INTO item FROM jsonb_array_elements(w->'blocked_comments') x WHERE x->>'comment_id' = public.zz_sim('cmt_b3')::TEXT;
    PERFORM public.zz_sim_check('F5 쓴 학생의 담임(바다반) 검토함·메뉴 숫자에 올라온다 · 참여 중(active)',
        item IS NOT NULL AND (b->>'count')::INT = 1 AND (b->>'active')::BOOLEAN,
        format('메뉴 %s · 사유 %s', b->>'count', item->>'reason'));
    PERFORM public.review_neighbor_blocked_comment_v1(public.zz_sim('space'), public.zz_sim('c_b'), public.zz_sim('cmt_b3'), 'restore');
    PERFORM public.zz_sim_check('F6 교사가 되살리면 메뉴 숫자 0', (public.get_neighbor_teacher_badge_v1(public.zz_sim('c_b'))->>'count')::INT = 0);
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('F5~F6 검사 실패 댓글 처리', FALSE, SQLERRM);
END $$;
RESET ROLE;
SELECT public.zz_sim_check('F7 되살린 댓글은 보이고 글쓴이에게 알림이 간다',
    (SELECT status FROM public.neighbor_comments WHERE id = public.zz_sim('cmt_b3')) = 'visible'
    AND EXISTS (SELECT 1 FROM public.student_notification_events
        WHERE student_id = public.zz_sim('owner_a1') AND event_key = 'neighbor-comment:' || public.zz_sim('cmt_b3')));
SET LOCAL ROLE authenticated;
SELECT public.zz_sim_login('u_b3');
DO $$
DECLARE d JSONB;
BEGIN
    d := public.get_neighbor_shared_post_v1(public.zz_sim('space'), public.zz_sim('shared_a1'));
    PERFORM public.zz_sim_check('F8 보이게 된 내 댓글은 목록에 있고 my_comment 는 비었다',
        d->'my_comment' = 'null'::JSONB
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(d->'comments') c WHERE (c->>'is_mine')::BOOLEAN));
    -- 뒤 단계(공감 알림 수 등)를 흔들지 않게 이 댓글은 거둔다.
    PERFORM public.save_neighbor_comment_v1(public.zz_sim('space'), public.zz_sim('shared_a1'), '', 'delete');
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('F8 보이는 내 댓글', FALSE, SQLERRM);
END $$;
SELECT public.zz_sim_login('t_d');
DO $$ BEGIN
    PERFORM public.zz_sim_check('F9 참여하지 않은 학급의 메뉴 배지는 active=false(다른 메뉴 12초 확인을 켜지 않음)',
        (public.get_neighbor_teacher_badge_v1(public.zz_sim('c_d'))->>'active')::BOOLEAN IS FALSE);
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('F9 비참여 배지', FALSE, SQLERRM);
END $$;
RESET ROLE;

-- AI 검사 요청은 학생 한 명이 10분에 20번까지(우리 반·이웃 댓글 합산, 20261340).
SET LOCAL ROLE authenticated;
SELECT public.zz_sim_login('u_b2');
DO $$
DECLARE v_ok INT := 0; v_denied TEXT;
BEGIN
    FOR i IN 1..20 LOOP
        PERFORM public.save_neighbor_comment_v1(public.zz_sim('space'), public.zz_sim('shared_a1'), '고쳐 쓰기 ' || i, 'save');
        v_ok := v_ok + 1;
    END LOOP;
    BEGIN
        PERFORM public.save_neighbor_comment_v1(public.zz_sim('space'), public.zz_sim('shared_a1'), '스물한 번째', 'save');
    EXCEPTION WHEN OTHERS THEN v_denied := SQLSTATE || ' ' || SQLERRM;
    END;
    PERFORM public.zz_sim_check('Q1 댓글 고쳐 쓰기 20번까지는 되고 21번째는 PT429 로 막힌다',
        v_ok = 20 AND v_denied LIKE 'PT429%', COALESCE(v_denied, '막히지 않음'));
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('Q1 요청 횟수', FALSE, SQLERRM);
END $$;
RESET ROLE;
SELECT public.zz_sim_check('Q2 막힌 저장은 되돌려져 댓글 내용이 20번째 그대로다',
    (SELECT content FROM public.neighbor_comments WHERE shared_post_id = public.zz_sim('shared_a1') AND student_id = public.zz_sim('s_b2')) = '고쳐 쓰기 20',
    (SELECT content FROM public.neighbor_comments WHERE shared_post_id = public.zz_sim('shared_a1') AND student_id = public.zz_sim('s_b2')));
SET LOCAL ROLE authenticated;
SELECT public.zz_sim_login('u_b2');
DO $$ BEGIN
    PERFORM public.save_neighbor_comment_v1(public.zz_sim('space'), public.zz_sim('shared_a1'), '', 'delete');
    PERFORM public.zz_sim_check('Q3 삭제는 AI 검사가 없어 횟수와 상관없이 된다', TRUE);
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('Q3 삭제', FALSE, SQLERRM);
END $$;
RESET ROLE;
SELECT public.zz_sim_check('Q4 요청 기록 표는 학생·교사 역할이 직접 못 읽는다',
    to_regclass('public.comment_review_submissions') IS NOT NULL
    AND NOT has_table_privilege('authenticated', 'public.comment_review_submissions', 'SELECT')
    AND NOT has_function_privilege('authenticated', 'public.consume_comment_review_quota_v1(uuid)', 'EXECUTE'));
DO $$ BEGIN
    IF to_regclass('public.comment_review_submissions') IS NOT NULL THEN
        EXECUTE format('DELETE FROM public.comment_review_submissions WHERE student_id = %L', public.zz_sim('s_b2'));
    END IF;
END $$;

-- 반별 이웃 글 마당(학생: 반 고르기 → 주제별 묶음, 교사: ③ 댓글·반응 반별)
SET LOCAL ROLE authenticated;
SELECT public.zz_sim_login('u_b1');
DO $$
DECLARE c JSONB; g JSONB; sun JSONB;
BEGIN
    c := public.get_neighbor_gallery_classes_v1(public.zz_sim('space'));
    PERFORM public.zz_sim_check('G1 반 고르기: 참여 3반 · 우리 반(바다반)이 맨 앞 · 햇살반 3편',
        jsonb_array_length(c->'classes') = 3 AND c->'classes'->0->>'class_name' = '바다반' AND (c->'classes'->0->>'is_own_class')::BOOLEAN
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(c->'classes') x WHERE x->>'class_name' = '햇살반' AND (x->>'post_count')::INT = 3),
        (SELECT string_agg((x->>'class_name') || ' ' || (x->>'post_count') || '편', ', ') FROM jsonb_array_elements(c->'classes') x));
    SELECT x INTO sun FROM jsonb_array_elements(c->'classes') x WHERE x->>'class_name' = '햇살반';
    PERFORM set_config('sim.key_sun', sun->>'class_key', TRUE);
    PERFORM public.zz_sim_check('G2 반 열쇠는 원본 학급 id 가 아니다', public.zz_sim('key_sun') <> public.zz_sim('c_a'));
    g := public.get_neighbor_class_gallery_v1(public.zz_sim('space'), public.zz_sim('key_sun'));
    PERFORM public.zz_sim_check('G3 햇살반에 들어가면 3편 · 주제 이름이 붙어 온다',
        jsonb_array_length(g->'items') = 3 AND g->'items'->0->>'topic' = '우리 동네 자랑' AND (g->>'total')::INT = 3,
        g->'items'->0->>'topic');
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('G1~G3 반별 이웃 글 마당', FALSE, SQLERRM);
END $$;
SELECT public.zz_sim_expect_denied('G4 참여하지 않는 반 열쇠로는 못 연다',
    format($q$SELECT public.get_neighbor_class_gallery_v1(%L, %L)$q$, public.zz_sim('space'), gen_random_uuid()));
-- 지난 방문이 한 시간 전이었다면 → 그 뒤 올라온 글이 "새 글" 이다.
RESET ROLE;
UPDATE public.neighbor_feed_visits SET last_seen_at = NOW() - INTERVAL '2 hours'
WHERE space_id = public.zz_sim('space') AND student_id = public.zz_sim('s_b1');
UPDATE public.neighbor_feed_visits SET last_seen_at = NOW() - INTERVAL '1 hour'
WHERE space_id = public.zz_sim('space') AND student_id = public.zz_sim('s_b1');
SELECT public.zz_sim_check('G5 피드를 다시 열어도 지난 방문 시각이 남는다(트리거)',
    (SELECT previous_seen_at < last_seen_at FROM public.neighbor_feed_visits
     WHERE space_id = public.zz_sim('space') AND student_id = public.zz_sim('s_b1')));
SET LOCAL ROLE authenticated;
SELECT public.zz_sim_login('u_b1');
DO $$
DECLARE c JSONB;
BEGIN
    c := public.get_neighbor_gallery_classes_v1(public.zz_sim('space'));
    PERFORM public.zz_sim_check('G6 지난 방문 뒤 올라온 글이 반마다 "새 글" 로 센다(햇살반 3)',
        EXISTS (SELECT 1 FROM jsonb_array_elements(c->'classes') x WHERE x->>'class_name' = '햇살반' AND (x->>'new_count')::INT = 3));
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('G6 새 글 수', FALSE, SQLERRM);
END $$;
SELECT public.zz_sim_login('t_c');
DO $$
DECLARE e JSONB; sun JSONB;
BEGIN
    e := public.get_neighbor_teacher_engagement_v1(public.zz_sim('space'), public.zz_sim('c_c'), 'gallery');
    SELECT x INTO sun FROM jsonb_array_elements(e->'classes') x WHERE x->>'class_name' = '햇살반';
    PERFORM public.zz_sim_check('G7 교사 ③ 댓글·반응: 반별로 글 수·댓글·공감 합계(햇살반 3편 · 댓글 1 · 공감 1)',
        jsonb_array_length(e->'classes') = 3 AND (e->'classes'->0->>'is_own_class')::BOOLEAN
        AND (sun->>'post_count')::INT = 3 AND (sun->>'comment_total')::INT = 1 AND (sun->>'reaction_total')::INT = 1,
        format('%s편 · 댓글 %s · 공감 %s', sun->>'post_count', sun->>'comment_total', sun->>'reaction_total'));
    e := public.get_neighbor_teacher_engagement_v1(public.zz_sim('space'), public.zz_sim('c_c'), 'topic');
    PERFORM public.zz_sim_check('G8 같이 쓰기 광장 쪽은 따로 센다(아직 0편)',
        NOT EXISTS (SELECT 1 FROM jsonb_array_elements(e->'classes') x WHERE (x->>'post_count')::INT > 0));
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('G7~G8 교사 반별 댓글·반응', FALSE, SQLERRM);
END $$;
RESET ROLE;

-- 교사가 댓글을 숨기면 알림도 사라진다
SET LOCAL ROLE authenticated;
SELECT public.zz_sim_login('t_a');
DO $$ BEGIN
    PERFORM public.run_neighbor_teacher_action_v1(public.zz_sim('c_a'), 'hide_comment',
        jsonb_build_object('space_id', public.zz_sim('space'), 'item_id', public.zz_sim('cmt_b1'), 'reason', '시뮬 확인'));
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('34 교사가 댓글 숨기기', FALSE, SQLERRM);
END $$;
RESET ROLE;
SELECT public.zz_sim_check('34 교사가 댓글을 숨기면 학생 알림도 거둬진다',
    (SELECT status FROM public.neighbor_comments WHERE id = public.zz_sim('cmt_b1')) = 'hidden'
    AND NOT EXISTS (SELECT 1 FROM public.student_notification_events WHERE event_key = 'neighbor-comment:' || public.zz_sim('cmt_b1')));

-- 글 비공개는 자기 반 글만
SET LOCAL ROLE authenticated;
SELECT public.zz_sim_login('t_b');
SELECT public.zz_sim_expect_denied('35 바다반 교사는 햇살반 글을 비공개할 수 없다',
    format($q$SELECT public.run_neighbor_teacher_action_v1(%L, 'hide_post', jsonb_build_object('space_id', %L, 'item_id', %L, 'reason', 'x'))$q$,
        public.zz_sim('c_b'), public.zz_sim('space'), public.zz_sim('shared_a1')));
SELECT public.zz_sim_login('t_a');
DO $$ BEGIN
    PERFORM public.run_neighbor_teacher_action_v1(public.zz_sim('c_a'), 'hide_post',
        jsonb_build_object('space_id', public.zz_sim('space'), 'item_id', public.zz_sim('shared_a1'), 'reason', '시뮬'));
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('36 우리 반 글 비공개', FALSE, SQLERRM);
END $$;
SELECT public.zz_sim_login('u_b1');
DO $$
DECLARE f JSONB;
BEGIN
    f := public.get_neighbor_space_feed_v1(public.zz_sim('space'), 20, NULL, NULL);
    PERFORM public.zz_sim_check('36 비공개한 글은 학생 피드에서 빠진다(4→3)', jsonb_array_length(f->'items') = 3, jsonb_array_length(f->'items') || '편');
END $$;
-- 숨긴 글은 올린 학급 교사만 연다(2026-09-19 결정, 20261340 에서 글 상세까지).
SELECT public.zz_sim_login('t_b');
SELECT public.zz_sim_expect_denied('36-1 다른 반(바다반) 교사는 햇살반이 숨긴 글 상세를 못 연다',
    format($q$SELECT public.get_neighbor_teacher_post_detail_v1(%L, %L, %L)$q$, public.zz_sim('space'), public.zz_sim('c_b'), public.zz_sim('shared_a1')));
SELECT public.zz_sim_login('t_a');
DO $$ BEGIN
    PERFORM public.zz_sim_check('36-2 숨긴 반(햇살반) 교사는 다시 공개하려고 상세를 연다',
        public.get_neighbor_teacher_post_detail_v1(public.zz_sim('space'), public.zz_sim('c_a'), public.zz_sim('shared_a1'))->>'status' = 'hidden');
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('36-2 숨긴 글 자기 반 상세', FALSE, SQLERRM);
END $$;
DO $$ BEGIN
    PERFORM public.run_neighbor_teacher_action_v1(public.zz_sim('c_a'), 'restore_post',
        jsonb_build_object('space_id', public.zz_sim('space'), 'item_id', public.zz_sim('shared_a1'), 'reason', ''));
    PERFORM public.zz_sim_check('37 다시 공개', TRUE);
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('37 다시 공개', FALSE, SQLERRM);
END $$;

-- ───────────────────────── 4. 같이 쓰기 광장 ─────────────────────────
SELECT public.zz_sim_login('t_b');
DO $$
DECLARE r JSONB;
BEGIN
    r := public.run_neighbor_teacher_action_v1(public.zz_sim('c_b'), 'create_activity', jsonb_build_object(
        'space_id', public.zz_sim('space'), 'type', 'topic', 'title', '가을 운동회에서 기억에 남는 순간',
        'prompt', '한 장면을 자세히 써 봐요.', 'genre', '생활문', 'guide_questions', jsonb_build_array('언제였나요?', '어떤 마음이었나요?'),
        'min_chars', 20, 'min_paragraphs', 1, 'base_reward', 10, 'bonus_threshold', 0, 'bonus_reward', 0));
    PERFORM set_config('sim.topic', r#>>'{action_result,activity_id}', TRUE);
    PERFORM public.zz_sim_check('38 바다반 교사가 주제를 제안', public.zz_sim('topic') IS NOT NULL, r#>>'{action_result,status}');
    r := public.set_neighbor_activity_schedule_v1(public.zz_sim('space'), public.zz_sim('c_b'), public.zz_sim('topic'),
        jsonb_build_object('writing_close_at', NOW() + INTERVAL '3 days', 'comments_close_at', NOW() + INTERVAL '5 days'));
    PERFORM public.zz_sim_check('39 제안한 교사가 기한(글쓰기 3일·댓글 5일)을 붙인다', r->>'writing_close_at' IS NOT NULL AND r->>'comments_close_at' IS NOT NULL);
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('38~39 주제 제안·기한', FALSE, SQLERRM);
END $$;

SELECT public.zz_sim_login('u_a1');
DO $$
DECLARE f JSONB;
BEGIN
    f := public.get_neighbor_space_feed_v1(public.zz_sim('space'), 20, NULL, NULL);
    PERFORM public.zz_sim_check('40 승인 전에는 학생에게 주제가 안 보인다',
        NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(f->'activities', '[]')) a WHERE (a->>'id')::UUID = public.zz_sim('topic')));
END $$;

SELECT public.zz_sim_login('t_a');
DO $$
DECLARE w JSONB; b JSONB; v_inbox INT;
BEGIN
    w := public.get_neighbor_teacher_workspace_v1(public.zz_sim('c_a'));
    b := public.get_neighbor_teacher_badge_v1(public.zz_sim('c_a'));
    v_inbox := (w#>>'{notifications,pending_approvals}')::INT + (w#>>'{notifications,blocked_comments}')::INT + (w#>>'{notifications,pending_joins}')::INT;
    PERFORM public.zz_sim_check('41 햇살반 검토함에 주제 제안 1 · 메뉴 숫자와 같다', v_inbox = 1 AND (b->>'count')::INT = 1,
        format('검토함 %s · 메뉴 %s', v_inbox, b->>'count'));
    PERFORM public.zz_sim_check('42 제안 카드에 기한이 실려 온다',
        EXISTS (SELECT 1 FROM jsonb_array_elements(w->'activities') a WHERE (a->>'id')::UUID = public.zz_sim('topic') AND a->>'writing_close_at' IS NOT NULL));
    PERFORM public.run_neighbor_teacher_action_v1(public.zz_sim('c_a'), 'review_activity',
        jsonb_build_object('space_id', public.zz_sim('space'), 'activity_id', public.zz_sim('topic'), 'approve', TRUE));
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('41~42 주제 검토', FALSE, SQLERRM);
END $$;
SELECT public.zz_sim_login('t_c');
SELECT public.zz_sim_expect_denied('43 게스트(별빛반, 제안 안 함)는 글쓰기 마감을 못 바꾼다',
    format($q$SELECT public.set_neighbor_activity_schedule_v1(%L, %L, %L, jsonb_build_object('writing_close_at', now() + interval '1 day'))$q$,
        public.zz_sim('space'), public.zz_sim('c_c'), public.zz_sim('topic')));
DO $$ BEGIN
    PERFORM public.run_neighbor_teacher_action_v1(public.zz_sim('c_c'), 'review_activity',
        jsonb_build_object('space_id', public.zz_sim('space'), 'activity_id', public.zz_sim('topic'), 'approve', TRUE));
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('44 별빛반 승인', FALSE, SQLERRM);
END $$;
RESET ROLE;
SELECT public.zz_sim_check('44 모두 승인 → 주제가 열리고 세 반에 같은 과제가 생긴다',
    (SELECT status FROM public.neighbor_activities WHERE id = public.zz_sim('topic')) = 'open'
    AND (SELECT count(*) FROM public.neighbor_activity_classes l JOIN public.writing_missions m ON m.id = l.mission_id
         WHERE l.activity_id = public.zz_sim('topic') AND m.is_archived IS NOT TRUE) = 3,
    (SELECT string_agg(m.title || '@' || c.name, ', ') FROM public.neighbor_activity_classes l
       JOIN public.writing_missions m ON m.id = l.mission_id JOIN public.classes c ON c.id = l.class_id WHERE l.activity_id = public.zz_sim('topic')));

SET LOCAL ROLE authenticated;
SELECT public.zz_sim_login('u_c2');
DO $$
DECLARE f JSONB; a JSONB;
BEGIN
    f := public.get_neighbor_space_feed_v1(public.zz_sim('space'), 20, NULL, NULL);
    SELECT x INTO a FROM jsonb_array_elements(f->'activities') x WHERE (x->>'id')::UUID = public.zz_sim('topic');
    PERFORM public.zz_sim_check('45 학생에게 주제와 기한이 보인다', a IS NOT NULL AND a->>'writing_close_at' IS NOT NULL AND a->>'comments_close_at' IS NOT NULL,
        COALESCE(a->>'status', '없음'));
END $$;

-- 학생들이 주제 과제로 글을 낸다(글쓰기 화면이 만드는 것과 같은 제출 글).
RESET ROLE;
DO $$ BEGIN
    INSERT INTO public.student_posts (mission_id, student_id, class_id, title, content, char_count, paragraph_count, is_submitted, first_submitted_at, writing_context, visibility)
    SELECT l.mission_id, s.id, s.class_id, s.name || '의 운동회', '이어달리기에서 바통을 받는 순간 심장이 쿵쾅거렸어요. 끝까지 달려서 뿌듯했어요.', 40, 1, TRUE, NOW(), 'assignment', 'class'
    FROM public.neighbor_activity_classes l
    JOIN public.students s ON s.class_id = l.class_id
    WHERE l.activity_id = public.zz_sim('topic');
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('45-1 학생 주제 글 제출', FALSE, SQLERRM);
END $$;
SET LOCAL ROLE authenticated;

SELECT public.zz_sim_login('t_a');
DO $$
DECLARE c JSONB; r JSONB;
BEGIN
    c := public.get_neighbor_teacher_activity_candidates_v1(public.zz_sim('space'), public.zz_sim('c_a'), public.zz_sim('topic'))->'items';
    PERFORM public.zz_sim_check('46 햇살반 교사가 주제 제출 글 후보를 본다(3편)', jsonb_array_length(c) = 3, jsonb_array_length(c) || '편');
    r := public.run_neighbor_teacher_action_v1(public.zz_sim('c_a'), 'publish_activity_posts_bulk',
        jsonb_build_object('space_id', public.zz_sim('space'), 'post_ids', (SELECT jsonb_agg(x->'post_id') FROM jsonb_array_elements(c) x)));
    PERFORM public.zz_sim_check('47 주제 글 일괄 공개', (r#>>'{action_result,published}')::INT = 3, r->>'action_result');
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('46~47 주제 글 공개', FALSE, SQLERRM);
END $$;
SELECT public.zz_sim_login('t_b');
DO $$
DECLARE c JSONB;
BEGIN
    c := public.get_neighbor_teacher_activity_candidates_v1(public.zz_sim('space'), public.zz_sim('c_b'), public.zz_sim('topic'))->'items';
    PERFORM public.run_neighbor_teacher_action_v1(public.zz_sim('c_b'), 'publish_activity_posts_bulk',
        jsonb_build_object('space_id', public.zz_sim('space'), 'post_ids', (SELECT jsonb_agg(x->'post_id') FROM jsonb_array_elements(c) x)));
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('48 바다반 주제 글 공개', FALSE, SQLERRM);
END $$;
SELECT public.zz_sim_login('u_c2');
DO $$
DECLARE f JSONB; v_target UUID;
BEGIN
    f := public.get_neighbor_activity_feed_v1(public.zz_sim('space'), public.zz_sim('topic'), 20, NULL, NULL);
    PERFORM public.zz_sim_check('48 별빛반 학생이 주제 글 6편(햇살 3 + 바다 3)을 본다', jsonb_array_length(f->'items') = 6, jsonb_array_length(f->'items') || '편');
    v_target := (SELECT (x->>'shared_post_id')::UUID FROM jsonb_array_elements(f->'items') x WHERE x->>'class_name' = '바다반' LIMIT 1);
    PERFORM set_config('sim.topic_post_b', v_target::TEXT, TRUE);
    PERFORM set_config('sim.cmt_c2', public.save_neighbor_comment_v1(public.zz_sim('space'), v_target, '바통 받을 때 나도 떨렸어!', 'save')->>'comment_id', TRUE);
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('48~49 주제 글 읽기·댓글', FALSE, SQLERRM);
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT public.zz_sim_login('admin', 'service_role');
SELECT public.zz_sim_ai(public.zz_sim('cmt_c2'), TRUE) AS ai3 \gset
RESET ROLE;
SELECT public.zz_sim_check('49 주제 글 댓글도 글쓴이(바다반 학생)에게 알림',
    :'ai3'::BOOLEAN AND EXISTS (SELECT 1 FROM public.student_notification_events e JOIN public.neighbor_shared_posts s ON s.student_id = e.student_id
        WHERE s.id = public.zz_sim('topic_post_b') AND e.event_key = 'neighbor-comment:' || public.zz_sim('cmt_c2')));

-- 활동 종료(글쓰기와 댓글·반응까지) — 화면의 "댓글·반응까지 함께 마치기" 와 같은 두 호출
SET LOCAL ROLE authenticated;
SELECT public.zz_sim_login('t_a');
DO $$ BEGIN
    PERFORM public.run_neighbor_teacher_action_v1(public.zz_sim('c_a'), 'close_activity',
        jsonb_build_object('space_id', public.zz_sim('space'), 'activity_id', public.zz_sim('topic')));
    PERFORM public.set_neighbor_activity_schedule_v1(public.zz_sim('space'), public.zz_sim('c_a'), public.zz_sim('topic'),
        jsonb_build_object('comments_close_at', NOW()));
    PERFORM public.zz_sim_check('50 호스트가 글쓰기와 댓글·반응을 함께 마친다', TRUE);
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('50 활동 종료', FALSE, SQLERRM);
END $$;
SELECT public.zz_sim_login('u_a2');
SELECT public.zz_sim_expect_denied('51 마감 뒤 새 댓글은 막힌다',
    format($q$SELECT public.save_neighbor_comment_v1(%L, %L, '늦은 댓글', 'save')$q$, public.zz_sim('space'), public.zz_sim('topic_post_b')));
SELECT public.zz_sim_expect_denied('52 마감 뒤 새 공감도 막힌다',
    format($q$SELECT public.toggle_neighbor_reaction_v1(%L, %L)$q$, public.zz_sim('space'), public.zz_sim('topic_post_b')));
DO $$
DECLARE f JSONB;
BEGIN
    f := public.get_neighbor_activity_feed_v1(public.zz_sim('space'), public.zz_sim('topic'), 20, NULL, NULL);
    PERFORM public.zz_sim_check('53 종료된 주제의 글은 계속 읽을 수 있다', jsonb_array_length(f->'items') = 6, jsonb_array_length(f->'items') || '편');
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('53 종료 뒤 읽기', FALSE, SQLERRM);
END $$;
RESET ROLE;
SELECT public.zz_sim_check('54 종료하면 세 반의 주제 과제가 보관된다',
    (SELECT bool_and(m.is_archived) FROM public.neighbor_activity_classes l JOIN public.writing_missions m ON m.id = l.mission_id WHERE l.activity_id = public.zz_sim('topic')));

-- 글쓰기 마감 자동 종료: 두 번째 주제를 제안만 해 두고 시간이 지난 것처럼 만든다.
SET LOCAL ROLE authenticated;
SELECT public.zz_sim_login('t_a');
DO $$
DECLARE r JSONB;
BEGIN
    r := public.run_neighbor_teacher_action_v1(public.zz_sim('c_a'), 'create_activity', jsonb_build_object(
        'space_id', public.zz_sim('space'), 'type', 'topic', 'title', '겨울 방학 계획', 'prompt', '방학에 하고 싶은 일을 써요.',
        'min_chars', 20, 'min_paragraphs', 1, 'base_reward', 5, 'bonus_threshold', 0, 'bonus_reward', 0));
    PERFORM set_config('sim.topic2', r#>>'{action_result,activity_id}', TRUE);
    PERFORM public.set_neighbor_activity_schedule_v1(public.zz_sim('space'), public.zz_sim('c_a'), public.zz_sim('topic2'),
        jsonb_build_object('writing_close_at', NOW() + INTERVAL '1 hour'));
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('55 두 번째 주제 제안', FALSE, SQLERRM);
END $$;
RESET ROLE;
UPDATE public.neighbor_activities SET writing_close_at = NOW() - INTERVAL '1 minute' WHERE id = public.zz_sim('topic2');
SELECT COALESCE(public.close_due_neighbor_activities_v1(), -1) AS closed_due \gset
SELECT public.zz_sim_check('55 승인 전 글쓰기 마감이 지나면 cron 이 제안을 닫고 승인 대기를 거둔다',
    (SELECT status FROM public.neighbor_activities WHERE id = public.zz_sim('topic2')) = 'closed'
    AND NOT EXISTS (SELECT 1 FROM public.neighbor_activity_approvals WHERE activity_id = public.zz_sim('topic2') AND status = 'pending'),
    '닫힌 주제 ' || :'closed_due' || '건');
SET LOCAL ROLE authenticated;
SELECT public.zz_sim_login('t_b');
SELECT public.zz_sim_check('56 닫힌 제안은 다른 반 메뉴 숫자에 남지 않는다', (public.get_neighbor_teacher_badge_v1(public.zz_sim('c_b'))->>'count')::INT = 0,
    '메뉴 ' || (public.get_neighbor_teacher_badge_v1(public.zz_sim('c_b'))->>'count'));

-- ───────────────────────── 4-2. 🏛️ 문집 도서관 · 방문록 ─────────────────────────
-- 햇살반이 글꽃 책방에서 확정한 학급 문집(학생에게 보이는 판)과, 아직 학생에게 가린 문집 하나를 만든다.
RESET ROLE;
DO $$
DECLARE v_book UUID; v_hidden UUID; v_works JSONB := '[]'::JSONB; v_item UUID; v_post RECORD; v_pos INT := 0;
BEGIN
    -- 문집에는 교사가 승인한 글만 실린다(글꽃 책방 규칙).
    UPDATE public.student_posts post SET is_confirmed = TRUE
    FROM public.writing_missions m
    WHERE m.id = post.mission_id AND m.title = '우리 동네 자랑' AND post.class_id = public.zz_sim('c_a');
    INSERT INTO public.class_agit_books (id, class_id, title, subtitle) VALUES (gen_random_uuid(), public.zz_sim('c_a'), '햇살반 동네 이야기', '우리가 사는 곳')
    RETURNING id INTO v_book;
    FOR v_post IN
        SELECT post.id, post.student_id, post.title, post.content, s.name FROM public.student_posts post
        JOIN public.writing_missions m ON m.id = post.mission_id AND m.title = '우리 동네 자랑'
        JOIN public.students s ON s.id = post.student_id
        WHERE post.class_id = public.zz_sim('c_a') ORDER BY s.name
    LOOP
        v_pos := v_pos + 1;
        INSERT INTO public.class_agit_book_items (class_id, book_id, post_id, student_id, position, source_revision, snapshot)
        VALUES (public.zz_sim('c_a'), v_book, v_post.id, v_post.student_id, v_pos, repeat('a', 64), jsonb_build_object('title', v_post.title))
        RETURNING id INTO v_item;
        v_works := v_works || jsonb_build_array(jsonb_build_object(
            'itemId', v_item, 'consentId', (SELECT consent_id FROM public.class_agit_book_items WHERE id = v_item),
            'title', v_post.title, 'author', v_post.name, 'blocks', jsonb_build_array(v_post.content),
            'format', 'prose', 'kindLabel', '글', 'excerpt', left(v_post.content, 40), 'group', '우리 동네'));
    END LOOP;
    INSERT INTO public.class_agit_book_editions (class_id, book_id, number, snapshot, student_visible)
    VALUES (public.zz_sim('c_a'), v_book, 1, jsonb_build_object('title', '햇살반 동네 이야기', 'subtitle', '우리가 사는 곳',
        'introduction', '우리 동네 자랑을 모았어요.', 'class_label', '햇살반', 'term', '2학기', 'issue_date', '2026-09-23',
        'grouping', 'custom', 'book_type', 'class', 'cover_kicker', '우리 반의 이야기', 'page_breaks', '[]'::JSONB,
        'owner_student_id', NULL, 'owner_student_name', NULL, 'print', jsonb_build_object('design', 'storybook', 'paper', 'A4'),
        'works', v_works), TRUE);
    PERFORM set_config('sim.book', v_book::TEXT, TRUE);

    INSERT INTO public.class_agit_books (id, class_id, title) VALUES (gen_random_uuid(), public.zz_sim('c_a'), '아직 가린 문집') RETURNING id INTO v_hidden;
    INSERT INTO public.class_agit_book_editions (class_id, book_id, number, snapshot, student_visible)
    VALUES (public.zz_sim('c_a'), v_hidden, 1, jsonb_build_object('title', '아직 가린 문집', 'works', '[]'::JSONB), FALSE);
    PERFORM set_config('sim.book_hidden', v_hidden::TEXT, TRUE);
    PERFORM public.zz_sim_check('B0 준비: 햇살반 학급 문집(3편, 학생에게 보임) + 가린 문집', v_pos = 3, v_pos || '편');
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('B0 문집 준비', FALSE, SQLERRM);
END $$;
SET LOCAL ROLE authenticated;

SELECT public.zz_sim_login('t_a');
DO $$
DECLARE r JSONB; m JSONB;
BEGIN
    r := public.get_neighbor_teacher_books_v1(public.zz_sim('space'), public.zz_sim('c_a'));
    SELECT x INTO m FROM jsonb_array_elements(r->'my_books') x WHERE (x->>'book_id')::UUID = public.zz_sim('book');
    PERFORM public.zz_sim_check('B1 교사가 소개할 수 있는 우리 반 문집을 본다(1판·3편)',
        (m->>'latest_number')::INT = 1 AND (m->>'work_count')::INT = 3 AND m->>'shared_book_id' IS NULL, m::TEXT);
    r := public.share_neighbor_book_v1(public.zz_sim('space'), public.zz_sim('c_a'), public.zz_sim('book'));
    PERFORM set_config('sim.shared_book', r->>'shared_book_id', TRUE);
    PERFORM public.zz_sim_check('B2 문집을 모두의 아지트에 소개', public.zz_sim('shared_book') IS NOT NULL);
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('B1~B2 문집 소개', FALSE, SQLERRM);
END $$;
SELECT public.zz_sim_expect_denied('B3 학생에게 가린 판은 소개할 수 없다',
    format($q$SELECT public.share_neighbor_book_v1(%L, %L, %L)$q$, public.zz_sim('space'), public.zz_sim('c_a'), public.zz_sim('book_hidden')));
SELECT public.zz_sim_login('t_b');
SELECT public.zz_sim_expect_denied('B4 다른 반(바다반) 교사는 햇살반 문집을 소개할 수 없다',
    format($q$SELECT public.share_neighbor_book_v1(%L, %L, %L)$q$, public.zz_sim('space'), public.zz_sim('c_b'), public.zz_sim('book')));

SELECT public.zz_sim_login('u_b1');
DO $$
DECLARE l JSONB; b JSONB; w JSONB;
BEGIN
    l := public.get_neighbor_space_books_v1(public.zz_sim('space'));
    PERFORM public.zz_sim_check('B5 바다반 학생이 소개된 문집을 본다', jsonb_array_length(l->'books') = 1 AND l->'books'->0->>'class_name' = '햇살반',
        COALESCE(l->'books'->0->>'title', '') || ' · ' || COALESCE(l->'books'->0->>'design', ''));
    b := public.get_neighbor_shared_book_v1(public.zz_sim('space'), public.zz_sim('shared_book'), NULL);
    PERFORM public.zz_sim_check('B6 책을 펼치면 차례 3편 · 방문록 0 · 학생 id 는 응답에 없다',
        jsonb_array_length(b->'works') = 3 AND jsonb_array_length(b#>'{guestbook,entries}') = 0
        AND NOT (b->'book' ? 'owner_student_id') AND position('itemId' in b::TEXT) = 0, b->'book'->>'title');
    w := public.get_neighbor_shared_book_v1(public.zz_sim('space'), public.zz_sim('shared_book'), b->'works'->0->>'id');
    PERFORM public.zz_sim_check('B7 작품 한 편을 읽는다', jsonb_array_length(w->'work'->'blocks') >= 1, w->'work'->>'title');
    PERFORM set_config('sim.gb_b1', (public.save_neighbor_guestbook_v1(public.zz_sim('space'), public.zz_sim('shared_book'), '느티나무 이야기가 제일 좋았어요!', 'save'))->>'entry_id', TRUE);
    b := public.get_neighbor_shared_book_v1(public.zz_sim('space'), public.zz_sim('shared_book'), NULL);
    PERFORM public.zz_sim_check('B8 방문록을 쓰면 "선생님 확인 중"(본인만 보임)', b#>>'{guestbook,mine,status}' = 'pending'
        AND jsonb_array_length(b#>'{guestbook,entries}') = 0);
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('B5~B8 학생 문집 읽기·방문록', FALSE, SQLERRM);
END $$;
SELECT public.zz_sim_login('u_c1');
DO $$ BEGIN
    PERFORM public.zz_sim_check('B9 승인 전에는 다른 학생에게 안 보인다',
        jsonb_array_length(public.get_neighbor_shared_book_v1(public.zz_sim('space'), public.zz_sim('shared_book'), NULL)#>'{guestbook,entries}') = 0);
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('B 단계 오류', FALSE, SQLERRM);
END $$;
SELECT public.zz_sim_login('t_b');
SELECT public.zz_sim_expect_denied('B10 문집 주인이 아닌 반(바다반) 교사는 승인할 수 없다',
    format($q$SELECT public.review_neighbor_guestbook_v1(%L, %L, %L, 'approve')$q$, public.zz_sim('space'), public.zz_sim('c_b'), public.zz_sim('gb_b1')));
SELECT public.zz_sim_login('t_a');
DO $$
DECLARE w JSONB; v_inbox INT;
BEGIN
    w := public.get_neighbor_teacher_workspace_v1(public.zz_sim('c_a'));
    v_inbox := (w#>>'{notifications,pending_approvals}')::INT + (w#>>'{notifications,blocked_comments}')::INT
        + (w#>>'{notifications,pending_joins}')::INT + (w#>>'{notifications,pending_guestbook}')::INT;
    PERFORM public.zz_sim_check('B11 햇살반 검토함에 방문록 1 · 메뉴 숫자와 같다',
        jsonb_array_length(w->'pending_guestbook') = 1 AND v_inbox = (public.get_neighbor_teacher_badge_v1(public.zz_sim('c_a'))->>'count')::INT,
        format('검토함 %s · 메뉴 %s · "%s"', v_inbox, public.get_neighbor_teacher_badge_v1(public.zz_sim('c_a'))->>'count', w->'pending_guestbook'->0->>'content'));
    PERFORM public.review_neighbor_guestbook_v1(public.zz_sim('space'), public.zz_sim('c_a'), public.zz_sim('gb_b1'), 'approve');
    PERFORM public.zz_sim_check('B12 승인하면 메뉴 숫자가 준다', (public.get_neighbor_teacher_badge_v1(public.zz_sim('c_a'))->>'count')::INT = v_inbox - 1);
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('B11~B12 방문록 승인', FALSE, SQLERRM);
END $$;
SELECT public.zz_sim_login('u_c1');
DO $$
DECLARE b JSONB;
BEGIN
    b := public.get_neighbor_shared_book_v1(public.zz_sim('space'), public.zz_sim('shared_book'), NULL);
    PERFORM public.zz_sim_check('B13 승인된 방문록은 모든 반 학생에게 보인다', jsonb_array_length(b#>'{guestbook,entries}') = 1,
        (b#>'{guestbook,entries}'->0->>'class_name') || ' ' || (b#>'{guestbook,entries}'->0->>'student_name'));
    PERFORM set_config('sim.gb_c1', (public.save_neighbor_guestbook_v1(public.zz_sim('space'), public.zz_sim('shared_book'), '별로야', 'save'))->>'entry_id', TRUE);
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('B13 방문록 보기', FALSE, SQLERRM);
END $$;
RESET ROLE;
SELECT public.zz_sim_check('B14 승인되면 쓴 학생에게 "방문록이 올라갔어요" 알림',
    EXISTS (SELECT 1 FROM public.student_notification_events WHERE student_id = public.zz_sim('s_b1') AND event_type = 'neighbor.guestbook_approved'));
SELECT public.zz_sim_check('B15 문집에 글이 실린 햇살반 학생 3명에게 "우리 문집에 방문록" 알림',
    (SELECT count(*) FROM public.student_notification_events e JOIN public.students s ON s.id = e.student_id
     WHERE e.event_type = 'neighbor.guestbook_received' AND s.class_id = public.zz_sim('c_a')) = 3,
    (SELECT count(*) FROM public.student_notification_events WHERE event_type = 'neighbor.guestbook_received') || '건');
SET LOCAL ROLE authenticated;
SELECT public.zz_sim_login('t_a');
DO $$ BEGIN
    PERFORM public.review_neighbor_guestbook_v1(public.zz_sim('space'), public.zz_sim('c_a'), public.zz_sim('gb_c1'), 'reject');
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('B16 거절', FALSE, SQLERRM);
END $$;
SELECT public.zz_sim_login('u_c1');
DO $$
DECLARE b JSONB;
BEGIN
    b := public.get_neighbor_shared_book_v1(public.zz_sim('space'), public.zz_sim('shared_book'), NULL);
    PERFORM public.zz_sim_check('B16 거절한 방문록은 올라가지 않고, 쓴 학생은 "거절" 상태를 본다',
        jsonb_array_length(b#>'{guestbook,entries}') = 1 AND b#>>'{guestbook,mine,status}' = 'rejected');
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('B 단계 오류', FALSE, SQLERRM);
END $$;
SELECT public.zz_sim_login('u_b1');
DO $$ BEGIN
    PERFORM public.save_neighbor_guestbook_v1(public.zz_sim('space'), public.zz_sim('shared_book'), '다시 읽어도 좋아요!', 'save');
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('B 단계 오류', FALSE, SQLERRM);
END $$;
RESET ROLE;
SELECT public.zz_sim_check('B17 고쳐 쓰면 다시 확인 대기가 되고, 올라갔다는 알림은 거둬진다',
    (SELECT status FROM public.neighbor_book_guestbook WHERE id = public.zz_sim('gb_b1')) = 'pending'
    AND NOT EXISTS (SELECT 1 FROM public.student_notification_events WHERE student_id = public.zz_sim('s_b1') AND event_type = 'neighbor.guestbook_approved'));
-- 학생이 자기 작품을 문집에서 철회하면 이웃에게서도 빠진다.
UPDATE public.class_agit_book_items SET revoked_at = NOW()
WHERE id = (SELECT id FROM public.class_agit_book_items WHERE book_id = public.zz_sim('book') ORDER BY position LIMIT 1);
SET LOCAL ROLE authenticated;
SELECT public.zz_sim_login('u_b2');
DO $$ BEGIN
    PERFORM public.zz_sim_check('B18 작품이 철회되면 이웃 반 차례에서도 빠진다(3→2)',
        jsonb_array_length(public.get_neighbor_shared_book_v1(public.zz_sim('space'), public.zz_sim('shared_book'), NULL)->'works') = 2);
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('B18 철회 반영', FALSE, SQLERRM);
END $$;
SELECT public.zz_sim_login('u_d1');
SELECT public.zz_sim_expect_denied('B19 참여하지 않은 학급 학생은 문집을 못 연다',
    format($q$SELECT public.get_neighbor_shared_book_v1(%L, %L, NULL)$q$, public.zz_sim('space'), public.zz_sim('shared_book')));
SELECT public.zz_sim_login('t_a');
DO $$ BEGIN
    PERFORM public.withdraw_neighbor_book_v1(public.zz_sim('space'), public.zz_sim('c_a'), public.zz_sim('shared_book'));
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('B20 소개 내리기', FALSE, SQLERRM);
END $$;
SELECT public.zz_sim_login('u_b1');
DO $$ BEGIN
    PERFORM public.zz_sim_check('B20 소개를 내리면 학생 목록에서 사라진다',
        jsonb_array_length(public.get_neighbor_space_books_v1(public.zz_sim('space'))->'books') = 0);
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('B 단계 오류', FALSE, SQLERRM);
END $$;
SELECT public.zz_sim_expect_denied('B21 내린 문집은 열 수 없다',
    format($q$SELECT public.get_neighbor_shared_book_v1(%L, %L, NULL)$q$, public.zz_sim('space'), public.zz_sim('shared_book')));
SELECT public.zz_sim_login('t_a');
DO $$ BEGIN
    PERFORM public.share_neighbor_book_v1(public.zz_sim('space'), public.zz_sim('c_a'), public.zz_sim('book'));
    PERFORM public.zz_sim_check('B22 다시 소개하면 방문록이 이어진다',
        (public.get_neighbor_teacher_books_v1(public.zz_sim('space'), public.zz_sim('c_a'))->'shared_books'->0->>'approved_count')::INT = 0
        AND (public.get_neighbor_teacher_books_v1(public.zz_sim('space'), public.zz_sim('c_a'))->'shared_books'->0->>'pending_count')::INT = 1);
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('B22 다시 소개', FALSE, SQLERRM);
END $$;

-- ───────────────────────── 5. 나가기·종료 ─────────────────────────
-- 나가는 반 학생도 받은 이웃 알림이 있어야 57-1 이 헛돌지 않는다(시뮬레이션에서는 별빛반 글에 댓글이 없어 직접 남긴다).
RESET ROLE;
INSERT INTO public.student_notification_events (class_id, student_id, module_id, event_type, entity_type, entity_id, payload, event_key)
VALUES (public.zz_sim('c_c'), public.zz_sim('s_c1'), 'feedback', 'feedback.neighbor_comment_received', 'neighbor_shared_post',
    public.zz_sim('shared_a1'), jsonb_build_object('space_id', public.zz_sim('space'), 'shared_post_id', public.zz_sim('shared_a1')),
    'neighbor-comment:' || gen_random_uuid());
SET LOCAL ROLE authenticated;
SELECT public.zz_sim_login('t_c');
DO $$ BEGIN
    PERFORM public.run_neighbor_teacher_action_v1(public.zz_sim('c_c'), 'leave_space', jsonb_build_object('space_id', public.zz_sim('space')));
    PERFORM public.zz_sim_check('57 별빛반이 공간에서 나간다', TRUE);
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('57 별빛반 나가기', FALSE, SQLERRM);
END $$;
RESET ROLE;
SELECT public.zz_sim_check('57-1 나간 반 학생의 이웃 댓글·방문록 알림은 거둔다',
    NOT EXISTS (SELECT 1 FROM public.student_notification_events e
        WHERE e.class_id = public.zz_sim('c_c') AND e.module_id = 'feedback'
          AND (e.event_key LIKE 'neighbor-comment:%' OR e.event_key LIKE 'neighbor-guestbook%')),
    (SELECT count(*) || '건 남음' FROM public.student_notification_events e
        WHERE e.class_id = public.zz_sim('c_c') AND e.event_key LIKE 'neighbor-%'));
SET LOCAL ROLE authenticated;
SELECT public.zz_sim_login('u_c1');
SELECT public.zz_sim_expect_denied('58 나간 반 학생은 더 이상 못 들어온다',
    format($q$SELECT public.get_neighbor_space_feed_v1(%L, 20, NULL, NULL)$q$, public.zz_sim('space')));
SELECT public.zz_sim_login('u_b1');
DO $$
DECLARE f JSONB;
BEGIN
    f := public.get_neighbor_space_feed_v1(public.zz_sim('space'), 20, NULL, NULL);
    PERFORM public.zz_sim_check('59 남은 두 반은 계속 쓴다(햇살·바다 글만 보임)',
        NOT EXISTS (SELECT 1 FROM jsonb_array_elements(f->'items') x WHERE x->>'class_name' = '별빛반'), jsonb_array_length(f->'items') || '편');
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('59 남은 반 피드', FALSE, SQLERRM);
END $$;
SELECT public.zz_sim_login('t_a');
DO $$ BEGIN
    PERFORM public.run_neighbor_teacher_action_v1(public.zz_sim('c_a'), 'close_space', jsonb_build_object('space_id', public.zz_sim('space')));
    PERFORM public.zz_sim_check('60 호스트가 공간을 종료', TRUE);
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('60 공간 종료', FALSE, SQLERRM);
END $$;
SELECT public.zz_sim_login('u_b1');
SELECT public.zz_sim_expect_denied('61 종료 뒤 학생은 못 들어온다',
    format($q$SELECT public.get_neighbor_space_feed_v1(%L, 20, NULL, NULL)$q$, public.zz_sim('space')));
DO $$ BEGIN
    PERFORM public.zz_sim_check('62 종료 뒤 학생 홈 카드가 사라진다',
        (public.get_student_home_bootstrap_v1()#>>'{home,neighbor_agit_available}')::BOOLEAN IS NOT TRUE);
END $$;
SELECT public.zz_sim_login('t_a');
DO $$ BEGIN
    PERFORM public.zz_sim_check('63 종료 뒤 교사 메뉴 숫자 0 · 새 공간을 만들 수 있는 상태',
        (public.get_neighbor_teacher_badge_v1(public.zz_sim('c_a'))->>'count')::INT = 0
        AND public.get_neighbor_teacher_workspace_v1(public.zz_sim('c_a'))#>>'{space,id}' IS NULL,
        COALESCE(public.get_neighbor_teacher_workspace_v1(public.zz_sim('c_a'))#>>'{space,id}', '공간 없음'));
EXCEPTION WHEN OTHERS THEN PERFORM public.zz_sim_check('63 종료 뒤 교사 화면', FALSE, SQLERRM);
END $$;
RESET ROLE;
SELECT public.zz_sim_check('64 종료 뒤: 우리 반 원글은 그대로 남는다',
    (SELECT count(*) FROM public.student_posts WHERE class_id IN (public.zz_sim('c_a'), public.zz_sim('c_b'), public.zz_sim('c_c'))) = 18,
    (SELECT count(*) FROM public.student_posts WHERE class_id IN (public.zz_sim('c_a'), public.zz_sim('c_b'), public.zz_sim('c_c'))) || '편');
SELECT public.zz_sim_check('65 종료 뒤 이웃 댓글·방문록 알림은 거둔다(눌러도 갈 곳이 없으므로)',
    NOT EXISTS (SELECT 1 FROM public.student_notification_events e JOIN public.students s ON s.id = e.student_id
        WHERE s.student_code LIKE 'SIM%' AND e.module_id = 'feedback'
          AND (e.event_key LIKE 'neighbor-comment:%' OR e.event_key LIKE 'neighbor-guestbook%')),
    '남은 이웃 댓글 알림 ' || (SELECT count(*) FROM public.student_notification_events e JOIN public.students s ON s.id = e.student_id
        WHERE s.student_code LIKE 'SIM%' AND e.event_type = 'feedback.neighbor_comment_received') || '건');


-- 두 번째 시도 중 작업기가 멈춤(임대 만료) → 다음 claim 이 교사 확인으로 넘긴다.
-- 운영 슬롯 하나를 이 트랜잭션 안에서만 잠깐 빌린다(끝에 ROLLBACK). 작업기는 SKIP LOCKED 라 기다리지 않는다.
RESET ROLE;
INSERT INTO public.neighbor_comments (shared_post_id, space_id, class_id, student_id, content, status,
    ai_review_attempts, ai_review_enqueued_at, ai_review_next_at, ai_review_token, ai_review_lease_until)
SELECT shared.id, shared.space_id, public.zz_sim('c_a'), public.zz_sim('s_a2'), '임대 만료 시험 댓글', 'pending',
    2, NOW(), NULL, 'aaaaaaaa-0000-4000-8000-000000000001'::UUID, NOW() - INTERVAL '1 second'
FROM public.neighbor_shared_posts shared WHERE shared.id = public.zz_sim('shared_a1')
RETURNING set_config('sim.lease_cmt', id::TEXT, TRUE) \gset
UPDATE public.comment_ai_review_slots SET comment_id = public.zz_sim('lease_cmt'),
    review_token = 'aaaaaaaa-0000-4000-8000-000000000001'::UUID, leased_at = NOW() - INTERVAL '3 minutes',
    lease_until = NOW() - INTERVAL '1 second'
WHERE slot_no = (SELECT min(slot_no) FROM public.comment_ai_review_slots WHERE comment_id IS NULL);
SET LOCAL ROLE service_role;
SELECT public.zz_sim_login('admin', 'service_role');
SELECT public.claim_next_comment_ai_review_v2() AS lease_claim \gset
RESET ROLE;
SELECT public.zz_sim_check('L1 두 번째 시도의 작업기가 멈추면 다음 claim 이 교사 확인(blocked)으로 넘기고 슬롯을 비운다',
    (SELECT status = 'blocked' AND moderated_by = 'ai_failed' AND ai_review_token IS NULL FROM public.neighbor_comments WHERE id = public.zz_sim('lease_cmt'))
    AND NOT EXISTS (SELECT 1 FROM public.comment_ai_review_slots WHERE comment_id = public.zz_sim('lease_cmt')),
    :'lease_claim');
-- ───────────────────────── 결과 ─────────────────────────
\echo
\echo '===== 모두의 아지트 시뮬레이션 결과 ====='
SELECT n AS "번호", CASE WHEN ok THEN '통과' ELSE '실패' END AS "결과", step AS "단계", left(detail, 90) AS "내용" FROM public.zz_sim_log ORDER BY n;
SELECT count(*) FILTER (WHERE ok) AS "통과", count(*) FILTER (WHERE NOT ok) AS "실패" FROM public.zz_sim_log;
