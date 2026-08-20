-- check-migrations의 바깥 트랜잭션 안에서 실행되며 마지막에 전부 롤백된다.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'reading_log_teacher_reviews_review_status_check'
          AND pg_get_constraintdef(oid) LIKE '%revision_requested%'
    ) THEN
        RAISE EXCEPTION '자율 글 보완 요청 상태 제약이 없습니다.';
    END IF;
    IF has_function_privilege('anon', 'public.save_teacher_self_writing_review_v2(uuid,text,text)', 'EXECUTE') THEN
        RAISE EXCEPTION '익명 역할이 자율 글 확인 RPC를 실행할 수 있습니다.';
    END IF;
    IF has_function_privilege('authenticated', 'public.record_reading_marathon_contribution(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION '학생/교사 역할에 독서마라톤 내부 집계 함수가 노출됐습니다.';
    END IF;
END;
$$;
