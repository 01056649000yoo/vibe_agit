-- 이미 모듈 목록을 명시적으로 저장한 학급 중 기존 아이디어마켓이 켜진 곳은
-- 독립 모듈 전환 후에도 노출 상태를 유지한다. 미설정 학급은 프론트의 legacy resolver가 처리한다.
UPDATE public.classes
SET enabled_modules = array_append(enabled_modules, 'idea-market')
WHERE enabled_modules @> ARRAY['__configured__']::text[]
  AND COALESCE((agit_settings ->> 'isIdeaMarketEnabled')::boolean, false)
  AND NOT (enabled_modules @> ARRAY['idea-market']::text[]);
