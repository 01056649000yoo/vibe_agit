-- 이 파일은 바깥 트랜잭션에서 실행되고 마지막에 전부 롤백된다.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'writing_helper'
          AND table_name = 'portable_results'
    ) THEN
        RAISE EXCEPTION '연구소 표준 결과 원장이 없습니다.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'writing_helper'
          AND indexname = 'portable_results_student_completed_idx'
    ) THEN
        RAISE EXCEPTION '학생별 연구소 결과 조회 인덱스가 없습니다.';
    END IF;

    IF has_table_privilege('anon', 'writing_helper.portable_results', 'SELECT')
       OR has_table_privilege('authenticated', 'writing_helper.portable_results', 'SELECT')
       OR has_table_privilege('authenticated', 'writing_helper.portable_results', 'INSERT') THEN
        RAISE EXCEPTION '브라우저 역할이 연구소 결과 원장에 직접 접근할 수 있습니다.';
    END IF;

    IF NOT has_function_privilege(
        'service_role',
        'writing_helper.upsert_portable_result_v1(uuid,text,integer,integer,text,text,text,jsonb,jsonb)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION '연구소 서버의 표준 결과 저장 RPC 실행 권한이 없습니다.';
    END IF;

    IF pg_get_functiondef(
        'writing_helper.upsert_portable_result_v1(uuid,text,integer,integer,text,text,text,jsonb,jsonb)'::regprocedure
    ) !~ 'UPDATE writing_helper.student_sessions[[:space:]]+SET status = ''done''' THEN
        RAISE EXCEPTION '완료 처리와 표준 결과 저장이 한 RPC 트랜잭션에 있지 않습니다.';
    END IF;

    IF has_function_privilege(
        'authenticated',
        'writing_helper.upsert_portable_result_v1(uuid,text,integer,integer,text,text,text,jsonb,jsonb)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION '학생 브라우저가 표준 결과 저장 RPC를 직접 실행할 수 있습니다.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM writing_helper.portable_results portable
        JOIN writing_helper.student_sessions session ON session.id = portable.session_id
        JOIN writing_helper.rooms room ON room.id = portable.room_id
        WHERE portable.agit_student_id IS DISTINCT FROM session.agit_student_id
           OR portable.class_id IS DISTINCT FROM room.agit_class_id
           OR session.room_id IS DISTINCT FROM portable.room_id
           OR jsonb_array_length(portable.chunks) = 0
    ) THEN
        RAISE EXCEPTION '표준 결과의 학생·학급·방 연결 또는 내용이 올바르지 않습니다.';
    END IF;
END;
$$;
