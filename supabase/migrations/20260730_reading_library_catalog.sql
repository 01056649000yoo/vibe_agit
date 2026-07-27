-- ==========================================================================
-- 독서록 도서 카탈로그 + 학생 책장
--
-- 책 정보, 학생이 읽은 책, 독서록 글을 분리한다. student_posts는 글쓰기
-- 코어 저장소로 그대로 두고 reading_log_entries가 1:1로 연결한다.
-- ==========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.book_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL CHECK (source IN ('kakao', 'manual')),
    source_key TEXT NOT NULL,
    isbn10 TEXT,
    isbn13 TEXT,
    title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 300),
    authors TEXT[] NOT NULL DEFAULT '{}',
    translators TEXT[] NOT NULL DEFAULT '{}',
    publisher TEXT,
    published_date DATE,
    thumbnail_url TEXT,
    source_url TEXT,
    created_by_student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT book_catalog_source_key_unique UNIQUE (source, source_key),
    CONSTRAINT book_catalog_isbn10_format CHECK (isbn10 IS NULL OR isbn10 ~ '^[0-9X]{10}$'),
    CONSTRAINT book_catalog_isbn13_format CHECK (isbn13 IS NULL OR isbn13 ~ '^[0-9]{13}$'),
    CONSTRAINT book_catalog_thumbnail_https CHECK (thumbnail_url IS NULL OR thumbnail_url LIKE 'https://%'),
    CONSTRAINT book_catalog_source_url_https CHECK (source_url IS NULL OR source_url LIKE 'https://%')
);

CREATE INDEX IF NOT EXISTS idx_book_catalog_isbn13
    ON public.book_catalog (isbn13)
    WHERE isbn13 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_book_catalog_title
    ON public.book_catalog (lower(title));

CREATE TABLE IF NOT EXISTS public.student_library_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    book_id UUID NOT NULL REFERENCES public.book_catalog(id) ON DELETE RESTRICT,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    reading_status TEXT NOT NULL DEFAULT 'completed'
        CHECK (reading_status IN ('reading', 'completed')),
    started_on DATE,
    finished_on DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT student_library_student_book_unique UNIQUE (student_id, book_id),
    CONSTRAINT student_library_finished_date_check
        CHECK (finished_on IS NULL OR started_on IS NULL OR finished_on >= started_on)
);

