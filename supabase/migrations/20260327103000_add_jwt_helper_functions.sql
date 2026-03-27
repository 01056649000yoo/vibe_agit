-- ============================================================================
-- 🛡️ [성능 최적화] RLS용 JWT 헬퍼 함수 (STABLE) - Public 스키마 버전
-- 작성일: 2026-03-27
-- 설명: auth 스키마 직접 생성이 제한된 환경을 위해 public 스키마에 
--       STABLE 함수를 생성합니다. 쿼리당 1회만 평가되어 성능을 높여줍니다.
-- ============================================================================

-- 1. 유저 역할(role) 반환 함수
CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS text AS $$
  SELECT (COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', ''))::text;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 2. 유저 반 번호(class_id) 반환 함수
CREATE OR REPLACE FUNCTION public.auth_user_class_id()
RETURNS uuid AS $$
  SELECT (NULLIF(auth.jwt() -> 'app_metadata' ->> 'class_id', ''))::uuid;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 권한 설정 (모든 인증 유저가 접근 가능하도록)
GRANT EXECUTE ON FUNCTION public.auth_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_class_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_role() TO service_role;
GRANT EXECUTE ON FUNCTION public.auth_user_class_id() TO service_role;

-- 스키마 캐시 새로고침
NOTIFY pgrst, 'reload schema';
