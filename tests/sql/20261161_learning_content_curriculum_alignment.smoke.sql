-- 교육과정 기준과 실제 제공 학년군의 분리 및 published 승격 제약을 검증한다.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'learning_content_items'
          AND column_name = 'curriculum_band'
    ) OR NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'learning_content_items'
          AND column_name = 'curriculum_role'
    ) THEN
        RAISE EXCEPTION '교육과정 분류 열이 만들어지지 않았습니다.';
    END IF;
END;
$$;

INSERT INTO public.learning_content_items (
    content_type, item_key, expression, definition,
    curriculum_band, curriculum_role, grade_bands, content_level, review_status
) VALUES (
    'proverb', 'proverb:curriculum-smoke', '가는 말이 고와야 오는 말이 곱다',
    '내가 먼저 잘 대해야 상대도 잘 대해 준다는 뜻',
    'g56', 'aligned', ARRAY['g34', 'g56'], 1, 'published'
);

DO $$
DECLARE
    v_curriculum_band TEXT;
    v_grade_bands TEXT[];
BEGIN
    SELECT curriculum_band, grade_bands
      INTO v_curriculum_band, v_grade_bands
      FROM public.learning_content_items
     WHERE content_type = 'proverb'
       AND item_key = 'proverb:curriculum-smoke';

    IF v_curriculum_band <> 'g56' OR NOT ('g34' = ANY (v_grade_bands)) THEN
        RAISE EXCEPTION '5~6학년 교육과정 기준과 3~4학년 미리 만나기 범위가 함께 보존되지 않았습니다.';
    END IF;

    BEGIN
        INSERT INTO public.learning_content_items (
            content_type, item_key, expression, definition,
            grade_bands, content_level, review_status
        ) VALUES (
            'idiom', 'idiom:missing-curriculum', '고진감래',
            '고생 끝에 즐거움이 찾아온다는 뜻', ARRAY['g56'], 2, 'published'
        );
        RAISE EXCEPTION '교육과정 분류가 없는 항목이 published로 저장되었습니다.';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;
END;
$$;
