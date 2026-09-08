-- 바깥 실행기가 전체 트랜잭션을 롤백하므로 운영 학생은 실제로 삭제되지 않는다.

SELECT set_config('test.delete_student_id', candidate.student_id::TEXT, true),
       set_config('test.delete_teacher_id', candidate.teacher_id::TEXT, true)
FROM (
    SELECT student.id AS student_id, class.teacher_id
    FROM public.students student
    JOIN public.classes class ON class.id = student.class_id
    WHERE student.deleted_at IS NULL
      AND class.deleted_at IS NULL
      AND EXISTS (
          SELECT 1 FROM public.writing_activity_events event
          WHERE event.student_id = student.id
      )
    ORDER BY EXISTS (
        SELECT 1 FROM writing_helper.portable_results result
        WHERE result.agit_student_id = student.id
    ) DESC,
    EXISTS (
        SELECT 1 FROM public.writing_assignment_outline_pins pin
        WHERE pin.student_id = student.id
    ) DESC
    LIMIT 1
) candidate;

DO $$
BEGIN
    IF current_setting('test.delete_student_id', true) IS NULL THEN
        RAISE EXCEPTION '학생 영구 삭제 스모크에 사용할 발자국 보유 학생이 없습니다.';
    END IF;
END;
$$;

-- 3일 지난 삭제 대기 학생을 자동 정리하는 두 번째 RPC도 같은 원장을 지울 수 있어야 한다.
SELECT set_config('test.purge_student_id', candidate.student_id::TEXT, true),
       set_config('test.purge_class_id', candidate.class_id::TEXT, true),
       set_config('test.purge_teacher_id', candidate.teacher_id::TEXT, true)
FROM (
    SELECT student.id AS student_id, student.class_id, class.teacher_id
    FROM public.students student
    JOIN public.classes class ON class.id = student.class_id
    WHERE student.deleted_at IS NULL
      AND class.deleted_at IS NULL
      AND EXISTS (
          SELECT 1 FROM public.writing_activity_events event
          WHERE event.student_id = student.id
      )
    LIMIT 1
) candidate;

SELECT set_config('app.bypass_student_trigger', 'true', true);
UPDATE public.students
SET deleted_at = NOW() - INTERVAL '4 days'
WHERE id = current_setting('test.purge_student_id')::UUID;
SELECT set_config('app.bypass_student_trigger', 'false', true);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.purge_teacher_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.purge_teacher_id'), 'role', 'authenticated'
)::TEXT, true);
SELECT public.purge_expired_students(current_setting('test.purge_class_id')::UUID);
RESET ROLE;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.students
        WHERE id = current_setting('test.purge_student_id')::UUID
    ) THEN
        RAISE EXCEPTION '3일 지난 발자국 보유 학생이 자동 영구 삭제되지 않았습니다.';
    END IF;

    IF current_setting('app.writing_footprint_maintenance', true) IS DISTINCT FROM 'off' THEN
        RAISE EXCEPTION '자동 학생 삭제 뒤 발자국 유지보수 우회가 닫히지 않았습니다.';
    END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.delete_teacher_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.delete_teacher_id'), 'role', 'authenticated'
)::TEXT, true);

SELECT public.delete_student_immediately(current_setting('test.delete_student_id')::UUID);

RESET ROLE;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.students
        WHERE id = current_setting('test.delete_student_id')::UUID
    ) THEN
        RAISE EXCEPTION '발자국 보유 학생이 영구 삭제되지 않았습니다.';
    END IF;

    IF current_setting('app.writing_footprint_maintenance', true) IS DISTINCT FROM 'off' THEN
        RAISE EXCEPTION '학생 삭제 뒤 발자국 유지보수 우회가 닫히지 않았습니다.';
    END IF;
END;
$$;
