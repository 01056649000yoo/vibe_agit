-- ==========================================
-- 🛡️ [명예의 전당 기능 복구] RLS 보안 정책 및 가시성 해결
-- 작성일: 2026-02-25
-- 수정사항: 최신 보안 함수 fn_get_students_for_rls_check() 도입 및 UPDATE 권한 부여
-- ==========================================

-- 1. 기존 정책 삭제 (안전한 재구축을 위해)
DROP POLICY IF EXISTS "Honor_Roll_Select" ON public.agit_honor_roll;
DROP POLICY IF EXISTS "Honor_Roll_Insert" ON public.agit_honor_roll;
DROP POLICY IF EXISTS "Honor_Roll_Update" ON public.agit_honor_roll;
DROP POLICY IF EXISTS "Honor_Roll_Delete" ON public.agit_honor_roll;
DROP POLICY IF EXISTS "Honor_Roll_Manage" ON public.agit_honor_roll;

-- 2. [조회] 관리자, 담당 교사, 소속 학급 학생
CREATE POLICY "Honor_Roll_Select_v7" ON public.agit_honor_roll 
FOR SELECT USING (
    public.is_admin()
    OR EXISTS (
        SELECT 1 FROM public.classes 
        WHERE id = class_id AND teacher_id = auth.uid()
    )
    OR class_id IN (
        SELECT class_id FROM public.fn_get_students_for_rls_check()
        WHERE auth_id = auth.uid() AND deleted_at IS NULL
    )
);

-- 3. [삽입] 관리자, 담당 교사, 학생 본인
-- Upsert 작동을 위해 INSERT와 UPDATE 정책이 모두 필요합니다.
CREATE POLICY "Honor_Roll_Insert_v7" ON public.agit_honor_roll 
FOR INSERT WITH CHECK (
    public.is_admin()
    OR EXISTS (
        SELECT 1 FROM public.classes 
        WHERE id = class_id AND teacher_id = auth.uid()
    )
    OR student_id IN (
        SELECT id FROM public.fn_get_students_for_rls_check()
        WHERE auth_id = auth.uid() AND deleted_at IS NULL
    )
);

-- 4. [수정] Upsert 시 중복 데이터 업데이트를 위해 필수
CREATE POLICY "Honor_Roll_Update_v7" ON public.agit_honor_roll 
FOR UPDATE USING (
    public.is_admin()
    OR EXISTS (
        SELECT 1 FROM public.classes 
        WHERE id = class_id AND teacher_id = auth.uid()
    )
    OR student_id IN (
        SELECT id FROM public.fn_get_students_for_rls_check()
        WHERE auth_id = auth.uid() AND deleted_at IS NULL
    )
);

-- 5. [삭제] 관리자 또는 담당 교사만
CREATE POLICY "Honor_Roll_Delete_v7" ON public.agit_honor_roll 
FOR DELETE USING (
    public.is_admin()
    OR EXISTS (
        SELECT 1 FROM public.classes 
        WHERE id = class_id AND teacher_id = auth.uid()
    )
);

-- 권한 재확인 (anonymous 접근 차단, 인증된 사용자만 허용)
GRANT ALL ON public.agit_honor_roll TO authenticated;
GRANT SELECT ON public.agit_honor_roll TO anon; -- 익명 사용자는 조회만 가능

-- 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
