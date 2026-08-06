-- 학생 댓글을 교사가 한자리에서 관리한다. AI 가 막은 댓글도 **지우지 않고 남긴다.**
--
-- 지금까지 AI 가 부적절로 판정하면 화면이 그 댓글을 곧바로 `DELETE` 했다. 그래서
--   * 학생은 애써 쓴 글을 잃고
--   * 교사는 무엇이 막혔는지 모르고
--   * 우리도 **오탐률을 잴 방법이 없었다** (이 저장소는 맞춤법에서 `오탐 0 최우선` 을 원칙으로 세웠는데,
--     댓글 AI 는 측정 자체가 불가능했다)
--
-- 이제 삭제 대신 `status='blocked'` 로 두고 판정 이유를 함께 남긴다. 교사가 보고 `이건 괜찮아요` 를
-- 누르면 승인된다. 2주쯤 쌓이면 처음으로 오탐률을 숫자로 볼 수 있다.
--
-- 덤: 지금 운영에 `pending` 117건이 갇혀 있다(AI 판정이 끝나지 않은 댓글). 아무에게도 안 보이는데
-- 학생은 썼다고 생각한다. 이제 교사 화면에서 보이므로 풀어 줄 수 있다.

BEGIN;

ALTER TABLE public.post_comments
    ADD COLUMN IF NOT EXISTS moderation_reason TEXT,
    ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS moderated_by TEXT;

COMMENT ON COLUMN public.post_comments.moderation_reason IS 'AI 또는 교사가 이 상태로 정한 이유. 오탐 점검의 근거.';
COMMENT ON COLUMN public.post_comments.moderated_by IS 'ai | teacher';

-- 교사 목록은 학급으로 직접 좁히고 최신순으로 읽는다.
CREATE INDEX IF NOT EXISTS idx_post_comments_class_status_created
    ON public.post_comments (class_id, status, created_at DESC);

/** 학급의 학생 댓글 목록. 상태별로 걸러 보고 글 제목·작성자를 함께 준다. */
CREATE OR REPLACE FUNCTION public.get_teacher_class_comments(
    p_class_id UUID,
    p_status TEXT DEFAULT 'blocked',
    p_query TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
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

    IF p_status NOT IN ('blocked', 'pending', 'approved', 'all') THEN
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
          -- 선생님이 남긴 댓글은 관리 대상이 아니다. 학생 댓글만 본다.
          AND c.student_id IS NOT NULL
          AND writer.deleted_at IS NULL
          AND (p_status = 'all' OR c.status = p_status)
          AND (v_query IS NULL OR writer.name ILIKE '%' || v_query || '%' OR c.content ILIKE '%' || v_query || '%')
    )
    SELECT jsonb_build_object(
        'total', (SELECT count(*) FROM base),
        'counts', jsonb_build_object(
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

/** 교사가 댓글 상태를 정한다. `approved` 로 풀어 주거나 `blocked` 로 가린다. */
CREATE OR REPLACE FUNCTION public.set_teacher_comment_status(
    p_comment_id UUID,
    p_status TEXT,
    p_reason TEXT DEFAULT NULL
)
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

    IF p_status NOT IN ('approved', 'blocked') THEN
        RAISE EXCEPTION '올바르지 않은 상태입니다.' USING ERRCODE = '22023';
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

    UPDATE public.post_comments
    SET status = p_status,
        moderation_reason = COALESCE(NULLIF(BTRIM(COALESCE(p_reason, '')), ''), moderation_reason),
        moderated_at = NOW(),
        moderated_by = 'teacher'
    WHERE id = p_comment_id;

    RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$$;

/** 학생 화면이 AI 판정을 기록한다. 예전처럼 지우지 않는다. */
CREATE OR REPLACE FUNCTION public.record_comment_ai_review(
    p_comment_id UUID,
    p_is_appropriate BOOLEAN,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_status TEXT := CASE WHEN p_is_appropriate THEN 'approved' ELSE 'blocked' END;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    -- 자기가 방금 쓴 댓글만, 아직 판정 전(pending)일 때만 기록한다.
    UPDATE public.post_comments
    SET status = v_status,
        moderation_reason = NULLIF(BTRIM(COALESCE(p_reason, '')), ''),
        moderated_at = NOW(),
        moderated_by = 'ai'
    WHERE id = p_comment_id
      AND student_id = v_student_id
      AND status = 'pending';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', '이미 판정된 댓글입니다.');
    END IF;

    RETURN jsonb_build_object('success', true, 'status', v_status);
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_class_comments(UUID, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_teacher_comment_status(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_comment_ai_review(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_class_comments(UUID, TEXT, TEXT, INTEGER, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_teacher_comment_status(UUID, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_comment_ai_review(UUID, BOOLEAN, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
