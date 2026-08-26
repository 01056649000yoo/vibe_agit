-- 구형 판은 사라지고 쓰는 판은 그대로 도는지 실제 DB에서 확인한다.
BEGIN;

DO $$
DECLARE
    v_class public.classes%ROWTYPE;
    v_board JSONB;
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname IN (
            'get_teacher_assignment_submission_board_v1',
            'submit_teacher_feedback_v1',
            'admin_get_spelling_promotion_workspace_v2',
            'admin_reject_spelling_candidate_v1'
        )
    ) THEN
        RAISE EXCEPTION '구형 RPC 가 아직 존재합니다.';
    END IF;

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

    -- 교사 제출 전광판 새 판은 계속 응답해야 한다.
    v_board := public.get_teacher_assignment_submission_board_v2(v_class.id, NULL, 8);
    IF COALESCE((v_board->>'version')::INTEGER, 0) <> 2 THEN
        RAISE EXCEPTION '제출 전광판 _v2 응답이 올바르지 않습니다.';
    END IF;
END $$;

ROLLBACK;
