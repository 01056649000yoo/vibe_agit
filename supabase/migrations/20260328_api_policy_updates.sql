-- ============================================================================
-- 🛡️ [VIBE_TEST] API Policy Updates: Global Switch & Policy Initialization
-- 작성일: 2026-03-28
-- 설명: 
--   1. system_settings에 public_api_enabled 키 추가 (기본값: true)
-- ============================================================================

INSERT INTO public.system_settings (key, value)
VALUES ('public_api_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 이미 존재한다면 값을 보존하거나 초기화할 수 있음. 
-- 여기서는 초기 설치 시에만 동작하도록 DO NOTHING 사용.
