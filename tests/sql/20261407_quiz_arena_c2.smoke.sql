-- 퀴즈 아레나 2지선다(c2) 스모크(전부 롤백): 저장·읽기·잘못된 보기 수·정답 번호 거절.
DO $$
DECLARE v_admin UUID; v_set UUID; v_result JSONB; v_bad BOOLEAN := false;
BEGIN
    SELECT id INTO v_admin FROM public.profiles WHERE role = 'ADMIN' ORDER BY created_at LIMIT 1;
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('request.jwt.claim.sub', v_admin::TEXT, true);
    v_result := public.save_quiz_arena_set_v1(NULL, '{"title":"형식 섞기"}'::JSONB, '[
      {"kind":"ox","text":"O/X","answer":1},
      {"kind":"c2","text":"빈칸에 알맞은 말은? 집에 가도 ＿＿＿.","choices":["돼요","되요"],"answer":0,"explanation":"되어요의 줄임말"},
      {"kind":"c4","text":"사지선다","choices":["가","나","다","라"],"answer":3}]'::JSONB);
    v_set := (v_result->>'id')::UUID;
    IF (SELECT count(*) FROM public.quiz_arena_questions WHERE set_id = v_set AND kind = 'c2') <> 1 THEN RAISE EXCEPTION 'c2 가 저장되지 않았습니다'; END IF;
    IF (public.get_quiz_arena_set_v1(v_set)->'questions'->1->'choices') IS NULL THEN RAISE EXCEPTION 'c2 보기가 안 읽힙니다'; END IF;
    BEGIN PERFORM public.save_quiz_arena_set_v1(NULL, '{"title":"나쁨"}'::JSONB, '[{"kind":"c2","text":"q","choices":["a","b","c"],"answer":0}]'::JSONB);
    EXCEPTION WHEN invalid_parameter_value THEN v_bad := true; END;
    IF NOT v_bad THEN RAISE EXCEPTION '보기 3개 c2 가 저장됩니다'; END IF;
    v_bad := false;
    BEGIN PERFORM public.save_quiz_arena_set_v1(NULL, '{"title":"나쁨2"}'::JSONB, '[{"kind":"c2","text":"q","choices":["a","b"],"answer":2}]'::JSONB);
    EXCEPTION WHEN invalid_parameter_value THEN v_bad := true; END;
    IF NOT v_bad THEN RAISE EXCEPTION '정답 번호 2 인 c2 가 저장됩니다'; END IF;
    -- 이전 판은 choices 가 NULL 이면 CHECK 가 통과했다 — 이제 막혀야 한다
    v_bad := false;
    BEGIN INSERT INTO public.quiz_arena_questions (set_id, position, kind, text, choices, answer) VALUES (v_set, 10, 'c2', 'q', NULL, 0);
    EXCEPTION WHEN check_violation THEN v_bad := true; END;
    IF NOT v_bad THEN RAISE EXCEPTION 'choices 가 없는 c2 가 표에 들어갑니다'; END IF;
END $$;
