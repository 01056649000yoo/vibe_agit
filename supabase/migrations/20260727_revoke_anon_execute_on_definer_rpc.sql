-- ============================================================================
-- 🚨 익명(anon) 실행 권한 회수 — 포인트 조작 취약점 차단
-- 작성일: 2026-07-27
--
-- 실증된 취약점:
--   `SET ROLE anon` 상태에서 `teacher_manage_points(<실제 학생 id>, 99999, ...)` 호출 시
--   학생 포인트가 15 → 100,014 로 변경되었다(검증 후 ROLLBACK).
--   anon 키는 프론트 번들에 포함된 공개 값이므로 **인터넷의 누구나 실행 가능**한 상태였다.
--
-- 원인 두 가지가 겹쳤다:
--   1) 함수에 `anon=X` 실행 권한이 명시적으로 부여되어 있었다.
--      (앞선 마이그레이션의 PUBLIC 회수만으로는 이 명시 권한이 남는다)
--   2) 권한 검사 로직이 `IF auth.uid() IS NULL THEN v_is_authorized := true` 형태다.
--      서버 배치(service_role) 호출을 허용하려는 의도였으나, anon 요청도 auth.uid() 가
--      NULL 이므로 그대로 통과했다. 같은 패턴이 11개 함수에 존재한다.
--
-- 이 마이그레이션은 (1)을 닫는다. anon 을 제거하면 남는 호출자는 authenticated 와
-- service_role 뿐이고, authenticated 는 JWT 의 sub 가 있어 auth.uid() 가 절대 NULL 이
-- 아니다. 따라서 (2)의 NULL 분기는 본래 의도대로 서버 내부 호출에서만 도달한다.
--
-- 앱 영향 없음(확인함):
--   - 교사: 구글 로그인 후 호출 → authenticated
--   - 학생: signInAnonymously() 로 **익명 세션을 먼저 만든 뒤** RPC 호출 → 익명 세션도 JWT 롤은 authenticated
--   - useAuthStore 의 get_student_by_auth / unbind_student_auth 는 session 존재 시에만 호출
--
-- 제외: RLS 정책 본문이 호출하는 헬퍼(auth_user_role / auth_user_class_id / auth_student_id).
--       회수하면 비로그인 조회가 permission denied 로 깨진다.
-- ============================================================================

DO $$
DECLARE
    r RECORD;
    v_count INTEGER := 0;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS sig, p.proname
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosecdef
          AND p.prorettype::regtype::text <> 'trigger'
          AND p.proname NOT IN ('auth_user_role', 'auth_user_class_id', 'auth_student_id')
          AND has_function_privilege('anon', p.oid, 'EXECUTE')
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, PUBLIC', r.sig);
        v_count := v_count + 1;
        RAISE NOTICE 'anon 회수: %', r.proname;
    END LOOP;

    RAISE NOTICE '총 % 개 함수에서 익명 실행 권한을 회수했습니다.', v_count;
END $$;

NOTIFY pgrst, 'reload schema';
