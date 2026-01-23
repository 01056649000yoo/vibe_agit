-- [데이터베이스 확장 SQL]
-- student_posts 테이블에 학생의 단계별 답변 저장을 위한 컬럼을 추가합니다.

ALTER TABLE public.student_posts 
ADD COLUMN IF NOT EXISTS student_answers JSONB DEFAULT '[]'::jsonb;
