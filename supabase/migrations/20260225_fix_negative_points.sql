-- ====================================================================
-- 💰 [포인트 마이너스 방지 패치]
-- 작성일: 2026-02-25
--
-- 문제:
--   교사의 포인트 관리 또는 특정 보상 시스템에서 포인트가 차감될 때,
--   보유 포인트보다 더 많이 차감되어 마이너스(-)가 발생하는 현상.
--
-- 해결:
--   1. increment_student_points RPC: 차감 시 0 이하로 내려가지 않도록 GREATEST 적용
--   2. teacher_manage_points RPC: 보유 포인트보다 많은 금액 회수 시 에러 발생
-- ====================================================================

-- 1. increment_student_points — 소유권 검증 및 마이너스 방지
CREATE OR REPLACE FUNCTION public.increment_student_points(
    p_student_id UUID,
    p_amount INTEGER,
    p_reason TEXT DEFAULT '포인트 보상 🎁',
    p_post_id UUID DEFAULT NULL,
    p_mission_id UUID DEFAULT NULL
)
RETURNS void AS $$
DECLARE
    v_caller_id UUID;
    v_is_authorized BOOLEAN := false;
BEGIN
    v_caller_id := auth.uid();

    -- Service role (서버 호출)은 항상 허용
    IF v_caller_id IS NULL THEN
        v_is_authorized := true;
    ELSE
        -- 관리자 확인
        SELECT EXISTS (
            SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role = 'ADMIN'
        ) INTO v_is_authorized;

        -- 관리자가 아니면 소유권 확인
        IF NOT v_is_authorized THEN
            SELECT EXISTS (
                -- 해당 학생이 속한 학급의 담당 교사인지 확인
                SELECT 1 FROM public.students s
                JOIN public.classes c ON c.id = s.class_id
                WHERE s.id = p_student_id
                  AND (c.teacher_id = v_caller_id OR s.auth_id = v_caller_id)
                  AND s.deleted_at IS NULL
            ) INTO v_is_authorized;
        END IF;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION '[보안] 해당 학생의 포인트를 변경할 권한이 없습니다.'
            USING ERRCODE = '42501';
    END IF;

    -- [보안 핵심] 트리거 우회 설정
    PERFORM set_config('app.bypass_student_trigger', 'true', true);

    -- 포인트 업데이트 (0 이하로 내려가지 않도록 보호)
    UPDATE public.students
    SET total_points = GREATEST(0, COALESCE(total_points, 0) + p_amount)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. teacher_manage_points — 교사 소유권 검증 및 마이너스 차단 (에러 발생)
CREATE OR REPLACE FUNCTION public.teacher_manage_points(
    target_student_id UUID,
    points_amount INTEGER,
    reason_text TEXT
)
RETURNS void AS $$
DECLARE
    v_caller_id UUID;
    v_is_authorized BOOLEAN := false;
    v_current_points INTEGER;
BEGIN
    v_caller_id := auth.uid();

    IF v_caller_id IS NULL THEN
        v_is_authorized := true;
    ELSE
        -- 관리자 확인
        SELECT EXISTS (
            SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role = 'ADMIN'
        ) INTO v_is_authorized;

        -- 관리자가 아니면 학급 소유권 확인
        IF NOT v_is_authorized THEN
            SELECT EXISTS (
                SELECT 1 FROM public.students s
                JOIN public.classes c ON c.id = s.class_id
                WHERE s.id = target_student_id
                  AND c.teacher_id = v_caller_id
                  AND s.deleted_at IS NULL
            ) INTO v_is_authorized;
        END IF;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION '[보안] 해당 학생의 포인트를 관리할 권한이 없습니다.'
            USING ERRCODE = '42501';
    END IF;

    -- 현재 포인트 조회 (차감 가능 여부 확인)
    SELECT total_points INTO v_current_points
    FROM public.students
    WHERE id = target_student_id;

    -- 포인트 차감 시 보유량보다 많은 경우 에러 발생
    IF points_amount < 0 AND (v_current_points + points_amount) < 0 THEN
        RAISE EXCEPTION '포인트가 부족하여 회수할 수 없습니다. (현재: % P, 회수 시도: % P)', 
            v_current_points, ABS(points_amount)
            USING ERRCODE = '42501';
    END IF;

    -- [보안 핵심] 트리거 우회 설정
    PERFORM set_config('app.bypass_student_trigger', 'true', true);

    -- 1. 학생 포인트 업데이트
    UPDATE public.students
    SET total_points = GREATEST(0, COALESCE(total_points, 0) + points_amount)
    WHERE id = target_student_id;

    -- 2. 포인트 로그 기록
    INSERT INTO public.point_logs (student_id, reason, amount)
    VALUES (target_student_id, reason_text, points_amount);

    -- 우회 설정 해제
    PERFORM set_config('app.bypass_student_trigger', 'false', true);
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.bypass_student_trigger', 'false', true);
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 권한 부여
GRANT EXECUTE ON FUNCTION public.increment_student_points(UUID, INTEGER, TEXT, UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_manage_points(UUID, INTEGER, TEXT) TO authenticated;

-- 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
