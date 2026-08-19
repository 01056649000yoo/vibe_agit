-- 연구소 결과 불러오기를 기본 켜짐으로 바꾼다 (2026-08-19)
--
-- 배경: 교사 설정(글쓰기창 관리)에 `연구소 결과 불러오기` 스위치가 있지만 기본이 꺼짐이라
-- 아무도 켜지 않으면 연구소와 글쓰기가 이어지지 않는다. 연구소 통합이 기본 동선이 된 지금은
-- 켜짐이 기본이어야 하고, 필요 없는 학급만 끄면 된다.
--
-- 기존 학급은 모두 `{"enabled_tools":["spelling-lookup"]}` 를 그대로 들고 있어(설정을 만든 적이 없다)
-- 열 기본값만 바꾸면 아무 학급도 켜지지 않는다. 그래서 **한 번도 손대지 않은 학급**의 값을 함께 옮긴다.
-- 교사가 직접 고른 조합(도구 목록이 이 두 가지가 아닌 학급)은 건드리지 않는다.

BEGIN;

ALTER TABLE public.classes
    ALTER COLUMN writing_editor_settings
    SET DEFAULT '{"enabled_tools":["spelling-lookup","lab-results"]}'::JSONB;

UPDATE public.classes
SET writing_editor_settings = jsonb_set(
        writing_editor_settings,
        '{enabled_tools}',
        (writing_editor_settings->'enabled_tools') || '["lab-results"]'::JSONB
    )
WHERE jsonb_typeof(writing_editor_settings->'enabled_tools') = 'array'
  AND NOT (writing_editor_settings->'enabled_tools' ? 'lab-results')
  -- 교사가 손댄 적 없는 초기값만 옮긴다.
  AND writing_editor_settings->'enabled_tools' = '["spelling-lookup"]'::JSONB;

-- 배열 자체가 없거나 모양이 깨진 학급은 기본값으로 맞춘다.
UPDATE public.classes
SET writing_editor_settings = '{"enabled_tools":["spelling-lookup","lab-results"]}'::JSONB
WHERE jsonb_typeof(writing_editor_settings) <> 'object'
   OR jsonb_typeof(writing_editor_settings->'enabled_tools') <> 'array';

COMMENT ON COLUMN public.classes.writing_editor_settings IS
    '학급별 학생 글쓰기 창 설정. enabled_tools는 글쓰기 지원 도구 manifest id 배열이며 기본은 맞춤법 찾아보기·연구소 결과 불러오기다.';

COMMIT;
