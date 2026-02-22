-- ====================================================================
-- [보안 패치] SECURITY DEFINER RPC 소유권 검증 추가
-- 작성일: 2026-02-22
--
-- 문제점:
--   SECURITY DEFINER 함수들은 RLS를 우회하므로, 함수 내부에서
--   요청자가 해당 학생/학급의 소유자인지 검증하지 않으면
--   다른 교사의 학생 데이터에 접근/조작 가능한 취약점 존재
--
-- 수정 대상:
--   1. increment_student_points — 교사 소유권 또는 학생 본인 검증
--   2. teacher_manage_points — 교사 소유권 검증
--   3. add_student_with_bonus — 학급 소유권 검증
--   4. mark_feedback_as_read — 학생 본인 검증
--   5. update_tower_max_floor — 학생 본인 검증
-- ====================================================================


-- ──────────────────────────────────────────────────────────────────
-- [수정 1] increment_student_points — 소유권 검증 추가
--
-- 허용 조건:
--   - 관리자(ADMIN)
--   - 해당 학생이 속한 학급의 담당 교사
--   - 해당 학생 본인 (auth_id 일치)
-- ──────────────────────────────────────────────────────────────────

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

    -- 포인트 업데이트
    UPDATE public.students
    SET total_points = COALESCE(total_points, 0) + p_amount
    WHERE id = p_student_id;

    -- 로그 기록
    INSERT INTO public.point_logs (student_id, reason, amount, post_id, mission_id)
    VALUES (p_student_id, p_reason, p_amount, p_post_id, p_mission_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ──────────────────────────────────────────────────────────────────
-- [수정 2] teacher_manage_points — 교사 소유권 검증 추가
--
-- 허용 조건:
--   - 관리자(ADMIN)
--   - 해당 학생이 속한 학급의 담당 교사
-- ──────────────────────────────────────────────────────────────────

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
        RAISE EXCEPTION '[보안] 해당 학생의 포인트를 관리할 권한이 없습니다. 본인 학급의 학생만 관리할 수 있습니다.'
            USING ERRCODE = '42501';
    END IF;

    -- 1. 학생 포인트 업데이트
    UPDATE public.students
    SET total_points = COALESCE(total_points, 0) + points_amount
    WHERE id = target_student_id;

    -- 2. 포인트 로그 기록
    INSERT INTO public.point_logs (student_id, reason, amount)
    VALUES (target_student_id, reason_text, points_amount);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ──────────────────────────────────────────────────────────────────
-- [수정 3] add_student_with_bonus — 학급 소유권 검증 추가
--
-- 허용 조건:
--   - 관리자(ADMIN)
--   - 해당 학급의 담당 교사
-- ──────────────────────────────────────────────────────────────────

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
        v_is_authorized := true;
    ELSE
        -- 관리자 확인
        SELECT EXISTS (
            SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role = 'ADMIN'
        ) INTO v_is_authorized;

        -- 관리자가 아니면 학급 소유권 확인
        IF NOT v_is_authorized THEN
            SELECT EXISTS (
                SELECT 1 FROM public.classes
                WHERE id = p_class_id
                  AND teacher_id = v_caller_id
                  AND deleted_at IS NULL
            ) INTO v_is_authorized;
        END IF;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION '[보안] 해당 학급에 학생을 추가할 권한이 없습니다. 본인 학급에만 학생을 추가할 수 있습니다.'
            USING ERRCODE = '42501';
    END IF;

    -- 1. 학생 추가
    INSERT INTO public.students (class_id, name, student_code, total_points)
    VALUES (p_class_id, p_name, p_student_code, p_initial_points)
    RETURNING id INTO new_student_id;

    -- 2. 환영 포인트 로그 기록
    INSERT INTO public.point_logs (student_id, reason, amount)
    VALUES (new_student_id, '신규 등록 기념 환영 포인트! 🎁', p_initial_points);

    RETURN new_student_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ──────────────────────────────────────────────────────────────────
-- [수정 4] mark_feedback_as_read — 학생 본인 검증 추가
--
-- 허용 조건:
--   - 관리자(ADMIN)
--   - 해당 학생 본인 (auth_id 일치)
--   - 해당 학생의 담당 교사
-- ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mark_feedback_as_read(p_student_id UUID)
RETURNS void AS $$
DECLARE
    v_caller_id UUID;
    v_is_authorized BOOLEAN := false;
BEGIN
    v_caller_id := auth.uid();

    IF v_caller_id IS NULL THEN
        v_is_authorized := true;
    ELSE
        -- 관리자 확인
        SELECT EXISTS (
            SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role = 'ADMIN'
        ) INTO v_is_authorized;

        -- 관리자가 아니면 본인 또는 담당 교사인지 확인
        IF NOT v_is_authorized THEN
            SELECT EXISTS (
                SELECT 1 FROM public.students s
                LEFT JOIN public.classes c ON c.id = s.class_id
                WHERE s.id = p_student_id
                  AND s.deleted_at IS NULL
                  AND (s.auth_id = v_caller_id OR c.teacher_id = v_caller_id)
            ) INTO v_is_authorized;
        END IF;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION '[보안] 해당 학생의 알림 상태를 변경할 권한이 없습니다.'
            USING ERRCODE = '42501';
    END IF;

    UPDATE public.students
    SET last_feedback_check = timezone('utc'::text, now())
    WHERE id = p_student_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ──────────────────────────────────────────────────────────────────
-- [수정 5] update_tower_max_floor — 학생 본인 검증 추가
--
-- 허용 조건:
--   - 관리자(ADMIN)
--   - 해당 학생 본인 (auth_id 일치)
--   - 해당 학생의 담당 교사
-- ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_tower_max_floor(
    p_student_id UUID,
    p_class_id UUID,
    p_floor INTEGER
)
RETURNS void AS $$
DECLARE
    v_caller_id UUID;
    v_is_authorized BOOLEAN := false;
BEGIN
    v_caller_id := auth.uid();

    IF v_caller_id IS NULL THEN
        v_is_authorized := true;
    ELSE
        -- 관리자 확인
        SELECT EXISTS (
            SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role = 'ADMIN'
        ) INTO v_is_authorized;

        -- 관리자가 아니면 본인 또는 담당 교사인지 확인
        IF NOT v_is_authorized THEN
            SELECT EXISTS (
                SELECT 1 FROM public.students s
                JOIN public.classes c ON c.id = s.class_id
                WHERE s.id = p_student_id
                  AND s.class_id = p_class_id
                  AND s.deleted_at IS NULL
                  AND (s.auth_id = v_caller_id OR c.teacher_id = v_caller_id)
            ) INTO v_is_authorized;
        END IF;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION '[보안] 해당 학생의 랭킹을 변경할 권한이 없습니다.'
            USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.vocab_tower_rankings (student_id, class_id, max_floor, updated_at)
    VALUES (p_student_id, p_class_id, p_floor, now())
    ON CONFLICT (student_id)
    DO UPDATE SET
        max_floor = GREATEST(vocab_tower_rankings.max_floor, EXCLUDED.max_floor),
        updated_at = now()
    WHERE vocab_tower_rankings.max_floor < EXCLUDED.max_floor;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ──────────────────────────────────────────────────────────────────
-- 스키마 캐시 새로고침
-- ──────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';


-- ====================================================================
-- 완료! 🛡️
--
-- 수정된 함수별 권한 검증 요약:
--
--   함수명                      | 허용 대상
--   ----------------------------+-----------------------------------
--   increment_student_points    | ADMIN, 담당 교사, 학생 본인
--   teacher_manage_points       | ADMIN, 담당 교사
--   add_student_with_bonus      | ADMIN, 학급 소유 교사
--   mark_feedback_as_read       | ADMIN, 담당 교사, 학생 본인
--   update_tower_max_floor      | ADMIN, 담당 교사, 학생 본인
--
-- 적용 후 검증 방법:
--   1. 교사 A 계정으로 로그인
--   2. 브라우저 콘솔에서 교사 B의 학생 UUID로 RPC 호출:
--      await supabase.rpc('increment_student_points', {
--        p_student_id: '교사B_학생_UUID', p_amount: 100
--      })
--   3. 에러 발생 확인: "[보안] 해당 학생의 포인트를 변경할 권한이 없습니다"
-- ====================================================================
