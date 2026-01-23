-- [데이터베이스 업데이트 SQL]
-- student_posts 테이블에 최초 기록용 컬럼을 추가합니다.
-- 이 SQL을 Supabase의 SQL Editor에서 실행해주세요. ✨

ALTER TABLE public.student_posts 
ADD COLUMN IF NOT EXISTS original_content TEXT,
ADD COLUMN IF NOT EXISTS original_title TEXT,
ADD COLUMN IF NOT EXISTS first_submitted_at TIMESTAMPTZ;

-- (선택 사항) 만약 컬럼 추가 후 기존에 이미 제출된 글들을 최초 글 기록으로 채우고 싶다면 아래 주석을 풀고 실행하세요.
/*
UPDATE public.student_posts 
SET original_content = content, 
    original_title = title, 
    first_submitted_at = created_at
WHERE original_content IS NULL AND is_submitted = true;
*/
