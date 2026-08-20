-- 날짜를 바꿔 저장한 일기의 이전 날짜 임시본을 RPC 한 번으로 정리한다 (2026-08-21)

BEGIN;

CREATE OR REPLACE FUNCTION public.delete_my_self_writing_drafts(
    p_writing_type TEXT,
    p_source_keys TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_deleted INTEGER := 0;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    IF p_writing_type IS NULL OR char_length(p_writing_type) NOT BETWEEN 1 AND 50
       OR p_source_keys IS NULL
       OR COALESCE(array_length(p_source_keys, 1), 0) NOT BETWEEN 1 AND 50
       OR EXISTS (
           SELECT 1 FROM unnest(p_source_keys) source_key
           WHERE source_key IS NULL OR char_length(source_key) NOT BETWEEN 1 AND 200
       ) THEN
        RAISE EXCEPTION '정리할 임시본 범위가 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;

    DELETE FROM public.self_writing_drafts draft
    WHERE draft.student_id = v_student_id
      AND draft.writing_type = p_writing_type
      AND draft.source_key = ANY(p_source_keys);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    RETURN jsonb_build_object('success', TRUE, 'deleted', v_deleted);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_self_writing_drafts(TEXT, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_self_writing_drafts(TEXT, TEXT[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
