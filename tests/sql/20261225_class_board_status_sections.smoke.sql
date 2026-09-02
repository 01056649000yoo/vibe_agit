-- run-rollback-smoke가 만든 바깥 트랜잭션 안에서 실행되고 마지막에 모두 롤백된다.
-- 오늘 현황이 켠 항목만 돌려주는지, 배경색·구성 항목 저장 검증이 도는지 실제 스키마에서 확인한다.

DO $$
BEGIN
    IF has_function_privilege('anon', 'public.get_teacher_class_board_status_v1(uuid,uuid,text[])', 'EXECUTE') THEN
        RAISE EXCEPTION '오늘 현황 RPC가 익명 역할에 열려 있습니다.';
    END IF;
    -- 인수를 늘렸으므로 옛 2인수 함수는 남아 있으면 안 된다(같은 이름이 둘이면 호출이 갈린다).
    IF EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'get_teacher_class_board_status_v1'
          AND p.pronargs = 2
    ) THEN
        RAISE EXCEPTION '옛 2인수 오늘 현황 함수가 남아 있습니다.';
    END IF;
END;
$$;

SELECT set_config('test.status_teacher_id', fixture.teacher_id::TEXT, true),
       set_config('test.status_class_id', fixture.class_id::TEXT, true)
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
    IF current_setting('test.status_teacher_id', true) IS NULL THEN
        RAISE EXCEPTION '오늘 현황 스모크에 사용할 교사 학급이 없습니다.';
    END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.status_teacher_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.status_teacher_id'), 'role', 'authenticated'
)::TEXT, true);

DO $$
DECLARE
    v_class_id UUID := current_setting('test.status_class_id')::UUID;
    v_result JSONB;
BEGIN
    -- 인수를 안 주면 기존 구성 그대로 본다(배포 중 옛 화면이 두 인수로 불러도 같다).
    v_result := public.get_teacher_class_board_status_v1(v_class_id);
    IF (v_result->>'version')::INTEGER <> 1
       OR v_result->'sections' <> '["mission", "daily"]'::JSONB
       OR NOT (v_result ? 'dailyWriting')
       OR v_result ? 'dailyNames'
       OR v_result ? 'todayTitles'
       OR v_result ? 'todayReading' THEN
        RAISE EXCEPTION '오늘 현황 기본 구성이 예전과 다릅니다.';
    END IF;

    -- 머리말과 설정창이 늘 쓰는 값은 항목과 무관하게 온다.
    IF NOT (v_result ? 'missionOptions') OR NOT (v_result ? 'totalStudents') THEN
        RAISE EXCEPTION '오늘 현황의 공통 값이 빠졌습니다.';
    END IF;

    -- 켠 항목만 온다.
    v_result := public.get_teacher_class_board_status_v1(v_class_id, NULL, ARRAY['dailyNames']);
    IF NOT (v_result ? 'dailyNames')
       OR v_result ? 'dailyWriting'
       OR v_result ? 'todayTitles'
       OR v_result ? 'todayReading' THEN
        RAISE EXCEPTION '켜지 않은 오늘 현황 항목이 함께 왔습니다.';
    END IF;
    IF JSONB_TYPEOF(v_result->'dailyNames'->'writerNames') <> 'array'
       OR JSONB_TYPEOF(v_result->'dailyNames'->'restingNames') <> 'array' THEN
        RAISE EXCEPTION '자율 글 명단 형식이 올바르지 않습니다.';
    END IF;

    v_result := public.get_teacher_class_board_status_v1(v_class_id, NULL, ARRAY['titles', 'reactions']);
    IF NOT (v_result ? 'todayTitles') OR NOT (v_result ? 'todayReading')
       OR v_result ? 'dailyWriting' OR v_result ? 'dailyNames' THEN
        RAISE EXCEPTION '고른 두 항목만 오지 않았습니다.';
    END IF;
    IF JSONB_TYPEOF(v_result->'todayReading'->'commentCount') <> 'number'
       OR JSONB_TYPEOF(v_result->'todayReading'->'reactionCount') <> 'number' THEN
        RAISE EXCEPTION '서로 읽어 준 정도가 숫자가 아닙니다.';
    END IF;

    -- 모르는 이름은 버리고 아무것도 안 남으면 아무 항목도 계산하지 않는다.
    v_result := public.get_teacher_class_board_status_v1(v_class_id, NULL, ARRAY['point_ranking', '../etc']);
    IF v_result->'sections' <> '[]'::JSONB
       OR v_result ? 'dailyWriting' OR v_result ? 'dailyNames'
       OR v_result ? 'todayTitles' OR v_result ? 'todayReading' THEN
        RAISE EXCEPTION '허용하지 않은 오늘 현황 항목이 받아들여졌습니다.';
    END IF;
END;
$$;

RESET ROLE;

-- 저장 payload 검증: 오늘 현황의 배경색과 구성 항목도 서버에서 막는다.
DO $$
DECLARE
    v_class_id UUID := current_setting('test.status_class_id')::UUID;
    v_layout JSONB := '{"version":3,"preset":"freeform-stage-7-3"}'::JSONB;
    v_widget JSONB := jsonb_build_object(
        'instanceId', 'status-smoke', 'widgetId', 'writing-status', 'version', 1,
        'zone', 'sidebar', 'order', 10, 'size', 'large', 'visible', true,
        'config', jsonb_build_object('tone', 'forest', 'sections', jsonb_build_array('mission', 'dailyNames'))
    );
BEGIN
    PERFORM public.validate_class_board_payload_v1(v_class_id, v_layout, jsonb_build_array(v_widget));

    BEGIN
        PERFORM public.validate_class_board_payload_v1(
            v_class_id, v_layout,
            jsonb_build_array(jsonb_set(v_widget, '{config,tone}', '"무지개"'::JSONB))
        );
        RAISE EXCEPTION '허용하지 않은 오늘 현황 배경색이 저장됐습니다.';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;

    BEGIN
        PERFORM public.validate_class_board_payload_v1(
            v_class_id, v_layout,
            jsonb_build_array(jsonb_set(v_widget, '{config,sections}', '["point_ranking"]'::JSONB))
        );
        RAISE EXCEPTION '허용하지 않은 오늘 현황 구성 항목이 저장됐습니다.';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;

    BEGIN
        PERFORM public.validate_class_board_payload_v1(
            v_class_id, v_layout,
            jsonb_build_array(jsonb_set(v_widget, '{config,sections}', '["daily","daily"]'::JSONB))
        );
        RAISE EXCEPTION '같은 오늘 현황 항목이 두 번 저장됐습니다.';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;
END;
$$;