CREATE INDEX IF NOT EXISTS idx_student_library_owner_status
    ON public.student_library_items (student_id, reading_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_library_class
    ON public.student_library_items (class_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.reading_log_entries (
    post_id UUID PRIMARY KEY REFERENCES public.student_posts(id) ON DELETE CASCADE,
    library_item_id UUID NOT NULL REFERENCES public.student_library_items(id) ON DELETE RESTRICT,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reading_log_library_item
    ON public.reading_log_entries (library_item_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_reading_log_student
    ON public.reading_log_entries (student_id, updated_at DESC);

-- 1차 독서록 기능으로 먼저 작성된 글이 있으면 수동 등록 책으로 무손실 연결한다.
WITH legacy_books AS (
    SELECT DISTINCT ON (source_key)
        source_key,
        book_title,
        book_author,
        student_id
    FROM (
        SELECT
            md5(
                lower(btrim(COALESCE(NULLIF(p.structured_content ->> 'bookTitle', ''), p.title, '제목 없는 책')))
                || '|' || lower(btrim(COALESCE(p.structured_content ->> 'bookAuthor', '')))
                || '|'
            ) AS source_key,
            btrim(COALESCE(NULLIF(p.structured_content ->> 'bookTitle', ''), p.title, '제목 없는 책')) AS book_title,
            btrim(COALESCE(p.structured_content ->> 'bookAuthor', '')) AS book_author,
            p.student_id
        FROM public.student_posts p
        WHERE p.writing_context = 'self'
          AND p.self_writing_type = 'reading_log'
    ) normalized
    ORDER BY source_key, student_id
)
INSERT INTO public.book_catalog (
    source, source_key, title, authors, created_by_student_id
)
SELECT
    'manual',
    source_key,
    left(book_title, 300),
    CASE WHEN book_author = '' THEN '{}'::TEXT[] ELSE ARRAY[left(book_author, 120)] END,
    student_id
FROM legacy_books
ON CONFLICT (source, source_key) DO NOTHING;

WITH legacy_posts AS (
    SELECT
        p.id AS post_id,
        p.student_id,
        p.class_id,
        md5(
            lower(btrim(COALESCE(NULLIF(p.structured_content ->> 'bookTitle', ''), p.title, '제목 없는 책')))
            || '|' || lower(btrim(COALESCE(p.structured_content ->> 'bookAuthor', '')))
            || '|'
        ) AS source_key
    FROM public.student_posts p
    WHERE p.writing_context = 'self'
      AND p.self_writing_type = 'reading_log'
), inserted_library AS (
    INSERT INTO public.student_library_items (
        student_id, book_id, class_id, reading_status, finished_on
    )
    SELECT DISTINCT
        lp.student_id,
        b.id,
        lp.class_id,
        'completed',
        CURRENT_DATE
    FROM legacy_posts lp
    JOIN public.book_catalog b
      ON b.source = 'manual' AND b.source_key = lp.source_key
    ON CONFLICT (student_id, book_id) DO NOTHING
    RETURNING id
)
SELECT count(*) FROM inserted_library;

INSERT INTO public.reading_log_entries (post_id, library_item_id, student_id, class_id)
SELECT
    p.id,
    l.id,
    p.student_id,
    p.class_id
FROM public.student_posts p
JOIN public.book_catalog b
  ON b.source = 'manual'
 AND b.source_key = md5(
    lower(btrim(COALESCE(NULLIF(p.structured_content ->> 'bookTitle', ''), p.title, '제목 없는 책')))
    || '|' || lower(btrim(COALESCE(p.structured_content ->> 'bookAuthor', '')))
    || '|'
 )
JOIN public.student_library_items l
  ON l.student_id = p.student_id AND l.book_id = b.id
WHERE p.writing_context = 'self'
  AND p.self_writing_type = 'reading_log'
ON CONFLICT (post_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_reading_library_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_book_catalog_updated_at ON public.book_catalog;
CREATE TRIGGER trg_book_catalog_updated_at
BEFORE UPDATE ON public.book_catalog
FOR EACH ROW EXECUTE FUNCTION public.set_reading_library_updated_at();

DROP TRIGGER IF EXISTS trg_student_library_updated_at ON public.student_library_items;
CREATE TRIGGER trg_student_library_updated_at
BEFORE UPDATE ON public.student_library_items
FOR EACH ROW EXECUTE FUNCTION public.set_reading_library_updated_at();

DROP TRIGGER IF EXISTS trg_reading_log_updated_at ON public.reading_log_entries;
CREATE TRIGGER trg_reading_log_updated_at
BEFORE UPDATE ON public.reading_log_entries
FOR EACH ROW EXECUTE FUNCTION public.set_reading_library_updated_at();

CREATE OR REPLACE FUNCTION public.validate_student_library_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_class_id UUID;
BEGIN
    SELECT s.class_id
    INTO v_class_id
    FROM public.students s
    WHERE s.id = NEW.student_id
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW());

    IF v_class_id IS NULL THEN
        RAISE EXCEPTION '활성 학생의 학급 정보를 찾을 수 없습니다.'
            USING ERRCODE = '23514';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.student_id IS DISTINCT FROM OLD.student_id
           OR NEW.book_id IS DISTINCT FROM OLD.book_id
           OR NEW.class_id IS DISTINCT FROM OLD.class_id THEN
            RAISE EXCEPTION '책장 항목의 학생, 책, 학급은 변경할 수 없습니다.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    NEW.class_id := v_class_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_student_library_item ON public.student_library_items;
CREATE TRIGGER trg_validate_student_library_item
BEFORE INSERT OR UPDATE ON public.student_library_items
FOR EACH ROW EXECUTE FUNCTION public.validate_student_library_item();

CREATE OR REPLACE FUNCTION public.validate_reading_log_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_post_student_id UUID;
    v_post_class_id UUID;
    v_library_student_id UUID;
    v_library_class_id UUID;
BEGIN
    SELECT p.student_id, p.class_id
    INTO v_post_student_id, v_post_class_id
    FROM public.student_posts p
    WHERE p.id = NEW.post_id
      AND p.writing_context = 'self'
      AND p.self_writing_type = 'reading_log';

    SELECT l.student_id, l.class_id
    INTO v_library_student_id, v_library_class_id
    FROM public.student_library_items l
    WHERE l.id = NEW.library_item_id;

    IF v_post_student_id IS NULL OR v_library_student_id IS NULL THEN
        RAISE EXCEPTION '독서록 글 또는 책장 항목을 찾을 수 없습니다.'
            USING ERRCODE = '23503';
    END IF;

    IF v_post_student_id IS DISTINCT FROM v_library_student_id
       OR v_post_class_id IS DISTINCT FROM v_library_class_id THEN
        RAISE EXCEPTION '독서록 글과 책장 항목의 학생 또는 학급이 일치하지 않습니다.'
            USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.post_id IS DISTINCT FROM OLD.post_id THEN
        RAISE EXCEPTION '독서록 연결의 대상 글은 변경할 수 없습니다.'
            USING ERRCODE = '42501';
    END IF;

    NEW.student_id := v_post_student_id;
    NEW.class_id := v_post_class_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_reading_log_entry ON public.reading_log_entries;
CREATE TRIGGER trg_validate_reading_log_entry
BEFORE INSERT OR UPDATE ON public.reading_log_entries
FOR EACH ROW EXECUTE FUNCTION public.validate_reading_log_entry();

ALTER TABLE public.book_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_library_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_log_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Book_Catalog_Read_V1" ON public.book_catalog;
CREATE POLICY "Book_Catalog_Read_V1" ON public.book_catalog
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Student_Library_Read_V1" ON public.student_library_items;
CREATE POLICY "Student_Library_Read_V1" ON public.student_library_items
FOR SELECT TO authenticated
USING (
    public.auth_user_role() = 'ADMIN'
    OR student_id = public.auth_student_id()
    OR EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = student_library_items.class_id AND c.teacher_id = auth.uid()
    )
    OR (
        class_id = public.auth_user_class_id()
        AND EXISTS (
            SELECT 1
            FROM public.reading_log_entries r
            JOIN public.student_posts p ON p.id = r.post_id
            WHERE r.library_item_id = student_library_items.id
              AND p.is_submitted = true
              AND p.visibility = 'class'
        )
    )
);

DROP POLICY IF EXISTS "Reading_Log_Entry_Read_V1" ON public.reading_log_entries;
CREATE POLICY "Reading_Log_Entry_Read_V1" ON public.reading_log_entries
FOR SELECT TO authenticated
USING (
    public.auth_user_role() = 'ADMIN'
    OR student_id = public.auth_student_id()
    OR EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = reading_log_entries.class_id AND c.teacher_id = auth.uid()
    )
    OR (
        class_id = public.auth_user_class_id()
        AND EXISTS (
            SELECT 1 FROM public.student_posts p
            WHERE p.id = reading_log_entries.post_id
              AND p.is_submitted = true
              AND p.visibility = 'class'
        )
    )
);

-- 한 번의 트랜잭션에서 책 카탈로그, 학생 책장, 글, 연결 행을 저장한다.
-- SECURITY DEFINER이므로 JWT에 연결된 학생 본인 여부를 함수 내부에서 먼저 확인한다.
CREATE OR REPLACE FUNCTION public.upsert_my_reading_log(
    p_post_id UUID,
    p_book JSONB,
    p_title TEXT,
    p_content TEXT,
    p_visibility TEXT DEFAULT 'private',
    p_reading_status TEXT DEFAULT 'completed'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID;
    v_class_id UUID;
    v_source TEXT;
    v_source_key TEXT;
    v_isbn10 TEXT;
    v_isbn13 TEXT;
    v_title TEXT;
    v_authors TEXT[];
    v_translators TEXT[];
    v_publisher TEXT;
    v_published_date DATE;
    v_thumbnail_url TEXT;
    v_source_url TEXT;
    v_book_id UUID;
    v_library_item_id UUID;
    v_post_id UUID;
    v_char_count INTEGER;
    v_paragraph_count INTEGER;
    v_structured_content JSONB;
BEGIN
    v_student_id := public.auth_student_id();
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT s.class_id
    INTO v_class_id
    FROM public.students s
    WHERE s.id = v_student_id
      AND s.auth_id = auth.uid()
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW());

    IF v_class_id IS NULL THEN
        RAISE EXCEPTION '현재 로그인과 연결된 학생을 찾을 수 없습니다.'
            USING ERRCODE = '42501';
    END IF;

    IF p_visibility NOT IN ('private', 'class') THEN
        RAISE EXCEPTION '공개 범위가 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;
    IF p_reading_status NOT IN ('reading', 'completed') THEN
        RAISE EXCEPTION '독서 상태가 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;
    IF char_length(btrim(COALESCE(p_title, ''))) NOT BETWEEN 1 AND 200 THEN
        RAISE EXCEPTION '독서록 제목은 1자 이상 200자 이하로 입력해 주세요.' USING ERRCODE = '22023';
    END IF;
    IF char_length(btrim(COALESCE(p_content, ''))) NOT BETWEEN 1 AND 20000 THEN
        RAISE EXCEPTION '독서록 내용은 1자 이상 20,000자 이하로 입력해 주세요.' USING ERRCODE = '22023';
    END IF;

    v_source := CASE WHEN p_book ->> 'source' = 'kakao' THEN 'kakao' ELSE 'manual' END;
    v_title := left(btrim(COALESCE(p_book ->> 'title', '')), 300);
    IF v_title = '' THEN
        RAISE EXCEPTION '책 제목이 필요합니다.' USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(array_agg(left(value, 120)), '{}')
    INTO v_authors
    FROM jsonb_array_elements_text(
        CASE
            WHEN jsonb_typeof(p_book -> 'authors') = 'array' THEN p_book -> 'authors'
            ELSE '[]'::JSONB
        END
    ) WITH ORDINALITY AS author(value, position)
    WHERE position <= 20
      AND btrim(value) <> '';

    SELECT COALESCE(array_agg(left(value, 120)), '{}')
    INTO v_translators
    FROM jsonb_array_elements_text(
        CASE
            WHEN jsonb_typeof(p_book -> 'translators') = 'array' THEN p_book -> 'translators'
            ELSE '[]'::JSONB
        END
    ) WITH ORDINALITY AS translator(value, position)
    WHERE position <= 20
      AND btrim(value) <> '';

    v_isbn10 := upper(regexp_replace(COALESCE(p_book ->> 'isbn10', ''), '[^0-9X]', '', 'g'));
    IF char_length(v_isbn10) <> 10 THEN v_isbn10 := NULL; END IF;
    v_isbn13 := regexp_replace(COALESCE(p_book ->> 'isbn13', ''), '[^0-9]', '', 'g');
    IF char_length(v_isbn13) <> 13 THEN v_isbn13 := NULL; END IF;

    v_publisher := NULLIF(left(btrim(COALESCE(p_book ->> 'publisher', '')), 160), '');
    v_thumbnail_url := CASE
        WHEN p_book ->> 'thumbnailUrl' LIKE 'https://%' THEN left(p_book ->> 'thumbnailUrl', 1000)
        ELSE NULL
    END;
    v_source_url := CASE
        WHEN p_book ->> 'sourceUrl' LIKE 'https://%' THEN left(p_book ->> 'sourceUrl', 1000)
        ELSE NULL
    END;
    v_published_date := CASE
        WHEN COALESCE(p_book ->> 'publishedDate', '') ~ '^\d{4}-\d{2}-\d{2}'
            THEN left(p_book ->> 'publishedDate', 10)::DATE
        ELSE NULL
    END;

    v_source_key := COALESCE(
        v_isbn13,
        v_isbn10,
        md5(lower(v_title) || '|' || lower(array_to_string(v_authors, ',')) || '|' || lower(COALESCE(v_publisher, '')))
    );

    INSERT INTO public.book_catalog (
        source, source_key, isbn10, isbn13, title, authors, translators,
        publisher, published_date, thumbnail_url, source_url, created_by_student_id
    ) VALUES (
        v_source, v_source_key, v_isbn10, v_isbn13, v_title, v_authors, v_translators,
        v_publisher, v_published_date, v_thumbnail_url, v_source_url, v_student_id
    )
    ON CONFLICT (source, source_key) DO NOTHING
    RETURNING id INTO v_book_id;

    -- 학생 클라이언트가 이미 등록된 공통 도서 정보를 덮어쓰지 못하게 한다.
    IF v_book_id IS NULL THEN
        SELECT b.id
        INTO v_book_id
        FROM public.book_catalog b
        WHERE b.source = v_source
          AND b.source_key = v_source_key;
    END IF;

    INSERT INTO public.student_library_items (
        student_id, book_id, class_id, reading_status,
        started_on, finished_on
    ) VALUES (
        v_student_id, v_book_id, v_class_id, p_reading_status,
        CASE WHEN p_reading_status = 'reading' THEN CURRENT_DATE ELSE NULL END,
        CASE WHEN p_reading_status = 'completed' THEN CURRENT_DATE ELSE NULL END
    )
    ON CONFLICT (student_id, book_id) DO UPDATE
    SET reading_status = EXCLUDED.reading_status,
        started_on = CASE
            WHEN student_library_items.started_on IS NOT NULL THEN student_library_items.started_on
            WHEN EXCLUDED.reading_status = 'reading' THEN CURRENT_DATE
            ELSE student_library_items.started_on
        END,
        finished_on = CASE
            WHEN EXCLUDED.reading_status = 'completed' THEN COALESCE(student_library_items.finished_on, CURRENT_DATE)
            ELSE NULL
        END
    RETURNING id INTO v_library_item_id;

    v_char_count := char_length(regexp_replace(COALESCE(p_content, ''), '\s', '', 'g'));
    SELECT count(*)::INTEGER
    INTO v_paragraph_count
    FROM regexp_split_to_table(COALESCE(p_content, ''), E'\n+') AS paragraph(value)
    WHERE btrim(value) <> '';

    v_structured_content := jsonb_build_object(
        'type', 'reading_log',
        'bookId', v_book_id,
        'libraryItemId', v_library_item_id,
        'source', v_source,
        'bookTitle', v_title,
        'bookAuthor', array_to_string(v_authors, ', '),
        'bookAuthors', to_jsonb(v_authors),
        'publisher', v_publisher,
        'publishedDate', v_published_date,
        'isbn10', v_isbn10,
        'isbn13', v_isbn13,
        'thumbnailUrl', v_thumbnail_url,
        'sourceUrl', v_source_url,
        'readingStatus', p_reading_status
    );

    IF p_post_id IS NULL THEN
        INSERT INTO public.student_posts (
            student_id, mission_id, writing_context, self_writing_type,
            title, content, char_count, paragraph_count, structured_content,
            visibility, is_submitted
        ) VALUES (
            v_student_id, NULL, 'self', 'reading_log',
            btrim(p_title), p_content, v_char_count, v_paragraph_count, v_structured_content,
            p_visibility, true
        )
        RETURNING id INTO v_post_id;
    ELSE
        UPDATE public.student_posts
        SET title = btrim(p_title),
            content = p_content,
            char_count = v_char_count,
            paragraph_count = v_paragraph_count,
            structured_content = v_structured_content,
            visibility = p_visibility,
            is_submitted = true
        WHERE id = p_post_id
          AND student_id = v_student_id
          AND writing_context = 'self'
          AND self_writing_type = 'reading_log'
        RETURNING id INTO v_post_id;

        IF v_post_id IS NULL THEN
            RAISE EXCEPTION '수정할 내 독서록을 찾을 수 없습니다.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    INSERT INTO public.reading_log_entries (post_id, library_item_id, student_id, class_id)
    VALUES (v_post_id, v_library_item_id, v_student_id, v_class_id)
    ON CONFLICT (post_id) DO UPDATE
    SET library_item_id = EXCLUDED.library_item_id;

    RETURN jsonb_build_object(
        'success', true,
        'post_id', v_post_id,
        'book_id', v_book_id,
        'library_item_id', v_library_item_id
    );
END;
$$;

REVOKE ALL ON TABLE public.book_catalog FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.student_library_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.reading_log_entries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.book_catalog TO authenticated;
GRANT SELECT ON TABLE public.student_library_items TO authenticated;
GRANT SELECT ON TABLE public.reading_log_entries TO authenticated;
GRANT ALL ON TABLE public.book_catalog TO service_role;
GRANT ALL ON TABLE public.student_library_items TO service_role;
GRANT ALL ON TABLE public.reading_log_entries TO service_role;

REVOKE ALL ON FUNCTION public.upsert_my_reading_log(UUID, JSONB, TEXT, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_my_reading_log(UUID, JSONB, TEXT, TEXT, TEXT, TEXT)
    TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_reading_library_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_student_library_item() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_reading_log_entry() FROM PUBLIC, anon, authenticated;

COMMIT;
