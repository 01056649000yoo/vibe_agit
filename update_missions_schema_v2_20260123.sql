-- [데이터베이스 구조 업데이트]
-- writing_missions 테이블에 AI 질문 설계 관련 보조 컬럼들을 추가합니다.

ALTER TABLE public.writing_missions 
ADD COLUMN IF NOT EXISTS question_count INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS use_ai_questions BOOLEAN DEFAULT false;

-- 주석: question_count는 AI가 생성할 질문의 개수 설정을 저장합니다.
-- use_ai_questions는 해당 미션이 AI 핵심 질문 기능을 활성화했는지 여부를 저장합니다.
