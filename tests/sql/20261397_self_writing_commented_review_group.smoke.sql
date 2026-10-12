-- check-migrations의 바깥 트랜잭션에서 실행되고 마지막에 모두 롤백된다.
-- 확인만(reviewed)·한마디 남김(commented) 칸이 실제로 글을 고르고, 다섯 칸이 겹치지 않는지 본다.

DO $$
BEGIN
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
    v_comment TEXT;
    v_expect TEXT;
    v_other TEXT;
    v_all JSONB;
    v_hit JSONB;
    v_miss JSONB;
    v_summary JSONB;
    v_row JSONB;
    v_expected RECORD;
    v_tested INTEGER := 0;
BEGIN
    FOR v_post IN
        SELECT DISTINCT ON (post.self_writing_type)
            post.id, post.student_id, post.class_id, post.self_writing_type, class.teacher_id
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
        PERFORM set_config('request.jwt.claim.sub', v_post.teacher_id::TEXT, TRUE);
        PERFORM set_config('request.jwt.claims', jsonb_build_object(
            'sub', v_post.teacher_id, 'role', 'authenticated'
        )::TEXT, TRUE);

        -- 같은 글을 '한마디 있음' → '한마디 없음'(공백만) 순서로 바꿔 가며 칸이 따라 움직이는지 본다.
        FOREACH v_comment IN ARRAY ARRAY['잘 썼어요', '   '] LOOP
            v_expect := CASE WHEN BTRIM(v_comment) = '' THEN 'reviewed' ELSE 'commented' END;
            v_other := CASE WHEN v_expect = 'reviewed' THEN 'commented' ELSE 'reviewed' END;

            INSERT INTO public.reading_log_teacher_reviews (
                post_id, student_id, class_id, teacher_id,
                review_status, teacher_comment, reviewed_at, updated_at
            ) VALUES (
                v_post.id, v_post.student_id, v_post.class_id, v_post.teacher_id,
                'checked', v_comment, NOW(), NOW()
            )
            ON CONFLICT (post_id) DO UPDATE SET
                student_id = EXCLUDED.student_id,
                class_id = EXCLUDED.class_id,
                teacher_id = EXCLUDED.teacher_id,
                review_status = EXCLUDED.review_status,
                teacher_comment = EXCLUDED.teacher_comment,
                reviewed_at = EXCLUDED.reviewed_at,
                updated_at = EXCLUDED.updated_at;

            SELECT
                COUNT(*)::INTEGER AS total,
                COUNT(*) FILTER (WHERE review.post_id IS NULL)::INTEGER AS unreviewed,
                COUNT(*) FILTER (WHERE review.review_status = 'revision_requested')::INTEGER AS revision,
                COUNT(*) FILTER (WHERE review.post_id IS NOT NULL AND review.review_status <> 'revision_requested'
                                   AND BTRIM(COALESCE(review.teacher_comment, '')) = '')::INTEGER AS reviewed,
                COUNT(*) FILTER (WHERE review.post_id IS NOT NULL AND review.review_status <> 'revision_requested'
                                   AND BTRIM(COALESCE(review.teacher_comment, '')) <> '')::INTEGER AS commented
            INTO v_expected
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
                v_all := public.get_teacher_reading_log_overview(v_post.class_id, 'all', v_post.student_id, NULL, 100, 0);
                v_hit := public.get_teacher_reading_log_overview(v_post.class_id, v_expect, v_post.student_id, NULL, 100, 0);
                v_miss := public.get_teacher_reading_log_overview(v_post.class_id, v_other, v_post.student_id, NULL, 100, 0);
                v_summary := public.get_teacher_reading_log_student_summary(v_post.class_id, NULL);
            ELSE
                v_all := public.get_teacher_diary_overview(v_post.class_id, 'all', v_post.student_id, 100, 0);
                v_hit := public.get_teacher_diary_overview(v_post.class_id, v_expect, v_post.student_id, 100, 0);
                v_miss := public.get_teacher_diary_overview(v_post.class_id, v_other, v_post.student_id, 100, 0);
                v_summary := public.get_teacher_diary_student_summary(v_post.class_id, NULL);
            END IF;

            IF (v_all #>> '{counts,total}')::INTEGER <> v_expected.total
               OR (v_all #>> '{counts,unreviewed}')::INTEGER <> v_expected.unreviewed
               OR (v_all #>> '{counts,revision_requested}')::INTEGER <> v_expected.revision
               OR (v_all #>> '{counts,reviewed}')::INTEGER <> v_expected.reviewed
               OR (v_all #>> '{counts,commented}')::INTEGER <> v_expected.commented
               OR v_expected.unreviewed + v_expected.revision + v_expected.reviewed + v_expected.commented
                  <> v_expected.total THEN
                RAISE EXCEPTION '% 다섯 칸 수가 실제와 다르거나 겹칩니다: % / %', v_post.self_writing_type, v_all -> 'counts', row_to_json(v_expected);
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM jsonb_array_elements(v_hit -> 'items') item
                WHERE item ->> 'post_id' = v_post.id::TEXT AND item ->> 'review_group' = v_expect
            ) THEN
                RAISE EXCEPTION '% % 필터에 시험 글이 없습니다.', v_post.self_writing_type, v_expect;
            END IF;
            IF EXISTS (
                SELECT 1 FROM jsonb_array_elements(v_miss -> 'items') item
                WHERE item ->> 'post_id' = v_post.id::TEXT
            ) THEN
                RAISE EXCEPTION '% % 필터에 다른 칸 글이 섞였습니다.', v_post.self_writing_type, v_other;
            END IF;
            IF EXISTS (
                SELECT 1 FROM jsonb_array_elements(v_hit -> 'items') item
                WHERE item ->> 'review_group' <> v_expect
            ) THEN
                RAISE EXCEPTION '% % 필터가 다른 칸 글을 돌려줍니다.', v_post.self_writing_type, v_expect;
            END IF;

            SELECT item INTO v_row
            FROM jsonb_array_elements(v_summary -> 'students') item
            WHERE item ->> 'student_id' = v_post.student_id::TEXT;
            IF v_post.self_writing_type = 'reading_log' THEN
                IF (v_row ->> 'reviewed_count')::INTEGER <> v_expected.reviewed
                   OR (v_row ->> 'commented_count')::INTEGER <> v_expected.commented
                   OR (v_row ->> 'revision_requested_count')::INTEGER <> v_expected.revision THEN
                    RAISE EXCEPTION '독서록 학생별 요약이 실제와 다릅니다: %', v_row;
                END IF;
            ELSIF (v_row ->> 'reviewed')::INTEGER <> v_expected.reviewed
               OR (v_row ->> 'commented')::INTEGER <> v_expected.commented
               OR (v_row ->> 'revision_requested')::INTEGER <> v_expected.revision THEN
                RAISE EXCEPTION '일기 학생별 요약이 실제와 다릅니다: %', v_row;
            END IF;
        END LOOP;
    END LOOP;

    IF v_tested < 2 THEN
        RAISE EXCEPTION '일기·독서록 둘 다 시험할 제출 글이 필요합니다(찾은 갈래 %개).', v_tested;
    END IF;
END;
$$;
