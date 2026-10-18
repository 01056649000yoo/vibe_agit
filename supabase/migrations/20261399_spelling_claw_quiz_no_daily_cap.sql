-- 수호룡의 인형뽑기 — 맞춤법 퀴즈를 하루 60번까지만 받던 제한을 없앤다 (2026-10-18)
--
-- 목표를 못 채우면 바로 새 문제로 다시 도전하게 바뀌어(끊긴 판이 잦아짐) 맞춤법 퀴즈를 많이 풀수록 좋다.
-- 코인은 합격해야만 나가고 하루 코인 수(`dailyPlays`)는 따로 막으므로, 문제를 많이 받아도 상품은 늘지 않는다.
-- 나머지 동작(이전 진행 중 퀴즈를 abandoned 로 닫고 새로 발급)은 그대로다. 되돌리려면 20261363 의 같은 함수 정의를 다시 적용한다.

BEGIN;

CREATE OR REPLACE FUNCTION public.spelling_claw_issue_quiz_v1(
    p_student_id UUID,
    p_questions JSONB,
    p_pass_count SMALLINT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_class_id UUID;
    v_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::DATE;
    v_id UUID;
BEGIN
    SELECT student.class_id INTO v_class_id
    FROM public.students student
    JOIN public.classes class ON class.id = student.class_id AND class.deleted_at IS NULL
    WHERE student.id = p_student_id
      AND student.is_active IS DISTINCT FROM false
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
      AND 'spelling-claw' = ANY(class.enabled_modules)
    FOR UPDATE OF student;
    IF v_class_id IS NULL THEN
        RAISE EXCEPTION '인형뽑기를 열 수 없는 학생입니다.' USING ERRCODE = '42501';
    END IF;
    UPDATE public.spelling_claw_quiz_attempts SET status = 'abandoned', finished_at = NOW()
    WHERE student_id = p_student_id AND status = 'active';

    INSERT INTO public.spelling_claw_quiz_attempts (student_id, class_id, played_on, questions, pass_count)
    VALUES (p_student_id, v_class_id, v_today, p_questions, p_pass_count)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.spelling_claw_issue_quiz_v1(UUID, JSONB, SMALLINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spelling_claw_issue_quiz_v1(UUID, JSONB, SMALLINT) TO service_role;

COMMIT;
