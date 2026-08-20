DO $$
DECLARE
    v_bulk_function TEXT;
    v_diary_overview TEXT;
BEGIN
    SELECT pg_get_functiondef(
        'public.save_teacher_self_writing_reviews_bulk_v1(uuid[],text)'::regprocedure
    ) INTO v_bulk_function;
    IF v_bulk_function NOT LIKE '%save_teacher_self_writing_review_v2%'
       OR v_bulk_function NOT LIKE '%points_awarded%'
       OR v_bulk_function NOT LIKE '%p_writing_type NOT IN%reading_log%diary%' THEN
        RAISE EXCEPTION '자율 글 공용 일괄 확인 계약이 없습니다.';
    END IF;

    IF has_function_privilege('anon',
        'public.save_teacher_self_writing_reviews_bulk_v1(uuid[],text)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated',
        'public.save_teacher_self_writing_reviews_bulk_v1(uuid[],text)', 'EXECUTE') THEN
        RAISE EXCEPTION '자율 글 공용 일괄 확인 RPC 실행 권한이 올바르지 않습니다.';
    END IF;

    SELECT pg_get_functiondef(
        'public.get_teacher_diary_overview(uuid,text,uuid,integer,integer)'::regprocedure
    ) INTO v_diary_overview;
    IF v_diary_overview NOT LIKE '%' || quote_literal('counts') || '%'
       OR v_diary_overview NOT LIKE '%unreviewed_count%'
       OR v_diary_overview NOT LIKE '%COUNT(DISTINCT student_id)%' THEN
        RAISE EXCEPTION '일기 미확인/확인/전체 통계 계약이 없습니다.';
    END IF;
END;
$$;
