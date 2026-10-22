-- quiz-arena 문제 세트 스모크(전부 롤백). 관리자·다른 교사·학생·anon 을 흉내 내어 권한과 저장·공유·복사 흐름을 본다.
DO $$
DECLARE
    v_admin UUID;
    v_teacher UUID;
    v_student UUID;
    v_set UUID;
    v_copy UUID;
    v_result JSONB;
    v_questions JSONB := '[
        {"kind":"ox","text":"바르게 쓴 문장일까요? 이제 집에 가도 돼요.","answer":0,"explanation":"되어의 줄임말이에요."},
        {"kind":"c4","text":"뜻에 알맞은 낱말은? 회의를 시작하는 것","choices":["개회","폐회","휴회","산회"],"answer":0}
    ]'::JSONB;
    v_denied BOOLEAN;
BEGIN
    SELECT id INTO v_admin FROM public.profiles WHERE role = 'ADMIN' ORDER BY created_at LIMIT 1;
    SELECT id INTO v_teacher FROM public.profiles WHERE role = 'TEACHER' ORDER BY created_at LIMIT 1;
    SELECT auth_id INTO v_student FROM public.students WHERE auth_id IS NOT NULL AND is_active IS DISTINCT FROM false LIMIT 1;
    IF v_admin IS NULL OR v_teacher IS NULL OR v_student IS NULL THEN RAISE EXCEPTION '스모크에 쓸 관리자·교사·학생 계정이 없습니다.'; END IF;

    -- 권한: anon·학생·일반 교사는 모두 거절(공개 전에는 관리자만)
    IF has_function_privilege('anon', 'public.save_quiz_arena_set_v1(uuid,jsonb,jsonb)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.list_shared_quiz_arena_sets_v1(integer,text,integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon 이 퀴즈 아레나 함수를 부를 수 있습니다.';
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.quiz_arena_sets'::regclass)
       OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.quiz_arena_questions'::regclass) THEN
        RAISE EXCEPTION '퀴즈 아레나 표에 RLS 가 꺼져 있습니다.';
    END IF;
    IF has_table_privilege('authenticated', 'public.quiz_arena_sets', 'SELECT') OR has_table_privilege('authenticated', 'public.quiz_arena_questions', 'INSERT') THEN
        RAISE EXCEPTION '로그인 사용자에게 표 직접 권한이 열려 있습니다.';
    END IF;

    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_teacher, 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('request.jwt.claim.sub', v_teacher::TEXT, true);
    v_denied := false;
    BEGIN PERFORM public.list_my_quiz_arena_sets_v1(); EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
    IF NOT v_denied THEN RAISE EXCEPTION '일반 교사가 관리자 시험 기능을 쓸 수 있습니다.'; END IF;

    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_student, 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('request.jwt.claim.sub', v_student::TEXT, true);
    v_denied := false;
    BEGIN PERFORM public.list_shared_quiz_arena_sets_v1(); EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
    IF NOT v_denied THEN RAISE EXCEPTION '학생이 퀴즈 아레나 목록을 볼 수 있습니다.'; END IF;

    -- 관리자: 저장 → 목록 → 공유 → 다른 문제 검사
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('request.jwt.claim.sub', v_admin::TEXT, true);
    v_result := public.save_quiz_arena_set_v1(NULL, '{"title":"3학년 맞춤법 점검","grade":"3","subject":"국어","unit":"1단원"}'::JSONB, v_questions);
    v_set := (v_result->>'id')::UUID;
    IF (v_result->>'question_count')::INTEGER <> 2 THEN RAISE EXCEPTION '문제 수가 다릅니다: %', v_result; END IF;
    IF jsonb_array_length(public.list_my_quiz_arena_sets_v1()) < 1 THEN RAISE EXCEPTION '내 세트 목록이 비었습니다.'; END IF;
    v_result := public.get_quiz_arena_set_v1(v_set);
    IF jsonb_array_length(v_result->'questions') <> 2 OR (v_result->'questions'->0) ? 'choices' OR (v_result->'questions'->1->>'answer') <> '0' THEN
        RAISE EXCEPTION '불러온 문제 모양이 다릅니다: %', v_result;
    END IF;
    -- 공유 전에는 공유 목록에 없다
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(public.list_shared_quiz_arena_sets_v1(3, NULL, 30)) e WHERE (e->>'id')::UUID = v_set) THEN
        RAISE EXCEPTION '공유하지 않은 세트가 공유 목록에 있습니다.';
    END IF;
    PERFORM public.set_quiz_arena_set_visibility_v1(v_set, 'shared');
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(public.list_shared_quiz_arena_sets_v1(3, '맞춤법', 30)) e WHERE (e->>'id')::UUID = v_set AND (e->>'is_mine')::BOOLEAN) THEN
        RAISE EXCEPTION '공유한 세트를 학년·검색어로 찾지 못했습니다.';
    END IF;
    IF public.list_shared_quiz_arena_sets_v1(3, NULL, 30)::TEXT LIKE '%owner%' THEN RAISE EXCEPTION '공유 목록에 만든 사람 정보가 있습니다.'; END IF;
    -- 와일드카드 문자는 글자 그대로 찾는다(% 한 글자로 전부 나오면 안 됨)
    IF jsonb_array_length(public.list_shared_quiz_arena_sets_v1(NULL, '%', 30)) <> 0 THEN RAISE EXCEPTION '검색어 %% 가 모든 세트와 맞습니다.'; END IF;

    -- 복사: 내 것으로 복사하면 원본 복사 횟수는 그대로(내 것이라), 문제는 같다
    v_copy := (public.copy_quiz_arena_set_v1(v_set)->>'id')::UUID;
    IF (SELECT COUNT(*) FROM public.quiz_arena_questions WHERE set_id = v_copy) <> 2 THEN RAISE EXCEPTION '복사한 문제 수가 다릅니다.'; END IF;
    IF (SELECT copied_from FROM public.quiz_arena_sets WHERE id = v_copy) <> v_set THEN RAISE EXCEPTION '복사 원본이 기록되지 않았습니다.'; END IF;

    -- 고치기: 문제를 통째로 바꾼다 / 잘못된 문제는 거절
    PERFORM public.save_quiz_arena_set_v1(v_set, '{"title":"3학년 맞춤법 점검","grade":"3"}'::JSONB, '[{"kind":"ox","text":"하나만","answer":1}]'::JSONB);
    IF (SELECT COUNT(*) FROM public.quiz_arena_questions WHERE set_id = v_set) <> 1 THEN RAISE EXCEPTION '문제를 통째로 바꾸지 못했습니다.'; END IF;
    v_denied := false;
    BEGIN PERFORM public.save_quiz_arena_set_v1(NULL, '{"title":"나쁜 세트"}'::JSONB, '[{"kind":"c4","text":"q","choices":["a","a","b","c"],"answer":0}]'::JSONB);
    EXCEPTION WHEN invalid_parameter_value THEN v_denied := true; END;
    IF NOT v_denied THEN RAISE EXCEPTION '보기가 겹치는 문제가 저장됩니다.'; END IF;
    v_denied := false;
    BEGIN PERFORM public.save_quiz_arena_set_v1(NULL, '{"title":"긴 글"}'::JSONB, jsonb_build_array(jsonb_build_object('kind', 'ox', 'text', repeat('가', 61), 'answer', 0)));
    EXCEPTION WHEN invalid_parameter_value THEN v_denied := true; END;
    IF NOT v_denied THEN RAISE EXCEPTION '60자를 넘는 문제가 저장됩니다.'; END IF;

    -- 삭제
    PERFORM public.delete_quiz_arena_set_v1(v_copy);
    IF EXISTS (SELECT 1 FROM public.quiz_arena_sets WHERE id = v_copy) OR EXISTS (SELECT 1 FROM public.quiz_arena_questions WHERE set_id = v_copy) THEN
        RAISE EXCEPTION '삭제한 세트가 남아 있습니다.';
    END IF;
END;
$$;
