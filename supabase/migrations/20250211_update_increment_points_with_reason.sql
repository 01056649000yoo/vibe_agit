-- increment_student_points RPC에 reason 파라미터 추가
-- 기존 호출(2인자)과의 호환성을 위해 기본값 설정
CREATE OR REPLACE FUNCTION public.increment_student_points(
    student_id UUID,
    points_to_add INTEGER,
    log_reason TEXT DEFAULT '포인트 보상 🎁'
)
RETURNS void AS $$
BEGIN
    -- 1. 학생의 총 포인트 업데이트
    UPDATE public.students
    SET total_points = COALESCE(total_points, 0) + points_to_add
    WHERE id = student_id;

    -- 2. 포인트 로그 기록 추가 (호출 시 전달받은 reason 사용)
    INSERT INTO public.point_logs (student_id, reason, amount)
    VALUES (student_id, log_reason, points_to_add);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
