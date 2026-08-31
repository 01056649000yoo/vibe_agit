-- check-migrations의 바깥 트랜잭션에서 실행되고 마지막에 모두 롤백된다.

DO $$
DECLARE
    v_reading_overview TEXT;
    v_reading_summary TEXT;
    v_diary_overview TEXT;
    v_diary_summary TEXT;
BEGIN
    SELECT pg_get_functiondef(
        'public.get_teacher_reading_log_overview(uuid,text,uuid,text,integer,integer)'::regprocedure
    ) INTO v_reading_overview;
    SELECT pg_get_functiondef(
        'public.get_teacher_reading_log_student_summary(uuid,text)'::regprocedure
    ) INTO v_reading_summary;
    SELECT pg_get_functiondef(
        'public.get_teacher_diary_overview(uuid,text,uuid,integer,integer)'::regprocedure
    ) INTO v_diary_overview;
    SELECT pg_get_functiondef(
        'public.get_teacher_diary_student_summary(uuid,text)'::regprocedure
    ) INTO v_diary_summary;

    IF v_reading_overview NOT LIKE '%revision_requested_count%'
       OR v_reading_overview NOT LIKE '%review_status = p_review_filter%'
       OR v_reading_summary NOT LIKE '%revision_requested_count%'
       OR v_diary_overview NOT LIKE '%revision_requested_count%'
       OR v_diary_overview NOT LIKE '%review_status = p_review_filter%'
       OR v_diary_summary NOT LIKE '%revision_requested%reviewed%' THEN
        RAISE EXCEPTION '자율 글 네 상태 분류 함수가 모두 같은 계약을 쓰지 않습니다.';
    END IF;

    IF has_function_privilege(
        'anon', 'public.get_teacher_reading_log_overview(uuid,text,uuid,text,integer,integer)', 'EXECUTE'
    ) OR has_function_privilege(
        'anon', 'public.get_teacher_reading_log_student_summary(uuid,text)', 'EXECUTE'
    ) OR has_function_privilege(
        'anon', 'public.get_teacher_diary_overview(uuid,text,uuid,integer,integer)', 'EXECUTE'
    ) OR has_function_privilege(
        'anon', 'public.get_teacher_diary_student_summary(uuid,text)', 'EXECUTE'
    ) THEN
        RAISE EXCEPTION '자율 글 교사 요약 RPC가 익명 역할에 노출됐습니다.';
    END IF;
END;
$$;

DO $$
DECLARE
    v_post RECORD;
    v_overview JSONB;
    v_filtered JSONB;
    v_summary JSONB;
    v_student_row JSONB;
    v_expected_total INTEGER;
    v_expected_unreviewed INTEGER;
    v_expected_revision INTEGER;
    v_expected_reviewed INTEGER;
    v_tested INTEGER := 0;
