-- 학생 맞춤법 밑줄 자료 v3 스모크 (롤백된다).
-- ① 처음엔 켜진 공통 자료 전부 + 우리 반 수첩 ② 이후엔 바뀐 줄만, 꺼진 것은 status 로 알림
-- ③ 학생이 아니면 빈 목록, 로그인 안 하면 못 부름, 옛 판 v2 없음 ④ 관리자 화면에 한도·개수
BEGIN;

DO $$
DECLARE
    v_student UUID; v_admin UUID; v_res JSONB; v_version TIMESTAMPTZ; v_entry UUID; v_count INTEGER; v_blocked BOOLEAN;
BEGIN
    SELECT s.auth_id INTO v_student FROM public.students s
    WHERE s.auth_id IS NOT NULL AND s.deleted_at IS NULL LIMIT 1;
    SELECT id INTO v_admin FROM public.profiles WHERE role = 'ADMIN' LIMIT 1;
    SELECT count(*) INTO v_count FROM public.spelling_learning_entries WHERE scope = 'common' AND status = 'approved';

    IF to_regprocedure('public.get_student_spelling_entries_v2()') IS NOT NULL THEN RAISE EXCEPTION '옛 판 v2 가 남음'; END IF;
    IF has_function_privilege('anon', 'public.get_student_spelling_entries_v3(timestamptz)', 'EXECUTE') THEN
        RAISE EXCEPTION '로그인 안 한 사람이 부를 수 있음';
    END IF;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_student, 'role', 'authenticated')::TEXT, TRUE);
    -- ① 처음
    v_res := public.get_student_spelling_entries_v3(NULL);
    IF NOT (v_res->>'full')::BOOLEAN OR jsonb_array_length(v_res->'common') <> v_count OR (v_res->>'common_count')::INT <> v_count THEN
        RAISE EXCEPTION '처음 받기가 공통 자료 전부가 아님: % / %', jsonb_array_length(v_res->'common'), v_count;
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_res->'common') e WHERE e->>'status' <> 'approved') THEN
        RAISE EXCEPTION '처음 받기에 꺼진 자료가 섞임';
    END IF;
    v_version := (v_res->>'common_version')::TIMESTAMPTZ;

    -- ② 바뀐 것 없음 → 겹쳐 받는 5분 안의 것만(오래된 자료는 안 옴)
    UPDATE public.spelling_learning_entries SET updated_at = updated_at - INTERVAL '1 day' WHERE scope = 'common';
    v_res := public.get_student_spelling_entries_v3(now());
    IF (v_res->>'full')::BOOLEAN OR jsonb_array_length(v_res->'common') <> 0 THEN RAISE EXCEPTION '바뀐 것이 없는데 자료가 옴'; END IF;

    -- 하나 끄면 그 하나만 status=disabled 로 온다
    SELECT id INTO v_entry FROM public.spelling_learning_entries WHERE scope = 'common' AND status = 'approved' LIMIT 1;
    IF v_entry IS NOT NULL THEN
        UPDATE public.spelling_learning_entries SET status = 'disabled', updated_at = now() WHERE id = v_entry;
        v_res := public.get_student_spelling_entries_v3(now() - INTERVAL '1 hour');
        IF jsonb_array_length(v_res->'common') <> 1 OR v_res->'common'->0->>'status' <> 'disabled' OR v_res->'common'->0->>'id' <> v_entry::TEXT THEN
            RAISE EXCEPTION '끈 자료가 바뀐 줄로 오지 않음: %', v_res->'common';
        END IF;
        IF (v_res->>'common_count')::INT <> v_count - 1 THEN RAISE EXCEPTION '개수가 줄지 않음'; END IF;
    END IF;

    -- ③ 학생이 아니면 빈 목록
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::TEXT, TRUE);
    v_res := public.get_student_spelling_entries_v3(NULL);
    IF jsonb_array_length(v_res->'common') <> 0 THEN RAISE EXCEPTION '학생이 아닌데 자료가 옴'; END IF;

    -- ④ 관리자 화면 한도·개수
    v_res := public.admin_get_spelling_promotion_workspace_v3();
    IF (v_res->>'student_entry_limit')::INT <> 3000 OR NOT (v_res ? 'common_approved_count') THEN
        RAISE EXCEPTION '관리자 화면에 한도·개수가 없음';
    END IF;
    RAISE NOTICE '학생 맞춤법 v3 스모크 통과';
END;
$$;

ROLLBACK;
