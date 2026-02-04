-- profiles 테이블에 최근 접속 시간(last_login_at) 컬럼을 추가하는 SQL입니다.
-- Supabase SQL Editor에서 이 쿼리를 실행해 주세요.

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;

-- (선택 사항) 기존 데이터의 last_login_at을 created_at으로 초기화하고 싶다면 아래 주석을 해제하고 실행하세요.
-- UPDATE public.profiles SET last_login_at = created_at WHERE last_login_at IS NULL;
