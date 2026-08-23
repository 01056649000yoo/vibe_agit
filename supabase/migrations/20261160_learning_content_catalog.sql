-- 공통 학습 콘텐츠 카탈로그 토대
--
-- `learning_item_progress`는 학생의 학습 상태만 소유하고, 실제 표현·뜻·문제·묶음은 콘텐츠가
-- 소유한다. 지금까지는 어휘의 탑 전용 검수표만 있었으므로 속담·사자성어를 일일 미션과 향후
-- 별도 콘텐츠가 함께 쓰려면 같은 원본을 가리키는 중립 카탈로그가 필요하다.
--
-- 이 마이그레이션은 표와 보안 경계만 만든다. 원본 185개는 아직 학년군·난이도·선택형 문제
-- 검수가 끝나지 않았으므로 DB에 넣거나 학생에게 공개하지 않는다. 검수 완료 자료의 승격 RPC와
-- 학생용 일일 미션 RPC는 후속 마이그레이션에서 추가한다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.learning_content_items (
    content_type TEXT NOT NULL,
    item_key TEXT NOT NULL,
    expression TEXT NOT NULL,
    hanja TEXT,
    definition TEXT NOT NULL,
    example TEXT,
    grade_bands TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    content_level SMALLINT,
    themes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    review_status TEXT NOT NULL DEFAULT 'source_imported',
    review_flags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    source_pack TEXT,
    source_ref TEXT,
    source_fingerprint TEXT,
    content_version INTEGER NOT NULL DEFAULT 1,
    source_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (content_type, item_key),
    CONSTRAINT learning_content_items_type_check
        CHECK (char_length(BTRIM(content_type)) BETWEEN 1 AND 40),
    CONSTRAINT learning_content_items_key_check
        CHECK (char_length(BTRIM(item_key)) BETWEEN 3 AND 160),
    CONSTRAINT learning_content_items_expression_check
        CHECK (char_length(BTRIM(expression)) BETWEEN 1 AND 300),
    CONSTRAINT learning_content_items_hanja_check
        CHECK (hanja IS NULL OR char_length(BTRIM(hanja)) BETWEEN 1 AND 100),
    CONSTRAINT learning_content_items_definition_check
        CHECK (char_length(BTRIM(definition)) BETWEEN 1 AND 1000),
    CONSTRAINT learning_content_items_example_check
        CHECK (example IS NULL OR char_length(BTRIM(example)) BETWEEN 1 AND 1000),
    CONSTRAINT learning_content_items_grade_bands_check
        CHECK (grade_bands <@ ARRAY['g34', 'g56']::TEXT[] AND cardinality(grade_bands) <= 2),
    CONSTRAINT learning_content_items_level_check
        CHECK (content_level IS NULL OR content_level BETWEEN 1 AND 5),
    CONSTRAINT learning_content_items_themes_check
        CHECK (cardinality(themes) <= 10),
    CONSTRAINT learning_content_items_review_status_check
        CHECK (review_status = ANY (ARRAY[
            'source_imported', 'editorial_review', 'teacher_confirmed', 'published', 'retired'
        ])),
    CONSTRAINT learning_content_items_version_check
        CHECK (content_version > 0),
    CONSTRAINT learning_content_items_source_fingerprint_check
        CHECK (source_fingerprint IS NULL OR char_length(source_fingerprint) BETWEEN 16 AND 128),
    CONSTRAINT learning_content_items_source_metadata_check
        CHECK (jsonb_typeof(source_metadata) = 'object' AND char_length(source_metadata::TEXT) <= 10000),
    CONSTRAINT learning_content_items_publish_ready_check
        CHECK (
            review_status <> 'published'
            OR (cardinality(grade_bands) > 0 AND content_level IS NOT NULL AND cardinality(review_flags) = 0)
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS learning_content_items_source_idx
    ON public.learning_content_items (source_pack, source_ref)
    WHERE source_pack IS NOT NULL AND source_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS learning_content_items_published_idx
    ON public.learning_content_items (content_type, content_level, item_key)
    WHERE review_status = 'published';
CREATE INDEX IF NOT EXISTS learning_content_items_grade_bands_idx
    ON public.learning_content_items USING GIN (grade_bands);

CREATE TABLE IF NOT EXISTS public.learning_content_questions (
    content_type TEXT NOT NULL,
    item_key TEXT NOT NULL,
    variant_key TEXT NOT NULL,
    question_type TEXT NOT NULL,
    prompt TEXT NOT NULL,
    choices JSONB NOT NULL DEFAULT '[]'::JSONB,
    correct_answer TEXT NOT NULL,
    accepted_answers TEXT[] NOT NULL,
    explanation TEXT NOT NULL,
    grade_bands TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    difficulty SMALLINT,
    review_status TEXT NOT NULL DEFAULT 'source_imported',
    question_version INTEGER NOT NULL DEFAULT 1,
    source_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (content_type, item_key, variant_key),
    FOREIGN KEY (content_type, item_key)
        REFERENCES public.learning_content_items(content_type, item_key) ON DELETE CASCADE,
    CONSTRAINT learning_content_questions_variant_key_check
        CHECK (char_length(BTRIM(variant_key)) BETWEEN 3 AND 200),
    CONSTRAINT learning_content_questions_type_check
        CHECK (char_length(BTRIM(question_type)) BETWEEN 1 AND 50),
    CONSTRAINT learning_content_questions_prompt_check
        CHECK (char_length(BTRIM(prompt)) BETWEEN 1 AND 1500),
    CONSTRAINT learning_content_questions_choices_check
        CHECK (jsonb_typeof(choices) = 'array' AND jsonb_array_length(choices) <= 6
               AND char_length(choices::TEXT) <= 6000),
    CONSTRAINT learning_content_questions_answer_check
        CHECK (char_length(BTRIM(correct_answer)) BETWEEN 1 AND 500),
    CONSTRAINT learning_content_questions_accepted_answers_check
        CHECK (cardinality(accepted_answers) BETWEEN 1 AND 10),
    CONSTRAINT learning_content_questions_explanation_check
        CHECK (char_length(BTRIM(explanation)) BETWEEN 1 AND 1500),
    CONSTRAINT learning_content_questions_grade_bands_check
        CHECK (grade_bands <@ ARRAY['g34', 'g56']::TEXT[] AND cardinality(grade_bands) <= 2),
    CONSTRAINT learning_content_questions_difficulty_check
        CHECK (difficulty IS NULL OR difficulty BETWEEN 1 AND 5),
    CONSTRAINT learning_content_questions_review_status_check
        CHECK (review_status = ANY (ARRAY[
            'source_imported', 'editorial_review', 'teacher_confirmed', 'published', 'retired'
        ])),
    CONSTRAINT learning_content_questions_version_check
        CHECK (question_version > 0),
    CONSTRAINT learning_content_questions_source_metadata_check
        CHECK (jsonb_typeof(source_metadata) = 'object' AND char_length(source_metadata::TEXT) <= 10000),
    CONSTRAINT learning_content_questions_publish_ready_check
        CHECK (
            review_status <> 'published'
            OR (cardinality(grade_bands) > 0 AND difficulty IS NOT NULL)
        )
);

CREATE INDEX IF NOT EXISTS learning_content_questions_published_idx
    ON public.learning_content_questions (content_type, question_type, difficulty, item_key)
    WHERE review_status = 'published';

CREATE TABLE IF NOT EXISTS public.learning_content_collections (
    content_type TEXT NOT NULL,
    collection_key TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    grade_bands TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    content_level SMALLINT,
    review_status TEXT NOT NULL DEFAULT 'editorial_review',
    collection_version INTEGER NOT NULL DEFAULT 1,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (content_type, collection_key),
    CONSTRAINT learning_content_collections_key_check
        CHECK (char_length(BTRIM(collection_key)) BETWEEN 1 AND 120),
    CONSTRAINT learning_content_collections_title_check
        CHECK (char_length(BTRIM(title)) BETWEEN 1 AND 100),
    CONSTRAINT learning_content_collections_description_check
        CHECK (description IS NULL OR char_length(BTRIM(description)) BETWEEN 1 AND 1000),
    CONSTRAINT learning_content_collections_grade_bands_check
        CHECK (grade_bands <@ ARRAY['g34', 'g56']::TEXT[] AND cardinality(grade_bands) <= 2),
    CONSTRAINT learning_content_collections_level_check
        CHECK (content_level IS NULL OR content_level BETWEEN 1 AND 5),
    CONSTRAINT learning_content_collections_review_status_check
        CHECK (review_status = ANY (ARRAY['editorial_review', 'teacher_confirmed', 'published', 'retired'])),
    CONSTRAINT learning_content_collections_version_check
        CHECK (collection_version > 0),
    CONSTRAINT learning_content_collections_metadata_check
        CHECK (jsonb_typeof(metadata) = 'object' AND char_length(metadata::TEXT) <= 10000),
    CONSTRAINT learning_content_collections_publish_ready_check
        CHECK (review_status <> 'published' OR cardinality(grade_bands) > 0)
);

CREATE TABLE IF NOT EXISTS public.learning_content_collection_items (
    content_type TEXT NOT NULL,
    collection_key TEXT NOT NULL,
    item_key TEXT NOT NULL,
    item_order SMALLINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (content_type, collection_key, item_key),
    FOREIGN KEY (content_type, collection_key)
        REFERENCES public.learning_content_collections(content_type, collection_key) ON DELETE CASCADE,
    FOREIGN KEY (content_type, item_key)
        REFERENCES public.learning_content_items(content_type, item_key) ON DELETE CASCADE,
    CONSTRAINT learning_content_collection_items_order_check
        CHECK (item_order BETWEEN 1 AND 100),
    UNIQUE (content_type, collection_key, item_order)
);

CREATE INDEX IF NOT EXISTS learning_content_collection_items_lookup_idx
    ON public.learning_content_collection_items (content_type, item_key, collection_key);

-- 문제 정답을 포함하므로 네 표 모두 브라우저 직접 권한을 주지 않는다. 후속 학생 RPC는 실제
-- 인증 학생·학급·오늘의 스냅샷을 확인하고 필요한 문제 한 건에서 정답을 제외해 반환해야 한다.
ALTER TABLE public.learning_content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_content_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_content_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_content_collection_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.learning_content_items FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.learning_content_questions FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.learning_content_collections FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.learning_content_collection_items FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.learning_content_items IS
    '일일 학습과 별도 학습 콘텐츠가 함께 쓰는 표현·뜻 원본. published만 운영 출제 가능.';
COMMENT ON TABLE public.learning_content_questions IS
    '공통 항목의 문제 변형과 서버 채점 정답. 브라우저 직접 조회 금지.';
COMMENT ON TABLE public.learning_content_collections IS
    '콘텐츠가 선언하는 학습 묶음. 키는 learning_item_progress.collection_key와 그대로 연결한다.';
COMMENT ON TABLE public.learning_content_collection_items IS
    '한 원본 항목을 하나 이상의 학습 묶음에서 재사용하기 위한 순서표.';

COMMIT;
