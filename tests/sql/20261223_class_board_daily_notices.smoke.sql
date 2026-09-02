-- run-rollback-smoke가 만든 바깥 트랜잭션 안에서 실행되고 마지막에 모두 롤백된다.
-- 알림장이 날짜별로 저장·수정·삭제되는지와 담당 학급·길이·날짜 경계를 실제 스키마에서 확인한다.

DO $$
BEGIN
    IF has_table_privilege('authenticated', 'public.class_board_notices', 'SELECT')
       OR has_table_privilege('authenticated', 'public.class_board_notices', 'INSERT')
       OR has_table_privilege('anon', 'public.class_board_notices', 'SELECT') THEN
        RAISE EXCEPTION '알림장 표가 브라우저 역할에 직접 공개됐습니다.';
    END IF;

    IF has_function_privilege('anon', 'public.get_teacher_class_board_notices_v1(uuid,date,integer)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.save_teacher_class_board_notice_v1(uuid,date,text)', 'EXECUTE') THEN
        RAISE EXCEPTION '알림장 RPC가 익명 역할에 열려 있습니다.';
    END IF;
END;
$$;

SELECT set_config('test.notice_teacher_id', fixture.teacher_id::TEXT, true),
       set_config('test.notice_class_id', fixture.class_id::TEXT, true)
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
    IF current_setting('test.notice_teacher_id', true) IS NULL THEN
        RAISE EXCEPTION '알림장 스모크에 사용할 교사 학급이 없습니다.';
    END IF;
END $$;

-- 다른 교사의 학급 하나를 경계 확인용으로 잡는다(없으면 그 확인만 건너뛴다).
SELECT set_config('test.notice_other_class_id', other.class_id::TEXT, true)
FROM (
    SELECT class.id AS class_id
    FROM public.classes class
    WHERE class.deleted_at IS NULL
      AND class.teacher_id IS DISTINCT FROM current_setting('test.notice_teacher_id')::UUID
    ORDER BY class.created_at DESC
    LIMIT 1
) other;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.notice_teacher_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.notice_teacher_id'), 'role', 'authenticated'
)::TEXT, true);

DO $$
DECLARE
    v_class_id UUID := current_setting('test.notice_class_id')::UUID;
    v_other_class_id TEXT := current_setting('test.notice_other_class_id', true);
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
    v_yesterday DATE := v_today - 1;
    v_result JSONB;
