-- [1] increment_student_points 수정 (마이너스 방지)
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
    IF v_caller_id IS NULL THEN
        IF current_setting('role') = 'service_role' THEN
            v_is_authorized := true;
        END IF;
    ELSE
        SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role = 'ADMIN') INTO v_is_authorized;
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
        RAISE EXCEPTION '[보안] 해당 학생의 포인트를 변경할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    UPDATE public.students 
    SET total_points = GREATEST(0, COALESCE(total_points, 0) + p_amount) 
    WHERE id = p_student_id;

    INSERT INTO public.point_logs (student_id, reason, amount, post_id, mission_id) 
    VALUES (p_student_id, p_reason, p_amount, p_post_id, p_mission_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- [2] teacher_manage_points 수정 (회수 시 잔액 체크)
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
        IF current_setting('role') = 'service_role' THEN
            v_is_authorized := true;
        END IF;
    ELSE
        SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role = 'ADMIN') INTO v_is_authorized;
        IF NOT v_is_authorized THEN
            SELECT EXISTS (
                SELECT 1 FROM public.students s JOIN public.classes c ON c.id = s.class_id
                WHERE s.id = target_student_id AND c.teacher_id = v_caller_id AND s.deleted_at IS NULL
            ) INTO v_is_authorized;
        END IF;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION '[보안] 해당 학생의 포인트를 관리할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(total_points, 0) INTO v_current_points FROM public.students WHERE id = target_student_id;
    
    -- 마이너스(-) 포인트 회수 시 잔액보다 많이 회수하려 하면 에러
    IF points_amount < 0 AND (v_current_points + points_amount) < 0 THEN
        RAISE EXCEPTION '보유 포인트보다 더 많이 회수할 수 없습니다. (현재: % P, 회수 시도: % P)', 
            v_current_points, ABS(points_amount) 
            USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.students 
    SET total_points = GREATEST(0, COALESCE(total_points, 0) + points_amount) 
    WHERE id = target_student_id;

    INSERT INTO public.point_logs (student_id, reason, amount) VALUES (target_student_id, reason_text, points_amount);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- [3] spend_student_points 수정 (방어적 0 하한선 추가)
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
    IF v_auth_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', '인증되지 않은 요청입니다.');
    END IF;

    SELECT id, total_points INTO v_student_id, v_current_points
    FROM public.students
    WHERE auth_id = v_auth_id AND deleted_at IS NULL
    FOR UPDATE;

    IF v_student_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', '학생 정보를 찾을 수 없습니다.');
    END IF;

    IF v_current_points < p_amount THEN
        RETURN json_build_object('success', false, 'error', '포인트가 부족합니다.', 'current_points', v_current_points);
    END IF;

    PERFORM set_config('app.bypass_student_trigger', 'true', true);

    UPDATE public.students
    SET total_points = GREATEST(0, total_points - p_amount), -- 방어적 GREATEST 적용
        pet_data = COALESCE(p_pet_data, pet_data)
    WHERE id = v_student_id;

    IF p_amount != 0 OR p_reason IS NOT NULL THEN
        INSERT INTO public.point_logs (student_id, amount, reason)
        VALUES (v_student_id, -p_amount, COALESCE(p_reason, '포인트 사용 💰'));
    END IF;

    PERFORM set_config('app.bypass_student_trigger', 'false', true);

    RETURN json_build_object('success', true, 'new_points', GREATEST(0, v_current_points - p_amount));
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.bypass_student_trigger', 'false', true);
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

NOTIFY pgrst, 'reload schema';

