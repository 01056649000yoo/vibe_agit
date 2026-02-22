-- ============================================================================
-- 🛡️ API 키 존재 여부 확인 RPC (2026-02-22)
-- 
-- 목적: 클라이언트에서 API 키 원본을 가져오지 않고,
--        키가 존재하는지 여부(boolean)만 확인할 수 있는 안전한 RPC
-- 
-- 사용 이유:
--   - 기존: select('*') → personal_openai_api_key가 클라이언트에 평문 노출
--   - 변경: check_my_api_key_exists() → { has_key: true/false }만 반환
--   - 효과: 브라우저 Network탭, React DevTools, 공용PC에서도 키 원본 노출 불가
-- ============================================================================

-- 기존 함수가 있으면 삭제 후 재생성
DROP FUNCTION IF EXISTS public.check_my_api_key_exists();

CREATE OR REPLACE FUNCTION public.check_my_api_key_exists()
RETURNS JSON AS $$
DECLARE
    v_key_exists BOOLEAN := FALSE;
BEGIN
    -- 현재 로그인한 사용자의 프로필에서 키 존재 여부만 확인
    -- 실제 키 값은 절대 반환하지 않음
    SELECT 
        (personal_openai_api_key IS NOT NULL AND personal_openai_api_key != '')
    INTO v_key_exists
    FROM public.profiles
    WHERE id = auth.uid();

    RETURN json_build_object('has_key', COALESCE(v_key_exists, FALSE));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 인증된 사용자만 호출 가능 (익명 학생은 호출 불필요)
GRANT EXECUTE ON FUNCTION public.check_my_api_key_exists() TO authenticated;
