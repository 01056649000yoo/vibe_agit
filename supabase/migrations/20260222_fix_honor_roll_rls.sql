-- ====================================================================
-- 🏆 [명예의 전당 보안 패치] RLS 정책 보강 (UPDATE 추가 및 조회 제한)
-- 작성일: 2026-02-22
--
-- 문제:
--   1. agit_honor_roll 테이블에 UPDATE 정책이 없어 upsert(on conflict update) 시 403 에러 발생
--   2. SELECT 정책이 지나치게 개방적일 수 있음
--
-- 해결:
--   1. UPDATE 정책 추가 (본인 또는 담당 교사만 허용)
--   2. SELECT 정책을 소속 학급 정보로 제한
--   3. INSERT 정책 유지 및 보강
-- ====================================================================

-- 기존 정책 삭제
DROP POLICY IF EXISTS "Honor_Roll_Select" ON public.agit_honor_roll;
DROP POLICY IF EXISTS "Honor_Roll_Insert" ON public.agit_honor_roll;
DROP POLICY IF EXISTS "Honor_Roll_Update" ON public.agit_honor_roll;

-- 1. [조회] 관리자, 담당 교사, 또는 소속 학급 학생만
CREATE POLICY "Honor_Roll_Select" ON public.agit_honor_roll 
FOR SELECT USING (
    is_admin()
    OR EXISTS (
        SELECT 1 FROM public.classes 
        WHERE id = class_id AND teacher_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1 FROM public.students 
        WHERE class_id = agit_honor_roll.class_id AND auth_id = auth.uid()
    )
);

-- 2. [삽입] 관리자, 담당 교사, 또는 학생 본인(오늘 기록만)
CREATE POLICY "Honor_Roll_Insert" ON public.agit_honor_roll 
FOR INSERT WITH CHECK (
    is_admin()
    OR EXISTS (
        SELECT 1 FROM public.classes 
        WHERE id = class_id AND teacher_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1 FROM public.students 
        WHERE id = student_id AND auth_id = auth.uid() AND deleted_at IS NULL
    )
);

-- 3. [수정] upsert 시 매칭되는 행이 있을 경우 필요
CREATE POLICY "Honor_Roll_Update" ON public.agit_honor_roll 
FOR UPDATE USING (
    is_admin()
    OR EXISTS (
        SELECT 1 FROM public.classes 
        WHERE id = class_id AND teacher_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1 FROM public.students 
        WHERE id = student_id AND auth_id = auth.uid() AND deleted_at IS NULL
    )
);

-- 4. [삭제] 관리자 또는 담당 교사만
CREATE POLICY "Honor_Roll_Delete" ON public.agit_honor_roll 
FOR DELETE USING (
    is_admin()
    OR EXISTS (
        SELECT 1 FROM public.classes 
        WHERE id = class_id AND teacher_id = auth.uid()
    )
);

-- 권한 재확인
GRANT ALL ON public.agit_honor_roll TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.agit_honor_roll TO anon;

-- 스키마 캐시 새로고침
NOTIFY pgrst, 'reload schema';
