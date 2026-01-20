-- [수정된 통합 SQL 스크립트] 관리자 권한 허용 및 승인 시스템 설정

-- 1. profiles 테이블의 role 제약조건 수정 (ADMIN 역할 허용)
-- 기존 제약조건이 'TEACHER', 'STUDENT'만 허용하고 있어 오류가 발생하므로, 'ADMIN'을 추가합니다.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('TEACHER', 'STUDENT', 'ADMIN'));

-- 2. profiles 테이블에 승인 여부 컬럼 추가 (중복 오류 방지 로직 포함)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'is_approved') THEN
        ALTER TABLE profiles ADD COLUMN is_approved BOOLEAN DEFAULT false;
    END IF;
END $$;

-- 3. 기존 가입된 선생님들은 바로 이용 가능하도록 일괄 승인 처리
UPDATE profiles SET is_approved = true WHERE role = 'TEACHER';

-- 4. 지정된 이메일 계정을 관리자(ADMIN)로 승격 및 승인
UPDATE profiles
SET role = 'ADMIN', is_approved = true
WHERE email = '01056649000yoo@gmail.com';

-- 5. 관리자(ADMIN) 권한 RLS 정책 설정
-- (기존 정책이 있을 경우 삭제하고 재생성하여 충돌 방지)

-- 관리자가 모든 프로필을 조회할 수 있는 정책
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
CREATE POLICY "Admins can view all profiles"
ON profiles FOR SELECT
USING (role = 'ADMIN');

-- 관리자가 승인 상태(is_approved) 등을 수정할 수 있는 정책
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
CREATE POLICY "Admins can update all profiles"
ON profiles FOR UPDATE
USING (role = 'ADMIN');

-- 확인용: 관리자 계정이 잘 설정되었는지 조회
SELECT email, role, is_approved FROM profiles WHERE email = '01056649000yoo@gmail.com';
