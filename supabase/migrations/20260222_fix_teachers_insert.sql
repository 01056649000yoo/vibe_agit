-- ============================================================================
-- [긴급 수정] teachers 테이블 INSERT 정책 추가
-- 작성일: 2026-02-22
--
-- 문제: 보안 패치(20260224_final_security_fix.sql)에서 teachers 테이블에
--       SELECT/UPDATE/DELETE 정책만 생성하고 INSERT 정책을 누락함.
--       이로 인해 신규 교사 가입 시 "new row violates row-level security
--       policy for table 'teachers'" 403 오류 발생.
--
-- 해결: 본인 ID(auth.uid() = id)로만 INSERT 가능한 정책 추가
-- ============================================================================

-- 신규 교사가 본인 정보를 등록할 수 있도록 INSERT 정책 추가
DROP POLICY IF EXISTS "teachers_insert_self" ON public.teachers;
CREATE POLICY "teachers_insert_self" ON public.teachers 
    FOR INSERT WITH CHECK (auth.uid() = id);

-- 관리자도 교사 정보를 등록할 수 있도록 INSERT 정책 추가
DROP POLICY IF EXISTS "teachers_insert_admin" ON public.teachers;
CREATE POLICY "teachers_insert_admin" ON public.teachers 
    FOR INSERT WITH CHECK (public.is_admin());

-- 명시적 테이블 권한 부여 (PostgREST 접근 허용)
GRANT ALL ON TABLE public.teachers TO authenticated;

-- 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
