-- 회색 점선 고른 결과 기록 스모크(롤백된다):
-- ① 브라우저는 표를 못 읽고, 로그인 안 하면 함수를 못 부른다 ② 학급이 끄면 0개 ③ 켜면 바른 것만 남고 학생 식별자는 없다
BEGIN;
DO $$
DECLARE v_student UUID; v_class UUID; v_saved INTEGER; v_blocked BOOLEAN;
BEGIN
    IF has_table_privilege('authenticated', 'public.spelling_gray_feedback', 'SELECT')
       OR has_table_privilege('anon', 'public.spelling_gray_feedback', 'SELECT') THEN
        RAISE EXCEPTION '브라우저가 고른 결과 기록을 읽을 수 있음';
    END IF;
    IF has_function_privilege('anon', 'public.record_spelling_gray_feedback_v1(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION '로그인 안 한 사람이 기록 함수를 부를 수 있음';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'spelling_gray_feedback' AND column_name LIKE '%student%') THEN
        RAISE EXCEPTION '학생 식별자 칸이 있음';
    END IF;

    SELECT s.auth_id, s.class_id INTO v_student, v_class FROM public.students s
    WHERE s.auth_id IS NOT NULL AND s.deleted_at IS NULL AND s.class_id IS NOT NULL LIMIT 1;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_student, 'role', 'authenticated')::TEXT, TRUE);

    -- ② 학급이 끈 상태
    UPDATE public.classes SET writing_editor_settings = jsonb_build_object('enabled_tools', jsonb_build_array('spelling-lookup')) WHERE id = v_class;
    v_saved := public.record_spelling_gray_feedback_v1('[{"category":"typo","original":"떄문에","suggestion":"때문에","choice":"applied"}]');
    IF v_saved <> 0 THEN RAISE EXCEPTION '학급이 껐는데 기록함'; END IF;

    -- ③ 켠 상태: 바른 것 2개 + 모르는 갈래·긴 조각은 버림
    UPDATE public.classes SET writing_editor_settings = jsonb_build_object('enabled_tools', jsonb_build_array('spelling-lookup', 'spelling-gray')) WHERE id = v_class;
    v_saved := public.record_spelling_gray_feedback_v1(jsonb_build_array(
        jsonb_build_object('category', 'typo', 'original', '떄문에', 'suggestion', '때문에', 'choice', 'applied'),
        jsonb_build_object('category', 'modifier_noun', 'original', '먹을것', 'suggestion', '먹을 것', 'choice', 'kept'),
        jsonb_build_object('category', 'other_spacing', 'original', '그 다음', 'suggestion', '그다음', 'choice', 'kept'),
        jsonb_build_object('category', 'typo', 'original', repeat('가', 31), 'suggestion', '나', 'choice', 'kept')
    ));
    IF v_saved <> 2 THEN RAISE EXCEPTION '바른 것 2개만 남아야 함: %', v_saved; END IF;

    v_blocked := FALSE;
    BEGIN
        PERFORM public.record_spelling_gray_feedback_v1((SELECT jsonb_agg(jsonb_build_object('category', 'typo')) FROM generate_series(1, 21)));
    EXCEPTION WHEN invalid_parameter_value THEN v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN RAISE EXCEPTION '한 번에 21개를 받음'; END IF;
    RAISE NOTICE '회색 점선 고른 결과 기록 스모크 통과';
END;
$$;
ROLLBACK;
