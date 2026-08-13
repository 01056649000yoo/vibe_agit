-- 이 파일은 바깥 트랜잭션에서 실행되고 마지막에 전부 롤백된다.

DO $$
BEGIN
    IF NOT has_schema_privilege('service_role', 'writing_helper', 'USAGE') THEN
        RAISE EXCEPTION '연구소 서버가 writing_helper 스키마를 사용할 수 없습니다.';
    END IF;

    IF NOT has_table_privilege('service_role', 'writing_helper.short_links', 'SELECT')
       OR NOT has_table_privilege('service_role', 'writing_helper.short_links', 'INSERT') THEN
        RAISE EXCEPTION '연구소 서버의 단축주소 조회·생성 권한이 없습니다.';
    END IF;

    IF has_table_privilege('anon', 'writing_helper.short_links', 'SELECT')
       OR has_table_privilege('anon', 'writing_helper.short_links', 'INSERT')
       OR has_table_privilege('authenticated', 'writing_helper.short_links', 'SELECT')
       OR has_table_privilege('authenticated', 'writing_helper.short_links', 'INSERT') THEN
        RAISE EXCEPTION '브라우저 역할이 단축주소 테이블에 직접 접근할 수 있습니다.';
    END IF;
END;
$$;
