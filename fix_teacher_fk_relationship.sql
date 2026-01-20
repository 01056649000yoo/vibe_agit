-- [긴급 수정 SQL] profiles와 teachers 테이블 간의 외래 키(FK) 관계 설정

-- 1. profiles와 teachers 간의 FK 관계가 명확하지 않아 Supabase API가 관계를 찾지 못하는 문제를 해결합니다.
--    teachers 테이블의 id가 profiles 테이블의 id를 참조하도록 명시적인 제약조건을 추가합니다.

DO $$
BEGIN
    -- 기존에 이름이 같은 제약조건이 있다면 삭제 (충돌 방지)
    ALTER TABLE teachers DROP CONSTRAINT IF EXISTS teachers_id_fkey;
    ALTER TABLE teachers DROP CONSTRAINT IF EXISTS fk_teachers_profiles;
    
    -- profiles(id)를 참조하는 FK 제약조건 추가
    ALTER TABLE teachers
    ADD CONSTRAINT teachers_id_fkey
    FOREIGN KEY (id)
    REFERENCES profiles(id)
    ON DELETE CASCADE; -- 프로필 삭제 시 교사 정보도 함께 삭제
END $$;

-- 2. FK 설정 후 Supabase Schema Cache가 갱신되어야 API에서 인식이 됩니다.
--    이것은 SQL 레벨에서 강제할 수 없지만, COMMENT를 업데이트하면 스키마 캐시 리로드를 유도할 수 있습니다.
COMMENT ON TABLE teachers IS 'Teachers detailed information table with explicit FK to profiles';

-- 3. 확인용: 조인을 테스트하는 쿼리 (제대로 연결되었는지 확인)
-- 이 쿼리가 에러 없이 실행되어야 합니다.
SELECT 
    p.id, 
    p.email, 
    t.name, 
    t.school_name 
FROM profiles p
JOIN teachers t ON p.id = t.id
LIMIT 5;

-- 4. 승인 대기 목록 조회 테스트 (API와 유사한 로직)
SELECT 
    p.*, 
    t.name, 
    t.school_name 
FROM profiles p
LEFT JOIN teachers t ON p.id = t.id
WHERE p.role = 'TEACHER' 
AND (p.is_approved IS FALSE OR p.is_approved IS NULL);
