-- ============================================================================
-- 독서록 안전성 보완
--   1) 학생 역할에 초안 테이블 SELECT 권한을 열지 않고 본인 초안만 RPC로 반환한다.
--   2) "한 책 = 한 독서록" 결정을 DB 유일 제약으로도 보장한다.
-- ============================================================================

BEGIN;

-- 운영 자료에 중복이 있으면 임의로 지우거나 합치지 않고 적용을 멈춘다.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.reading_log_entries rle
        GROUP BY rle.library_item_id
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION '한 책에 여러 독서록이 연결된 자료가 있어 유일 제약을 만들 수 없습니다.';
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS reading_log_entries_library_item_unique
    ON public.reading_log_entries (library_item_id);

CREATE OR REPLACE FUNCTION public.get_my_reading_log_draft(
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
    v_book_key TEXT;
    v_result JSONB;
BEGIN
    v_student_id := public.auth_student_id();
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.students s
        WHERE s.id = v_student_id
          AND s.auth_id = auth.uid()
          AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
    ) THEN
        RAISE EXCEPTION '현재 로그인과 연결된 학생을 찾을 수 없습니다.' USING ERRCODE = '42501';
    END IF;

    v_book_key := COALESCE(left(btrim(p_book_key), 300), '');

    SELECT jsonb_build_object(
        'title', d.title,
        'content', d.content,
        'book', d.book,
        'visibility', d.visibility,
        'reading_status', d.reading_status,
        'updated_at', d.updated_at
    )
    INTO v_result
    FROM public.reading_log_drafts d
    WHERE d.student_id = v_student_id
      AND (
        (p_post_id IS NOT NULL AND d.post_id = p_post_id)
        OR (p_post_id IS NULL AND d.post_id IS NULL AND d.book_key = v_book_key)
      )
    ORDER BY d.updated_at DESC
    LIMIT 1;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_reading_log_draft(UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_reading_log_draft(UUID, TEXT)
    TO authenticated;

COMMIT;
