-- 기존 자유 입력을 기본으로 유지하면서 장르별 입력 틀을 선택적으로 연결한다.
ALTER TABLE public.writing_missions
ADD COLUMN IF NOT EXISTS input_template TEXT NOT NULL DEFAULT 'freeform',
ADD COLUMN IF NOT EXISTS template_config JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.student_posts
ADD COLUMN IF NOT EXISTS structured_content JSONB;

COMMENT ON COLUMN public.writing_missions.input_template IS '학생 입력 UI 식별자. 기존 미션은 freeform';
COMMENT ON COLUMN public.writing_missions.template_config IS '입력 틀별 교사 설정';
COMMENT ON COLUMN public.student_posts.structured_content IS '장르별 입력 틀의 구조화 원본. title/content도 함께 유지';
