-- ============================================================
-- 🛡️ [보안 수정] NULL 인증 우회 취약점 수정
-- 작성일: 2026-03-16
-- 설명: auth.uid() IS NULL일 때 무조건 허용하던 패턴을
--       service_role인 경우에만 허용하도록 변경
-- ============================================================

-- [1] increment_student_points
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
        -- service_role(서버 내부 호출)만 허용, anon 차단
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
    UPDATE public.students SET total_points = COALESCE(total_points, 0) + p_amount WHERE id = p_student_id;
    INSERT INTO public.point_logs (student_id, reason, amount, post_id, mission_id) VALUES (p_student_id, p_reason, p_amount, p_post_id, p_mission_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- [2] update_tower_max_floor
CREATE OR REPLACE FUNCTION public.update_tower_max_floor(p_student_id UUID, p_class_id UUID, p_floor INTEGER)
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
                SELECT 1 FROM public.students s JOIN public.classes c ON c.id = s.class_id
                WHERE s.id = p_student_id AND s.class_id = p_class_id AND s.deleted_at IS NULL
                  AND (s.auth_id = v_caller_id OR c.teacher_id = v_caller_id)
            ) INTO v_is_authorized;
        END IF;
    END IF;
    IF NOT v_is_authorized THEN
        RAISE EXCEPTION '[보안] 해당 학생의 랭킹을 변경할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.vocab_tower_rankings (student_id, class_id, max_floor, updated_at)
    VALUES (p_student_id, p_class_id, p_floor, now())
    ON CONFLICT (student_id)
    DO UPDATE SET
        max_floor = GREATEST(vocab_tower_rankings.max_floor, EXCLUDED.max_floor),
        updated_at = now()
    WHERE vocab_tower_rankings.max_floor < EXCLUDED.max_floor;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- [3] mark_feedback_as_read
CREATE OR REPLACE FUNCTION public.mark_feedback_as_read(p_student_id UUID)
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
                SELECT 1 FROM public.students s LEFT JOIN public.classes c ON c.id = s.class_id
                WHERE s.id = p_student_id AND s.deleted_at IS NULL
                  AND (s.auth_id = v_caller_id OR c.teacher_id = v_caller_id)
            ) INTO v_is_authorized;
        END IF;
    END IF;
    IF NOT v_is_authorized THEN
        RAISE EXCEPTION '[보안] 해당 학생의 알림 상태를 변경할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;
    UPDATE public.students SET last_feedback_check = timezone('utc'::text, now()) WHERE id = p_student_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- [4] teacher_manage_points
CREATE OR REPLACE FUNCTION public.teacher_manage_points(
    target_student_id UUID,
    points_amount INTEGER,
    reason_text TEXT
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
                SELECT 1 FROM public.students s JOIN public.classes c ON c.id = s.class_id
                WHERE s.id = target_student_id AND c.teacher_id = v_caller_id AND s.deleted_at IS NULL
            ) INTO v_is_authorized;
        END IF;
    END IF;
    IF NOT v_is_authorized THEN
        RAISE EXCEPTION '[보안] 해당 학생의 포인트를 관리할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;
    UPDATE public.students SET total_points = COALESCE(total_points, 0) + points_amount WHERE id = target_student_id;
    INSERT INTO public.point_logs (student_id, reason, amount) VALUES (target_student_id, reason_text, points_amount);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- [5] add_student_with_bonus
CREATE OR REPLACE FUNCTION public.add_student_with_bonus(
    p_class_id UUID,
    p_name TEXT,
    p_student_code TEXT,
    p_initial_points INTEGER DEFAULT 100
)
RETURNS UUID AS $$
DECLARE
    v_caller_id UUID;
    v_is_authorized BOOLEAN := false;
    new_student_id UUID;
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
                SELECT 1 FROM public.classes WHERE id = p_class_id AND teacher_id = v_caller_id AND deleted_at IS NULL
            ) INTO v_is_authorized;
        END IF;
    END IF;
    IF NOT v_is_authorized THEN
        RAISE EXCEPTION '[보안] 해당 학급에 학생을 추가할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.students (class_id, name, student_code, total_points)
    VALUES (p_class_id, p_name, p_student_code, p_initial_points)
    RETURNING id INTO new_student_id;
    INSERT INTO public.point_logs (student_id, reason, amount)
    VALUES (new_student_id, '신규 등록 기념 환영 포인트! 🎁', p_initial_points);
    RETURN new_student_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 스키마 캐시 새로고침
NOTIFY pgrst, 'reload schema';
