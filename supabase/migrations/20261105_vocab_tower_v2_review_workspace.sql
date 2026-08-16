BEGIN;

-- 어휘 V2 검수 자료는 현재 운영 단어표와 분리한다. 학생 출제기는 이 표를 읽지 않으며,
-- 관리자 확인과 덱 잠금이 끝난 뒤 별도 배포 마이그레이션에서만 운영 문항으로 승격한다.
CREATE TABLE IF NOT EXISTS public.vocab_tower_v2_review_decks (
    deck_id TEXT PRIMARY KEY,
    grade SMALLINT NOT NULL CHECK (grade BETWEEN 3 AND 6),
    deck_number SMALLINT NOT NULL CHECK (deck_number BETWEEN 1 AND 10),
    review_status TEXT NOT NULL DEFAULT 'editorial_review'
        CHECK (review_status IN ('editorial_review', 'teacher_confirmed', 'locked')),
    source_fingerprint TEXT NOT NULL CHECK (char_length(source_fingerprint) BETWEEN 16 AND 128),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    locked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    locked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (grade, deck_number)
);

CREATE TABLE IF NOT EXISTS public.vocab_tower_v2_review_items (
    item_key TEXT PRIMARY KEY CHECK (char_length(item_key) BETWEEN 8 AND 120),
    deck_id TEXT NOT NULL
        REFERENCES public.vocab_tower_v2_review_decks(deck_id) ON DELETE CASCADE,
    item_order SMALLINT NOT NULL CHECK (item_order BETWEEN 1 AND 50),
    word TEXT NOT NULL CHECK (char_length(BTRIM(word)) BETWEEN 1 AND 50),
    part_of_speech TEXT NOT NULL CHECK (char_length(BTRIM(part_of_speech)) BETWEEN 1 AND 30),
    meaning_number SMALLINT NOT NULL CHECK (meaning_number BETWEEN 1 AND 20),
    difficulty SMALLINT NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
    category TEXT NOT NULL CHECK (char_length(BTRIM(category)) BETWEEN 1 AND 50),
    source_definition TEXT NOT NULL CHECK (char_length(BTRIM(source_definition)) BETWEEN 1 AND 300),
    source_example TEXT NOT NULL CHECK (char_length(BTRIM(source_example)) BETWEEN 1 AND 500),
    definition TEXT NOT NULL CHECK (char_length(BTRIM(definition)) BETWEEN 1 AND 300),
    example TEXT NOT NULL CHECK (char_length(BTRIM(example)) BETWEEN 1 AND 500),
    accepted_answers TEXT[] NOT NULL
        CHECK (cardinality(accepted_answers) BETWEEN 1 AND 10),
    questions JSONB NOT NULL CHECK (jsonb_typeof(questions) = 'object'),
    review_notes TEXT CHECK (review_notes IS NULL OR char_length(review_notes) <= 1000),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (deck_id, item_order),
    UNIQUE (deck_id, word, meaning_number)
);

CREATE INDEX IF NOT EXISTS vocab_tower_v2_review_items_deck_word_idx
    ON public.vocab_tower_v2_review_items(deck_id, word, meaning_number);

ALTER TABLE public.vocab_tower_v2_review_decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vocab_tower_v2_review_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.vocab_tower_v2_review_decks FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.vocab_tower_v2_review_items FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.vocab_tower_v2_review_decks IS
    '운영 어휘와 분리된 V2 덱 검수 상태. ADMIN 전용 RPC로만 확인·잠금한다.';
COMMENT ON TABLE public.vocab_tower_v2_review_items IS
    '품사·뜻 번호·문항 버전을 가진 V2 검수 항목. 잠긴 덱도 학생 출제에는 자동 연결하지 않는다.';

