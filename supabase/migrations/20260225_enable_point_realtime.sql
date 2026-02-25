-- ==========================================
-- 🛡️ [포인트 시스템 기능 복구] 실시간 알림 및 회수 기능 정상화 (v2)
-- 작성일: 2026-02-25
-- 수정사항: vw_students_rls_bypass 대신 fn_get_students_for_rls_check() 함수 사용
-- ==========================================

-- 1. 실시간 데이터 전송 설정
ALTER TABLE public.point_logs REPLICA IDENTITY FULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
          AND tablename = 'point_logs'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.point_logs;
    END IF;
END $$;

-- 2. [핵심] RLS 정책 복구 (보안 함수 fn_get_students_for_rls_check 활용)
-- 보안 강화 작업(View 제거)으로 인해 끊겼던 조회 권한을 최신 표준에 맞춰 복구합니다.

DROP POLICY IF EXISTS "Log_Select_Realtime" ON public.point_logs;
DROP POLICY IF EXISTS "point_logs_read_v1" ON public.point_logs;
DROP POLICY IF EXISTS "point_logs_read_v2" ON public.point_logs;

CREATE POLICY "point_logs_read_v3" ON public.point_logs
FOR SELECT
USING (
    public.is_admin()
    -- 학생 본인: 자신의 포인트 로그 조회 가능
    OR student_id IN (
        SELECT id FROM public.fn_get_students_for_rls_check()
        WHERE auth_id = auth.uid() AND deleted_at IS NULL
    )
    -- 담당 교사: 자신이 담당하는 학급 학생의 포인트 로그 조회 가능 (승인 취소/회수용)
    OR EXISTS (
        SELECT 1 FROM public.fn_get_students_for_rls_check() s
        JOIN public.classes c ON c.id = s.class_id
        WHERE s.id = public.point_logs.student_id 
          AND c.teacher_id = auth.uid()
          AND s.deleted_at IS NULL
    )
);

-- 3. INSERT 권한 (관리자/교사/시스템용)
DROP POLICY IF EXISTS "point_logs_insert_v1" ON public.point_logs;
CREATE POLICY "point_logs_insert_v2" ON public.point_logs
FOR INSERT
WITH CHECK (
    public.is_admin()
    OR auth.uid() IS NULL -- 서비스 롤 (RPC 등)
    OR EXISTS (
        SELECT 1 FROM public.classes 
        WHERE teacher_id = auth.uid()
    )
);

-- 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
