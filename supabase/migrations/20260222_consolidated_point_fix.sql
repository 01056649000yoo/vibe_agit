-- ====================================================================
-- 🛡️ [포인트 시스템 마스터 패치] 보안 트리거 및 RPC 완벽 연동
-- 작성일: 2026-02-22
--
-- 문제:
--   1. 여러 설정 파일이 충돌하여 포인트 보호 트리거에 우회 로직이 누락됨
--   2. RPC 호출 시 트리거가 차단하여 400/403 에러 유발
--
-- 해결:
--   1. protect_student_sensitive_columns 트리거 함수에 확실한 우회 로직 적용
--   2. trg_protect_student_columns 트리거 재등록
--   3. spend_student_points 및 increment_student_points RPC 재정의
--   4. 에러 메시지에 상세 정보(Attempted)를 포함하여 디버깅 용이성 확보
-- ====================================================================

-- 1. 트리거 함수 재정의 (우회 로직 포함)
CREATE OR REPLACE FUNCTION public.protect_student_sensitive_columns()
RETURNS TRIGGER AS $$
DECLARE
    v_caller_id UUID;
    v_is_admin BOOLEAN := false;
    v_is_teacher BOOLEAN := false;
    v_bypass BOOLEAN := false;
BEGIN
    -- [보안 핵심] 세션 우회 변수 확인 (RPC 내부에서 설정 가능)
    BEGIN
        v_bypass := current_setting('app.bypass_student_trigger', true) = 'true';
    EXCEPTION WHEN OTHERS THEN
        v_bypass := false;
    END;

    -- 우회 설정 시 즉시 통과
    IF v_bypass THEN
        RETURN NEW;
    END IF;

    v_caller_id := auth.uid();

    -- Service role (auth.uid() IS NULL) 호출은 항상 허용 (서버/마이그레이션)
    IF v_caller_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- [1단계] 관리자 여부 확인
    SELECT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = v_caller_id AND role = 'ADMIN'
    ) INTO v_is_admin;

    IF v_is_admin THEN
        RETURN NEW;
    END IF;

    -- [2단계] 담당 교사 여부 확인
    SELECT EXISTS (
        SELECT 1 FROM public.classes 
        WHERE id = OLD.class_id AND teacher_id = v_caller_id
    ) INTO v_is_teacher;

    IF v_is_teacher THEN
        RETURN NEW;
    END IF;

    -- [3단계] 학생(본인)인 경우 민감 컬럼 수정 제한
    IF NEW.total_points IS DISTINCT FROM OLD.total_points THEN
        RAISE EXCEPTION '[보안] 포인트(total_points)는 직접 수정할 수 없습니다. (Attempted: % -> %) 지정된 RPC를 이용하세요.', 
            OLD.total_points, NEW.total_points
            USING ERRCODE = '42501';
    END IF;

    IF NEW.auth_id IS DISTINCT FROM OLD.auth_id OR 
       NEW.class_id IS DISTINCT FROM OLD.class_id OR 
       NEW.student_code IS DISTINCT FROM OLD.student_code THEN
        RAISE EXCEPTION '[보안] 민감한 계정 정보는 직접 수정할 수 없습니다.'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 2. 트리거 확실하게 재등록 (동명 트리거 삭제 후 재생성)
DROP TRIGGER IF EXISTS trg_protect_student_columns ON public.students;
CREATE TRIGGER trg_protect_student_columns
    BEFORE UPDATE ON public.students
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_student_sensitive_columns();


