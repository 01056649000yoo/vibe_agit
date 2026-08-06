-- 자율 글쓰기의 서버 임시본(기기 간 이어 쓰기)을 유형 공용으로 둔다.
--
-- 독서록은 `reading_log_drafts` 를 쓰는데 그 표에는 `book_key`·`book`·`reading_status` 처럼
-- 책 전용 칸이 있어 일기가 얹히면 빈 칸만 늘어난다. 그래서 유형·열쇠만 받는 표를 새로 둔다.
-- 일기의 열쇠는 **날짜**다(하루 한 편이라 그 날짜의 임시본도 하나).
--
-- 독서록은 지금 잘 도는 경로를 건드리지 않고 기존 표에 그대로 둔다. 언젠가 이 표로 합칠 수 있다.
--
-- 완성본(`student_posts`)과 자리를 나누는 이유는 독서록과 같다 — 칭호·발자국 함수 여럿이
-- `is_confirmed`/`is_submitted` 만 보므로, 임시본을 글 표에 넣으면 쓰다 만 글이 집계에 섞인다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.self_writing_drafts (
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    writing_type TEXT NOT NULL REFERENCES public.writing_types(id),
    source_key TEXT NOT NULL CHECK (char_length(source_key) BETWEEN 1 AND 200),
    post_id UUID REFERENCES public.student_posts(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '' CHECK (char_length(title) <= 200),
    content TEXT NOT NULL DEFAULT '' CHECK (char_length(content) <= 20000),
    visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'class')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (student_id, writing_type, source_key)
);

CREATE INDEX IF NOT EXISTS idx_self_writing_drafts_class_updated
    ON public.self_writing_drafts (class_id, writing_type, updated_at DESC);

ALTER TABLE public.self_writing_drafts ENABLE ROW LEVEL SECURITY;
-- 정책을 두지 않는다. 학생은 아래 SECURITY DEFINER RPC 로만 자기 임시본에 닿는다.
REVOKE ALL ON TABLE public.self_writing_drafts FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.self_writing_drafts TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_my_self_writing_draft(
    p_writing_type TEXT,
    p_source_key TEXT,
    p_post_id UUID,
    p_title TEXT,
    p_content TEXT,
    p_visibility TEXT DEFAULT 'private'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID;
    v_visibility TEXT := CASE WHEN p_visibility = 'class' THEN 'class' ELSE 'private' END;
    v_updated_at TIMESTAMPTZ;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.writing_types wt WHERE wt.id = p_writing_type AND wt.is_active) THEN
        RAISE EXCEPTION '지원하지 않는 글 유형입니다.' USING ERRCODE = '22023';
    END IF;

    SELECT s.class_id INTO v_class_id
    FROM public.students s
    WHERE s.id = v_student_id
      AND s.is_active IS DISTINCT FROM false
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW());

    IF v_class_id IS NULL THEN
        RAISE EXCEPTION '학생 정보를 찾지 못했습니다.' USING ERRCODE = 'P0002';
    END IF;

    -- 남의 글에 임시본을 붙일 수 없다.
    IF p_post_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.student_posts post
        WHERE post.id = p_post_id AND post.student_id = v_student_id AND post.class_id = v_class_id
    ) THEN
        RAISE EXCEPTION '내 글이 아닙니다.' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.self_writing_drafts (
        student_id, class_id, writing_type, source_key, post_id, title, content, visibility
    ) VALUES (
        v_student_id, v_class_id, p_writing_type, p_source_key, p_post_id,
        LEFT(COALESCE(p_title, ''), 200), LEFT(COALESCE(p_content, ''), 20000), v_visibility
    )
    ON CONFLICT (student_id, writing_type, source_key) DO UPDATE
    SET post_id = EXCLUDED.post_id,
        title = EXCLUDED.title,
        content = EXCLUDED.content,
        visibility = EXCLUDED.visibility,
        updated_at = NOW()
    RETURNING updated_at INTO v_updated_at;

    RETURN jsonb_build_object('success', true, 'updated_at', v_updated_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_self_writing_draft(
    p_writing_type TEXT,
    p_source_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_result JSONB;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT jsonb_build_object(
        'source_key', draft.source_key,
        'post_id', draft.post_id,
        'title', draft.title,
        'content', draft.content,
        'visibility', draft.visibility,
        'updated_at', draft.updated_at
    )
    INTO v_result
    FROM public.self_writing_drafts draft
    WHERE draft.student_id = v_student_id
      AND draft.writing_type = p_writing_type
      AND draft.source_key = p_source_key;

    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_my_self_writing_draft(
    p_writing_type TEXT,
    p_source_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    DELETE FROM public.self_writing_drafts draft
    WHERE draft.student_id = v_student_id
      AND draft.writing_type = p_writing_type
      AND draft.source_key = p_source_key;

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_my_self_writing_draft(TEXT, TEXT, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_self_writing_draft(TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_my_self_writing_draft(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_my_self_writing_draft(TEXT, TEXT, UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_self_writing_draft(TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_my_self_writing_draft(TEXT, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
