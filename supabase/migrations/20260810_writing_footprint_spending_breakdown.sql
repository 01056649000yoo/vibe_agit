-- ============================================================================
-- 나의 글쓰기 발자국 — 자발적 포인트 사용처 집계
--
-- point_logs 의 음수에는 학생이 직접 쓴 포인트뿐 아니라 승인 취소·교사 회수도 섞여 있다.
-- 사용처에는 게임/꾸미기 활동만 포함하고, 행정성 차감은 별도 합계로 분리한다.
-- 신규 놀이 activity_type 은 행정 유형이 아닌 한 이 집계에 자동 포함된다.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_point_spending_breakdown()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID;
    v_result JSONB;
BEGIN
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT class_id
    INTO v_class_id
    FROM public.students
    WHERE id = v_student_id;

    WITH negative_points AS (
        SELECT l.amount, l.activity_type
        FROM public.point_logs l
        WHERE l.class_id = v_class_id
          AND l.student_id = v_student_id
          AND l.amount < 0
    ), voluntary_spending AS (
        SELECT amount, activity_type
        FROM negative_points
        WHERE activity_type NOT IN ('writing_reward', 'private_adjustment', 'starting_bonus')
    )
    SELECT jsonb_build_object(
        'total_used', COALESCE((SELECT -sum(amount) FROM voluntary_spending), 0),
        'total_adjusted', COALESCE((
            SELECT -sum(amount)
            FROM negative_points
            WHERE activity_type IN ('writing_reward', 'private_adjustment', 'starting_bonus')
        ), 0),
        'by_type', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object('type', activity_type, 'total', total)
                ORDER BY total DESC
            )
            FROM (
                SELECT activity_type, -sum(amount)::INTEGER AS total
                FROM voluntary_spending
                GROUP BY activity_type
            ) grouped
        ), '[]'::JSONB)
    )
    INTO v_result;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_point_spending_breakdown() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_point_spending_breakdown() TO authenticated, service_role;

COMMIT;
