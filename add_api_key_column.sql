
-- 교사 개인 API 키 저장을 위한 컬럼 추가
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS personal_openai_api_key TEXT,
ADD COLUMN IF NOT EXISTS api_mode TEXT DEFAULT 'SYSTEM'; -- 'SYSTEM' or 'PERSONAL'

-- 보안을 위해 RLS (Row Level Security) 정책 확인
-- 사용자는 자신의 profile만 업데이트할 수 있어야 함 (기존 정책이 있다면 생략 가능하지만 확인 차원)
CREATE POLICY "Users can update own profile api key" 
ON profiles FOR UPDATE 
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);
