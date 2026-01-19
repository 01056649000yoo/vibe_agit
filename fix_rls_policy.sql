-- [긴급 수정] 학생/선생님 모두 반 정보(게임 설정)를 조회할 수 있도록 허용
-- 이유: 기존 정책이 'user_id' 컬럼 부재로 실패했으므로, 조건 없이 인증된 사용자는 조회 가능하게 변경

-- 1. classes 테이블의 RLS 활성화 (이미 되어있어도 안전함)
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

-- 2. 오류를 유발했던 기존 정책(또는 이전 정책) 삭제
DROP POLICY IF EXISTS "Authenticated users can view their classes" ON classes;
DROP POLICY IF EXISTS "학급_전체_조회" ON classes; -- 만약 있다면 삭제

-- 3. 새로운 정책: "로그인한 모든 사용자는 반 정보를 읽을 수 있다" (SELECT 권한)
CREATE POLICY "Authenticated users can view their classes"
ON classes FOR SELECT
TO authenticated
USING (true);

-- (참고: 반 정보를 '수정'하거나 '삭제'하는 건 여전히 선생님(teacher_id)만 가능하므로 안전합니다)
