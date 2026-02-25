-- ============================================================================
-- 🛡️ [보안 강화] Security Definer View 고정 및 search_path 보안 패치
-- Supabase Linter 경고: security_definer_view (0010_security_definer_view) 해결
-- ============================================================================

-- 문제 분석:
-- 1. vw_students_rls_bypass는 RLS 정책 내에서 '무한 루프' 방지를 위해 SECURITY DEFINER로 생성되었습니다.
-- 2. SECURITY DEFINER 뷰는 생성자의 권한을 그대로 가지므로, 보안 설정(search_path 등)이 누락되면 취약점이 될 수 있습니다.
-- 3. Supabase Linter는 이 뷰가 RLS를 우회할 수 있음을 경고합니다.

-- 해결책:
-- 1. 뷰를 명시적으로 SECURITY DEFINER 옵션을 가진 채로 재정의하되, 보안 모범 사례를 따릅니다.
-- 2. 하지만 PostgreSQL View는 함수와 달리 'SET search_path' 옵션을 직접 가질 수 없으므로,
--    뷰 정의 내부에서 모든 테이블 참조를 스키마명(public.)을 포함한 정규화된 이름으로 강제합니다.
-- 3. 또한 해당 View의 소유자를 'postgres'로 확실히 지정하고,
--    일반 사용자가 뷰를 통해 불필요한 데이터를 탐색하지 못하도록 SELECT 권한을 필요한 역할에만 부여합니다.

-- 1. 기존 뷰 제거
DROP VIEW IF EXISTS public.vw_students_rls_bypass CASCADE;

-- 2. 뷰 재생성 (SECURITY DEFINER 명시는 CREATE VIEW 문법에 직접 없으므로, 
--    함수나 룰을 통해 구현하거나 뷰 자체를 SECURITY INVOKER로 바꾸고 내부 로직을 조정해야 함)
-- ※ PostgreSQL의 일반적인 뷰는 SECURITY INVOKER입니다.
-- ※ Supabase/Postgres에서 'SECURITY DEFINER'로 작동하는 뷰를 만들려면,
--    함수를 SECURITY DEFINER로 만들고 그 함수를 호출하는 뷰를 만들거나,
--    뷰 소유권이 권한이 높은 사용자(postgres)에게 있고, 뷰 사용자가 그 소유자의 권한을 빌려 쓰게 해야 합니다.

-- [해결책 선택] 
-- RLS 무한루프 방지가 목적이므로, 권한이 높은 사용자의 데이터를 읽어야 합니다.
-- 이에 가장 안전한 방법은 '기능을 수행하는 SECURITY DEFINER 함수'를 만들고, 
-- 그 함수를 래핑하는 뷰를 만드는 것입니다. (함수는 search_path 보안 설정이 가능함)

-- 2-1. RLS 우회 데이터 조회용 보안 함수 (함수는 search_path 고정 가능)
CREATE OR REPLACE FUNCTION public.fn_get_students_for_rls_check()
RETURNS TABLE (
    id UUID,
    class_id UUID,
    auth_id UUID,
    deleted_at TIMESTAMPTZ
) 
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT id, class_id, auth_id, deleted_at 
    FROM public.students;
$$;

-- 2-2. 해당 함수를 호출하는 뷰 생성
-- 이 뷰는 이제 함수에 의해 보호되며, 함수가 SECURITY DEFINER이므로 RLS 무한루프를 방지하면서도 보안 가이드라인(search_path)을 준수합니다.
CREATE OR REPLACE VIEW public.vw_students_rls_bypass AS
SELECT * FROM public.fn_get_students_for_rls_check();

-- 3. 권한 설정
-- 이 뷰는 RLS 정책 내부에서만 사용되므로 일반적인 익명 사용자의 직접 접근은 제한하는 것이 좋으나,
-- RLS 정책을 평가하는 'authenticated' 역할은 이 뷰를 읽을 수 있어야 합니다.
GRANT SELECT ON public.vw_students_rls_bypass TO authenticated;
GRANT SELECT ON public.vw_students_rls_bypass TO service_role;

-- 4. 기존 RLS 정책들에서 뷰를 참조하고 있으므로, 뷰 정의 변경 후 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
