-- 20261185 파일에서 바뀜: submit_teacher_feedback_v1 을 지우고 _v2(text,text,text,jsonb)로 옮겼다. 같은 성질을 _v2 에서 본다.
DO $$
BEGIN
    IF to_regprocedure('public.submit_teacher_feedback_v1(text,text)') IS NOT NULL THEN
        RAISE EXCEPTION '지운 submit_teacher_feedback_v1 이 다시 생겼습니다.';
    END IF;
    IF NOT pg_get_functiondef('public.submit_teacher_feedback_v2(text,text,text,jsonb)'::regprocedure)
        ILIKE '%pg_advisory_xact_lock%' THEN
        RAISE EXCEPTION '피드백 동시 요청 잠금이 없습니다.';
    END IF;
    IF has_table_privilege('authenticated', 'public.feedback_reports', 'INSERT') THEN
        RAISE EXCEPTION '피드백 표 직접 INSERT 권한이 열려 있습니다.';
    END IF;
END;
$$;
