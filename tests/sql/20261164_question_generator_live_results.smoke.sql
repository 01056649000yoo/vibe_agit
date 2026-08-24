DO $$
DECLARE
    v_policy_qual TEXT;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'writing_helper'
          AND indexname = 'student_sessions_room_status_number_idx'
    ) THEN
        RAISE EXCEPTION '질문 결과 방별 조회 인덱스가 없습니다.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_class table_info
        JOIN pg_namespace namespace_info ON namespace_info.oid = table_info.relnamespace
        WHERE namespace_info.nspname = 'writing_helper'
          AND table_info.relname = 'activity_events'
          AND table_info.relrowsecurity IS TRUE
    ) THEN
        RAISE EXCEPTION '활동 이벤트 RLS가 활성화되지 않았습니다.';
    END IF;

    IF NOT has_table_privilege('authenticated', 'writing_helper.activity_events', 'SELECT')
       OR has_table_privilege('authenticated', 'writing_helper.activity_events', 'INSERT')
       OR has_table_privilege('anon', 'writing_helper.activity_events', 'SELECT') THEN
        RAISE EXCEPTION '활동 이벤트 브라우저 권한이 교사 SELECT 전용이 아닙니다.';
    END IF;

    IF NOT has_table_privilege('service_role', 'writing_helper.activity_events', 'INSERT') THEN
        RAISE EXCEPTION '연구소 서버가 질문 제출 이벤트를 기록할 수 없습니다.';
    END IF;

    SELECT policy.qual
    INTO v_policy_qual
    FROM pg_policies policy
    WHERE policy.schemaname = 'writing_helper'
      AND policy.tablename = 'activity_events'
      AND policy.policyname = 'question_generator_result_events_teacher_select';

    IF v_policy_qual IS NULL
       OR v_policy_qual !~ 'auth_user_role'
       OR v_policy_qual !~ 'teacher_id'
       OR v_policy_qual !~ 'question_generator_submitted' THEN
        RAISE EXCEPTION '질문 제출 이벤트 정책이 실제 역할·방 소유·이벤트 종류를 모두 확인하지 않습니다.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'writing_helper'
          AND tablename = 'activity_events'
    ) THEN
        RAISE EXCEPTION '질문 제출 이벤트가 Supabase Realtime publication에 없습니다.';
    END IF;
END;
$$;
