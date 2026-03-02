-- ============================================================================
-- 🛡️ [보안 패치] point_logs 익명 삽입 취약점 제거
-- 작성일: 2026-02-27
--
-- 문제:
--   point_logs_insert_v2 정책의 WITH CHECK 조건에 "auth.uid() IS NULL"이 포함되어
--   미인증(anon) 사용자도 point_logs 테이블에 직접 INSERT가 가능한 상태.
--
-- 원인:
--   서비스 롤(서버 내부 호출) 허용을 의도했으나, anon 역할도 auth.uid() IS NULL이므로
--   의도치 않게 익명 사용자에게 쓰기 권한이 부여됨.
--
-- 해결:
--   해당 조건 제거. SECURITY DEFINER RPC 함수들은 RLS를 우회하므로 영향 없음.
--   클라이언트에서 직접 INSERT하는 경우는 모두 교사(authenticated) 계정에서 실행되므로
--   "EXISTS (SELECT 1 FROM classes WHERE classes.teacher_id = auth.uid())" 조건으로 충분.
-- ============================================================================

DROP POLICY IF EXISTS "point_logs_insert_v2" ON public.point_logs;

CREATE POLICY "point_logs_insert_v2" ON public.point_logs
    FOR INSERT WITH CHECK (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.classes
            WHERE classes.teacher_id = auth.uid()
        )
    );

-- 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
