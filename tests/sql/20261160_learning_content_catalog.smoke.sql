-- 공통 언어 학습 카탈로그 구조·승격 차단·직접 권한을 실제 DB에서 검증한다.

DO $$
BEGIN
    IF to_regclass('public.learning_content_items') IS NULL
       OR to_regclass('public.learning_content_questions') IS NULL
       OR to_regclass('public.learning_content_collections') IS NULL
       OR to_regclass('public.learning_content_collection_items') IS NULL THEN
        RAISE EXCEPTION '공통 학습 콘텐츠 카탈로그 표가 모두 만들어지지 않았습니다.';
    END IF;
END;
$$;

INSERT INTO public.learning_content_items (
    content_type, item_key, expression, hanja, definition, example,
    grade_bands, content_level, review_status, source_pack, source_ref, source_fingerprint
) VALUES (
    'idiom', 'idiom:smoke-001', '고진감래', '苦盡甘來',
    '고생 끝에 즐거움이 찾아온다는 뜻', '꾸준히 연습한 끝에 좋은 결과를 얻었다.',
    ARRAY['g34', 'g56'], 2, 'published', 'migration-smoke', '1', repeat('a', 64)
);

INSERT INTO public.learning_content_questions (
    content_type, item_key, variant_key, question_type, prompt, choices,
    correct_answer, accepted_answers, explanation, grade_bands, difficulty, review_status
) VALUES (
    'idiom', 'idiom:smoke-001', 'idiom:smoke-001:meaningChoice', 'meaningChoice',
    '고진감래의 뜻으로 알맞은 것은?', '["고생 끝에 즐거움이 찾아온다", "좋은 일은 오래가지 않는다"]'::JSONB,
    '고생 끝에 즐거움이 찾아온다', ARRAY['고생 끝에 즐거움이 찾아온다'],
    '고생 끝에 낙이 온다는 뜻이다.', ARRAY['g34', 'g56'], 1, 'published'
);

INSERT INTO public.learning_content_collections (
    content_type, collection_key, title, grade_bands, content_level, review_status
) VALUES ('idiom', 'core-smoke-01', '사자성어 기초', ARRAY['g34', 'g56'], 1, 'published');

INSERT INTO public.learning_content_collection_items (
    content_type, collection_key, item_key, item_order
) VALUES ('idiom', 'core-smoke-01', 'idiom:smoke-001', 1);

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT count(*) INTO v_count
    FROM public.learning_content_collection_items member
    JOIN public.learning_content_questions question
      ON question.content_type = member.content_type
     AND question.item_key = member.item_key
    WHERE member.content_type = 'idiom'
      AND member.collection_key = 'core-smoke-01';
    IF v_count <> 1 THEN
        RAISE EXCEPTION '한 원본 항목을 묶음과 문제에서 함께 참조하지 못했습니다.';
    END IF;
END;
$$;

DO $$
BEGIN
    BEGIN
        INSERT INTO public.learning_content_items (
            content_type, item_key, expression, definition, review_status
        ) VALUES ('proverb', 'proverb:invalid-published', '가는 말이 고와야 오는 말이 곱다',
                  '내가 먼저 잘 대해야 상대도 잘 대해 준다.', 'published');
        RAISE EXCEPTION '검수 정보가 없는 항목이 published로 저장되었습니다.';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    BEGIN
        INSERT INTO public.learning_content_questions (
            content_type, item_key, variant_key, question_type, prompt,
            correct_answer, accepted_answers, explanation, review_status
        ) VALUES (
            'idiom', 'idiom:smoke-001', 'idiom:invalid-published', 'definitionInput',
            '고생 끝에 낙이 온다는 뜻의 사자성어는?', '고진감래', ARRAY['고진감래'],
            '고진감래이다.', 'published'
        );
        RAISE EXCEPTION '학년군·난이도가 없는 문제가 published로 저장되었습니다.';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;
END;
$$;

DO $$
DECLARE
    v_table TEXT;
    v_role TEXT;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'learning_content_items',
        'learning_content_questions',
        'learning_content_collections',
        'learning_content_collection_items'
    ] LOOP
        FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
            IF has_table_privilege(v_role, 'public.' || v_table, 'SELECT')
               OR has_table_privilege(v_role, 'public.' || v_table, 'INSERT')
               OR has_table_privilege(v_role, 'public.' || v_table, 'UPDATE')
               OR has_table_privilege(v_role, 'public.' || v_table, 'DELETE') THEN
                RAISE EXCEPTION '% 역할에 % 직접 권한이 열려 있습니다.', v_role, v_table;
            END IF;
        END LOOP;
    END LOOP;
END;
$$;

