DO $$
BEGIN
    IF has_function_privilege(
        'authenticated',
        'public.get_class_writing_title_stats_v1(uuid,timestamptz,timestamptz)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION '학생/교사가 학급 칭호 내부 집계를 직접 실행할 수 있습니다.';
    END IF;
    IF public.dragon_diary_level(39) <> 6 OR public.dragon_diary_level(40) <> 7 THEN
        RAISE EXCEPTION '기록가 칭호 DB 경계가 화면 기준과 다릅니다.';
    END IF;
    IF public.dragon_reading_level(25, 17) <> 6
       OR public.dragon_reading_level(25, 18) <> 7 THEN
        RAISE EXCEPTION '독서가 칭호 DB의 편수·책 수 동시 경계가 잘못되었습니다.';
    END IF;
END;
$$;

DO $$
DECLARE
    v_student RECORD;
    v_started_at TIMESTAMPTZ;
    v_before RECORD;
    v_after RECORD;
    v_general_id UUID;
    v_diary_one_id UUID;
    v_diary_two_id UUID;
    v_reading_one_id UUID;
    v_reading_two_id UUID;
    v_reading_three_id UUID;
    v_book_one UUID := gen_random_uuid();
    v_book_two UUID := gen_random_uuid();
    v_debug JSONB;
BEGIN
    SELECT student.id, student.auth_id, student.class_id, class_row.teacher_id
    INTO v_student
    FROM public.students student
    JOIN public.classes class_row ON class_row.id = student.class_id
    JOIN public.profiles teacher_profile ON teacher_profile.id = class_row.teacher_id
    LEFT JOIN LATERAL (
        SELECT candidate.status, candidate.started_at
        FROM public.dragon_growth_seasons candidate
        WHERE candidate.class_id = class_row.id
        ORDER BY (candidate.status IN ('active', 'closing')) DESC, candidate.season_number DESC
        LIMIT 1
    ) latest_season ON TRUE
    WHERE student.auth_id IS NOT NULL
      AND student.is_active IS DISTINCT FROM FALSE
      AND student.deleted_at IS NULL
      AND teacher_profile.role IN ('TEACHER', 'ADMIN')
      AND teacher_profile.is_approved IS TRUE
      AND teacher_profile.approval_revoked_at IS NULL
      AND COALESCE(latest_season.status, 'active') = 'active'
      AND COALESCE(
          latest_season.started_at,
          class_row.season_started_at,
          class_row.created_at
      ) <= clock_timestamp()
    ORDER BY student.created_at DESC
    LIMIT 1;

    IF v_student.id IS NULL THEN
        RETURN;
    END IF;

    SELECT COALESCE(season.started_at, class_row.season_started_at, class_row.created_at)
    INTO v_started_at
    FROM public.classes class_row
    LEFT JOIN LATERAL (
        SELECT candidate.started_at
        FROM public.dragon_growth_seasons candidate
        WHERE candidate.class_id = class_row.id
        ORDER BY (candidate.status IN ('active', 'closing')) DESC, candidate.season_number DESC
        LIMIT 1
    ) season ON TRUE
    WHERE class_row.id = v_student.class_id;

    SELECT * INTO v_before
    FROM public.get_class_writing_title_stats_v1(v_student.class_id, v_started_at, NULL) stats
    WHERE stats.student_id = v_student.id;

    PERFORM set_config('app.bypass_student_trigger', 'true', TRUE);

    INSERT INTO public.writing_types (
        id, label, completion_flow, default_policy, is_active
    ) VALUES (
        'activity_title_smoke', '칭호 스모크 일반 자율글', 'student_complete', '{}'::JSONB, TRUE
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.student_posts (
        student_id, class_id, title, content, char_count, paragraph_count,
        is_submitted, first_submitted_at, writing_context, self_writing_type,
        visibility, published_at, structured_content
    ) VALUES (
        v_student.id, v_student.class_id, '칭호 스모크 자유글', repeat('가', 111), 111, 1,
        TRUE, NOW(), 'self', 'activity_title_smoke', 'private', clock_timestamp(), '{}'::JSONB
    ) RETURNING id INTO v_general_id;

    INSERT INTO public.student_posts (
        student_id, class_id, title, content, char_count, paragraph_count,
        is_submitted, first_submitted_at, writing_context, self_writing_type,
        visibility, published_at, structured_content
    ) VALUES (
        v_student.id, v_student.class_id, '칭호 스모크 일기 1', repeat('나', 120), 120, 1,
        TRUE, NOW(), 'self', 'diary', 'private', clock_timestamp(),
        jsonb_build_object('diaryDate', '2099-01-01')
    )
    RETURNING id INTO v_diary_one_id;

    INSERT INTO public.student_posts (
        student_id, class_id, title, content, char_count, paragraph_count,
        is_submitted, first_submitted_at, writing_context, self_writing_type,
        visibility, published_at, structured_content
    ) VALUES (
        v_student.id, v_student.class_id, '칭호 스모크 일기 2', repeat('다', 130), 130, 1,
        TRUE, NOW(), 'self', 'diary', 'private', clock_timestamp(),
        jsonb_build_object('diaryDate', '2099-01-02')
    )
    RETURNING id INTO v_diary_two_id;

    INSERT INTO public.student_posts (
        student_id, class_id, title, content, char_count, paragraph_count,
        is_submitted, first_submitted_at, writing_context, self_writing_type,
        visibility, published_at, structured_content
    ) VALUES
        (
            v_student.id, v_student.class_id, '칭호 스모크 독서록 1', repeat('라', 210), 210, 1,
            TRUE, NOW(), 'self', 'reading_log', 'private', clock_timestamp(),
            jsonb_build_object('bookId', v_book_one, 'bookTitle', '칭호 스모크 책 1')
        ),
        (
            v_student.id, v_student.class_id, '칭호 스모크 독서록 2', repeat('마', 220), 220, 1,
            TRUE, NOW(), 'self', 'reading_log', 'private', clock_timestamp(),
            jsonb_build_object('bookId', v_book_one, 'bookTitle', '칭호 스모크 책 1')
        ),
        (
            v_student.id, v_student.class_id, '칭호 스모크 독서록 3', repeat('바', 230), 230, 1,
            TRUE, NOW(), 'self', 'reading_log', 'private', clock_timestamp(),
            jsonb_build_object('bookId', v_book_two, 'bookTitle', '칭호 스모크 책 2')
        );

    SELECT post.id INTO v_reading_one_id
    FROM public.student_posts post
    WHERE post.student_id = v_student.id AND post.class_id = v_student.class_id
      AND post.title = '칭호 스모크 독서록 1';
    SELECT post.id INTO v_reading_two_id
    FROM public.student_posts post
    WHERE post.student_id = v_student.id AND post.class_id = v_student.class_id
      AND post.title = '칭호 스모크 독서록 2';
    SELECT post.id INTO v_reading_three_id
    FROM public.student_posts post
    WHERE post.student_id = v_student.id AND post.class_id = v_student.class_id
      AND post.title = '칭호 스모크 독서록 3';

    INSERT INTO public.reading_log_teacher_reviews (
        post_id, student_id, class_id, teacher_id,
        review_status, teacher_comment, reviewed_at
    ) VALUES
        (v_diary_one_id, v_student.id, v_student.class_id, v_student.teacher_id, 'checked', '', NOW()),
        (v_diary_two_id, v_student.id, v_student.class_id, v_student.teacher_id, 'checked', '', NOW()),
        (v_reading_one_id, v_student.id, v_student.class_id, v_student.teacher_id, 'checked', '', NOW()),
        (v_reading_two_id, v_student.id, v_student.class_id, v_student.teacher_id, 'checked', '', NOW()),
        (v_reading_three_id, v_student.id, v_student.class_id, v_student.teacher_id, 'checked', '', NOW());

    PERFORM set_config('app.bypass_student_trigger', 'false', TRUE);

    SELECT * INTO v_after
    FROM public.get_class_writing_title_stats_v1(v_student.class_id, v_started_at, NULL) stats
    WHERE stats.student_id = v_student.id;

    SELECT jsonb_build_object(
        'post', to_jsonb(post),
        'counts_as_completed', public.writing_counts_as_completed(
            post.writing_context, post.is_confirmed, post.is_submitted
        )
    ) INTO v_debug
    FROM public.student_posts post
    WHERE post.id = v_general_id;

    IF v_after.writer_total_chars <> v_before.writer_total_chars + 111
       OR v_after.writer_completed_posts <> v_before.writer_completed_posts + 1 THEN
        RAISE EXCEPTION '일기·독서록이 작가 진행도에서 분리되지 않았습니다: before %, after %, debug %',
            row_to_json(v_before), row_to_json(v_after), v_debug;
    END IF;
    IF v_after.diary_days <> v_before.diary_days + 2 THEN
        RAISE EXCEPTION '확인한 서로 다른 일기 날짜가 정확히 집계되지 않았습니다.';
    END IF;
    IF v_after.reading_log_count <> v_before.reading_log_count + 3
       OR v_after.reading_book_count <> v_before.reading_book_count + 2 THEN
        RAISE EXCEPTION '확인 독서록과 서로 다른 책이 정확히 집계되지 않았습니다.';
    END IF;

    PERFORM set_config('test.activity_title_student_auth', v_student.auth_id::TEXT, TRUE);
    PERFORM set_config('test.activity_title_teacher_auth', v_student.teacher_id::TEXT, TRUE);
    PERFORM set_config('test.activity_title_class', v_student.class_id::TEXT, TRUE);
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.activity_title_student_auth'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.activity_title_student_auth'),
    'role', 'authenticated'
)::TEXT, TRUE);

DO $$
DECLARE
    v_status JSONB;
BEGIN
    v_status := public.get_my_title_status();
    IF NOT (v_status ? 'diary_days')
       OR NOT (v_status ? 'reading_log_count')
       OR NOT (v_status ? 'reading_book_count') THEN
        RAISE EXCEPTION '학생 칭호 응답에 새 활동 칭호 원자료가 없습니다: %', v_status;
    END IF;
END;
$$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.activity_title_teacher_auth'), TRUE);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.activity_title_teacher_auth'),
    'role', 'authenticated'
)::TEXT, TRUE);

DO $$
DECLARE
    v_dashboard JSONB;
BEGIN
    v_dashboard := public.get_teacher_dragon_growth_dashboard(
        current_setting('test.activity_title_class')::UUID
    );
    IF NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(v_dashboard -> 'students', '[]'::JSONB)) student
        WHERE student ? 'diary_days'
          AND student ? 'reading_log_count'
          AND student ? 'reading_book_count'
    ) THEN
        RAISE EXCEPTION '교사 성장 화면에 새 활동 칭호 원자료가 없습니다.';
    END IF;
END;
$$;

RESET ROLE;
