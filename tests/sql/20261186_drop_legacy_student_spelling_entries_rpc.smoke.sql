-- 구형 판은 사라지고, 아지트·연구소가 함께 쓰는 _v2 는 학생 권한으로 계속 도는지 확인한다.
BEGIN;

DO $$
DECLARE
    v_auth UUID;
    v_result JSONB;
BEGIN
    IF to_regprocedure('public.get_student_spelling_entries_v1()') IS NOT NULL THEN
        RAISE EXCEPTION '구형 학생 맞춤법 조회 함수가 아직 존재합니다.';
    END IF;

    SELECT auth_id INTO v_auth
    FROM public.students
    WHERE auth_id IS NOT NULL AND is_active IS DISTINCT FROM FALSE AND deleted_at IS NULL
    LIMIT 1;
    IF v_auth IS NULL THEN
        RAISE NOTICE '검증용 학생이 없어 호출 확인은 건너뜁니다.';
        RETURN;
    END IF;

    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_auth, 'role', 'authenticated'
    )::TEXT, TRUE);

    v_result := public.get_student_spelling_entries_v2();
    -- 연구소는 `data.entries` 를 배열로 읽는다. 이 모양이 깨지면 그쪽이 조용히 빈다.
    IF jsonb_typeof(v_result->'entries') <> 'array' THEN
        RAISE EXCEPTION '_v2 응답에 entries 배열이 없습니다.';
    END IF;
END $$;

ROLLBACK;
