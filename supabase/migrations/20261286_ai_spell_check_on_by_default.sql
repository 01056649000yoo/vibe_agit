-- ============================================================================
-- ✍️ AI 맞춤법 검사를 기본으로 켠다
-- 작성일: 2026-09-13
--
-- 왜: 594개 학급 중 **13개만** 켜 두고 있었다. 그런데 **끈 학급은 하나도 없다** —
--     기본 목록에 없어서 `있는 줄 몰라` 안 쓴 것이지 싫어서가 아니다(사용자 판단).
--
-- 무엇을 하나:
--   ① 새 학급의 기본값에 `ai-spell-check` 를 넣는다.
--   ② 이미 있는 학급에도 넣는다. 넣지 않으면 594개 중 13개만 계속 쓰게 된다 —
--      기본값만 바꾸는 것은 **새 학급에만** 미친다.
--
-- 되돌리려면: 학급마다 교사가 `글쓰기 창 관리`에서 끄면 된다. 이 장은 목록에 하나를
--   더할 뿐이고 다른 설정(연구소 결과 등)은 건드리지 않는다.
--
-- 알아 둘 것: 이 기능은 교사가 `다시 쓰기` 를 요청한 글에서만 열리고, 켜면 그 글이
--   OpenAI 로 전송된다(개인정보 처리방침 제5조에 이미 고지돼 있다). 이름·학번은 가지 않는다.
--
-- 화면 기본값의 원본은 `src/modules/writing/editor-settings/settings.js` 다.
--   두 곳이 어긋나면 새 학급과 화면이 다른 것을 보여 준다 —
--   `tests/writingEditorDefaults.test.mjs` 가 함께 본다.
-- ============================================================================

BEGIN;

ALTER TABLE public.classes
    ALTER COLUMN writing_editor_settings
    SET DEFAULT '{"enabled_tools": ["spelling-lookup", "lab-results", "ai-spell-check"]}'::JSONB;

-- 이미 있는 학급에 더한다. 이미 켠 13개는 그대로 두고(중복으로 넣지 않는다),
-- 다른 도구를 끈 학급의 선택도 건드리지 않는다.
UPDATE public.classes
SET writing_editor_settings = JSONB_SET(
        COALESCE(writing_editor_settings, '{}'::JSONB),
        '{enabled_tools}',
        COALESCE(writing_editor_settings -> 'enabled_tools', '[]'::JSONB) || '["ai-spell-check"]'::JSONB
    )
WHERE deleted_at IS NULL
  AND NOT COALESCE(writing_editor_settings -> 'enabled_tools', '[]'::JSONB) @> '["ai-spell-check"]'::JSONB;

-- 남은 학급이 있으면 이 장은 실패해야 한다. "켰다" 고 적고 안 켜져 있으면 안 된다.
DO $$
DECLARE
    v_left INTEGER;
BEGIN
    SELECT count(*) INTO v_left FROM public.classes
    WHERE deleted_at IS NULL
      AND NOT COALESCE(writing_editor_settings -> 'enabled_tools', '[]'::JSONB) @> '["ai-spell-check"]'::JSONB;
    IF v_left > 0 THEN
        RAISE EXCEPTION 'AI 맞춤법 검사가 아직 꺼진 학급이 %개 있습니다.', v_left;
    END IF;
END;
$$;

COMMIT;
