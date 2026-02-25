-- ============================================================================
-- 🚨 [긴급 핫픽스] B-1 보안 패치 부분 롤백
-- 작성일: 2026-02-25
--
-- 원인:
--   20260225_security_fix_stage1.sql의 B-1 조치에서
--   vw_students_rls_bypass 뷰의 authenticated SELECT 권한을 제거했으나,
--   이 뷰는 classes/students/writing_missions 등 RLS 정책 평가 시에도 사용되므로
--   교사 계정의 학급 조회 등 정상 기능이 403 오류로 차단됨.
--
-- 해결:
--   authenticated SELECT 권한을 임시 복구하고,
--   외부 직접 조회 방지는 별도의 named row filter로 추후 보완
-- ============================================================================

-- vw_students_rls_bypass 뷰에 authenticated SELECT 권한 복구
GRANT SELECT ON public.vw_students_rls_bypass TO authenticated;

NOTIFY pgrst, 'reload schema';
