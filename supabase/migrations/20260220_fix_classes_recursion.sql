-- ====================================================================
-- [긴급 수정] classes RLS 무한 재귀(Infinite Recursion) 버그 수정
-- 작성일: 2026-02-20
-- 원인: Classes_Select 정책이 students 테이블을 조회하고,
--       Student_Select 정책이 다시 classes 테이블을 조회하여 무한 루프 발생
-- 해결: SECURITY DEFINER 헬퍼 함수로 students.auth_id 직접 조회 (RLS 우회)
-- ====================================================================


-- ────────────────────────────────────────────────────────────────
-- STEP 1: 순환 참조를 끊는 헬퍼 함수 생성
--         SECURITY DEFINER = RLS를 우회하여 직접 테이블 조회
--         → classes 정책 → 함수 호출 (RLS 없음) → 재귀 없음!
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_class_id()
RETURNS UUID AS $$
    -- 현재 auth.uid()에 바인딩된 학생의 class_id를 직접 반환
    -- SECURITY DEFINER이므로 students RLS를 우회 → 무한 재귀 없음
    SELECT class_id 
    FROM public.students 
    WHERE auth_id = auth.uid() 
      AND deleted_at IS NULL 
    LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 함수 실행 권한 부여
GRANT EXECUTE ON FUNCTION public.get_my_class_id() TO anon, authenticated;


-- ────────────────────────────────────────────────────────────────
-- STEP 2: 기존 classes 관련 정책 전부 삭제
-- ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Classes_Select" ON public.classes;
DROP POLICY IF EXISTS "Teacher_Manage_Own_Classes" ON public.classes;
DROP POLICY IF EXISTS "Admin_Manage_Classes" ON public.classes;


-- ────────────────────────────────────────────────────────────────
-- STEP 3: 재귀 없는 안전한 정책 재생성
--         학생은 get_my_class_id() 함수로 자신의 학급만 조회
-- ────────────────────────────────────────────────────────────────
-- 조회: 교사(본인 학급), 관리자, 소속 학생(함수로 안전하게)
CREATE POLICY "Classes_Select" ON public.classes FOR SELECT USING (
    auth.uid() = teacher_id                         -- 담당 교사
    OR is_admin()                                   -- 관리자
    OR (
        deleted_at IS NULL 
        AND id = public.get_my_class_id()           -- 소속 학생 (재귀 없음!)
    )
);

-- 수정/삭제: 담당 교사만
CREATE POLICY "Teacher_Manage_Own_Classes" ON public.classes 
    FOR ALL USING (auth.uid() = teacher_id);

-- 관리자 전체 관리
CREATE POLICY "Admin_Manage_Classes" ON public.classes 
    FOR ALL USING (is_admin());


-- ────────────────────────────────────────────────────────────────
-- STEP 4: students 정책의 재귀도 동일 방식으로 수정
--         "같은 학급 확인" 시 classes 테이블 대신 함수 사용
-- ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Student_Select" ON public.students;

CREATE POLICY "Student_Select" ON public.students FOR SELECT USING (
    is_admin()
    OR EXISTS (
        -- 교사: 본인이 담당하는 학급의 학생만 조회
        -- (classes 테이블 직접 참조 - students를 참조하지 않으므로 재귀 없음)
        SELECT 1 FROM public.classes c 
        WHERE c.id = class_id AND c.teacher_id = auth.uid()
    )
    OR (
        -- 학생 본인: auth_id가 일치하고 같은 학급
        -- class_id 비교만 하기 때문에 재귀 없음
        deleted_at IS NULL 
        AND auth_id IS NOT NULL 
        AND class_id = public.get_my_class_id()  -- 함수로 안전하게 비교
    )
);


-- ────────────────────────────────────────────────────────────────
-- STEP 5: 스키마 캐시 새로고침
-- ────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';


-- ====================================================================
-- 완료! 이 파일 실행 후 교사 대시보드가 정상 작동해야 합니다.
-- ====================================================================
