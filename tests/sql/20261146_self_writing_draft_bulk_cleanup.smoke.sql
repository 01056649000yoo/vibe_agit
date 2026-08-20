DO $$
BEGIN
    IF has_function_privilege('anon', 'public.delete_my_self_writing_drafts(text, text[])', 'EXECUTE') THEN
        RAISE EXCEPTION '익명 사용자에게 임시본 일괄 정리 권한이 열려 있습니다.';
    END IF;

    IF NOT has_function_privilege('authenticated', 'public.delete_my_self_writing_drafts(text, text[])', 'EXECUTE') THEN
        RAISE EXCEPTION '인증 학생이 임시본 일괄 정리 RPC를 실행할 수 없습니다.';
    END IF;
END;
$$;
