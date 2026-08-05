-- ============================================================================
-- 독서록 기본 정책 조정
--   200자 / 1문단 / 100P / 하루 작성 완료 1편
--
-- 새 학급·정책 누락 학급에는 새 기본값을 사용한다. 기존 학급은 이전 기본값을
-- 그대로 쓰는 행만 갱신해, 교사가 별도로 조정한 정책은 덮어쓰지 않는다.
-- ============================================================================

BEGIN;

UPDATE public.writing_types
SET default_policy = jsonb_build_object(
        'min_chars', 200,
        'min_paragraphs', 1,
        'base_reward', 100,
        'bonus_enabled', false,
        'bonus_threshold', 0,
        'bonus_reward', 0,
        'daily_reward_limit', 1
    )
WHERE id = 'reading_log';

UPDATE public.class_writing_policies
SET min_chars = 200,
    min_paragraphs = 1,
    base_reward = 100,
    daily_reward_limit = 1
WHERE writing_type = 'reading_log'
  AND is_enabled = true
  AND min_chars = 100
  AND min_paragraphs = 1
  AND base_reward = 50
  AND bonus_enabled = false
  AND bonus_threshold = 0
  AND bonus_reward = 0
  AND daily_reward_limit = 3;

INSERT INTO public.class_writing_policies (
    class_id, writing_type, min_chars, min_paragraphs, base_reward,
    bonus_enabled, bonus_threshold, bonus_reward, daily_reward_limit
)
SELECT c.id, 'reading_log', 200, 1, 100, false, 0, 0, 1
FROM public.classes c
ON CONFLICT (class_id, writing_type) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
