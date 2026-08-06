-- 댓글 관리의 **배지 숫자와 목록을 같은 기준으로** 맞춘다.
--
-- 증상: `처리할 것` 에 숫자가 남는데 목록은 `처리할 댓글이 없어요` 라고 한다. 화면에서 손댈 수가 없다.
--
-- 원인: 배지는 `status` 만 세고, 목록은 거기에 더해
--   * 작성자를 학급으로 조인하고(`students.class_id = post_comments.class_id`)
--   * 글을 학급으로 조인하고
--   * **탈퇴한 학생(`deleted_at IS NOT NULL`)을 뺀다**
-- 적용 시점 운영에서 blocked+pending 112건 중 **2건이 탈퇴 학생의 댓글**이었다. 배지는 세고 목록은 걸렀다.
--
-- 고침: 조인·탈퇴 조건까지 적용한 `visible` 을 먼저 만들고 **배지와 목록이 그것을 함께 쓴다.**
-- 상태 필터·검색어·기간만 목록 쪽에 더 건다(배지는 상태별 총량을 보여야 하므로).
-- 탈퇴 학생의 댓글은 친구에게도 이미 보이지 않으므로 교사 할 일에서 빼는 것이 맞다.

BEGIN;

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

    WITH visible AS (
        -- 배지와 목록이 함께 쓰는 단 하나의 기준.
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
    ), base AS (
        SELECT * FROM visible
        WHERE (
                p_status = 'all'
             OR (p_status = 'todo' AND status IN ('blocked', 'pending'))
             OR status = p_status
          )
          AND (v_since IS NULL OR created_at >= v_since)
          AND (v_query IS NULL OR student_name ILIKE '%' || v_query || '%' OR content ILIKE '%' || v_query || '%')
    )
    SELECT jsonb_build_object(
        'total', (SELECT count(*) FROM base),
        'counts', jsonb_build_object(
            'todo', (SELECT count(*) FROM visible WHERE status IN ('blocked', 'pending')),
            'blocked', (SELECT count(*) FROM visible WHERE status = 'blocked'),
            'pending', (SELECT count(*) FROM visible WHERE status = 'pending'),
            'approved', (SELECT count(*) FROM visible WHERE status = 'approved')
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

NOTIFY pgrst, 'reload schema';

COMMIT;
