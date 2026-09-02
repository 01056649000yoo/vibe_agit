-- run-rollback-smoke가 만든 바깥 트랜잭션 안에서 실행되고 마지막에 모두 롤백된다.
-- 알림장 날짜 목록의 최신순·상한·커서 넘김과 담당 학급 경계를 실제 스키마에서 확인한다.

DO $$
BEGIN
    IF has_function_privilege('anon', 'public.get_teacher_class_board_notice_log_v1(uuid,date,integer)', 'EXECUTE') THEN
        RAISE EXCEPTION '알림장 목록 RPC가 익명 역할에 열려 있습니다.';
    END IF;
END;
$$;

SELECT set_config('test.log_teacher_id', fixture.teacher_id::TEXT, true),
       set_config('test.log_class_id', fixture.class_id::TEXT, true)
FROM (
    SELECT class.teacher_id, class.id AS class_id
    FROM public.classes class
    JOIN public.profiles teacher
      ON teacher.id = class.teacher_id
     AND teacher.role = 'TEACHER'
     AND teacher.is_approved IS TRUE
     AND teacher.approval_revoked_at IS NULL
    WHERE class.deleted_at IS NULL
    ORDER BY class.created_at DESC
    LIMIT 1
) fixture;

DO $$ BEGIN
    IF current_setting('test.log_teacher_id', true) IS NULL THEN
        RAISE EXCEPTION '알림장 목록 스모크에 사용할 교사 학급이 없습니다.';
    END IF;
END $$;

SELECT set_config('test.log_other_class_id', other.class_id::TEXT, true)
FROM (
    SELECT class.id AS class_id
    FROM public.classes class
    WHERE class.deleted_at IS NULL
      AND class.teacher_id IS DISTINCT FROM current_setting('test.log_teacher_id')::UUID
    ORDER BY class.created_at DESC
    LIMIT 1
) other;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.log_teacher_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.log_teacher_id'), 'role', 'authenticated'
)::TEXT, true);

DO $$
DECLARE
    v_class_id UUID := current_setting('test.log_class_id')::UUID;
    v_other_class_id TEXT := current_setting('test.log_other_class_id', true);
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
    v_result JSONB;
    v_cursor DATE;
    v_index INTEGER;
BEGIN
    -- 45일치를 넣어 한 쪽 상한 40개와 커서 넘김을 함께 본다.
    FOR v_index IN 0..44 LOOP
        PERFORM public.save_teacher_class_board_notice_v1(
            v_class_id, v_today - v_index, '알림 ' || v_index::TEXT
        );
    END LOOP;

    v_result := public.get_teacher_class_board_notice_log_v1(v_class_id, NULL, 40);
    IF (v_result->>'version')::INTEGER <> 1
       OR (v_result->>'today')::DATE <> v_today THEN
        RAISE EXCEPTION '알림장 목록 형식이 올바르지 않습니다.';
    END IF;
    IF JSONB_ARRAY_LENGTH(v_result->'notices') <> 40 THEN
        RAISE EXCEPTION '알림장 목록이 한 쪽 상한 40개를 지키지 않았습니다.';
    END IF;
    IF (v_result->'notices'->0->>'date')::DATE <> v_today
       OR (v_result->'notices'->39->>'date')::DATE <> v_today - 39 THEN
        RAISE EXCEPTION '알림장 목록이 최신순이 아닙니다.';
    END IF;
    IF v_result->'notices'->0 ? 'body' THEN
        RAISE EXCEPTION '알림장 목록에 본문 전체가 담겼습니다.';
    END IF;

    -- 다음 쪽 커서는 마지막으로 준 날짜이고, 그 뒤 5건이 남는다.
    v_cursor := (v_result->>'nextCursor')::DATE;
    IF v_cursor IS DISTINCT FROM v_today - 39 THEN
        RAISE EXCEPTION '알림장 목록의 다음 커서가 올바르지 않습니다.';
    END IF;
    v_result := public.get_teacher_class_board_notice_log_v1(v_class_id, v_cursor, 40);
    IF JSONB_ARRAY_LENGTH(v_result->'notices') <> 5
       OR (v_result->'notices'->0->>'date')::DATE <> v_today - 40
       OR v_result->>'nextCursor' IS NOT NULL THEN
        RAISE EXCEPTION '알림장 목록의 마지막 쪽이 올바르지 않습니다.';
    END IF;

    -- 미리보기는 120자까지만 담는다.
    PERFORM public.save_teacher_class_board_notice_v1(v_class_id, v_today, repeat('가', 300));
    v_result := public.get_teacher_class_board_notice_log_v1(v_class_id, NULL, 40);
    IF CHAR_LENGTH(v_result->'notices'->0->>'preview') <> 120 THEN
        RAISE EXCEPTION '알림장 목록 미리보기가 120자 상한을 지키지 않았습니다.';
    END IF;

    -- 상한을 넘겨 달라고 해도 40개를 넘지 않는다.
    v_result := public.get_teacher_class_board_notice_log_v1(v_class_id, NULL, 500);
    IF JSONB_ARRAY_LENGTH(v_result->'notices') > 40 THEN
        RAISE EXCEPTION '알림장 목록이 요청 상한을 그대로 따랐습니다.';
    END IF;

    -- 담당하지 않는 학급의 목록은 읽지 못한다.
    IF v_other_class_id IS NOT NULL THEN
        BEGIN
            PERFORM public.get_teacher_class_board_notice_log_v1(v_other_class_id::UUID, NULL, 40);
            RAISE EXCEPTION '담당하지 않는 학급의 알림장 목록을 읽었습니다.';
        EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
        END;
    END IF;
END;
$$;

RESET ROLE;
