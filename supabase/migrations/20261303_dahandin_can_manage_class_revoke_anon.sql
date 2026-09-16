-- 다했니 RLS 헬퍼의 anon 실행 권한 회수 (2026-09-16)
--
-- dahandin_can_manage_class 는 RLS 정책 안에서만 쓰는 SECURITY DEFINER 헬퍼다. 기본으로 PUBLIC
-- 에 EXECUTE 가 붙어 비로그인(anon)도 부를 수 있어 rpc-surface 검사가 경고했다. 정책 평가에
-- 필요한 authenticated·service_role 에만 남기고 나머지는 회수한다.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.dahandin_can_manage_class(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dahandin_can_manage_class(UUID) TO authenticated, service_role;

COMMIT;