BEGIN
    FOR v_post IN
        SELECT DISTINCT ON (post.self_writing_type)
            post.id,
            post.student_id,
            post.class_id,
            post.self_writing_type,
            class.teacher_id
        FROM public.student_posts post
        JOIN public.students student
          ON student.id = post.student_id
         AND student.class_id = post.class_id
        JOIN public.classes class ON class.id = post.class_id
        WHERE post.writing_context = 'self'
          AND post.self_writing_type IN ('reading_log', 'diary')
          AND post.is_submitted IS TRUE
          AND student.is_active IS DISTINCT FROM FALSE
          AND student.deleted_at IS NULL
          AND class.teacher_id IS NOT NULL
          AND class.deleted_at IS NULL
        ORDER BY post.self_writing_type, post.updated_at DESC, post.id
    LOOP
        v_tested := v_tested + 1;

        INSERT INTO public.reading_log_teacher_reviews (
            post_id, student_id, class_id, teacher_id,
            review_status, teacher_comment, reviewed_at, updated_at
        ) VALUES (
            v_post.id, v_post.student_id, v_post.class_id, v_post.teacher_id,
            'revision_requested', '', NOW(), NOW()
        )
        ON CONFLICT (post_id) DO UPDATE SET
            student_id = EXCLUDED.student_id,
            class_id = EXCLUDED.class_id,
            teacher_id = EXCLUDED.teacher_id,
            review_status = EXCLUDED.review_status,
            teacher_comment = EXCLUDED.teacher_comment,
            reviewed_at = EXCLUDED.reviewed_at,
            updated_at = EXCLUDED.updated_at;

        PERFORM set_config('request.jwt.claim.sub', v_post.teacher_id::TEXT, TRUE);
        PERFORM set_config('request.jwt.claims', jsonb_build_object(
            'sub', v_post.teacher_id,
            'role', 'authenticated'
        )::TEXT, TRUE);

        SELECT
            COUNT(*)::INTEGER,
            COUNT(*) FILTER (WHERE review.post_id IS NULL)::INTEGER,
            COUNT(*) FILTER (WHERE review.review_status = 'revision_requested')::INTEGER,
            COUNT(*) FILTER (WHERE review.review_status = 'checked')::INTEGER
        INTO v_expected_total, v_expected_unreviewed, v_expected_revision, v_expected_reviewed
        FROM public.student_posts post
        LEFT JOIN public.reading_log_teacher_reviews review
          ON review.post_id = post.id
         AND review.class_id = post.class_id
         AND review.student_id = post.student_id
        WHERE post.class_id = v_post.class_id
          AND post.student_id = v_post.student_id
          AND post.writing_context = 'self'
          AND post.self_writing_type = v_post.self_writing_type
          AND post.is_submitted IS TRUE;

        IF v_post.self_writing_type = 'reading_log' THEN
            v_overview := public.get_teacher_reading_log_overview(
                v_post.class_id, 'all', v_post.student_id, NULL, 100, 0
            );
            v_filtered := public.get_teacher_reading_log_overview(
                v_post.class_id, 'revision_requested', v_post.student_id, NULL, 100, 0
            );
            v_summary := public.get_teacher_reading_log_student_summary(v_post.class_id, NULL);
        ELSE
            v_overview := public.get_teacher_diary_overview(
                v_post.class_id, 'all', v_post.student_id, 100, 0
            );
            v_filtered := public.get_teacher_diary_overview(
                v_post.class_id, 'revision_requested', v_post.student_id, 100, 0
            );
            v_summary := public.get_teacher_diary_student_summary(v_post.class_id, NULL);
        END IF;

        IF (v_overview #>> '{counts,total}')::INTEGER <> v_expected_total
           OR (v_overview #>> '{counts,unreviewed}')::INTEGER <> v_expected_unreviewed
           OR (v_overview #>> '{counts,revision_requested}')::INTEGER <> v_expected_revision
           OR (v_overview #>> '{counts,reviewed}')::INTEGER <> v_expected_reviewed THEN
            RAISE EXCEPTION '% 요약 수가 실제 상태와 다릅니다: %', v_post.self_writing_type, v_overview;
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(v_filtered -> 'items') item
            WHERE item ->> 'post_id' = v_post.id::TEXT
        ) THEN
            RAISE EXCEPTION '% 보완 중 필터에 시험 글이 없습니다.', v_post.self_writing_type;
        END IF;

        IF v_post.self_writing_type = 'reading_log' THEN
            SELECT item INTO v_student_row
            FROM jsonb_array_elements(v_summary -> 'students') item
            WHERE item ->> 'student_id' = v_post.student_id::TEXT;

            IF (v_student_row ->> 'unreviewed_count')::INTEGER <> v_expected_unreviewed
               OR (v_student_row ->> 'revision_requested_count')::INTEGER <> v_expected_revision
               OR (v_student_row ->> 'reviewed_count')::INTEGER <> v_expected_reviewed THEN
                RAISE EXCEPTION '독서록 학생별 요약이 실제 상태와 다릅니다: %', v_student_row;
            END IF;
        ELSE
            SELECT item INTO v_student_row
            FROM jsonb_array_elements(v_summary -> 'students') item
            WHERE item ->> 'student_id' = v_post.student_id::TEXT;

            IF (v_student_row ->> 'unreviewed')::INTEGER <> v_expected_unreviewed
               OR (v_student_row ->> 'revision_requested')::INTEGER <> v_expected_revision
               OR (v_student_row ->> 'reviewed')::INTEGER <> v_expected_reviewed THEN
                RAISE EXCEPTION '일기 학생별 요약이 실제 상태와 다릅니다: %', v_student_row;
            END IF;
        END IF;
    END LOOP;

    IF v_tested = 0 THEN
        RAISE EXCEPTION '자율 글 상태 분류 스모크에 사용할 제출 글이 없습니다.';
    END IF;
END;
$$;