CREATE OR REPLACE FUNCTION public.validate_vocab_tower_v2_review_questions_v1(
    p_questions JSONB,
    p_word TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_key TEXT;
    v_question JSONB;
    v_correct_count INTEGER;
BEGIN
    IF jsonb_typeof(p_questions) IS DISTINCT FROM 'object'
       OR char_length(p_questions::TEXT) > 20000
       OR char_length(BTRIM(COALESCE(p_word, ''))) NOT BETWEEN 1 AND 50
       OR NOT (p_questions ?& ARRAY[
            'meaningChoice', 'clozeChoice', 'definitionInput', 'clozeInput', 'usageDistinction'
       ]) THEN
        RETURN FALSE;
    END IF;

    FOREACH v_key IN ARRAY ARRAY[
        'meaningChoice', 'clozeChoice', 'definitionInput', 'clozeInput', 'usageDistinction'
    ]
    LOOP
        v_question := p_questions->v_key;
        IF jsonb_typeof(v_question) IS DISTINCT FROM 'object'
           OR char_length(BTRIM(COALESCE(v_question->>'prompt', ''))) NOT BETWEEN 1 AND 1000
           OR v_question->>'status' IS DISTINCT FROM 'reviewed' THEN
            RETURN FALSE;
        END IF;
    END LOOP;

    FOREACH v_key IN ARRAY ARRAY['meaningChoice', 'clozeChoice', 'usageDistinction']
    LOOP
        v_question := p_questions->v_key;
        IF jsonb_typeof(v_question->'options') IS DISTINCT FROM 'array'
           OR jsonb_array_length(v_question->'options') NOT BETWEEN 2 AND 6
           OR EXISTS (
                SELECT 1
                FROM jsonb_array_elements(v_question->'options') option
                WHERE jsonb_typeof(option) IS DISTINCT FROM 'object'
                   OR char_length(BTRIM(COALESCE(option->>'value', ''))) NOT BETWEEN 1 AND 500
                   OR option->>'isCorrect' NOT IN ('true', 'false')
           ) THEN
            RETURN FALSE;
        END IF;

        SELECT count(*) FILTER (WHERE option->>'isCorrect' = 'true')
          INTO v_correct_count
        FROM jsonb_array_elements(v_question->'options') option;
        IF v_correct_count <> 1 THEN
            RETURN FALSE;
        END IF;
    END LOOP;

    FOREACH v_key IN ARRAY ARRAY['definitionInput', 'clozeInput']
    LOOP
        v_question := p_questions->v_key;
        IF jsonb_typeof(v_question->'acceptedAnswers') IS DISTINCT FROM 'array'
           OR jsonb_array_length(v_question->'acceptedAnswers') NOT BETWEEN 1 AND 10
           OR NOT ((v_question->'acceptedAnswers') ? p_word)
           OR EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(v_question->'acceptedAnswers') answer
                WHERE char_length(BTRIM(answer)) NOT BETWEEN 1 AND 50
           ) THEN
            RETURN FALSE;
        END IF;
    END LOOP;

    RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_vocab_tower_v2_review_deck_v1(
    p_grade SMALLINT,
    p_deck_number SMALLINT,
    p_limit INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_deck public.vocab_tower_v2_review_decks%ROWTYPE;
    v_items JSONB := '[]'::JSONB;
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 50);
BEGIN
    IF v_user_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.profiles profile
        WHERE profile.id = v_user_id
          AND profile.role = 'ADMIN'
    ) THEN
        RAISE EXCEPTION 'admin authentication required' USING ERRCODE = '42501';
    END IF;

    IF p_grade NOT BETWEEN 3 AND 6 OR p_deck_number NOT BETWEEN 1 AND 10 THEN
        RAISE EXCEPTION 'invalid vocabulary deck' USING ERRCODE = '22023';
    END IF;

    SELECT deck.*
      INTO v_deck
    FROM public.vocab_tower_v2_review_decks deck
    WHERE deck.grade = p_grade
      AND deck.deck_number = p_deck_number;

    IF v_deck.deck_id IS NULL THEN
        RETURN jsonb_build_object(
            'deck', NULL,
            'items', '[]'::JSONB,
            'can_edit', TRUE
        );
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(item_row) ORDER BY item_row.item_order), '[]'::JSONB)
      INTO v_items
    FROM (
        SELECT item.item_key,
               item.deck_id,
               item.item_order,
               item.word,
               item.part_of_speech,
               item.meaning_number,
               item.difficulty,
               item.category,
               item.source_definition,
               item.source_example,
               item.definition,
               item.example,
               item.accepted_answers,
               item.questions,
               item.review_notes,
               item.version,
               item.updated_at
        FROM public.vocab_tower_v2_review_items item
        WHERE item.deck_id = v_deck.deck_id
        ORDER BY item.item_order
        LIMIT v_limit
    ) item_row;

    RETURN jsonb_build_object(
        'deck', jsonb_build_object(
            'deck_id', v_deck.deck_id,
            'grade', v_deck.grade,
            'deck_number', v_deck.deck_number,
            'review_status', v_deck.review_status,
            'source_fingerprint', v_deck.source_fingerprint,
            'version', v_deck.version,
            'reviewed_at', v_deck.reviewed_at,
            'locked_at', v_deck.locked_at,
            'updated_at', v_deck.updated_at
        ),
        'items', v_items,
        'can_edit', TRUE
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_seed_vocab_tower_v2_review_deck_v1(
    p_grade SMALLINT,
    p_deck_number SMALLINT,
    p_deck_id TEXT,
    p_source_fingerprint TEXT,
    p_items JSONB,
    p_initial_status TEXT DEFAULT 'editorial_review'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_item JSONB;
    v_item_count INTEGER;
    v_expected_deck_id TEXT;
    v_answers TEXT[];
BEGIN
    IF v_user_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.profiles profile
        WHERE profile.id = v_user_id
          AND profile.role = 'ADMIN'
    ) THEN
        RAISE EXCEPTION 'admin authentication required' USING ERRCODE = '42501';
    END IF;

    v_expected_deck_id := format('grade%s-deck%s', p_grade, lpad(p_deck_number::TEXT, 2, '0'));
    IF p_grade NOT BETWEEN 3 AND 6
       OR p_deck_number NOT BETWEEN 1 AND 10
       OR p_deck_id IS DISTINCT FROM v_expected_deck_id
       OR p_initial_status NOT IN ('editorial_review', 'teacher_confirmed')
       OR char_length(COALESCE(p_source_fingerprint, '')) NOT BETWEEN 16 AND 128
       OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'invalid vocabulary review seed' USING ERRCODE = '22023';
    END IF;

    v_item_count := jsonb_array_length(p_items);
    IF v_item_count NOT BETWEEN 1 AND 50 THEN
        RAISE EXCEPTION 'vocabulary review seed must contain 1 to 50 items' USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(p_deck_id, 0));

    IF EXISTS (
        SELECT 1
        FROM public.vocab_tower_v2_review_decks deck
        WHERE deck.deck_id = p_deck_id
          AND deck.source_fingerprint IS DISTINCT FROM p_source_fingerprint
    ) THEN
        RAISE EXCEPTION 'vocabulary review deck source changed' USING ERRCODE = '40001';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.vocab_tower_v2_review_decks deck WHERE deck.deck_id = p_deck_id
    ) THEN
        RETURN public.admin_get_vocab_tower_v2_review_deck_v1(p_grade, p_deck_number, 50);
    END IF;

    INSERT INTO public.vocab_tower_v2_review_decks (
        deck_id, grade, deck_number, review_status, source_fingerprint,
        reviewed_by, reviewed_at
    ) VALUES (
        p_deck_id, p_grade, p_deck_number, p_initial_status, p_source_fingerprint,
        CASE WHEN p_initial_status = 'teacher_confirmed' THEN v_user_id ELSE NULL END,
        CASE WHEN p_initial_status = 'teacher_confirmed' THEN NOW() ELSE NULL END
    );

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
    LOOP
        IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
           OR char_length(BTRIM(COALESCE(v_item->>'itemKey', ''))) NOT BETWEEN 8 AND 120
           OR COALESCE((v_item->>'itemOrder')::INTEGER, 0) NOT BETWEEN 1 AND 50
           OR char_length(BTRIM(COALESCE(v_item->>'word', ''))) NOT BETWEEN 1 AND 50
           OR char_length(BTRIM(COALESCE(v_item->>'partOfSpeech', ''))) NOT BETWEEN 1 AND 30
           OR COALESCE((v_item->>'meaningNumber')::INTEGER, 0) NOT BETWEEN 1 AND 20
           OR COALESCE((v_item->>'level')::INTEGER, 0) NOT BETWEEN 1 AND 5
           OR char_length(BTRIM(COALESCE(v_item->>'category', ''))) NOT BETWEEN 1 AND 50
           OR char_length(BTRIM(COALESCE(v_item->>'sourceDefinition', ''))) NOT BETWEEN 1 AND 300
           OR char_length(BTRIM(COALESCE(v_item->>'sourceExample', ''))) NOT BETWEEN 1 AND 500
           OR char_length(BTRIM(COALESCE(v_item->>'definition', ''))) NOT BETWEEN 1 AND 300
           OR char_length(BTRIM(COALESCE(v_item->>'example', ''))) NOT BETWEEN 1 AND 500
           OR jsonb_typeof(v_item->'acceptedAnswers') IS DISTINCT FROM 'array'
           OR NOT public.validate_vocab_tower_v2_review_questions_v1(
                v_item->'questions', v_item->>'word'
           ) THEN
            RAISE EXCEPTION 'invalid vocabulary review item: %', COALESCE(v_item->>'itemKey', '(unknown)')
                USING ERRCODE = '22023';
        END IF;

        SELECT ARRAY(SELECT BTRIM(value) FROM jsonb_array_elements_text(v_item->'acceptedAnswers'))
          INTO v_answers;
        IF cardinality(v_answers) NOT BETWEEN 1 AND 10
           OR EXISTS (SELECT 1 FROM unnest(v_answers) answer WHERE char_length(answer) NOT BETWEEN 1 AND 50)
           OR NOT (v_item->>'word' = ANY(v_answers)) THEN
            RAISE EXCEPTION 'invalid accepted answers: %', v_item->>'itemKey' USING ERRCODE = '22023';
        END IF;

        INSERT INTO public.vocab_tower_v2_review_items (
            item_key, deck_id, item_order, word, part_of_speech, meaning_number, difficulty, category,
            source_definition, source_example, definition, example, accepted_answers,
            questions, review_notes, updated_by
        ) VALUES (
            v_item->>'itemKey', p_deck_id, (v_item->>'itemOrder')::SMALLINT,
            BTRIM(v_item->>'word'), BTRIM(v_item->>'partOfSpeech'),
            (v_item->>'meaningNumber')::SMALLINT, (v_item->>'level')::SMALLINT,
            BTRIM(v_item->>'category'), BTRIM(v_item->>'sourceDefinition'), BTRIM(v_item->>'sourceExample'),
            BTRIM(v_item->>'definition'), BTRIM(v_item->>'example'), v_answers,
            v_item->'questions', NULLIF(BTRIM(v_item->>'reviewNotes'), ''), v_user_id
        );
    END LOOP;

    RETURN public.admin_get_vocab_tower_v2_review_deck_v1(p_grade, p_deck_number, 50);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_save_vocab_tower_v2_review_item_v1(
    p_item_key TEXT,
    p_expected_version INTEGER,
    p_part_of_speech TEXT,
    p_meaning_number SMALLINT,
    p_difficulty SMALLINT,
    p_definition TEXT,
    p_example TEXT,
    p_accepted_answers TEXT[],
    p_questions JSONB,
    p_review_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_deck_id TEXT;
    v_deck_status TEXT;
    v_word TEXT;
    v_item public.vocab_tower_v2_review_items%ROWTYPE;
BEGIN
    IF v_user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles profile WHERE profile.id = v_user_id AND profile.role = 'ADMIN'
    ) THEN
        RAISE EXCEPTION 'admin authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT item.deck_id, deck.review_status, item.word
      INTO v_deck_id, v_deck_status, v_word
    FROM public.vocab_tower_v2_review_items item
    JOIN public.vocab_tower_v2_review_decks deck ON deck.deck_id = item.deck_id
    WHERE item.item_key = p_item_key
    FOR UPDATE OF item, deck;

    IF v_deck_id IS NULL THEN
        RAISE EXCEPTION 'vocabulary review item not found' USING ERRCODE = 'P0002';
    END IF;
    IF v_deck_status = 'locked' THEN
        RAISE EXCEPTION 'locked vocabulary deck cannot be edited' USING ERRCODE = '55000';
    END IF;
    IF COALESCE(p_expected_version, 0) < 1
       OR char_length(BTRIM(COALESCE(p_part_of_speech, ''))) NOT BETWEEN 1 AND 30
       OR p_meaning_number NOT BETWEEN 1 AND 20
       OR p_difficulty NOT BETWEEN 1 AND 5
       OR char_length(BTRIM(COALESCE(p_definition, ''))) NOT BETWEEN 1 AND 300
       OR char_length(BTRIM(COALESCE(p_example, ''))) NOT BETWEEN 1 AND 500
       OR cardinality(p_accepted_answers) NOT BETWEEN 1 AND 10
       OR EXISTS (SELECT 1 FROM unnest(p_accepted_answers) answer WHERE char_length(BTRIM(answer)) NOT BETWEEN 1 AND 50)
       OR NOT (v_word = ANY(p_accepted_answers))
       OR NOT public.validate_vocab_tower_v2_review_questions_v1(p_questions, v_word)
       OR char_length(COALESCE(p_review_notes, '')) > 1000 THEN
        RAISE EXCEPTION 'invalid vocabulary review item update' USING ERRCODE = '22023';
    END IF;

    UPDATE public.vocab_tower_v2_review_items item
       SET part_of_speech = BTRIM(p_part_of_speech),
           meaning_number = p_meaning_number,
           difficulty = p_difficulty,
           definition = BTRIM(p_definition),
           example = BTRIM(p_example),
           accepted_answers = ARRAY(SELECT BTRIM(answer) FROM unnest(p_accepted_answers) answer),
           questions = p_questions,
           review_notes = NULLIF(BTRIM(p_review_notes), ''),
           version = item.version + 1,
           updated_by = v_user_id,
           updated_at = NOW()
     WHERE item.item_key = p_item_key
       AND item.version = p_expected_version
    RETURNING item.* INTO v_item;

    IF v_item.item_key IS NULL THEN
        RAISE EXCEPTION 'vocabulary review item changed by another editor' USING ERRCODE = '40001';
    END IF;

    UPDATE public.vocab_tower_v2_review_decks deck
       SET review_status = 'editorial_review',
           reviewed_by = NULL,
           reviewed_at = NULL,
           version = deck.version + 1,
           updated_at = NOW()
     WHERE deck.deck_id = v_deck_id;

    RETURN jsonb_build_object(
        'item', to_jsonb(v_item),
        'deck_status', 'editorial_review',
        'deck_version', (
            SELECT deck.version FROM public.vocab_tower_v2_review_decks deck WHERE deck.deck_id = v_deck_id
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_vocab_tower_v2_review_status_v1(
    p_deck_id TEXT,
    p_expected_version INTEGER,
    p_review_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_deck public.vocab_tower_v2_review_decks%ROWTYPE;
    v_item_count INTEGER;
    v_incomplete_count INTEGER;
BEGIN
    IF v_user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles profile WHERE profile.id = v_user_id AND profile.role = 'ADMIN'
    ) THEN
        RAISE EXCEPTION 'admin authentication required' USING ERRCODE = '42501';
    END IF;
    IF p_review_status NOT IN ('editorial_review', 'teacher_confirmed', 'locked') THEN
        RAISE EXCEPTION 'invalid vocabulary review status' USING ERRCODE = '22023';
    END IF;

    SELECT deck.* INTO v_deck
    FROM public.vocab_tower_v2_review_decks deck
    WHERE deck.deck_id = p_deck_id
    FOR UPDATE;

    IF v_deck.deck_id IS NULL THEN
        RAISE EXCEPTION 'vocabulary review deck not found' USING ERRCODE = 'P0002';
    END IF;
    IF v_deck.version <> p_expected_version THEN
        RAISE EXCEPTION 'vocabulary review deck changed by another editor' USING ERRCODE = '40001';
    END IF;
    IF p_review_status = 'locked' AND v_deck.review_status <> 'teacher_confirmed' THEN
        RAISE EXCEPTION 'teacher confirmation is required before locking' USING ERRCODE = '55000';
    END IF;

    IF p_review_status IN ('teacher_confirmed', 'locked') THEN
        SELECT count(*), count(*) FILTER (WHERE
            part_of_speech = ''
            OR meaning_number IS NULL
            OR cardinality(accepted_answers) = 0
            OR NOT public.validate_vocab_tower_v2_review_questions_v1(questions, word)
        )
          INTO v_item_count, v_incomplete_count
        FROM public.vocab_tower_v2_review_items item
        WHERE item.deck_id = p_deck_id;

        IF v_item_count = 0 OR v_item_count > 50 OR v_incomplete_count > 0 THEN
            RAISE EXCEPTION 'vocabulary review deck has incomplete items' USING ERRCODE = '55000';
        END IF;
    END IF;

    UPDATE public.vocab_tower_v2_review_decks deck
       SET review_status = p_review_status,
           reviewed_by = CASE WHEN p_review_status IN ('teacher_confirmed', 'locked') THEN v_user_id ELSE NULL END,
           reviewed_at = CASE WHEN p_review_status IN ('teacher_confirmed', 'locked') THEN NOW() ELSE NULL END,
           locked_by = CASE WHEN p_review_status = 'locked' THEN v_user_id ELSE NULL END,
           locked_at = CASE WHEN p_review_status = 'locked' THEN NOW() ELSE NULL END,
           version = deck.version + 1,
           updated_at = NOW()
     WHERE deck.deck_id = p_deck_id
    RETURNING deck.* INTO v_deck;

    RETURN jsonb_build_object('deck', to_jsonb(v_deck), 'item_count', v_item_count);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_vocab_tower_v2_review_deck_v1(SMALLINT, SMALLINT, INTEGER)
    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_seed_vocab_tower_v2_review_deck_v1(SMALLINT, SMALLINT, TEXT, TEXT, JSONB, TEXT)
    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_save_vocab_tower_v2_review_item_v1(TEXT, INTEGER, TEXT, SMALLINT, SMALLINT, TEXT, TEXT, TEXT[], JSONB, TEXT)
    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_vocab_tower_v2_review_status_v1(TEXT, INTEGER, TEXT)
    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.validate_vocab_tower_v2_review_questions_v1(JSONB, TEXT)
    FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.admin_get_vocab_tower_v2_review_deck_v1(SMALLINT, SMALLINT, INTEGER)
    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_seed_vocab_tower_v2_review_deck_v1(SMALLINT, SMALLINT, TEXT, TEXT, JSONB, TEXT)
    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_save_vocab_tower_v2_review_item_v1(TEXT, INTEGER, TEXT, SMALLINT, SMALLINT, TEXT, TEXT, TEXT[], JSONB, TEXT)
    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_vocab_tower_v2_review_status_v1(TEXT, INTEGER, TEXT)
    TO authenticated, service_role;

COMMIT;
