-- ============================================================
-- students 테이블 소프트 딜리트 RLS 정책 추가 (보안 강화 버전)
--
-- 현황:
--   - 프론트엔드는 소프트 딜리트(deleted_at UPDATE) 방식으로 구현됨
--   - students 테이블에 UPDATE / DELETE 정책이 없어 교사의 삭제가 차단됨
--
-- 보안 설계 원칙:
--   1. UPDATE 정책: 학생은 class_id / total_points 등 민감 컬럼 변경 불가
--      → WITH CHECK에서 학생 본인 조건을 제거하여 방지
--      → (auth_id 바인딩은 SECURITY DEFINER RPC bind_student_auth가 담당)
--   2. DELETE 정책: 클라이언트가 타임스탬프 조작 불가
--      → 하드 딜리트는 SECURITY DEFINER RPC를 통해서만 처리
--      → DELETE 정책은 관리자 전용으로 한정
-- ============================================================


-- -------------------------------------------------------
-- 1. UPDATE 정책
--    USING (조회 조건): 교사(자반) 또는 관리자
--    WITH CHECK (변경 후 값 조건): 교사(자반) 또는 관리자
--
--    ★ 학생 본인(auth_id = auth.uid())은 의도적으로 제외
--      - auth_id 바인딩은 SECURITY DEFINER RPC(bind_student_auth)가 처리
--      - 직접 UPDATE 허용 시 학생이 class_id를 다른 반으로 바꾸는 등
--        민감 컬럼 변경이 가능해지는 보안 취약점이 생김
--      - protect_student_sensitive_columns 트리거가 추가 방어하지만,
--        RLS 레벨에서도 원천 차단하는 것이 안전함
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Student_Update_v1" ON public.students;

CREATE POLICY "Student_Update_v1"
ON public.students
FOR UPDATE
TO public
USING (
    is_admin()
    OR EXISTS (
        SELECT 1
        FROM classes c
        WHERE c.id = students.class_id
          AND c.teacher_id = auth.uid()
    )
)
WITH CHECK (
    is_admin()
    OR EXISTS (
        SELECT 1
        FROM classes c
        WHERE c.id = students.class_id
          AND c.teacher_id = auth.uid()
    )
);


-- -------------------------------------------------------
-- 2. DELETE 정책
--    - 관리자만 직접 삭제 허용
--    - 교사의 만료 학생 하드 딜리트는 아래 RPC 함수(purge_expired_students)를 통해서만 허용
--      → 클라이언트가 타임스탬프를 조작해도 서버 측 검증을 통과할 수 없음
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Student_Delete_v1" ON public.students;

CREATE POLICY "Student_Delete_v1"
ON public.students
FOR DELETE
TO public
USING (
    is_admin()
);


-- -------------------------------------------------------
-- 3. RPC 함수: purge_expired_students
--    - 교사가 자신의 반에서 deleted_at이 3일 이상 지난 학생을 하드 삭제
--    - SECURITY DEFINER로 실행되어 RLS를 우회하고 서버에서 직접 검증
--    - 클라이언트의 useStudentManager.fetchDeletedStudents()에서 호출
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_expired_students(p_class_id UUID)
RETURNS INT AS $$
DECLARE
    v_teacher_id UUID;
    v_deleted_count INT;
BEGIN
    v_teacher_id := auth.uid();

    -- 1. 호출자가 해당 학급의 교사인지 확인
    IF NOT EXISTS (
        SELECT 1 FROM public.classes
        WHERE id = p_class_id
          AND teacher_id = v_teacher_id
    ) AND NOT public.is_admin() THEN
        RAISE EXCEPTION '권한이 없습니다.';
    END IF;

    -- 2. 서버 측 시간 기준으로 3일 경과한 소프트 딜리트 학생만 하드 삭제
    DELETE FROM public.students
    WHERE class_id = p_class_id
      AND deleted_at IS NOT NULL
      AND deleted_at < (NOW() - INTERVAL '3 days');

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'auth';

-- 교사 계정(authenticated)에게 실행 권한 부여
GRANT EXECUTE ON FUNCTION public.purge_expired_students(UUID) TO authenticated;

-- PostgREST 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
