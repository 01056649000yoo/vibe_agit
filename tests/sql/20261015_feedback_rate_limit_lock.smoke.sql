DO $$
BEGIN
    IF NOT pg_get_functiondef('public.submit_teacher_feedback_v1(text,text)'::regprocedure)
        ILIKE '%pg_advisory_xact_lock%' THEN
        RAISE EXCEPTION '피드백 동시 요청 잠금이 없습니다.';
    END IF;
    IF has_table_privilege('authenticated', 'public.feedback_reports', 'INSERT') THEN
        RAISE EXCEPTION '피드백 표 직접 INSERT 권한이 열려 있습니다.';
    END IF;
END;
$$;