-- 3. spend_student_points RPC 재정의 (우회 로직 강화)
CREATE OR REPLACE FUNCTION public.spend_student_points(
    p_amount INTEGER,
    p_reason TEXT,
    p_pet_data JSONB DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_auth_id UUID := auth.uid();
    v_student_id UUID;
    v_current_points INTEGER;
BEGIN
    -- 인증 확인
    IF v_auth_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', '인증되지 않은 요청입니다.');
    END IF;

    -- 학생 정보 조회 (FOR UPDATE로 동기화)
    SELECT id, total_points INTO v_student_id, v_current_points
    FROM public.students
    WHERE auth_id = v_auth_id AND deleted_at IS NULL
    FOR UPDATE;

    IF v_student_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', '학생 정보를 찾을 수 없습니다.');
    END IF;

    -- 포인트 검증 (0포인트 소모는 허용 - 장착 등)
    IF v_current_points < p_amount THEN
        RETURN json_build_object('success', false, 'error', '포인트가 부족합니다.', 'current_points', v_current_points);
    END IF;

    -- [핵심] 트리거 우회 설정 (이 변수가 설정되어야 protect_student_sensitive_columns가 통과됨)
    PERFORM set_config('app.bypass_student_trigger', 'true', true);

    -- 데이터 업데이트
    UPDATE public.students
    SET total_points = total_points - p_amount,
        pet_data = COALESCE(p_pet_data, pet_data)
    WHERE id = v_student_id;

    -- 로그 기록 (0포인트 소모 시에도 기록할지 여부는 정책에 따라 선택, 여기서는 0보다 클 때만 기록하거나 사유가 있으면 기록)
    IF p_amount != 0 OR p_reason IS NOT NULL THEN
        INSERT INTO public.point_logs (student_id, amount, reason)
        VALUES (v_student_id, -p_amount, COALESCE(p_reason, '포인트 사용 💰'));
    END IF;

    -- 우회 설정 해제
    PERFORM set_config('app.bypass_student_trigger', 'false', true);

    RETURN json_build_object('success', true, 'new_points', v_current_points - p_amount);
EXCEPTION WHEN OTHERS THEN
    -- 에러 발생 시 우회 설정 해제 후 다시 던짐
    PERFORM set_config('app.bypass_student_trigger', 'false', true);
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';


-- 4. increment_student_points RPC 재정의
CREATE OR REPLACE FUNCTION public.increment_student_points(
    p_student_id UUID,
    p_amount INTEGER,
    p_reason TEXT DEFAULT '포인트 보상 🎁',
    p_post_id UUID DEFAULT NULL,
    p_mission_id UUID DEFAULT NULL
)
RETURNS void AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_is_authorized BOOLEAN := false;
BEGIN
    -- 권한 확인
    IF v_caller_id IS NULL THEN
        v_is_authorized := true; -- 서버 호출
    ELSE
        SELECT EXISTS (
            SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role = 'ADMIN'
        ) INTO v_is_authorized;

        IF NOT v_is_authorized THEN
            SELECT EXISTS (
                SELECT 1 FROM public.students s
                JOIN public.classes c ON c.id = s.class_id
                WHERE s.id = p_student_id
                  AND (c.teacher_id = v_caller_id OR s.auth_id = v_caller_id)
                  AND s.deleted_at IS NULL
            ) INTO v_is_authorized;
        END IF;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION '[보안] 포인트를 변경할 권한이 없습니다.'
            USING ERRCODE = '42501';
    END IF;

    -- [핵심] 트리거 우회 설정
    PERFORM set_config('app.bypass_student_trigger', 'true', true);

    -- 포인트 업데이트
    UPDATE public.students
    SET total_points = COALESCE(total_points, 0) + p_amount
    WHERE id = p_student_id;

    -- 로그 기록
    INSERT INTO public.point_logs (student_id, reason, amount, post_id, mission_id)
    VALUES (p_student_id, p_reason, p_amount, p_post_id, p_mission_id);

    -- 우회 설정 해제
    PERFORM set_config('app.bypass_student_trigger', 'false', true);
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.bypass_student_trigger', 'false', true);
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 권한 부여
GRANT EXECUTE ON FUNCTION public.spend_student_points(INTEGER, TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_student_points(UUID, INTEGER, TEXT, UUID, UUID) TO anon, authenticated;

-- 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
