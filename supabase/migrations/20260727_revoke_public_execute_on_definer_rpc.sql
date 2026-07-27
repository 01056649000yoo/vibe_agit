-- ============================================================================
-- 🔐 SECURITY DEFINER RPC 에서 PUBLIC 실행 권한 회수
-- 작성일: 2026-07-27
--
-- 배경 / 앞선 조치의 오류:
--   같은 날 `20260727_admin_function_privilege_hardening.sql` 에서 admin_* 함수에
--   `REVOKE ALL ... FROM anon` 을 돌렸으나 **실효가 없었다.**
--   대상 함수 상당수는 PUBLIC 이 EXECUTE 를 쥐고 있었고, PUBLIC 권한이 남아 있는 한
--   anon 은 그대로 호출 가능하다. (`has_function_privilege('anon', ...)` = true 유지)
--   → 반드시 **PUBLIC 에서 회수**해야 한다.
--
-- 이 마이그레이션의 규칙:
--   회수 대상 = SECURITY DEFINER · 트리거 아님 · PUBLIC 보유 · authenticated 명시 보유
--     → authenticated 가 이미 명시 권한을 갖고 있으므로 로그인 사용자 동작에는 영향이 없다.
--       (학생 로그인도 signInAnonymously 로 authenticated 세션을 먼저 만든 뒤 RPC 를 호출한다)
--   제외 = RLS 정책 본문에서 호출되는 헬퍼
--     auth_user_role / auth_user_class_id / auth_student_id
--     → 정책 평가는 호출자 권한으로 수행되므로, 회수하면 비로그인 조회가
--       빈 결과가 아니라 permission denied 로 깨진다.
--
-- 재실행 안전: 이미 회수된 함수는 조건에서 빠지므로 몇 번 실행해도 무해하다.
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
          AND EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0)
          AND EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 'authenticated'::regrole)
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
        v_count := v_count + 1;
        RAISE NOTICE 'PUBLIC 회수: %', r.proname;
    END LOOP;

    RAISE NOTICE '총 % 개 함수에서 PUBLIC 실행 권한을 회수했습니다.', v_count;
END $$;

NOTIFY pgrst, 'reload schema';
