-- 옛 판은 사라지고 쓰는 판은 학생 권한으로 계속 도는지 확인한다.
BEGIN;

DO $$
DECLARE
    v_auth UUID;
BEGIN
    IF to_regprocedure('public.record_spelling_search_batch_v1(jsonb)') IS NOT NULL
       OR to_regprocedure('public.save_teacher_self_writing_review(uuid,text)') IS NOT NULL
       OR to_regprocedure('public.save_teacher_reading_marathon(uuid,text,integer,date,boolean,boolean)') IS NOT NULL
       OR to_regprocedure('public.save_teacher_reading_log_reviews_bulk(uuid[])') IS NOT NULL THEN
        RAISE EXCEPTION '구형 함수가 아직 존재합니다.';
    END IF;

    -- 지운 이름을 DB 함수가 아직 부르고 있으면 교사 화면이 실행 중에 깨진다. 미리 잡는다.
    IF EXISTS (
        SELECT 1 FROM pg_proc c
        JOIN pg_namespace cn ON cn.oid = c.pronamespace AND cn.nspname = 'public'
        WHERE c.prokind = 'f' AND c.prolang <> 12
          AND pg_get_functiondef(c.oid) ~ '\msave_teacher_self_writing_review\M\s*\('
    ) THEN
        RAISE EXCEPTION '지운 함수를 아직 부르는 DB 함수가 있습니다.';
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

    PERFORM public.record_spelling_search_batch_v2(jsonb_build_array(
        jsonb_build_object('expression', '점검용표현', 'correction', '점검용 표현')
    ));
END $$;

ROLLBACK;
