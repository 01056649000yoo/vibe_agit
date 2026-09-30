-- 오늘 현황의 일기·독서록이 제출(submitted*)과 교사 확인(completed*)을 따로 돌려주는지 본다(ROLLBACK 안).
SELECT set_config('test.st_teacher', class.teacher_id::TEXT, true), set_config('test.st_class', class.id::TEXT, true)
FROM public.classes class
JOIN public.profiles teacher ON teacher.id = class.teacher_id AND teacher.role = 'TEACHER' AND teacher.is_approved IS TRUE
WHERE class.deleted_at IS NULL
ORDER BY class.created_at DESC
LIMIT 1;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.st_teacher'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('test.st_teacher'), 'role', 'authenticated')::TEXT, true);

DO $$
DECLARE
    v_result JSONB := public.get_teacher_class_board_status_v1(current_setting('test.st_class')::UUID, NULL, ARRAY['daily']);
BEGIN
    IF jsonb_typeof(v_result #> '{dailyWriting,diary,submittedStudentCount}') <> 'number'
       OR jsonb_typeof(v_result #> '{dailyWriting,diary,submittedCount}') <> 'number'
       OR jsonb_typeof(v_result #> '{dailyWriting,readingLog,submittedStudentCount}') <> 'number'
       OR jsonb_typeof(v_result #> '{dailyWriting,readingLog,submittedCount}') <> 'number'
       OR jsonb_typeof(v_result #> '{dailyWriting,diary,completedStudentCount}') <> 'number' THEN
        RAISE EXCEPTION '제출·확인 값이 빠졌습니다: %', v_result -> 'dailyWriting';
    END IF;
    IF (v_result #>> '{dailyWriting,diary,submittedStudentCount}')::INTEGER > (v_result #>> '{dailyWriting,diary,totalStudents}')::INTEGER THEN
        RAISE EXCEPTION '제출 학생이 학급 인원보다 많습니다: %', v_result -> 'dailyWriting';
    END IF;
END;
$$;
RESET ROLE;
