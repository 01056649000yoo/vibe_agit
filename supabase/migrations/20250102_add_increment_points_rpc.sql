-- 학생 포인트를 증가시키고 로그를 남기는 RPC 함수
CREATE OR REPLACE FUNCTION public.increment_student_points(student_id UUID, points_to_add INTEGER)
RETURNS void AS $$
BEGIN
    -- 1. 학생의 총 포인트 업데이트
    UPDATE public.students
    SET total_points = COALESCE(total_points, 0) + points_to_add
    WHERE id = student_id;

    -- 2. 포인트 로그 기록 추가 (amount 컬럼 사용)
    INSERT INTO public.point_logs (student_id, reason, amount)
    VALUES (student_id, '어휘의 탑 일일 미션 보상 🏰', points_to_add);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
