-- ============================================================================
-- 🛡️ [긴급 복구] 시스템 설정 및 관리자 테이블 RLS 정책 복원
-- 작성일: 2026-02-27
--
-- 문제: 보안 패치 중 is_admin() 함수가 CASCADE로 드롭되면서 
--       이를 참조하던 시스템 설정 및 관리 테이블의 정책들이 유실됨.
-- ============================================================================

-- 1. [system_settings] 테이블 정책 복구
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Settings_Read" ON public.system_settings;
CREATE POLICY "Settings_Read" ON public.system_settings 
    FOR SELECT USING (auth.uid() IS NOT NULL OR public.is_admin());

DROP POLICY IF EXISTS "Settings_Manage" ON public.system_settings;
CREATE POLICY "Settings_Manage" ON public.system_settings 
    FOR ALL USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 2. [announcements] (공지사항) 테이블 정책 복구
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Announcement_Read" ON public.announcements;
CREATE POLICY "Announcement_Read" ON public.announcements 
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Announcement_Manage" ON public.announcements;
CREATE POLICY "Announcement_Manage" ON public.announcements 
    FOR ALL USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 권한 재설정 (PostgREST 접근 허용)
GRANT ALL ON TABLE public.system_settings TO authenticated;
GRANT SELECT ON TABLE public.system_settings TO anon;
GRANT ALL ON TABLE public.announcements TO authenticated;
GRANT SELECT ON TABLE public.announcements TO anon;

-- 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
