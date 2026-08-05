-- 교사용 공용 글 내보내기 계약 스모크. 실제 데이터는 읽기만 하고 전체 ROLLBACK한다.
-- 실행: docker exec -i agit-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < scripts/smoke-writing-content-export.sql

BEGIN;

DO $$
DECLARE
    v_teacher_id UUID;
    v_class_id UUID;
    v_student_id UUID;
    v_other_class_id UUID;
    v_other_student_id UUID;
    v_row_count INTEGER;
    v_invalid_scope_rejected BOOLEAN := false;
BEGIN
    SELECT c.teacher_id, p.class_id, p.student_id
    INTO v_teacher_id, v_class_id, v_student_id
    FROM public.student_posts p
    JOIN public.classes c ON c.id = p.class_id
    JOIN public.profiles teacher_profile
      ON teacher_profile.id = c.teacher_id
     AND teacher_profile.role = 'TEACHER'
    JOIN public.reading_log_entries rle
      ON rle.post_id = p.id
     AND rle.class_id = p.class_id
    WHERE p.writing_context = 'self'
      AND p.self_writing_type = 'reading_log'
      AND p.is_submitted IS TRUE
    ORDER BY p.created_at DESC
    LIMIT 1;

    IF v_teacher_id IS NULL THEN
        RAISE EXCEPTION '독서록 내보내기 스모크에 사용할 글이 없습니다.';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_teacher_id::TEXT, true);
    PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('sub', v_teacher_id, 'role', 'authenticated')::TEXT,
        true
    );

    SELECT count(*)::INTEGER
    INTO v_row_count
    FROM public.get_teacher_writing_content_export(
        v_class_id, v_student_id, 'reading_log', 500
    ) exported
    WHERE exported.content_type = 'reading_log'
      AND exported.content_type_label = '독서록'
      AND exported.student_id = v_student_id
      AND exported.source_title IS NOT NULL
      AND exported.content IS NOT NULL;

    IF v_row_count < 1 THEN
        RAISE EXCEPTION '학생별 독서록 내보내기 행이 반환되지 않았습니다.';
    END IF;

    SELECT c.id, s.id
    INTO v_other_class_id, v_other_student_id
    FROM public.classes c
    JOIN public.students s ON s.class_id = c.id
    WHERE c.teacher_id <> v_teacher_id
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
    ORDER BY c.created_at, s.created_at
    LIMIT 1;

    IF v_other_class_id IS NOT NULL THEN
        BEGIN
            PERFORM *
            FROM public.get_teacher_writing_content_export(
                v_other_class_id, v_other_student_id, 'reading_log', 10
            );
        EXCEPTION WHEN SQLSTATE '42501' THEN
            v_invalid_scope_rejected := true;
        END;

        IF NOT v_invalid_scope_rejected THEN
            RAISE EXCEPTION '다른 교사 학급의 글 내보내기가 차단되지 않았습니다.';
        END IF;
    END IF;

    IF has_function_privilege('anon', 'public.get_teacher_writing_content_export(uuid,uuid,text,integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon 역할에 공용 글 내보내기 실행 권한이 남아 있습니다.';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.get_teacher_writing_content_export(uuid,uuid,text,integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated 역할의 공용 글 내보내기 실행 권한이 없습니다.';
    END IF;

    RAISE NOTICE 'writing-content-export smoke passed (% reading logs)', v_row_count;
END;
$$;

ROLLBACK;
