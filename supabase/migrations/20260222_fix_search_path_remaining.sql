-- ============================================================================
-- 🛡️ search_path 추가 패치 (2026-02-22)
-- 남은 7건의 function_search_path_mutable 경고 해결
-- ============================================================================

-- ==========================================================================
-- [1] increment_student_points — 구버전 오버로드 삭제
-- DB에 3개의 오버로드가 존재:
--   v1: (UUID, INTEGER)           ← 20250102에서 생성, 더 이상 불필요
--   v2: (UUID, INTEGER, TEXT)     ← 20250211에서 생성, 더 이상 불필요
--   v3: (UUID, INTEGER, TEXT, UUID, UUID) ← 현재 사용 중 (기본값 있음)
-- v3가 기본값을 가지므로 v1, v2 호출 패턴도 모두 처리 가능
-- ==========================================================================
DROP FUNCTION IF EXISTS public.increment_student_points(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.increment_student_points(UUID, INTEGER, TEXT);

-- ==========================================================================
-- [2] 현재 사용 중인 5개 RPC 함수에 search_path 재설정
-- (20260222_fix_rpc_ownership_checks.sql에서 CREATE OR REPLACE로 리셋됨)
-- ==========================================================================
ALTER FUNCTION public.increment_student_points(UUID, INTEGER, TEXT, UUID, UUID) SET search_path = '';
ALTER FUNCTION public.teacher_manage_points(UUID, INTEGER, TEXT) SET search_path = '';
ALTER FUNCTION public.add_student_with_bonus(UUID, TEXT, TEXT, INTEGER) SET search_path = '';
ALTER FUNCTION public.mark_feedback_as_read(UUID) SET search_path = '';
ALTER FUNCTION public.update_tower_max_floor(UUID, UUID, INTEGER) SET search_path = '';
