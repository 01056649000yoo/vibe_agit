-- 활용 안내서 AI 길잡이를 승인된 전체 교사에게 공개한다 (2026-09-09).
-- 요청당 입력 상한과 계정별 분당 3회·하루 5회 제한은 20261235의 기존 계약을 그대로 쓴다.

BEGIN;

INSERT INTO public.system_settings(key, value)
VALUES ('teacher_guide_ai_stage', '"public"'::JSONB)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value;

COMMIT;
