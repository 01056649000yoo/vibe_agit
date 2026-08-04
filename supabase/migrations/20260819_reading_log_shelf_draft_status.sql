-- ============================================================================
-- 독서록 책장용 작성 상태 조회
--
-- 임시본 내용은 공개하지 않고, 로그인한 학생 본인의 임시본 식별값만 돌려준다.
-- 책장에서는 완성 글 > 임시본 > 책만 저장 순서로 작성 상태를 표시한다.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_reading_log_draft_statuses()
RETURNS TABLE (
    post_id UUID,
    book_key TEXT,
    book JSONB,
    reading_status TEXT,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID;
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

    RETURN QUERY
    SELECT d.post_id, d.book_key, d.book, d.reading_status, d.updated_at
    FROM public.reading_log_drafts d
    WHERE d.student_id = v_student_id
    ORDER BY d.updated_at DESC
    LIMIT 500;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_reading_log_draft_statuses()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_reading_log_draft_statuses()
    TO authenticated;

COMMIT;
