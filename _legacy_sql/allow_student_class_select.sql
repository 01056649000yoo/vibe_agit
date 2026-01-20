-- [보안 정책 추가] 학생이 자신의 반 정보(게임 설정 등)를 조회할 수 있도록 허용합니다.

-- 1. classes 테이블에 RLS가 활성화되어 있는지 확인 (없어도 에러 안 남)
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

-- 2. 정책 생성: "학생(및 선생님)은 자신의 반 정보를 볼 수 있다"
-- (기존에 비슷한 정책이 있다면 충돌할 수 있으니, 먼저 DROP 합니다)
DROP POLICY IF EXISTS "Authenticated users can view their classes" ON classes;

CREATE POLICY "Authenticated users can view their classes"
ON classes FOR SELECT
TO authenticated
USING (
    -- 1. 선생님인 경우: 자신이 만든 반
    auth.uid() = teacher_id
    OR
    -- 2. 학생인 경우: 자신이 소속된 반 (students 테이블을 통해 확인)
    id IN (
        SELECT class_id 
        FROM students 
        WHERE user_id = auth.uid()
    )
    -- 주의: 만약 students 테이블에 user_id 컬럼이 없고 별도의 인증 방식을 쓴다면, 
    -- 아래 줄의 주석을 해제하고 위 내용을 주석 처리하여 '모든 인증된 사용자에게 허용'으로 변경하세요.
    -- OR true 
);
