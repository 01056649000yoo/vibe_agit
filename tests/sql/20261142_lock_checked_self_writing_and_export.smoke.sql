DO $$
DECLARE
    v_trigger_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_trigger_count
    FROM pg_trigger
    WHERE tgrelid = 'public.student_posts'::regclass
      AND tgname IN (
          'trg_guard_checked_self_writing_student_update',
          'trg_guard_checked_self_writing_student_delete'
      )
      AND NOT tgisinternal;

    IF v_trigger_count <> 2 THEN
        RAISE EXCEPTION '확인 완료 자율 글의 수정·삭제 잠금 트리거가 모두 설치되지 않았습니다.';
    END IF;

    IF has_function_privilege(
        'anon', 'public.get_teacher_checked_reading_log_export_v1(uuid,integer)', 'EXECUTE'
    ) THEN
        RAISE EXCEPTION '익명 사용자가 확인 완료 독서록을 내보낼 수 있습니다.';
    END IF;
END;
$$;

-- 운영 자료가 있으면 실제 학생 권한으로 확인 완료 글의 수정과 삭제가 모두 거부되는지 검사한다.
DO $$
DECLARE
    v_post RECORD;
    v_update_blocked BOOLEAN := FALSE;
    v_delete_blocked BOOLEAN := FALSE;
BEGIN
    SELECT post.id, post.student_id, post.class_id, student.auth_id
    INTO v_post
    FROM public.student_posts post
    JOIN public.students student
      ON student.id = post.student_id AND student.class_id = post.class_id
    JOIN public.reading_log_teacher_reviews review
      ON review.post_id = post.id AND review.class_id = post.class_id
     AND review.student_id = post.student_id AND review.review_status = 'checked'
    WHERE post.writing_context = 'self'
      AND post.self_writing_type IN ('reading_log', 'diary')
      AND student.auth_id IS NOT NULL
    LIMIT 1;

    IF v_post.id IS NULL THEN
        RETURN;
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_post.auth_id::TEXT, TRUE);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_post.auth_id, 'role', 'authenticated'
    )::TEXT, TRUE);

    BEGIN
        UPDATE public.student_posts
        SET title = title || ' '
        WHERE id = v_post.id;
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
        v_update_blocked := TRUE;
    END;

    BEGIN
        DELETE FROM public.student_posts WHERE id = v_post.id;
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
        v_delete_blocked := TRUE;
    END;

    IF NOT v_update_blocked OR NOT v_delete_blocked THEN
        RAISE EXCEPTION '학생 권한에서 확인 완료 글의 수정 또는 삭제가 차단되지 않았습니다.';
    END IF;
END;
$$;

-- 담당 교사 권한으로 학급 전체 내보내기가 확인 완료 독서록만 반환하는지 검사한다.
DO $$
DECLARE
    v_class RECORD;
    v_bad_count INTEGER;
BEGIN
    SELECT class.id, class.teacher_id
    INTO v_class
    FROM public.classes class
    WHERE class.teacher_id IS NOT NULL
      AND EXISTS (
          SELECT 1
          FROM public.student_posts post
          JOIN public.reading_log_teacher_reviews review
            ON review.post_id = post.id AND review.class_id = post.class_id
           AND review.review_status = 'checked'
          WHERE post.class_id = class.id
            AND post.self_writing_type = 'reading_log'
      )
    LIMIT 1;

    IF v_class.id IS NULL THEN
        RETURN;
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_class.teacher_id::TEXT, TRUE);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_class.teacher_id, 'role', 'authenticated'
    )::TEXT, TRUE);

    SELECT COUNT(*) INTO v_bad_count
    FROM public.get_teacher_checked_reading_log_export_v1(v_class.id, 2000) exported
    WHERE exported.review_status IS DISTINCT FROM 'checked';

    IF v_bad_count <> 0 THEN
        RAISE EXCEPTION '학급 독서록 내보내기에 미확인 또는 보완 요청 글이 섞였습니다.';
    END IF;
END;
$$;
