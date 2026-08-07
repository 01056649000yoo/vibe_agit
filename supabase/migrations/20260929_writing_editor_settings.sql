-- 학생 글쓰기 창의 선택 도구를 학급별로 관리한다.
-- 새 기능은 이 JSON에 키를 추가해 확장하며, 기존 학급은 맞춤법 찾아보기를 계속 사용한다.

BEGIN;

ALTER TABLE public.classes
    ADD COLUMN IF NOT EXISTS writing_editor_settings JSONB NOT NULL
    DEFAULT '{"enabled_tools":["spelling-lookup"]}'::JSONB;

UPDATE public.classes
SET writing_editor_settings = '{"enabled_tools":["spelling-lookup"]}'::JSONB
WHERE writing_editor_settings IS NULL
   OR jsonb_typeof(writing_editor_settings) <> 'object';

COMMENT ON COLUMN public.classes.writing_editor_settings IS
    '학급별 학생 글쓰기 창 설정. enabled_tools는 글쓰기 지원 도구 manifest id 배열이다.';

COMMIT;
