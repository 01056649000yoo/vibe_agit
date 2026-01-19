
-- [RLS 긴급 복구] point_logs 테이블 읽기 권한 전면 허용
-- 선생님이 학생들의 포인트 내역을 조회할 수 있도록 함

-- 1. RLS 활성화 확인
ALTER TABLE point_logs ENABLE ROW LEVEL SECURITY;

-- 2. 기존 정책 정리 (중복 방지)
DROP POLICY IF EXISTS "로그_조회_전체" ON point_logs;
DROP POLICY IF EXISTS "teachers_view_logs" ON point_logs;
DROP POLICY IF EXISTS "everyone_can_view_logs" ON point_logs;

-- 3. [핵심] 로그인한 사람은 누구나 point_logs 테이블을 'SELECT' 할 수 있다.
CREATE POLICY "everyone_can_view_logs"
ON point_logs FOR SELECT
TO authenticated
USING (true);

-- 4. 변경사항 즉시 적용 알림
NOTIFY pgrst, 'reload schema';
