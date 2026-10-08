-- 회색 줄 기록 표 스모크(롤백된다): 브라우저는 못 읽고, 서버는 쓰고, 값 범위를 지킨다.
BEGIN;
DO $$
DECLARE v_post UUID; v_blocked BOOLEAN;
BEGIN
    IF has_table_privilege('authenticated', 'public.spelling_shadow_suggestions', 'SELECT')
       OR has_table_privilege('anon', 'public.spelling_shadow_suggestions', 'SELECT')
       OR has_table_privilege('authenticated', 'public.spelling_shadow_runs', 'SELECT') THEN
        RAISE EXCEPTION '브라우저가 회색 줄 기록을 읽을 수 있음';
    END IF;
    SELECT id INTO v_post FROM public.student_posts LIMIT 1;
    INSERT INTO public.spelling_shadow_suggestions(post_id, text_version, kind, original, suggestion, overlaps_red, outcome)
    VALUES (v_post, 'original', 'spacing_insert', '같은색의', '같은 색의', FALSE, 'fixed_as_suggested');
    v_blocked := FALSE;
    BEGIN
        INSERT INTO public.spelling_shadow_suggestions(post_id, text_version, kind, original, suggestion) VALUES (v_post, 'original', 'rewrite', 'x', 'y');
    EXCEPTION WHEN check_violation THEN v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN RAISE EXCEPTION '모르는 갈래를 받음'; END IF;
    RAISE NOTICE '회색 줄 기록 표 스모크 통과';
END;
$$;
ROLLBACK;
