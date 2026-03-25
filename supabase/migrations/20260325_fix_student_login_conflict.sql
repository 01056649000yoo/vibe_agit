-- ==============================================================================
-- [버그 수정] 학생 로그인 시 409 Conflict (Duplicate Key) 오류 해결
-- 작성일: 2026-03-25
-- 
-- 원인: 
--   bind_student_auth RPC가 기존 바인딩을 해제할 때 'deleted_at IS NULL' 조건이 있어,
--   소프트 삭제된 학생에게 묶여있는 auth_id를 해제하지 못함. 
--   이 상태에서 동일한 세션(auth_id)으로 다른 학생 코드로 로그인 시도 시 유니크 제약 조건 위반 발생.
--
-- 해결: 
--   기존 바인딩 해제 시 삭제 여부와 상관없이 해당 auth_id를 가진 모든 레코드를 정리함.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.bind_student_auth(
    p_student_code TEXT
)
RETURNS JSON AS $$
DECLARE
    v_student RECORD;
    v_auth_id UUID;
BEGIN
    v_auth_id := auth.uid();
    
    -- 1. 인증되지 않은 요청 거부
    IF v_auth_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', '인증되지 않은 요청입니다.');
    END IF;
    
    -- 2. 학생 코드로 학생 조회
    SELECT s.id, s.name, s.student_code, s.class_id, s.auth_id, c.name AS class_name
    INTO v_student
    FROM public.students s
    LEFT JOIN public.classes c ON s.class_id = c.id
    WHERE s.student_code = p_student_code AND s.deleted_at IS NULL;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', '코드가 일치하는 학생을 찾을 수 없습니다.');
    END IF;
    
    -- ★ [핵심 수정] 트리거 우회 설정 후 기존 모든 바인딩(삭제된 학생 포함) 해제
    PERFORM set_config('app.bypass_student_trigger', 'true', true);
    
    -- 이전에 묶여있던 모든 기록(삭제된 계정 포함)에서 auth_id를 제거하여 유니크 충돌 방지
    UPDATE public.students 
    SET auth_id = NULL 
    WHERE auth_id = v_auth_id AND id != v_student.id;
    
    -- 3. 현재 대상 학생에게 새 auth_id 바인딩 업데이트
    UPDATE public.students SET auth_id = v_auth_id WHERE id = v_student.id;
    
    -- 트리거 우회 해제
    PERFORM set_config('app.bypass_student_trigger', 'false', true);
    
    -- 4. 성공 응답 반환
    RETURN json_build_object(
        'success', true,
        'student', json_build_object(
            'id', v_student.id,
            'name', v_student.name,
            'code', v_student.student_code,
            'classId', v_student.class_id,
            'className', v_student.class_name
        )
    );
EXCEPTION WHEN OTHERS THEN
    -- 에러 발생 시에도 우회 설정 해제
    PERFORM set_config('app.bypass_student_trigger', 'false', true);
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'auth';

-- 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
