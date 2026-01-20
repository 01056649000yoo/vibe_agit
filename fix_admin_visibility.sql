-- [관리자 권한 문제 해결을 위한 긴급 수정 SQL]

-- 1. [핵심] 재귀 호출 없는 안전한 관리자 확인 함수 생성
-- 이 함수는 RLS를 우회하여(Security Definer) 현재 사용자가 ADMIN인지 정확히 확인합니다.
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

-- 2. profiles 테이블 정책 수정 (관리자가 '모든' 프로필을 볼 수 있게 수정)
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
CREATE POLICY "Admins can view all profiles"
ON profiles FOR SELECT
USING ( is_admin() OR auth.uid() = id ); -- 관리자이거나 자기 자신일 때 허용

DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
CREATE POLICY "Admins can update all profiles"
ON profiles FOR UPDATE
USING ( is_admin() ); -- 관리자만 수정(승인) 가능

-- 3. teachers 테이블 정책 추가 (관리자가 선생님 상세 정보를 볼 수 있게 허용)
-- (만약 정책이 없다면 기본적으로 아무도 못 보거나 모두가 볼 수도 있음 - 보안 강화)
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all teachers" ON teachers;
CREATE POLICY "Admins can view all teachers"
ON teachers FOR SELECT
USING ( is_admin() OR auth.uid() = id ); -- 관리자이거나 자기 자신일 때 허용

-- 4. [확인용] 현재 승인 대기 중인 교사 수 확인 (직접 실행 결과 확인용)
SELECT count(*) as waiting_teachers FROM profiles WHERE role = 'TEACHER' AND is_approved = false;
