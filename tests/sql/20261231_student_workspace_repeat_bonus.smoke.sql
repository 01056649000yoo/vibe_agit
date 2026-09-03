-- run-rollback-smoke가 만든 바깥 트랜잭션 안에서 실행되고 마지막에 모두 롤백된다.
-- 학생 글쓰기 창이 반복 보너스 설정을 실제로 받는지, 권한 경계는 그대로인지 확인한다.

DO $$
DECLARE
    v_definition TEXT;
BEGIN
    SELECT pg_get_functiondef('public.get_student_assignment_workspace_v1(uuid,uuid)'::regprocedure)
    INTO v_definition;

    -- 이 네 열이 빠지면 교사가 켜도 학생 화면 계산기는 늘 꺼짐으로 본다.
    IF v_definition NOT LIKE '%mission.repeat_bonus_enabled%'
       OR v_definition NOT LIKE '%mission.repeat_bonus_threshold%'
       OR v_definition NOT LIKE '%mission.repeat_bonus_reward%'
       OR v_definition NOT LIKE '%mission.repeat_bonus_max_count%' THEN
        RAISE EXCEPTION '학생 작업공간이 반복 보너스 설정을 돌려주지 않습니다(학생 안내가 사라집니다).';
    END IF;

    -- 기존 보상 안내도 함께 남아 있어야 한다.
    IF v_definition NOT LIKE '%mission.base_reward%'
       OR v_definition NOT LIKE '%mission.bonus_threshold%'
       OR v_definition NOT LIKE '%mission.bonus_reward%'
       OR v_definition NOT LIKE '%mission.min_chars%' THEN
        RAISE EXCEPTION '학생 작업공간의 기존 보상 안내 값이 사라졌습니다.';
    END IF;

    -- 학생 글에는 다른 학생·다른 학급이 섞이지 않아야 한다(기존 경계 유지).
    IF v_definition NOT LIKE '%post.student_id = v_student.id%'
       OR v_definition NOT LIKE '%mission.class_id = v_student.class_id%' THEN
        RAISE EXCEPTION '학생 작업공간의 학생·학급 경계가 사라졌습니다.';
    END IF;

    -- 채점·검사 결과처럼 학생에게 주면 안 되는 값이 새로 섞이지 않았는지 본다.
    IF v_definition LIKE '%awarded_base_reward%'
       OR v_definition LIKE '%spell_check_result%' THEN
        RAISE EXCEPTION '학생 작업공간이 서버 전용 값을 반환합니다.';
    END IF;

    IF has_function_privilege('anon',
        'public.get_student_assignment_workspace_v1(uuid,uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION '학생 작업공간 RPC가 익명 역할에 열려 있습니다.';
    END IF;
END;
$$;
