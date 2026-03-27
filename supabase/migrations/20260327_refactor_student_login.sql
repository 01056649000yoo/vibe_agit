-- ==============================================================================
-- [보안 고도화] 학생 코드 로그인 고도화: auth_id 바인딩 및 메타데이터 주입
-- 작성일: 2026-03-27
-- 설명: 학생이 8자리 코드로 로그인할 때, students 테이블에 auth_id를 연결하고
--       동시에 auth.users의 app_metadata에 role과 class_id를 주입합니다.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.bind_student_auth(
    p_student_code TEXT
)
RETURNS JSON AS $$
DECLARE
    v_student RECORD;
    v_auth_id UUID;
    v_target_class_id UUID;
BEGIN
    -- 현재 로그인한 유저의 ID 가져오기 (signInAnonymously 호출 후 세션 상태)
    v_auth_id := auth.uid();
    
    -- 1. 인증되지 않은 요청 거부
    IF v_auth_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', '인증되지 않은 요청입니다.');
    END IF;
    
    -- 2. 학생 코드로 학생 조회 (대소문자 구분 없이 입력 대응)
    SELECT s.id, s.name, s.student_code, s.class_id, s.auth_id, c.name AS class_name
    INTO v_student
    FROM public.students s
    LEFT JOIN public.classes c ON s.class_id = c.id
    WHERE UPPER(s.student_code) = UPPER(p_student_code) AND s.deleted_at IS NULL;
    
    -- 2-1. 코드가 존재하지 않는 경우
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', '코드가 일치하는 학생을 찾을 수 없습니다.');
    END IF;

    -- 2-2. 이미 다른 auth_id에 가로채기(바인딩)된 코드인지 확인
    -- 다른 유저가 이미 이 코드를 선점한 경우 보안을 위해 요청 거부
    IF v_student.auth_id IS NOT NULL AND v_student.auth_id != v_auth_id THEN
        RETURN json_build_object('success', false, 'error', '이미 다른 기기(계정)에서 사용 중인 코드입니다.');
    END IF;
    
    -- 3. 중복 바인딩 방지 처리 (Atomicity 보장)
    -- 현재 세션(auth_id)이 이전에 다른 학생 코드에 묶여있었다면 이를 해제
    UPDATE public.students 
    SET auth_id = NULL 
    WHERE auth_id = v_auth_id AND id != v_student.id;
    
    -- 4. 대상 학생 레코드에 auth_id 바인딩 업데이트
    UPDATE public.students 
    SET auth_id = v_auth_id 
    WHERE id = v_student.id;
    
    -- 5. [수정] auth.users 메타데이터 주입 로직 제거 
    -- (Edge Function: set-student-metadata에서 처리하도록 변경됨)
    
    -- 6. 성공 결과 반환
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
    -- 예외 발생 시 에러 메시지 반환
    RETURN json_build_object('success', false, 'error', '서버 처리 중 오류가 발생했습니다: ' || SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'auth';

-- 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';

-- [검증 쿼리 가이드]
-- 1) 학생 코드 바인딩 확인:
--    SELECT name, student_code, auth_id FROM public.students WHERE student_code = '입력한코드';
--
-- 2) auth.users 메타데이터 주입 확인 (해당 auth_id로):
--    SELECT id, email, raw_app_meta_data FROM auth.users WHERE id = '방금전_auth_id';