BEGIN
    -- 저장한 적이 없으면 오늘 알림은 비어 있고 최근 목록은 배열이다.
    v_result := public.get_teacher_class_board_notices_v1(v_class_id, NULL, 14);
    IF (v_result->>'version')::INTEGER <> 1
       OR (v_result->>'today')::DATE <> v_today
       OR (v_result->>'date')::DATE <> v_today
       OR JSONB_TYPEOF(v_result->'recent') <> 'array' THEN
        RAISE EXCEPTION '알림장 작업공간 형식이 올바르지 않습니다.';
    END IF;

    -- 오늘 알림을 쓰면 그대로 다시 불러온다.
    PERFORM public.save_teacher_class_board_notice_v1(v_class_id, v_today, '내일 준비물: 색연필');
    v_result := public.get_teacher_class_board_notices_v1(v_class_id, NULL, 14);
    IF v_result->'notice'->>'body' <> '내일 준비물: 색연필' THEN
        RAISE EXCEPTION '오늘 알림을 저장한 뒤 다시 불러오지 못했습니다.';
    END IF;

    -- 같은 날짜에 다시 쓰면 덮어쓰고 줄이 늘지 않는다.
    -- 표는 브라우저 역할에 닫혀 있으므로 교사가 쓰는 RPC 결과로만 확인한다.
    PERFORM public.save_teacher_class_board_notice_v1(v_class_id, v_today, '내일 준비물: 색연필, 풀');
    v_result := public.get_teacher_class_board_notices_v1(v_class_id, v_today, 30);
    IF v_result->'notice'->>'body' <> '내일 준비물: 색연필, 풀' THEN
        RAISE EXCEPTION '알림 수정 내용이 반영되지 않았습니다.';
    END IF;
    IF (SELECT COUNT(*) FROM JSONB_ARRAY_ELEMENTS(v_result->'recent') item
        WHERE (item->>'date')::DATE = v_today) <> 1 THEN
        RAISE EXCEPTION '같은 날짜 알림이 두 줄로 쌓였습니다.';
    END IF;

    -- 어제 알림은 따로 남고, 지난 날짜를 지정해 그대로 불러온다.
    PERFORM public.save_teacher_class_board_notice_v1(v_class_id, v_yesterday, '어제 알림');
    v_result := public.get_teacher_class_board_notices_v1(v_class_id, v_yesterday, 14);
    IF v_result->'notice'->>'body' <> '어제 알림'
       OR (v_result->>'date')::DATE <> v_yesterday
       OR (v_result->>'today')::DATE <> v_today THEN
        RAISE EXCEPTION '지난 날짜 알림을 불러오지 못했습니다.';
    END IF;

    -- 최근 목록은 최신 날짜가 먼저 오고 미리보기만 담는다.
    v_result := public.get_teacher_class_board_notices_v1(v_class_id, NULL, 14);
    IF JSONB_ARRAY_LENGTH(v_result->'recent') < 2
       OR (v_result->'recent'->0->>'date')::DATE <> v_today
       OR (v_result->'recent'->1->>'date')::DATE <> v_yesterday
       OR v_result->'recent'->0 ? 'updatedAt' THEN
        RAISE EXCEPTION '최근 알림 목록의 순서나 내용이 올바르지 않습니다.';
    END IF;

    -- 빈 내용으로 저장하면 그 날짜 알림을 지운다.
    PERFORM public.save_teacher_class_board_notice_v1(v_class_id, v_yesterday, '   ');
    v_result := public.get_teacher_class_board_notices_v1(v_class_id, v_yesterday, 30);
    IF v_result->'notice' IS NOT NULL AND JSONB_TYPEOF(v_result->'notice') <> 'null' THEN
        RAISE EXCEPTION '빈 알림을 저장했는데 그 날짜 알림이 남아 있습니다.';
    END IF;
    IF EXISTS (SELECT 1 FROM JSONB_ARRAY_ELEMENTS(v_result->'recent') item
               WHERE (item->>'date')::DATE = v_yesterday) THEN
        RAISE EXCEPTION '지운 알림이 최근 목록에 남아 있습니다.';
    END IF;

    -- 2,000자 상한을 넘기면 거절한다.
    BEGIN
        PERFORM public.save_teacher_class_board_notice_v1(v_class_id, v_today, repeat('가', 2001));
        RAISE EXCEPTION '알림 2000자 상한을 넘긴 내용이 저장됐습니다.';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;

    -- 허용 범위를 벗어난 날짜도 거절한다.
    BEGIN
        PERFORM public.save_teacher_class_board_notice_v1(v_class_id, v_today + 400, '먼 미래 알림');
        RAISE EXCEPTION '허용 범위를 벗어난 날짜의 알림이 저장됐습니다.';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;

    -- 담당하지 않는 학급은 읽지도 쓰지도 못한다.
    IF v_other_class_id IS NOT NULL THEN
        BEGIN
            PERFORM public.get_teacher_class_board_notices_v1(v_other_class_id::UUID, NULL, 14);
            RAISE EXCEPTION '담당하지 않는 학급의 알림장을 읽었습니다.';
        EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
        END;
        BEGIN
            PERFORM public.save_teacher_class_board_notice_v1(v_other_class_id::UUID, v_today, '남의 학급 알림');
            RAISE EXCEPTION '담당하지 않는 학급의 알림장에 썼습니다.';
        EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
        END;
    END IF;
END;
$$;

RESET ROLE;
