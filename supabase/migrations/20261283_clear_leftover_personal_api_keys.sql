-- ============================================================================
-- 🔑 남아 있던 교사 개인 API 키를 지운다
-- 작성일: 2026-09-13
--
-- 왜: 앱은 이미 개인 API 키를 **받지 않는다** — 입력 화면도, 키를 읽는 화면 코드도 없고
--     교사 572명 전원이 서비스 키(`api_mode = 'SYSTEM'`) 로 쓴다. 그런데 기능을 걷어내기
--     전에 저장된 키가 DB 에 남아 있었다. 처리방침은 "AI 서비스 키는 서버 환경 변수에서만
--     관리하며 데이터베이스에 두지 않는다" 고 적고 있으므로, **적은 대로 만든다.**
--
-- 지우기 전 확인한 것(2026-09-13):
--   - 엣지 함수에서 `profile_secrets`·개인 키 열을 읽는 곳 0건
--   - 키 '값'을 읽는 DB 함수는 `check_my_api_key_exists` 하나뿐이고, 이 저장소의 화면
--     코드에서 부르는 곳 0건. 값이 사라지면 `has_key: false` 를 돌려줄 뿐 깨지지 않는다.
--   - 지우는 양: profile_secrets 16행 중 키가 든 10행, profiles.gemini_api_key 1행,
--     profiles.personal_openai_api_key 2행.
--
-- 열과 표는 지금 지우지 않는다: `check_my_api_key_exists` 가 아직 이 열들을 참조하고,
--   `api_mode` 는 여러 관리자 RPC 가 읽는다. 빈 껍데기만 남겨 두고
--   [안 쓰는 DB 객체](../../docs/DB_UNUSED_OBJECTS.md) 에 정리 후보로 적는다.
-- ============================================================================

BEGIN;

-- profile_secrets 는 이 두 열을 담으려고 만든 표다. 둘 다 비면 남길 것이 없다.
DELETE FROM public.profile_secrets
WHERE gemini_api_key IS NOT NULL OR personal_openai_api_key IS NOT NULL;

UPDATE public.profiles
SET gemini_api_key = NULL
WHERE gemini_api_key IS NOT NULL;

UPDATE public.profiles
SET personal_openai_api_key = NULL
WHERE personal_openai_api_key IS NOT NULL;

-- 한 개라도 남았으면 이 장은 실패해야 한다. "지웠다" 고 적고 남아 있으면 안 된다.
DO $$
DECLARE
    v_left INTEGER;
BEGIN
    SELECT (SELECT count(*) FROM public.profile_secrets
            WHERE gemini_api_key IS NOT NULL OR personal_openai_api_key IS NOT NULL)
         + (SELECT count(*) FROM public.profiles
            WHERE gemini_api_key IS NOT NULL OR personal_openai_api_key IS NOT NULL)
    INTO v_left;
    IF v_left > 0 THEN
        RAISE EXCEPTION '개인 API 키가 %건 남아 있습니다.', v_left;
    END IF;
END;
$$;

COMMENT ON COLUMN public.profiles.gemini_api_key IS
    '더 쓰지 않는다. 2026-09-13 에 값을 모두 지웠다. 열은 check_my_api_key_exists 가 참조해 남겨 두었다.';
COMMENT ON COLUMN public.profiles.personal_openai_api_key IS
    '더 쓰지 않는다. 2026-09-13 에 값을 모두 지웠다. 열은 check_my_api_key_exists 가 참조해 남겨 두었다.';

COMMIT;
