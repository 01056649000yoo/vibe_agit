-- ============================================================================
-- 🛡️ [긴급 복구] teachers 및 profiles 테이블 INSERT 정책 복구
-- 작성일: 2026-02-27
--
-- 문제: 20260224_final_security_fix.sql 보안 패치 적용 시
--       기존 INSERT 정책이 삭제되고 재생성되지 않아 신규 교사 가입 시 
--       PostgREST 403 오류 발생.
-- ============================================================================

-- 1. [teachers] INSERT 정책 복구
DROP POLICY IF EXISTS "teachers_insert_self" ON public.teachers;
CREATE POLICY "teachers_insert_self" ON public.teachers 
    FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "teachers_insert_admin" ON public.teachers;
CREATE POLICY "teachers_insert_admin" ON public.teachers 
    FOR INSERT WITH CHECK (public.is_admin());

-- 2. [profiles] INSERT 정책 복구
DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
CREATE POLICY "profiles_insert_self" ON public.profiles 
    FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_admin" ON public.profiles;
CREATE POLICY "profiles_insert_admin" ON public.profiles 
    FOR INSERT WITH CHECK (public.is_admin());

-- 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
