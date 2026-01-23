-- [데이터베이스 확장 SQL]
-- writing_missions 테이블에 AI 핵심 질문 설계를 위한 컬럼을 추가합니다.

ALTER TABLE public.writing_missions 
ADD COLUMN IF NOT EXISTS mission_type TEXT,
ADD COLUMN IF NOT EXISTS guide_questions JSONB DEFAULT '[]'::jsonb;

-- (선택 사항) 기존 데이터에 기본값 채우기
UPDATE public.writing_missions 
SET mission_type = genre 
WHERE mission_type IS NULL;
