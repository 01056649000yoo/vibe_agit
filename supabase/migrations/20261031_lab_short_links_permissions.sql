BEGIN;

-- 통합 /lab 서버만 방 단축주소를 조회·생성한다.
-- 브라우저 역할은 테이블을 직접 읽거나 쓸 수 없고, 연구소 서버의 service_role만 사용한다.
REVOKE ALL ON TABLE writing_helper.short_links FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA writing_helper TO service_role;
GRANT SELECT, INSERT ON TABLE writing_helper.short_links TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
