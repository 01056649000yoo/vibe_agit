-- ====================================================================
-- [VIBE_TEST 피드백 정책 수정 및 관리자 권한 부여]
-- 작성일: 2026-01-28
-- 설명: 관리자가 feedback_reports 테이블을 조회 및 수정할 수 있도록 RLS 정책을 업데이트함.
-- ====================================================================

-- 1. 기존 정책 삭제 (충돌 방지)
DROP POLICY IF EXISTS "Teachers can view their own feedback" ON feedback_reports;
DROP POLICY IF EXISTS "Admins can view all feedback" ON feedback_reports;
DROP POLICY IF EXISTS "Admins can update feedback" ON feedback_reports;

-- 2. 새 정책 적용

-- (1) 선생님은 본인 피드백만 조회 가능 + 관리자는 모든 피드백 조회 가능
CREATE POLICY "Users can view feedback based on role"
ON feedback_reports FOR SELECT
USING (
  auth.uid() = teacher_id   -- 본인이 작성한 글
  OR
  EXISTS (                  -- 또는 관리자 권한을 가진 경우
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'ADMIN'
  )
);

-- (2) 관리자는 피드백 상태(status) 등을 수정할 수 있어야 함
CREATE POLICY "Admins can update feedback status"
ON feedback_reports FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'ADMIN'
  )
);

-- (3) 쓰기는 기존대로 선생님 본인 ID로만 가능 (유지)
-- (만약 이전에 생성되지 않았다면 아래 주석 해제하여 실행)
-- DROP POLICY IF EXISTS "Teachers can insert their own feedback" ON feedback_reports;
-- CREATE POLICY "Teachers can insert their own feedback" ON feedback_reports FOR INSERT WITH CHECK (auth.uid() = teacher_id);

-- 3. 확인용: 관리자 권한이 있는지 체크 (필요시)
-- SELECT * FROM profiles WHERE role = 'ADMIN';
