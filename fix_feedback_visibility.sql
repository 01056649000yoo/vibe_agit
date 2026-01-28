-- ====================================================================
-- [VIBE_TEST 피드백 권한 및 관계 긴급 수정]
-- 작성일: 2026-01-28
-- 설명: 
-- 1. "이미 존재함" 에러 해결을 위해 기존 정책을 모두 삭제 후 재생성
-- 2. 프론트엔드에서 작성자 정보(Profiles)가 안 보이는 문제 해결을 위해 FK 관계 수정
-- ====================================================================

-- 1. 기존 정책 초기화 (에러 방지)
DROP POLICY IF EXISTS "Teacher view own" ON feedback_reports;
DROP POLICY IF EXISTS "Teacher insert own" ON feedback_reports;
DROP POLICY IF EXISTS "Teachers can view their own feedback" ON feedback_reports;
DROP POLICY IF EXISTS "Teachers can insert their own feedback" ON feedback_reports;
DROP POLICY IF EXISTS "Users can view feedback based on role" ON feedback_reports;
DROP POLICY IF EXISTS "Admins can update feedback status" ON feedback_reports;

-- 2. 외래키(ForeignKey) 관계 수정
-- 기존: auth.users 참조 -> 변경: public.profiles 참조
-- (이렇게 해야 프론트엔드에서 teacher:profiles 조인이 자연스럽게 작동합니다)

-- 기존 제약조건 삭제 (이름이 자동 생성되었을 수 있어 확인 필요, 일반적인 이름 시도)
DO $$ 
BEGIN
  ALTER TABLE feedback_reports DROP CONSTRAINT IF EXISTS feedback_reports_teacher_id_fkey;
EXCEPTION 
  WHEN undefined_object THEN NULL;
END $$;

-- 새로운 제약조건 추가 (public.profiles 참조)
ALTER TABLE feedback_reports
ADD CONSTRAINT feedback_reports_teacher_id_fkey
FOREIGN KEY (teacher_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


-- 3. 정책 재적용 (확실한 관리자 권한 포함)

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

-- 4. 변경사항 즉시 반영을 위한 스키마 캐시 리로드
NOTIFY pgrst, 'reload schema';
