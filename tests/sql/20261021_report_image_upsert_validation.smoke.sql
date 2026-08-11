DO $$
DECLARE
    v_definition TEXT;
BEGIN
    v_definition := pg_get_functiondef('public.validate_report_post_structure()'::regprocedure);

    IF v_definition !~ 'TG_OP = ''INSERT'''
       OR v_definition !~ 'post[.]student_id = NEW[.]student_id'
       OR v_definition !~ 'post[.]mission_id = NEW[.]mission_id'
       OR v_definition !~ 'v_expected_post_id := COALESCE[(]v_existing_post_id, NEW[.]id[)]'
       OR v_definition !~ 'v_path !~ [(]''[\^]'' [|][|] v_expected_post_id::TEXT' THEN
        RAISE EXCEPTION 'report image upsert must validate against the existing post id';
    END IF;

    IF v_definition !~ 'NOT BETWEEN 1 AND 262144' THEN
        RAISE EXCEPTION 'report image metadata limit must match the 256KiB bucket';
    END IF;
END;
$$;

DO $$
DECLARE
    v_post public.student_posts%ROWTYPE;
    v_min_sections INTEGER;
    v_sections JSONB;
    v_structured_content JSONB;
    v_saved_post_id UUID;
BEGIN
    -- 운영 데이터의 이름·본문을 출력하지 않는다. 보고서 글이 있을 때만 같은 키로
    -- UPSERT하여 BEFORE INSERT → ON CONFLICT UPDATE 경로를 실제로 통과시키고,
    -- 바깥 migrate:check 트랜잭션에서 전부 롤백한다.
    SELECT post.*
    INTO v_post
    FROM public.student_posts post
    JOIN public.writing_missions mission
      ON mission.id = post.mission_id
    WHERE mission.input_template = 'report'
    ORDER BY post.updated_at DESC
    LIMIT 1;

    IF v_post.id IS NULL THEN
        RETURN;
    END IF;

    SELECT LEAST(12, GREATEST(1, COALESCE((mission.template_config ->> 'min_sections')::INTEGER, 2)))
    INTO v_min_sections
    FROM public.writing_missions mission
    WHERE mission.id = v_post.mission_id;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', 'rollback-section-' || section_number,
            'heading', '롤백 검사',
            'body', '보고서 사진 upsert 롤백 검사',
            'image', CASE WHEN section_number = 1 THEN jsonb_build_object(
                'path', v_post.id::TEXT || '/rollback-section-1/rollback-smoke.webp',
                'caption', '롤백 검사 사진',
                'width', 640,
                'height', 480,
                'bytes', 1024,
                'mimeType', 'image/webp'
            ) ELSE 'null'::JSONB END
        )
        ORDER BY section_number
    )
    INTO v_sections
    FROM generate_series(1, v_min_sections) section_number;

    v_structured_content := jsonb_build_object(
        'template', 'report',
        'version', 1,
        'sections', v_sections
    );

    INSERT INTO public.student_posts (
        id, student_id, mission_id, class_id, title, content,
        char_count, paragraph_count, is_submitted, is_returned, is_confirmed,
        student_answers, structured_content, writing_context, visibility, show_original
    ) VALUES (
        gen_random_uuid(), v_post.student_id, v_post.mission_id, v_post.class_id,
        v_post.title, v_post.content, v_post.char_count, v_post.paragraph_count,
        v_post.is_submitted, v_post.is_returned, v_post.is_confirmed,
        COALESCE(v_post.student_answers, '[]'::JSONB), v_structured_content,
        COALESCE(v_post.writing_context, 'assignment'),
        COALESCE(v_post.visibility, 'class'), COALESCE(v_post.show_original, false)
    )
    ON CONFLICT (student_id, mission_id) DO UPDATE SET
        structured_content = EXCLUDED.structured_content,
        updated_at = NOW()
    RETURNING id INTO v_saved_post_id;

    IF v_saved_post_id IS DISTINCT FROM v_post.id THEN
        RAISE EXCEPTION 'report image upsert created a different post';
    END IF;
END;
$$;
