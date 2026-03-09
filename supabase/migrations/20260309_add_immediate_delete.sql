-- 학생 즉시 삭제를 위한 RPC 함수 추가
-- 호출자가 해당 학생의 학급 담임교사인지 또는 관리자인지 확인 후 삭제

CREATE OR REPLACE FUNCTION public.delete_student_immediately(p_student_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_class_id UUID;
    v_is_admin BOOLEAN;
BEGIN
    -- 1. 호출자가 관리자인지 확인
    v_is_admin := is_admin();

    -- 2. 학생의 학급 ID 조회
    SELECT class_id INTO v_class_id FROM students WHERE id = p_student_id;

    IF v_class_id IS NULL THEN
        RAISE EXCEPTION '학생을 찾을 수 없습니다.';
    END IF;

    -- 3. 권한 체크: 관리자이거나 해당 학급의 담임교사여야 함
    IF NOT v_is_admin THEN
        IF NOT EXISTS (
            SELECT 1 FROM classes 
            WHERE id = v_class_id AND teacher_id = auth.uid()
        ) THEN
            RAISE EXCEPTION '이 학생을 삭제할 권한이 없습니다.';
        END IF;
    END IF;

    -- 4. 학생 즉시 삭제 (연관 데이터는 ON DELETE CASCADE로 처리됨)
    DELETE FROM students WHERE id = p_student_id;

END;
$$;

-- RPC 실행 권한 부여
GRANT EXECUTE ON FUNCTION public.delete_student_immediately(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_student_immediately(UUID) TO service_role;
