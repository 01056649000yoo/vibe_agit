-- ==========================================================================
-- 독서록 임시본 (쓰다 만 글)
--
-- 왜 `student_posts` 에 넣지 않는가:
--   임시본을 글 테이블에 `is_submitted = false` 로 넣으면 칭호·발자국 함수들이
--   위험해진다. 확인해 보니 `get_my_title_status`·`get_my_writing_footprint_detail`·
--   `get_class_writing_footprint_dashboard`·`get_friend_writing_footprint` 등은
--   `is_confirmed` 만 보고 `is_submitted` 를 보지 않는다. 지금은 독서록이 전부
--   `is_confirmed = false` 라 우연히 문제가 없을 뿐, 독서록 승인 기능이 생기면 바로 샌다.
--   또 친구 공개·교사 화면에 새지 않게 하려면 필터에 계속 기대야 한다.
--
--   "쓰다 만 글"과 "쓴 글"은 성격이 다르니 자리도 나눈다. 임시본을 여기에 두면
--   기존 집계·공개·교사 화면은 **구조적으로** 임시본을 볼 수 없다.
--   학생이 `저장` 을 누르면 기존 `upsert_my_reading_log` 를 그대로 부르고 이 행을 지운다.
--   즉 기존 저장 경로는 한 줄도 바뀌지 않는다.
-- ==========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.reading_log_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    -- 어떤 독서록을 쓰다 말았는지. 이미 저장된 글을 고치는 중이면 그 글, 새 글이면 NULL.
    post_id UUID REFERENCES public.student_posts(id) ON DELETE CASCADE,
    -- 새 글일 때 어떤 책인지 구분하는 열쇠(ISBN 또는 제목). 글을 고치는 중이면 빈 문자열.
    book_key TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    book JSONB,
    visibility TEXT NOT NULL DEFAULT 'class'
        CHECK (visibility IN ('private', 'class')),
    reading_status TEXT NOT NULL DEFAULT 'completed'
        CHECK (reading_status IN ('reading', 'completed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- 임시본이 무한히 쌓이지 않도록 길이를 제한한다. 본문 한도는 완성본과 같다.
    CONSTRAINT reading_log_drafts_title_len CHECK (char_length(title) <= 200),
    CONSTRAINT reading_log_drafts_content_len CHECK (char_length(content) <= 20000)
);

-- 학생 한 명이 같은 대상에 임시본을 하나만 갖는다.
-- `post_id` 가 있으면 그 글 기준, 없으면 책 기준이다.
CREATE UNIQUE INDEX IF NOT EXISTS reading_log_drafts_post_unique
    ON public.reading_log_drafts (student_id, post_id)
    WHERE post_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS reading_log_drafts_book_unique
    ON public.reading_log_drafts (student_id, book_key)
    WHERE post_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_reading_log_drafts_student
    ON public.reading_log_drafts (student_id, updated_at DESC);

ALTER TABLE public.reading_log_drafts ENABLE ROW LEVEL SECURITY;

-- 임시본은 오직 본인만 본다. 교사도 친구도 볼 수 없다 — 아직 학생이 보여 주기로 한 글이 아니다.
DROP POLICY IF EXISTS reading_log_drafts_owner ON public.reading_log_drafts;
CREATE POLICY reading_log_drafts_owner ON public.reading_log_drafts
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.students s
            WHERE s.id = reading_log_drafts.student_id
              AND s.auth_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.students s
            WHERE s.id = reading_log_drafts.student_id
              AND s.auth_id = auth.uid()
        )
    );

REVOKE ALL ON TABLE public.reading_log_drafts FROM PUBLIC, anon, authenticated;

