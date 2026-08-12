DO $$
DECLARE
    v_student public.students%ROWTYPE;
    v_first_diary_id UUID;
    v_second_diary_id UUID;
    v_private_diary_id UUID;
    v_diary_date DATE := DATE '1900-01-01';
    v_all JSONB;
    v_diaries JSONB;
    v_assignments JSONB;
    v_first_page JSONB;
    v_second_page JSONB;
BEGIN
    SELECT student.* INTO v_student
    FROM public.students student
    JOIN public.classes class ON class.id = student.class_id
    WHERE student.auth_id IS NOT NULL
      AND student.is_active IS DISTINCT FROM FALSE
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
      AND class.deleted_at IS NULL
      AND NOT EXISTS (
          SELECT 1
          FROM public.class_writing_policies policy
          WHERE policy.class_id = student.class_id
            AND policy.writing_type = 'diary'
            AND policy.is_enabled IS FALSE
      )
    ORDER BY student.created_at
    LIMIT 1;
    IF v_student.id IS NULL THEN
        RAISE EXCEPTION '공개 글 피드 스모크에 사용할 활성 학생이 없습니다.';
    END IF;

    WHILE EXISTS (
        SELECT 1
        FROM public.student_posts post
        WHERE post.student_id = v_student.id
          AND post.writing_context = 'self'
          AND post.self_writing_type = 'diary'
          AND post.structured_content ->> 'diaryDate' IN (
              v_diary_date::TEXT,
              (v_diary_date + 1)::TEXT,
              (v_diary_date + 2)::TEXT
          )
    ) LOOP
        v_diary_date := v_diary_date + 3;
    END LOOP;

    INSERT INTO public.student_posts (
        student_id, class_id, title, content, char_count, paragraph_count,
        is_submitted, first_submitted_at, writing_context, self_writing_type,
        visibility, published_at, structured_content, show_original,
        original_title, original_content
    ) VALUES (
        v_student.id, v_student.class_id, '공개 일기 피드 첫 글', '공개 일기 피드 첫 글 내용', 13, 1,
        TRUE, NOW(), 'self', 'diary', 'class', NOW() + INTERVAL '10 minutes',
        jsonb_build_object('diaryDate', v_diary_date::TEXT), FALSE,
        '노출되면 안 되는 처음 제목', '노출되면 안 되는 처음 내용'
    ) RETURNING id INTO v_first_diary_id;

    INSERT INTO public.student_posts (
        student_id, class_id, title, content, char_count, paragraph_count,
        is_submitted, first_submitted_at, writing_context, self_writing_type,
        visibility, published_at, structured_content
    ) VALUES (
        v_student.id, v_student.class_id, '공개 일기 피드 둘째 글', '공개 일기 피드 둘째 글 내용', 14, 1,
        TRUE, NOW(), 'self', 'diary', 'class', NOW() + INTERVAL '9 minutes',
        jsonb_build_object('diaryDate', (v_diary_date + 1)::TEXT)
    ) RETURNING id INTO v_second_diary_id;

    INSERT INTO public.student_posts (
        student_id, class_id, title, content, char_count, paragraph_count,
        is_submitted, first_submitted_at, writing_context, self_writing_type,
        visibility, structured_content
    ) VALUES (
        v_student.id, v_student.class_id, '비공개 일기 피드 제외', '비공개 일기 내용', 9, 1,
        TRUE, NOW(), 'self', 'diary', 'private',
        jsonb_build_object('diaryDate', (v_diary_date + 2)::TEXT)
    ) RETURNING id INTO v_private_diary_id;

    PERFORM set_config('request.jwt.claim.sub', v_student.auth_id::TEXT, TRUE);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_student.auth_id, 'role', 'authenticated'
    )::TEXT, TRUE);

    v_all := public.get_class_public_writing_feed_v1('all', NULL, NULL, 50, NULL, NULL);
    IF v_all->>'version' <> '1'
       OR v_all->>'group' <> 'all'
       OR v_all->>'max_rows' <> '50'
       OR jsonb_array_length(v_all->'items') > 50 THEN
        RAISE EXCEPTION '전체 공개 글 피드 계약 오류: %', v_all;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_all->'items') item
        WHERE item->>'id' = v_first_diary_id::TEXT
          AND item->>'self_writing_type' = 'diary'
          AND item->'students'->>'name' = v_student.name
    ) THEN
        RAISE EXCEPTION '전체 공개 글 피드에 공개 일기가 없습니다: %', v_all;
    END IF;
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_all->'items') item
        WHERE item->>'id' = v_private_diary_id::TEXT
    ) THEN
        RAISE EXCEPTION '비공개 일기가 학급 공개 피드에 노출되었습니다.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_all->'items') item
        WHERE item->>'id' = v_first_diary_id::TEXT
          AND (item->>'original_title' IS NOT NULL OR item->>'original_content' IS NOT NULL)
    ) THEN
        RAISE EXCEPTION '처음 글 공개 OFF 상태에서 원문이 노출되었습니다.';
    END IF;

    v_diaries := public.get_class_public_writing_feed_v1('self', 'diary', NULL, 50, NULL, NULL);
    IF jsonb_array_length(v_diaries->'items') < 2 OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_diaries->'items') item
        WHERE item->>'writing_context' <> 'self' OR item->>'self_writing_type' <> 'diary'
    ) THEN
        RAISE EXCEPTION '일기 필터가 다른 글을 섞었습니다: %', v_diaries;
    END IF;

    v_assignments := public.get_class_public_writing_feed_v1('assignment', NULL, NULL, 50, NULL, NULL);
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_assignments->'items') item
        WHERE item->>'mission_id' IS NULL OR item->>'writing_context' = 'self'
    ) THEN
        RAISE EXCEPTION '선생님 과제 필터가 자율 글을 섞었습니다: %', v_assignments;
    END IF;

    v_first_page := public.get_class_public_writing_feed_v1('self', 'diary', NULL, 1, NULL, NULL);
    IF v_first_page->>'has_more' <> 'true'
       OR v_first_page->'items'->0->>'id' <> v_first_diary_id::TEXT THEN
        RAISE EXCEPTION '첫 커서 페이지 계약 오류: %', v_first_page;
    END IF;
    v_second_page := public.get_class_public_writing_feed_v1(
        'self', 'diary', NULL, 1,
        (v_first_page->>'next_cursor_at')::TIMESTAMPTZ,
        (v_first_page->>'next_cursor_id')::UUID
    );
    IF v_second_page->'items'->0->>'id' <> v_second_diary_id::TEXT THEN
        RAISE EXCEPTION '다음 커서 페이지가 이어지지 않습니다: %', v_second_page;
    END IF;

    BEGIN
        PERFORM public.get_class_public_writing_feed_v1('self', 'not-registered', NULL, 10, NULL, NULL);
        RAISE EXCEPTION '등록되지 않은 자율 글 유형이 허용되었습니다.';
    EXCEPTION WHEN SQLSTATE '22023' THEN
        NULL;
    END;

    IF has_function_privilege(
        'anon',
        'public.get_class_public_writing_feed_v1(text,text,uuid,integer,timestamp with time zone,uuid)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION '공개 글 피드 RPC가 anon에 노출되어 있습니다.';
    END IF;
END;
$$;
