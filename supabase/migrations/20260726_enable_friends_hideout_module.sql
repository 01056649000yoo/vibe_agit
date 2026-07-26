-- 친구 아지트는 모듈화 전 모든 학급에 노출되던 기능이다.
-- 이미 모듈 설정을 저장한 학급도 이전 동작을 유지하도록 새 ID를 명시적으로 추가한다.
UPDATE public.classes
SET enabled_modules = array_append(enabled_modules, 'friends-hideout')
WHERE enabled_modules @> ARRAY['__configured__']::text[]
  AND NOT (enabled_modules @> ARRAY['friends-hideout']::text[]);
