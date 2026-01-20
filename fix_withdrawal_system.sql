-- [강제 탈퇴 기능 정상화를 위한 긴급 수정 스크립트]

-- 1. [핵심] RLS 정책 수정: 관리자(ADMIN)에게 'DELETE' 권한 부여
-- 기존에는 SELECT, UPDATE만 허용되어 있어 DELETE 요청 시 권한 
-- 부족으로 무시되거나 에러가 발생했습니다.

-- profiles 테이블 삭제 권한
DROP POLICY IF EXISTS "Admins can delete profiles" ON profiles;
CREATE POLICY "Admins can delete profiles"
ON profiles FOR DELETE
USING ( is_admin() );

-- teachers 테이블 삭제 권한
DROP POLICY IF EXISTS "Admins can delete teachers" ON teachers;
CREATE POLICY "Admins can delete teachers"
ON teachers FOR DELETE
USING ( is_admin() );

-- 2. [데이터 무결성] FK 제약조건 Cascade(연쇄 삭제) 점검 및 적용
-- 선생님 삭제 시 -> 학급 삭제 -> 학생/미션 삭제 -> 글 삭제 순으로 이어지도록 설정합니다.
-- 이 과정이 없으면 "자식 레코드가 있어 부모를 삭제할 수 없습니다" 오류가 발생합니다.

DO $$
DECLARE
    rec record;
BEGIN
    -- 2.1. classes 테이블의 teacher_id 제약조건 수정 (Cascade 적용)
    FOR rec IN 
        SELECT tc.constraint_name, kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
        WHERE tc.table_name = 'classes' AND kcu.column_name = 'teacher_id' AND tc.constraint_type = 'FOREIGN KEY'
    LOOP
        -- 기존 제약조건 삭제 후 재생성 (ON DELETE CASCADE 추가)
        EXECUTE 'ALTER TABLE classes DROP CONSTRAINT ' || rec.constraint_name;
        EXECUTE 'ALTER TABLE classes ADD CONSTRAINT ' || rec.constraint_name || 
                ' FOREIGN KEY (' || rec.column_name || ') REFERENCES ' || rec.foreign_table_name || '(' || rec.foreign_column_name || ') ON DELETE CASCADE';
    END LOOP;

    -- 2.2. students 테이블의 class_id 제약조건 수정 (Cascade 적용)
    FOR rec IN 
        SELECT tc.constraint_name, kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
        WHERE tc.table_name = 'students' AND kcu.column_name = 'class_id' AND tc.constraint_type = 'FOREIGN KEY'
    LOOP
        EXECUTE 'ALTER TABLE students DROP CONSTRAINT ' || rec.constraint_name;
        EXECUTE 'ALTER TABLE students ADD CONSTRAINT ' || rec.constraint_name || 
                ' FOREIGN KEY (' || rec.column_name || ') REFERENCES ' || rec.foreign_table_name || '(' || rec.foreign_column_name || ') ON DELETE CASCADE';
    END LOOP;

END $$;
