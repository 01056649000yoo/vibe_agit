-- ====================================================================
-- 🛡️ [보안 패치] 학생 민감 컬럼(포인트, 학급 등) 보호 트리거 추가
-- 작성일: 2026-02-22
--
-- 문제:
--   profiles 테이블의 RLS는 강화되었으나, students 테이블의 RLS 정책이
--   본인(학생)에게 모든 컬럼의 UPDATE를 허용하고 있어 total_points 직접 조작 가능
--
-- 해결:
--   1. students 테이블에 BEFORE UPDATE 트리거 추가
--   2. 관리자/담당 교사가 아닌 경우 total_points, class_id 등 민감 컬럼 수정 차단
--   3. 학생은 오직 자신의 프로필(이름, 펫 데이터 등)만 수정 가능하도록 제한
-- ====================================================================

CREATE OR REPLACE FUNCTION public.protect_student_sensitive_columns()
RETURNS TRIGGER AS $$
DECLARE
    v_caller_id UUID;
    v_is_admin BOOLEAN := false;
    v_is_teacher BOOLEAN := false;
BEGIN
    v_caller_id := auth.uid();

    -- Service role (auth.uid() IS NULL) 호출은 항상 허용 (서버/마이그레이션)
    IF v_caller_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- 1. 관리자 여부 확인
    SELECT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = v_caller_id AND role = 'ADMIN'
    ) INTO v_is_admin;

    IF v_is_admin THEN
        RETURN NEW;
    END IF;

    -- 2. 담당 교사 여부 확인
    -- (현재 소속 학급의 담당 교사인지 확인)
    SELECT EXISTS (
        SELECT 1 FROM public.classes 
        WHERE id = OLD.class_id AND teacher_id = v_caller_id
    ) INTO v_is_teacher;

    IF v_is_teacher THEN
        RETURN NEW;
    END IF;

    -- 3. 학생(본인)인 경우 검증
    -- RLS 세팅 상 auth_id가 일치하는 경우에만 도달함
    IF NEW.auth_id IS DISTINCT FROM OLD.auth_id THEN
        RAISE EXCEPTION '[보안] 인증 정보(auth_id)는 직접 수정할 수 없습니다.'
            USING ERRCODE = '42501';
    END IF;

    IF NEW.total_points IS DISTINCT FROM OLD.total_points THEN
        RAISE EXCEPTION '[보안] 포인트(total_points)는 직접 수정할 수 없습니다. 지정된 활동이나 RPC를 이용하세요.'
            USING ERRCODE = '42501';
    END IF;

    IF NEW.class_id IS DISTINCT FROM OLD.class_id THEN
        RAISE EXCEPTION '[보안] 학급 정보(class_id)는 직접 수정할 수 없습니다.'
            USING ERRCODE = '42501';
    END IF;

    IF NEW.student_code IS DISTINCT FROM OLD.student_code THEN
        RAISE EXCEPTION '[보안] 학생 코드(student_code)는 직접 수정할 수 없습니다.'
            USING ERRCODE = '42501';
    END IF;

    -- 추가: 이름 변경도 교사가 하는 것이 바람직할 수 있으나, 
    -- 정책에 따라 허용할 수도 있음. 여기서는 일단 허용 (필요시 차단 가능)

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 트리거 등록
DROP TRIGGER IF EXISTS trg_protect_student_columns ON public.students;
CREATE TRIGGER trg_protect_student_columns
    BEFORE UPDATE ON public.students
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_student_sensitive_columns();

-- 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
