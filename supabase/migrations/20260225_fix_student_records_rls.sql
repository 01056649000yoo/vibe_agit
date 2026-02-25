-- ============================================================================
-- 🛡️ [보안 패치 3단계] student_records RLS 권한 세분화 및 명시적 복원
-- 작성일: 2026-02-25
--
-- 목적:
--   ActivityReport에서 AI 쫑알이 결과를 일괄 저장할 때 발생하는 
--   403 Forbidden 오류 해결. 기존 FOR ALL 정책의 암묵적 불협화음을 제거하고
--   INSERT, SELECT, UPDATE, DELETE 정책을 명시적으로 분리하여 
--   선생님(teacher_id)이 정상적으로 기록을 생성하고 관리할 수 있도록 함.
-- ============================================================================

ALTER TABLE public.student_records ENABLE ROW LEVEL SECURITY;

-- 1. 기존 통합 포괄 정책 삭제
DROP POLICY IF EXISTS "Records_Manage" ON public.student_records;
DROP POLICY IF EXISTS "Records_Select" ON public.student_records;
DROP POLICY IF EXISTS "Records_Insert" ON public.student_records;
DROP POLICY IF EXISTS "Records_Update" ON public.student_records;
DROP POLICY IF EXISTS "Records_Delete" ON public.student_records;

-- 2. 권한별 세분화된 신규 정책 생성
CREATE POLICY "Records_Select" ON public.student_records FOR SELECT USING (
    teacher_id = auth.uid() OR public.is_admin()
);

-- INSERT 시 현재 auth.uid()가 선생님이 맞거나 관리자일 때만 삽입 허용
CREATE POLICY "Records_Insert" ON public.student_records FOR INSERT WITH CHECK (
    teacher_id = auth.uid() OR public.is_admin()
);

CREATE POLICY "Records_Update" ON public.student_records FOR UPDATE USING (
    teacher_id = auth.uid() OR public.is_admin()
);

CREATE POLICY "Records_Delete" ON public.student_records FOR DELETE USING (
    teacher_id = auth.uid() OR public.is_admin()
);

-- 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
