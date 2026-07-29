-- ============================================================================
-- get_class_student_summary 제거
--
-- 학생 탭 상단 요약 띠(20260728_class_student_summary.sql)용으로 만들었으나,
-- 이후 학생 탭이 다시 개편되면서 요약은 get_class_operations_dashboard 가 맡게 됐다.
-- 부르는 곳이 한 군데도 없다(src 전체 검색 확인).
--
-- 쓰지 않는 SECURITY DEFINER 함수를 남겨 두지 않는다 — 권한 검사가 들어 있어도
-- 실행 가능한 표면은 좁을수록 좋고, 남아 있으면 다음 사람이 살아 있는 경로로 오해한다.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.get_class_student_summary(UUID);

COMMIT;
