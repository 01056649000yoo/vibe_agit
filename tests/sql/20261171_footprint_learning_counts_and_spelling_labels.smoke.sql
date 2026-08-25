-- check-migrations의 바깥 트랜잭션에서 실행되며 마지막에 모두 롤백된다.

DO $$
DECLARE
    v_class_id UUID;
    v_teacher_id UUID;
    v_student_id UUID;
    v_post_id UUID;
    v_before JSONB;
    v_after JSONB;
    v_before_student JSONB;
    v_after_student JSONB;
    v_label TEXT := '회귀검사-' || left(gen_random_uuid()::TEXT, 8);
BEGIN
    SELECT post.class_id, class.teacher_id, post.student_id, post.id
    INTO v_class_id, v_teacher_id, v_student_id, v_post_id
    FROM public.student_posts post
    JOIN public.students student
      ON student.id = post.student_id
     AND student.class_id = post.class_id
     AND student.is_active IS DISTINCT FROM FALSE
     AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
    JOIN public.classes class
      ON class.id = post.class_id
     AND class.teacher_id IS NOT NULL
     AND class.deleted_at IS NULL
    JOIN public.profiles teacher
      ON teacher.id = class.teacher_id
     AND teacher.role IN ('TEACHER', 'ADMIN')
     AND (teacher.role = 'ADMIN' OR (
         teacher.is_approved IS TRUE AND teacher.approval_revoked_at IS NULL
     ))
    WHERE post.writing_context = 'assignment'
      AND post.mission_id IS NOT NULL
    ORDER BY post.updated_at DESC
    LIMIT 1;
    IF v_post_id IS NULL THEN
        RAISE EXCEPTION '학습 횟수 발자국 스모크에 사용할 과제 글이 없습니다.';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_teacher_id::TEXT, true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_teacher_id, 'role', 'authenticated'
    )::TEXT, true);

    v_before := public.get_class_writing_footprint_dashboard(v_class_id);
    SELECT item.value INTO v_before_student
    FROM jsonb_array_elements(v_before->'students') item
    WHERE item.value->>'student_id' = v_student_id::TEXT;
    IF v_before_student IS NULL THEN
        RAISE EXCEPTION '발자국 응답에서 대상 학생을 찾지 못했습니다.';
    END IF;

    PERFORM public.notification_emit_v1(
        v_student_id,
        'writing',
        'writing.rewrite_requested',
        'student_post',
        v_post_id,
        jsonb_build_object('post_id', v_post_id),
        'test:footprint:rewrite:' || gen_random_uuid()::TEXT
    );
    PERFORM public.record_writing_activity_event(
        v_class_id,
        v_student_id,
        v_student_id,
        'post_resubmitted',
        v_post_id,
        v_post_id,
        jsonb_build_object('writing_context', 'assignment')
    );
    INSERT INTO public.class_spelling_daily_stats(
        class_id, event_date, entry_key, label, display_expression,
        search_count, student_count, last_seen_at
    ) VALUES (
        v_class_id, CURRENT_DATE, 'test:footprint:' || gen_random_uuid()::TEXT,
        v_label, NULL, 100000, 1, NOW()
    );

    v_after := public.get_class_writing_footprint_dashboard(v_class_id);
    SELECT item.value INTO v_after_student
    FROM jsonb_array_elements(v_after->'students') item
    WHERE item.value->>'student_id' = v_student_id::TEXT;

    IF COALESCE((v_after_student->>'rewrite_requests')::INTEGER, -1)
       <> COALESCE((v_before_student->>'rewrite_requests')::INTEGER, 0) + 1 THEN
        RAISE EXCEPTION '다시쓰기 요청 횟수가 증가하지 않았습니다: before %, after %',
            v_before_student, v_after_student;
    END IF;
    IF COALESCE((v_after_student->>'revision_submissions')::INTEGER, -1)
       <> COALESCE((v_before_student->>'revision_submissions')::INTEGER, 0) + 1 THEN
        RAISE EXCEPTION '수정 제출 횟수가 증가하지 않았습니다: before %, after %',
            v_before_student, v_after_student;
    END IF;
    IF NOT (v_after ? 'detail')
       OR jsonb_typeof(v_after #> '{detail,spelling_labels}') <> 'array'
       OR NOT EXISTS (
           SELECT 1
           FROM jsonb_array_elements(v_after #> '{detail,spelling_labels}') label
           WHERE label.value->>'type' = v_label
             AND (label.value->>'total')::INTEGER = 100000
       ) THEN
        RAISE EXCEPTION '맞춤법 발자국이 detail.spelling_labels에 담기지 않았습니다: %',
            v_after->'detail';
    END IF;
END;
$$;
