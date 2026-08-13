DO $$
DECLARE
    v_student public.students%ROWTYPE;
    v_apply JSONB;
    v_history JSONB;
    v_log_id UUID;
BEGIN
    SELECT student.* INTO v_student
    FROM public.students student
    JOIN public.classes class ON class.id = student.class_id
    WHERE student.auth_id IS NOT NULL
      AND student.is_active IS DISTINCT FROM FALSE
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
      AND class.deleted_at IS NULL
    ORDER BY student.created_at
    LIMIT 1;
    IF v_student.id IS NULL THEN
        RAISE EXCEPTION '포인트 내역 스모크에 사용할 활성 학생이 없습니다.';
    END IF;

    v_apply := public.point_engine_apply(
        v_student.id,
        1,
        '학생 포인트 내역 스모크',
        'private_adjustment',
        format('student-point-history-smoke:%s', gen_random_uuid()),
        NULL,
        NULL,
        jsonb_build_object('source', 'rollback_smoke')
    );
    v_log_id := (v_apply->>'log_id')::UUID;

    PERFORM set_config('request.jwt.claim.sub', v_student.auth_id::TEXT, TRUE);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_student.auth_id, 'role', 'authenticated'
    )::TEXT, TRUE);

    v_history := public.get_my_point_history_v1(200);
    IF v_history->>'version' <> '1'
       OR v_history->>'max_rows' <> '50'
       OR jsonb_array_length(v_history->'items') > 50 THEN
        RAISE EXCEPTION '학생 포인트 내역 응답 계약 오류: %', v_history;
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_history->'items') item
        WHERE item->>'id' = v_log_id::TEXT
          AND item->>'reason' = '학생 포인트 내역 스모크'
          AND item->>'amount' = '1'
    ) THEN
        RAISE EXCEPTION '본인 포인트 내역을 찾을 수 없습니다: %', v_history;
    END IF;
    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_history->'items') item
        WHERE item ?| ARRAY['student_id', 'class_id', 'event_key', 'metadata']
    ) THEN
        RAISE EXCEPTION '학생 응답에 내부 포인트 원장 정보가 노출되었습니다: %', v_history;
    END IF;
    IF has_function_privilege(
        'anon',
        'public.get_my_point_history_v1(integer)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION '학생 포인트 내역 RPC가 anon에 노출되어 있습니다.';
    END IF;
END;
$$;
