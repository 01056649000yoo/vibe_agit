-- [VIBE_TEST 피드백 삭제 권한 추가]
-- 작성일: 2026-01-28
-- 설명: 관리자가 feedback_reports 테이블에서 데이터를 삭제할 수 있도록 DELETE 정책을 추가합니다.

-- 기존 DELETE 정책이 있다면 삭제 (충돌 방지)
DROP POLICY IF EXISTS "delete_feedback_policy" ON feedback_reports;

-- [삭제] 관리자만 삭제 가능
CREATE POLICY "delete_feedback_policy"
ON feedback_reports FOR DELETE
USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ADMIN')
);

NOTIFY pgrst, 'reload schema';
