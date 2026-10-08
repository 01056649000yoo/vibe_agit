-- ============================================================================
-- 🔍 맞춤법 회색 점선 '한번 살펴볼까요?' 를 모든 학급에 기본으로 켠다
-- 작성일: 2026-10-08 (선생님 결정 — 시험해 보니 괜찮아 바로 전체 교사에게 적용)
--
-- 무엇을 하나(20261286 AI 맞춤법 검사 기본 켜기와 같은 방식):
--   ① 새 학급의 기본값에 `spelling-gray` 를 넣는다.
--   ② 이미 있는 학급에도 넣는다. 이미 켠 학급은 그대로 두고, 다른 도구를 끈 선택도 건드리지 않는다.
--
-- 되돌리려면: 학급마다 교사가 `학급 살펴보기 → 학생 화면 미리보기 → 글쓰기 창 관리` 에서 끄면 된다.
--
-- 알아 둘 것: 학생 글은 우리 서버(맥미니) 안에서만 분석하고 밖으로 보내지 않는다(외부 전송 없음).
--   학생이 고른 결과만 학급 단위로, 학생 식별자 없이 60일 남긴다(20261383).
--
-- 화면 기본값의 원본은 `src/modules/writing/editor-settings/settings.js` 다 — `tests/writingEditorDefaults.test.mjs` 가 함께 본다.
-- ============================================================================

BEGIN;

ALTER TABLE public.classes
    ALTER COLUMN writing_editor_settings
    SET DEFAULT '{"enabled_tools": ["spelling-lookup", "lab-results", "ai-spell-check", "spelling-gray"]}'::JSONB;

UPDATE public.classes
SET writing_editor_settings = JSONB_SET(
        COALESCE(writing_editor_settings, '{}'::JSONB),
        '{enabled_tools}',
        COALESCE(writing_editor_settings -> 'enabled_tools', '[]'::JSONB) || '["spelling-gray"]'::JSONB
    )
WHERE deleted_at IS NULL
  AND NOT COALESCE(writing_editor_settings -> 'enabled_tools', '[]'::JSONB) @> '["spelling-gray"]'::JSONB;

COMMIT;