-- ==========================================================================
-- 임시본 저장 / 삭제
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.upsert_my_reading_log_draft(
    p_post_id UUID,
    p_book_key TEXT,
    p_title TEXT,
    p_content TEXT,
    p_book JSONB DEFAULT NULL,
    p_visibility TEXT DEFAULT 'class',
    p_reading_status TEXT DEFAULT 'completed'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID;
    v_book_key TEXT;
    v_draft_id UUID;
    v_updated_at TIMESTAMPTZ;
BEGIN
    v_student_id := public.auth_student_id();
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.students s
        WHERE s.id = v_student_id
          AND s.auth_id = auth.uid()
          AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
    ) THEN
        RAISE EXCEPTION '현재 로그인과 연결된 학생을 찾을 수 없습니다.' USING ERRCODE = '42501';
    END IF;

    IF p_visibility NOT IN ('private', 'class') THEN
        RAISE EXCEPTION '공개 범위가 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;
    IF p_reading_status NOT IN ('reading', 'completed') THEN
        RAISE EXCEPTION '독서 상태가 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;

    -- 남의 글에 임시본을 붙이지 못하게 한다.
    IF p_post_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.student_posts sp
        WHERE sp.id = p_post_id
          AND sp.student_id = v_student_id
          AND sp.writing_context = 'self'
          AND sp.self_writing_type = 'reading_log'
    ) THEN
        RAISE EXCEPTION '수정할 내 독서록을 찾을 수 없습니다.' USING ERRCODE = '42501';
    END IF;

    v_book_key := COALESCE(left(btrim(p_book_key), 300), '');

    IF p_post_id IS NULL THEN
        INSERT INTO public.reading_log_drafts AS d (
            student_id, post_id, book_key, title, content, book, visibility, reading_status
        ) VALUES (
            v_student_id, NULL, v_book_key,
            left(COALESCE(p_title, ''), 200), left(COALESCE(p_content, ''), 20000),
            p_book, p_visibility, p_reading_status
        )
        ON CONFLICT (student_id, book_key) WHERE post_id IS NULL DO UPDATE
        SET title = EXCLUDED.title,
            content = EXCLUDED.content,
            book = EXCLUDED.book,
            visibility = EXCLUDED.visibility,
            reading_status = EXCLUDED.reading_status,
            updated_at = NOW()
        RETURNING d.id, d.updated_at INTO v_draft_id, v_updated_at;
    ELSE
        INSERT INTO public.reading_log_drafts AS d (
            student_id, post_id, book_key, title, content, book, visibility, reading_status
        ) VALUES (
            v_student_id, p_post_id, '',
            left(COALESCE(p_title, ''), 200), left(COALESCE(p_content, ''), 20000),
            p_book, p_visibility, p_reading_status
        )
        ON CONFLICT (student_id, post_id) WHERE post_id IS NOT NULL DO UPDATE
        SET title = EXCLUDED.title,
            content = EXCLUDED.content,
            book = EXCLUDED.book,
            visibility = EXCLUDED.visibility,
            reading_status = EXCLUDED.reading_status,
            updated_at = NOW()
        RETURNING d.id, d.updated_at INTO v_draft_id, v_updated_at;
    END IF;

    RETURN jsonb_build_object('success', true, 'draft_id', v_draft_id, 'updated_at', v_updated_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_my_reading_log_draft(
    p_post_id UUID,
    p_book_key TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID;
    v_deleted INTEGER;
BEGIN
    v_student_id := public.auth_student_id();
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    DELETE FROM public.reading_log_drafts d
    WHERE d.student_id = v_student_id
      AND (
        (p_post_id IS NOT NULL AND d.post_id = p_post_id)
        OR (p_post_id IS NULL AND d.post_id IS NULL AND d.book_key = COALESCE(btrim(p_book_key), ''))
      );

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN jsonb_build_object('success', true, 'deleted', v_deleted);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_my_reading_log_draft(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_my_reading_log_draft(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT)
    TO authenticated;

REVOKE ALL ON FUNCTION public.delete_my_reading_log_draft(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_reading_log_draft(UUID, TEXT) TO authenticated;

COMMIT;
