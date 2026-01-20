-- [최종 통합 관리자 설정 SQL]
-- 이 스크립트는 다음을 수행합니다:
-- 1. profiles 테이블 구조 변경 (ADMIN 역할 허용 및 승인 컬럼 추가)
-- 2. 관리자 계정 권한 부여 (01056649000yoo@gmail.com)
-- 3. 안전한 관리자 확인 함수(is_admin) 생성 (RLS 우회)
-- 4. 관리자가 모든 데이터를 볼 수 있도록 RLS 정책 적용

-- 1. profiles 테이블의 role 제약조건 수정 (ADMIN 역할 허용)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('TEACHER', 'STUDENT', 'ADMIN'));

-- 2. profiles 테이블에 승인 여부 컬럼 추가 (중복 방지)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'is_approved') THEN
        ALTER TABLE profiles ADD COLUMN is_approved BOOLEAN DEFAULT false;
    END IF;
END $$;

-- 3. 기존 선생님 일괄 승인 및 관리자 권한 부여
-- 기존 선생님 승인
UPDATE profiles SET is_approved = true WHERE role = 'TEACHER';

-- 내 계정 관리자 승격
UPDATE profiles
SET role = 'ADMIN', is_approved = true
WHERE email = '01056649000yoo@gmail.com';

-- 4. [핵심] 관리자 권한 확인 함수 생성 (보안 우회하여 정확히 체크)
-- 이 함수가 있어야 본인이 'ADMIN'인지 RLS 제약 없이 확인할 수 있습니다.
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = auth.uid()
    AND role = 'ADMIN'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RLS 정책 재설정 (profiles 테이블)
-- 조회: 관리자이거나 자기 자신일 때 허용
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
CREATE POLICY "Admins can view all profiles"
ON profiles FOR SELECT
USING ( is_admin() OR auth.uid() = id );

-- 수정: 관리자만 다른 사람의 프로필(승인 상태) 수정 가능 (자기 자신 수정은 별도 정책 필요하면 추가, 여기선 관리자용만 정의)
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
CREATE POLICY "Admins can update all profiles"
ON profiles FOR UPDATE
USING ( is_admin() );

-- 6. RLS 정책 재설정 (teachers 테이블)
-- 교사 상세 정보도 관리자가 볼 수 있어야 승인 목록에 뜸
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all teachers" ON teachers;
CREATE POLICY "Admins can view all teachers"
ON teachers FOR SELECT
USING ( is_admin() OR auth.uid() = id );

-- 완료 메시지 출력 (SQL Editor 결과창 확인용)
SELECT 'SUCCESS' as status, email, role, is_approved FROM profiles WHERE email = '01056649000yoo@gmail.com';
