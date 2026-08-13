-- 이 파일은 바깥 트랜잭션에서 실행되고 마지막에 전부 롤백된다.

DO $$
BEGIN
    IF NOT has_function_privilege(
        'authenticated',
        'public.get_my_lab_activities_v1(integer,timestamp with time zone,uuid)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION '학생의 본인 연구소 활동 조회 권한이 없습니다.';
    END IF;

    IF has_function_privilege(
        'anon',
        'public.get_my_lab_activities_v1(integer,timestamp with time zone,uuid)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION '비로그인 사용자가 연구소 활동을 조회할 수 있습니다.';
    END IF;

    IF pg_get_functiondef(
        'public.get_my_lab_activities_v1(integer,timestamp with time zone,uuid)'::regprocedure
    ) ~ 'auth\.jwt|app_metadata' THEN
        RAISE EXCEPTION '연구소 활동 조회가 검증되지 않은 JWT 메타데이터를 신뢰합니다.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'writing_helper'
          AND indexname = 'rooms_active_agit_class_created_id_idx'
    ) THEN
        RAISE EXCEPTION '활성 연구소 활동의 학급별 안정 정렬 인덱스가 없습니다.';
    END IF;
END;
$$;

DO $$
DECLARE
    v_student RECORD;
BEGIN
    SELECT student.id, student.auth_id, student.class_id
      INTO v_student
    FROM public.students student
    WHERE student.auth_id IS NOT NULL
      AND student.is_active IS DISTINCT FROM FALSE
      AND student.deleted_at IS NULL
      AND EXISTS (
          SELECT 1
          FROM writing_helper.rooms room
          WHERE room.agit_class_id = student.class_id
            AND room.is_active IS TRUE
      )
    LIMIT 1;

    IF v_student.auth_id IS NULL THEN
        RETURN;
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_student.auth_id::TEXT, TRUE);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_student.auth_id,
        'role', 'authenticated'
    )::TEXT, TRUE);

    IF EXISTS (
        SELECT 1
        FROM public.get_my_lab_activities_v1(50, NULL, NULL) activity
        JOIN writing_helper.rooms room ON room.id = activity.id
        WHERE room.agit_class_id IS DISTINCT FROM v_student.class_id
          OR room.is_active IS DISTINCT FROM TRUE
          OR (room.expires_at IS NOT NULL AND room.expires_at <= NOW())
          OR activity.activity_type <> ALL(ARRAY[
              'outline_builder',
              'question_generator',
              'question_voting',
              'one_line_share',
              'hanja_writing'
          ]::TEXT[])
    ) THEN
        RAISE EXCEPTION '학생에게 다른 학급·종료·미지원 연구소 활동이 노출됩니다.';
    END IF;
END;
$$;
