-- 댓글 관리 화면을 실제로 쓸 수 있게 다듬는다.
--
-- ① 삭제 — `이건 괜찮아요` 만으로는 부족하다. 정말 지워야 할 댓글도 있다.
-- ② `처리할 것` 묶음 — 막힘(blocked)과 대기(pending)는 성격이 같다(교사가 봐야 할 것). 한 번에 본다.
-- ③ 기간·더 보기 — 승인된 댓글이 8,300건이 넘어 스크롤로는 관리가 안 된다.
--    `처리할 것` 은 다 비우는 게 목표라 전부 보여 주고, `기록` 은 기본 최근 7일만 보여 준 뒤 이어 붙인다.

BEGIN;

/** 교사가 학생 댓글을 지운다. 되돌릴 수 없으므로 학급 권한을 다시 확인한다. */
CREATE OR REPLACE FUNCTION public.delete_teacher_class_comment(p_comment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_class_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT c.class_id INTO v_class_id
    FROM public.post_comments c
    WHERE c.id = p_comment_id AND c.student_id IS NOT NULL;

    IF v_class_id IS NULL THEN
        RAISE EXCEPTION '학생 댓글을 찾지 못했습니다.' USING ERRCODE = 'P0002';
    END IF;

    IF public.auth_user_role() <> 'ADMIN' AND NOT EXISTS (
        SELECT 1 FROM public.classes c WHERE c.id = v_class_id AND c.teacher_id = auth.uid()
    ) THEN
        RAISE EXCEPTION '이 학급의 댓글을 관리할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    DELETE FROM public.post_comments WHERE id = p_comment_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_teacher_class_comment(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_teacher_class_comment(UUID) TO authenticated, service_role;

/**
 * 학급 학생 댓글 목록.
 *   p_status  — 'todo'(막힘+대기) | 'blocked' | 'pending' | 'approved' | 'all'
 *   p_days    — 최근 며칠. NULL 이면 기간 제한 없음. `처리할 것` 은 기간을 걸지 않는다.
 */
CREATE OR REPLACE FUNCTION public.get_teacher_class_comments(
    p_class_id UUID,
    p_status TEXT DEFAULT 'todo',
    p_query TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0,
    p_days INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
    v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
    v_query TEXT := NULLIF(BTRIM(COALESCE(p_query, '')), '');
    v_since TIMESTAMPTZ := CASE
        WHEN p_days IS NULL OR p_days <= 0 THEN NULL
        ELSE (((NOW() AT TIME ZONE 'Asia/Seoul')::DATE - (p_days - 1))::TIMESTAMP AT TIME ZONE 'Asia/Seoul')
    END;
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    IF public.auth_user_role() <> 'ADMIN' AND NOT EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = p_class_id AND c.teacher_id = auth.uid()
    ) THEN
        RAISE EXCEPTION '이 학급의 댓글을 관리할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    IF p_status NOT IN ('todo', 'blocked', 'pending', 'approved', 'all') THEN
        RAISE EXCEPTION '올바르지 않은 상태 필터입니다.' USING ERRCODE = '22023';
    END IF;

    WITH base AS (
        SELECT
            c.id,
            c.content,
            c.status,
            c.moderation_reason,
            c.created_at,
            c.moderated_at,
            writer.id AS student_id,
            writer.name AS student_name,
            p.id AS post_id,
            p.title AS post_title,
            owner.name AS post_owner_name
        FROM public.post_comments c
        JOIN public.students writer
          ON writer.id = c.student_id AND writer.class_id = c.class_id
        JOIN public.student_posts p
          ON p.id = c.post_id AND p.class_id = c.class_id
        LEFT JOIN public.students owner
          ON owner.id = p.student_id AND owner.class_id = p.class_id
        WHERE c.class_id = p_class_id
          AND c.student_id IS NOT NULL
          AND writer.deleted_at IS NULL
          AND (
                p_status = 'all'
             OR (p_status = 'todo' AND c.status IN ('blocked', 'pending'))
             OR c.status = p_status
          )
          AND (v_since IS NULL OR c.created_at >= v_since)
          AND (v_query IS NULL OR writer.name ILIKE '%' || v_query || '%' OR c.content ILIKE '%' || v_query || '%')
    )
    SELECT jsonb_build_object(
        'total', (SELECT count(*) FROM base),
        'counts', jsonb_build_object(
            'todo', (SELECT count(*) FROM public.post_comments c
                     WHERE c.class_id = p_class_id AND c.student_id IS NOT NULL
                       AND c.status IN ('blocked', 'pending')),
            'blocked', (SELECT count(*) FROM public.post_comments c
                        WHERE c.class_id = p_class_id AND c.student_id IS NOT NULL AND c.status = 'blocked'),
            'pending', (SELECT count(*) FROM public.post_comments c
                        WHERE c.class_id = p_class_id AND c.student_id IS NOT NULL AND c.status = 'pending'),
            'approved', (SELECT count(*) FROM public.post_comments c
                        WHERE c.class_id = p_class_id AND c.student_id IS NOT NULL AND c.status = 'approved')
        ),
        'items', COALESCE((
            SELECT jsonb_agg(to_jsonb(item) ORDER BY item.created_at DESC)
            FROM (SELECT * FROM base ORDER BY created_at DESC LIMIT v_limit OFFSET v_offset) item
        ), '[]'::JSONB)
    )
    INTO v_result;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_class_comments(UUID, TEXT, TEXT, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_class_comments(UUID, TEXT, TEXT, INTEGER, INTEGER, INTEGER) TO authenticated, service_role;

-- 인자가 늘었다. 옛 5인자 시그니처가 남으면 PostgREST 가 어느 쪽을 부를지 헷갈린다.
DROP FUNCTION IF EXISTS public.get_teacher_class_comments(UUID, TEXT, TEXT, INTEGER, INTEGER);

NOTIFY pgrst, 'reload schema';

COMMIT;
