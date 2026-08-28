-- 목록은 관리자만 보고 읽기만 한다. 빼기는 되돌릴 수 있어야 하고, 게시된 후보는 건드리지 않아야 한다.

\echo '--- 관리자가 아니면 둘 다 막힌다 ---'
DO $$
BEGIN
    PERFORM public.admin_get_spelling_intake_candidates_v1('search');
    RAISE EXCEPTION '목록이 관리자 확인 없이 통과했다';
EXCEPTION WHEN insufficient_privilege THEN
    NULL;
END $$;

DO $$
BEGIN
    PERFORM public.admin_set_spelling_candidate_excluded_v1('search', '검사용표현');
    RAISE EXCEPTION '빼기가 관리자 확인 없이 통과했다';
EXCEPTION WHEN insufficient_privilege THEN
    NULL;
END $$;

\echo '--- 관리자로 가장해 목록·빼기·되돌리기를 확인한다 ---'
DO $$
DECLARE
    v_admin UUID;
    v_out JSONB;
    v_before BIGINT;
    v_after BIGINT;
BEGIN
    SELECT id INTO v_admin FROM public.profiles WHERE role = 'ADMIN' LIMIT 1;
    IF v_admin IS NULL THEN
        RAISE NOTICE 'ADMIN 계정이 없어 본문 확인을 건너뛴다';
        RETURN;
    END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, TRUE);

    -- 출처가 둘 다 목록을 준다.
    FOR v_out IN SELECT public.admin_get_spelling_intake_candidates_v1(kind)
                 FROM unnest(ARRAY['search', 'ai']) AS kind LOOP
        IF jsonb_typeof(v_out->'items') <> 'array' OR jsonb_typeof(v_out->'total') <> 'number' THEN
            RAISE EXCEPTION '목록 모양이 다르다: %', v_out::text;
        END IF;
    END LOOP;

    -- 모르는 출처는 막는다.
    BEGIN
        PERFORM public.admin_get_spelling_intake_candidates_v1('teacher');
        RAISE EXCEPTION '모르는 출처가 통과했다';
    EXCEPTION WHEN sqlstate '22023' THEN
        NULL;
    END;

    -- 빼면 목록에서 사라지고, 되돌리면 기록이 지워진다.
    SELECT (public.admin_get_spelling_intake_candidates_v1('search', TRUE)->>'total')::BIGINT INTO v_before;
    v_out := public.admin_set_spelling_candidate_excluded_v1('search', '검사용표현', '', TRUE);
    IF v_out->>'status' <> 'excluded' THEN
        RAISE EXCEPTION '빼기가 안 됐다: %', v_out::text;
    END IF;
    SELECT (public.admin_get_spelling_intake_candidates_v1('search', TRUE)->>'total')::BIGINT INTO v_after;
    IF v_after <> v_before + 1 THEN
        RAISE EXCEPTION '뺀 것 수가 안 늘었다: % -> %', v_before, v_after;
    END IF;

    v_out := public.admin_set_spelling_candidate_excluded_v1('search', '검사용표현', '', FALSE);
    IF v_out->>'status' <> 'restored' THEN
        RAISE EXCEPTION '되돌리기가 안 됐다: %', v_out::text;
    END IF;
    SELECT (public.admin_get_spelling_intake_candidates_v1('search', TRUE)->>'total')::BIGINT INTO v_after;
    IF v_after <> v_before THEN
        RAISE EXCEPTION '되돌린 뒤 수가 원래대로 안 왔다: % -> %', v_before, v_after;
    END IF;

    -- 이미 게시된 후보는 빼지 않고 published_locked 를 돌려준다.
    INSERT INTO public.spelling_common_reviews(source_kind, expression, source_correction, decision, decided_by)
    VALUES ('search', '게시된표현', '', 'published', v_admin);
    v_out := public.admin_set_spelling_candidate_excluded_v1('search', '게시된표현', '', TRUE);
    IF v_out->>'status' <> 'published_locked' THEN
        RAISE EXCEPTION '게시된 후보를 빼 버렸다: %', v_out::text;
    END IF;
END $$;
