-- 책장에 등록한 책을 학생이 직접 뺄 수 있게 한다.
--
-- 지금까지 삭제 버튼은 `글을 쓴 카드`에만 붙어 있었고, `student_library_items` 의 RLS 정책도
-- 읽기 하나뿐이라 DELETE 가 아예 막혀 있었다. 그래서 책을 잘못 등록하면 영영 못 지웠다.
-- 특히 예전 삭제 동작(글만 지우고 책은 남김)으로 생긴 `글 없는 책` 은 손댈 방법이 없었다.
--
-- 이 RPC 는 책 한 권에 딸린 것을 통째로 지운다: 초안 → 독서록 글 → 연결(글 삭제 시 cascade) → 책.
-- 보상 원장(writing_reward_claims)은 남긴다. source_key 가 book_id 라서, 같은 책을 다시 등록해
-- 완료해도 포인트가 다시 지급되지 않는다.

BEGIN;

CREATE OR REPLACE FUNCTION public.delete_my_library_book(p_library_item_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID;
    v_post_ids UUID[];
    v_deleted_logs INTEGER := 0;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT s.class_id
    INTO v_class_id
    FROM public.students s
    WHERE s.id = v_student_id
      AND s.is_active IS DISTINCT FROM false
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
    FOR UPDATE;

    IF v_class_id IS NULL THEN
        RAISE EXCEPTION '학생 정보를 찾지 못했습니다.' USING ERRCODE = 'P0002';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.student_library_items item
        WHERE item.id = p_library_item_id
          AND item.student_id = v_student_id
          AND item.class_id = v_class_id
    ) THEN
        RAISE EXCEPTION '삭제할 책을 찾지 못했습니다.' USING ERRCODE = 'P0002';
    END IF;

    SELECT COALESCE(array_agg(entry.post_id), '{}'::UUID[])
    INTO v_post_ids
    FROM public.reading_log_entries entry
    WHERE entry.library_item_id = p_library_item_id
      AND entry.student_id = v_student_id
      AND entry.class_id = v_class_id;

    -- 글에 매인 초안을 먼저 정리한다(글을 지우면 cascade 되지만 순서를 분명히 둔다).
    DELETE FROM public.reading_log_drafts draft
    WHERE draft.student_id = v_student_id
      AND draft.post_id = ANY(v_post_ids);

    DELETE FROM public.student_posts post
    WHERE post.id = ANY(v_post_ids)
      AND post.student_id = v_student_id
      AND post.class_id = v_class_id
      AND post.writing_context = 'self'
      AND post.self_writing_type = 'reading_log';
    GET DIAGNOSTICS v_deleted_logs = ROW_COUNT;

    DELETE FROM public.student_library_items item
    WHERE item.id = p_library_item_id
      AND item.student_id = v_student_id
      AND item.class_id = v_class_id;

    RETURN jsonb_build_object(
        'success', true,
        'deleted_logs', v_deleted_logs
    );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_library_book(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_library_book(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
