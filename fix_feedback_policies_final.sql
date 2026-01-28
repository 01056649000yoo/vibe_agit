-- ====================================================================
-- [VIBE_TEST 피드백 정책 최종 수정 (Final Fix)]
-- 작성일: 2026-01-28
-- 설명: 
-- 1. "이미 존재함" 에러를 완벽하게 방지하기 위해 사용된 모든 정책 이름을 삭제합니다.
-- 2. 조회(SELECT), 작성(INSERT), 수정(UPDATE), 삭제(DELETE) 권한을 모두 재생성합니다.
-- ====================================================================

-- 1. 기존에 생성되었을 수 있는 모든 정책 삭제
DROP POLICY IF EXISTS "Teacher view own" ON feedback_reports;
DROP POLICY IF EXISTS "Teachers can view their own feedback" ON feedback_reports;
DROP POLICY IF EXISTS "Users can view feedback based on role" ON feedback_reports;
DROP POLICY IF EXISTS "view_feedback_policy" ON feedback_reports;

DROP POLICY IF EXISTS "Teacher insert own" ON feedback_reports;
DROP POLICY IF EXISTS "Teachers can insert their own feedback" ON feedback_reports;
DROP POLICY IF EXISTS "insert_feedback_policy" ON feedback_reports;

DROP POLICY IF EXISTS "Admins can update feedback status" ON feedback_reports;
DROP POLICY IF EXISTS "update_feedback_policy" ON feedback_reports;

DROP POLICY IF EXISTS "delete_feedback_policy" ON feedback_reports;


-- 2. 정책 재생성 (관리자 권한 포함)

-- [읽기] 관리자는 전체 보기, 일반 교사는 본인 것만 보기
CREATE POLICY "view_feedback_policy"
ON feedback_reports FOR SELECT
USING (
  auth.uid() = teacher_id 
  OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ADMIN')
);

-- [쓰기] 교사는 본인 ID로만 작성 가능
CREATE POLICY "insert_feedback_policy"
ON feedback_reports FOR INSERT
WITH CHECK (auth.uid() = teacher_id);

-- [수정] 관리자는 상태(status) 변경 가능
CREATE POLICY "update_feedback_policy"
ON feedback_reports FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ADMIN')
);

-- [삭제] 관리자는 삭제 가능
CREATE POLICY "delete_feedback_policy"
ON feedback_reports FOR DELETE
USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ADMIN')
);


-- 3. 스키마 리로드 알림
NOTIFY pgrst, 'reload schema';
