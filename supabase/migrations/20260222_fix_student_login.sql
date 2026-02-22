-- ============================================================================
-- 🛡️ [긴급 수정] bind_student_auth / unbind_student_auth에 트리거 우회 추가
-- 작성일: 2026-02-22
--
-- 문제:
--   protect_student_sensitive_columns 트리거가 auth_id 변경을 차단합니다.
--   이 트리거는 학생(비교사/비관리자)이 auth_id를 직접 수정하는 것을 막지만,
--   bind_student_auth RPC도 auth_id를 변경하므로 함께 차단됩니다.
--   
--   트리거 내부에서 auth.uid()를 확인하면 익명 사용자(anon)로 나오므로
--   교사/관리자 조건을 통과하지 못합니다.
--
-- 해결:
--   bind_student_auth RPC 내부에서 'app.bypass_student_trigger' = 'true'를
--   설정하여 트리거를 안전하게 우회합니다.
--   (이미 spend_student_points, increment_student_points에서 같은 패턴 사용 중)
-- ============================================================================

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
    
    -- 3. 이미 다른 auth_id가 바인딩되어 있는 경우 처리
    IF v_student.auth_id IS NOT NULL AND v_student.auth_id != v_auth_id THEN
        NULL; -- 아래에서 덮어씁니다
    END IF;
    
    -- ★ [핵심] 트리거 우회 설정 (protect_student_sensitive_columns 통과)
    PERFORM set_config('app.bypass_student_trigger', 'true', true);
    
    -- 4. 현재 auth_id가 이미 다른 학생에게 바인딩되어 있는지 확인
    IF EXISTS (SELECT 1 FROM public.students WHERE auth_id = v_auth_id AND id != v_student.id AND deleted_at IS NULL) THEN
        UPDATE public.students SET auth_id = NULL WHERE auth_id = v_auth_id AND id != v_student.id;
    END IF;
    
    -- 5. auth_id 바인딩 업데이트
    UPDATE public.students SET auth_id = v_auth_id WHERE id = v_student.id;
    
    -- 트리거 우회 해제
    PERFORM set_config('app.bypass_student_trigger', 'false', true);
    
    -- 6. 성공 응답 반환
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


-- unbind_student_auth도 동일하게 수정
DROP FUNCTION IF EXISTS public.unbind_student_auth();
CREATE OR REPLACE FUNCTION public.unbind_student_auth()
RETURNS JSON AS $$
DECLARE
    v_auth_id UUID;
    v_student_id UUID;
BEGIN
    v_auth_id := auth.uid();
    
    IF v_auth_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', '인증되지 않은 요청입니다.');
    END IF;
    
    SELECT id INTO v_student_id
    FROM public.students
    WHERE auth_id = v_auth_id AND deleted_at IS NULL;
    
    IF v_student_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', '바인딩된 학생 정보가 없습니다.');
    END IF;
    
    -- ★ 트리거 우회 설정
    PERFORM set_config('app.bypass_student_trigger', 'true', true);
    
    UPDATE public.students SET auth_id = NULL WHERE id = v_student_id;
    
    -- 트리거 우회 해제
    PERFORM set_config('app.bypass_student_trigger', 'false', true);
    
    RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.bypass_student_trigger', 'false', true);
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'auth';


-- 권한 부여
GRANT EXECUTE ON FUNCTION public.bind_student_auth(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unbind_student_auth() TO anon, authenticated;

-- 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
