-- [RLS 긴급 복구] classes 테이블 읽기 권한 전면 허용
-- 기존 정책들을 정리하고, 단순 명료하게 '모든 인증된 유저 허용' 정책을 적용합니다.

-- 1. RLS 활성화 (안전을 위해)
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

-- 2. 기존의 잡다한/실패한 정책들 모두 삭제 (깨끗하게 청소)
DROP POLICY IF EXISTS "Authenticated users can view their classes" ON classes;
DROP POLICY IF EXISTS "학급_전체_조회" ON classes;
DROP POLICY IF EXISTS "Enable read access for all users" ON classes;
DROP POLICY IF EXISTS "teachers_view_own_classes" ON classes;
DROP POLICY IF EXISTS "anyone_can_read_classes" ON classes;

-- 3. [핵심] 로그인한 사람은 누구나 classes 테이블을 'SELECT' 할 수 있다.
CREATE POLICY "anyone_can_read_classes"
ON classes FOR SELECT
TO authenticated
USING (true);

-- (참고: 쓰기/수정 권한은 주지 않았으므로 여전히 선생님만 수정 가능합니다)
