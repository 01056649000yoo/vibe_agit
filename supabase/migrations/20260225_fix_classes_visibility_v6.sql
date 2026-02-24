-- ============================================================================
-- 🚀 [최종 디버그 패치] Classes 테이블 조회 불가 (PGRST116) 현상 해결 패치 (v6)
-- 작성일: 2026-02-23 (학급 조회 권한 완벽 복구)
-- ============================================================================

-- 문제 분석:
-- classes 테이블에 대한 SELECT 권한이 막혀있어 학생 대시보드 진입 시 학급 설정(온도, 목표치 등)을
-- 단일 레코드로 가져올 때 "결과가 없음(The result contains 0 rows)" 오류가 출력되며 크래시되는 현상.
-- 관리자 또는 교사만 classes를 읽을 수 있게 제한되어 있던 정책을 학생에게 개방해야 합니다.

-- 1. Classes 읽기 권한 재복구 (가장 안전한 개방형 조회 기능 추가)
DROP POLICY IF EXISTS "Classes_Select" ON public.classes;
DROP POLICY IF EXISTS "classes_read_v1" ON public.classes;
DROP POLICY IF EXISTS "classes_read_v2" ON public.classes;
DROP POLICY IF EXISTS "classes_read_v6" ON public.classes;

CREATE POLICY "classes_read_v6" ON public.classes FOR SELECT USING (
    -- 기본: 관리자, 혹은 본인이 담당(생성)한 교사
    public.is_admin()
    OR teacher_id = auth.uid()
    
    -- ★ 핵심 추가: 학생은 자기가 소속된 "같은 반(class_id)" 정보를 반드시 조회할 수 있어야 함
    OR id IN (
        SELECT class_id FROM public.vw_students_rls_bypass 
        WHERE auth_id = auth.uid() AND deleted_at IS NULL
    )
);

-- 스키마 갱신
NOTIFY pgrst, 'reload schema';
