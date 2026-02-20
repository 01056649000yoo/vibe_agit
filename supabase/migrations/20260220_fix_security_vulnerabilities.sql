-- ====================================================================
-- [보안 취약점 수정] student_id 위조 방지 + 포인트 안전 차감 RPC
-- 작성일: 2026-02-20
-- 수정 항목:
--   1. Comment_Insert: student_id가 본인(auth_id) 것인지 검증
--   2. Reaction_Insert: student_id가 본인(auth_id) 것인지 검증
--   3. spend_student_points RPC: 포인트 안전 차감 함수 (SECURITY DEFINER)
-- ====================================================================


-- ──────────────────────────────────────────────────────────────────
-- [수정 1] post_comments INSERT - student_id 위조 차단
-- ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Comment_Insert" ON public.post_comments;

CREATE POLICY "Comment_Insert" ON public.post_comments FOR INSERT WITH CHECK (
    is_admin()
    OR EXISTS (
        -- 삽입하려는 student_id가 실제로 현재 로그인한 사용자의 것인지 검증
        SELECT 1 FROM public.students s
        WHERE s.id = student_id
          AND s.auth_id = auth.uid()
          AND s.deleted_at IS NULL
    )
);


-- ──────────────────────────────────────────────────────────────────
-- [수정 2] post_reactions INSERT - student_id 위조 차단
-- ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Reaction_Insert" ON public.post_reactions;

CREATE POLICY "Reaction_Insert" ON public.post_reactions FOR INSERT WITH CHECK (
    is_admin()
    OR EXISTS (
        -- 삽입하려는 student_id가 실제로 현재 로그인한 사용자의 것인지 검증
        SELECT 1 FROM public.students s
        WHERE s.id = student_id
          AND s.auth_id = auth.uid()
          AND s.deleted_at IS NULL
    )
);

-- ──────────────────────────────────────────────────────────────────
-- [수정 3] post_reactions UPDATE - 본인 반응만 수정 가능하도록 강화
-- ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Reaction_Update" ON public.post_reactions;

CREATE POLICY "Reaction_Update" ON public.post_reactions FOR UPDATE USING (
    is_admin()
    OR EXISTS (
        SELECT 1 FROM public.students s
        WHERE s.id = student_id
          AND s.auth_id = auth.uid()
          AND s.deleted_at IS NULL
    )
);


-- ──────────────────────────────────────────────────────────────────
-- [수정 4] 포인트 안전 차감 RPC
--   - total_points를 직접 UPDATE하지 않고 이 함수를 통해서만 차감
--   - SECURITY DEFINER: RLS 우회로 내부 검증 후 처리
--   - 본인 학생 레코드만 차감 가능 (auth.uid() 검증)
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.spend_student_points(
    p_amount INTEGER,
    p_reason TEXT,
    p_pet_data JSONB DEFAULT NULL    -- 펫 데이터 동시 업데이트 (선택)
)
RETURNS JSON AS $$
DECLARE
    v_auth_id UUID;
    v_student RECORD;
    v_new_points INTEGER;
BEGIN
    v_auth_id := auth.uid();

    -- 1. 인증 확인
    IF v_auth_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', '인증되지 않은 요청입니다.');
    END IF;

    -- 2. 현재 학생 정보 조회 (FOR UPDATE로 동시성 보호)
    SELECT id, total_points
    INTO v_student
    FROM public.students
    WHERE auth_id = v_auth_id AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', '학생 정보를 찾을 수 없습니다.');
    END IF;

    -- 3. 포인트 충분한지 검증
    IF v_student.total_points < p_amount THEN
        RETURN json_build_object(
            'success', false,
            'error', '포인트가 부족합니다.',
            'current_points', v_student.total_points
        );
    END IF;

    v_new_points := v_student.total_points - p_amount;

    -- 4. 포인트 차감 (+ 선택적으로 펫 데이터도 동시 업데이트)
    IF p_pet_data IS NOT NULL THEN
        UPDATE public.students
        SET total_points = v_new_points,
            pet_data = p_pet_data
        WHERE id = v_student.id;
    ELSE
        UPDATE public.students
        SET total_points = v_new_points
        WHERE id = v_student.id;
    END IF;

    -- 5. 포인트 로그 기록
    INSERT INTO public.point_logs (student_id, amount, reason)
    VALUES (v_student.id, -p_amount, p_reason);

    -- 6. 성공 응답
    RETURN json_build_object(
        'success', true,
        'new_points', v_new_points,
        'deducted', p_amount
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 실행 권한 부여 (학생 anon 포함)
GRANT EXECUTE ON FUNCTION public.spend_student_points(INTEGER, TEXT, JSONB) TO anon, authenticated;


-- ──────────────────────────────────────────────────────────────────
-- 스키마 캐시 새로고침
-- ──────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ====================================================================
-- 완료! 🎉
-- ====================================================================
