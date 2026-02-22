-- ============================================================================
-- 🛡️ [긴급 수정] 모든 SECURITY DEFINER RPC 함수의 search_path 재설정
-- 작성일: 2026-02-22
--
-- 문제:
--   20260222_fix_search_path.sql에서 search_path = '' (빈 문자열)로 설정하여
--   auth.uid() 등 auth 스키마 접근이 불가능해졌습니다.
--   이로 인해 bind_student_auth, setup_teacher_profile 등 RPC 함수 호출 시
--   403 Forbidden 에러가 발생합니다.
--
-- 해결:
--   search_path = 'public', 'auth' 로 설정하여
--   public 스키마와 auth 스키마 모두 접근 가능하도록 변경합니다.
-- ============================================================================

-- 1. is_admin (이미 복구 스크립트에서 수정되었지만 확인)
ALTER FUNCTION public.is_admin() SET search_path = 'public', 'auth';

-- 2. get_my_class_id
ALTER FUNCTION public.get_my_class_id() SET search_path = 'public', 'auth';

-- 3. bind_student_auth ★ 학생 로그인 핵심
ALTER FUNCTION public.bind_student_auth(TEXT) SET search_path = 'public', 'auth';

-- 4. unbind_student_auth
ALTER FUNCTION public.unbind_student_auth() SET search_path = 'public', 'auth';

-- 5. get_student_by_auth
ALTER FUNCTION public.get_student_by_auth() SET search_path = 'public', 'auth';

-- 6. increment_student_points
ALTER FUNCTION public.increment_student_points(UUID, INTEGER, TEXT, UUID, UUID) SET search_path = 'public', 'auth';

-- 7. teacher_manage_points
ALTER FUNCTION public.teacher_manage_points(UUID, INTEGER, TEXT) SET search_path = 'public', 'auth';

-- 8. add_student_with_bonus
ALTER FUNCTION public.add_student_with_bonus(UUID, TEXT, TEXT, INTEGER) SET search_path = 'public', 'auth';

-- 9. mark_feedback_as_read
ALTER FUNCTION public.mark_feedback_as_read(UUID) SET search_path = 'public', 'auth';

-- 10. update_tower_max_floor
ALTER FUNCTION public.update_tower_max_floor(UUID, UUID, INTEGER) SET search_path = 'public', 'auth';

-- 11. spend_student_points
ALTER FUNCTION public.spend_student_points(INTEGER, TEXT, JSONB) SET search_path = 'public', 'auth';

-- 12. setup_teacher_profile
ALTER FUNCTION public.setup_teacher_profile(TEXT, TEXT, TEXT) SET search_path = 'public', 'auth';

-- 13. protect_profile_sensitive_columns (트리거 함수)
ALTER FUNCTION public.protect_profile_sensitive_columns() SET search_path = 'public', 'auth';

-- 14. handle_email_verification (트리거 함수)
ALTER FUNCTION public.handle_email_verification() SET search_path = 'public', 'auth';

-- 15. cleanup_expired_deletions
ALTER FUNCTION public.cleanup_expired_deletions() SET search_path = 'public', 'auth';

-- 16. check_my_api_key_exists (API 키 확인용)
DO $$
BEGIN
    ALTER FUNCTION public.check_my_api_key_exists() SET search_path = 'public', 'auth';
EXCEPTION WHEN undefined_function THEN
    NULL; -- 함수가 없으면 건너뜀
END $$;


-- ============================================================
-- 함수 실행 권한 재부여 (GRANT)
-- ============================================================
GRANT EXECUTE ON FUNCTION public.bind_student_auth(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unbind_student_auth() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_by_auth() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_student_points(UUID, INTEGER, TEXT, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_manage_points(UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_student_with_bonus(UUID, TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_feedback_as_read(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_tower_max_floor(UUID, UUID, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spend_student_points(INTEGER, TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.setup_teacher_profile(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_class_id() TO anon, authenticated;

-- check_my_api_key_exists 권한 (존재하는 경우만)
DO $$
BEGIN
    GRANT EXECUTE ON FUNCTION public.check_my_api_key_exists() TO authenticated;
EXCEPTION WHEN undefined_function THEN
    NULL;
END $$;

-- 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
