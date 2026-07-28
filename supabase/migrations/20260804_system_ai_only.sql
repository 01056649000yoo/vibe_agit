-- 공용 AI 전용 전환: 기존 교사도 SYSTEM 모드로 통일한다.
-- profile_secrets.personal_openai_api_key 값은 즉시 삭제하지 않는다.
-- 공용 AI 안정화·비용 모니터링 뒤 별도 승인으로 파기한다.

UPDATE public.profiles
SET api_mode = 'SYSTEM'
WHERE COALESCE(api_mode, 'SYSTEM') <> 'SYSTEM';

ALTER TABLE public.profiles
    ALTER COLUMN api_mode SET DEFAULT 'SYSTEM';
