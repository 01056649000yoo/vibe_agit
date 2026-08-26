-- 지운 판은 사라지고 쓰는 판은 그대로 도는지 실제 DB에서 확인한다.
BEGIN;

DO $$
DECLARE
    v_class public.classes%ROWTYPE;
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN (
              'get_spelling_learning_workspace_v1',
              'record_spelling_promotion_decisions_v1'
          )
    ) THEN
        RAISE EXCEPTION '사문화된 맞춤법 RPC 가 아직 존재합니다.';
    END IF;

    -- 연구소 배포본이 아직 부르는 판은 반드시 남아 있어야 한다.
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'get_student_spelling_entries_v1'
    ) THEN
        RAISE EXCEPTION '연구소가 쓰는 get_student_spelling_entries_v1 이 사라졌습니다.';
    END IF;

    -- 교사용 최신 작업 화면은 계속 응답해야 한다(_v3 는 내부에서 _v2 를 부르므로 _v2 도 함께 확인된다).
    SELECT * INTO v_class
    FROM public.classes
    WHERE deleted_at IS NULL AND teacher_id IS NOT NULL
    LIMIT 1;
    IF v_class.id IS NULL THEN
        RAISE NOTICE '검증용 학급이 없어 호출 확인은 건너뜁니다.';
        RETURN;
    END IF;

    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_class.teacher_id, 'role', 'authenticated'
    )::TEXT, TRUE);

    PERFORM public.get_spelling_learning_workspace_v3(v_class.id);
END $$;

ROLLBACK;
