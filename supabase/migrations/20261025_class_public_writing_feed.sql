-- 친구 아지트 `우리 반 새 글 탐색`을 글 유형별 클라이언트 조회에서
-- 학급 직접 범위·커서 페이지의 단일 RPC로 합친다.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_student_posts_class_public_feed
    ON public.student_posts (
        class_id,
        (COALESCE(published_at, first_submitted_at, created_at)) DESC,
        id DESC
    )
    WHERE is_submitted IS TRUE
      AND visibility = 'class';

CREATE OR REPLACE FUNCTION public.get_class_public_writing_feed_v1(
    p_group TEXT DEFAULT 'all',
    p_self_type TEXT DEFAULT NULL,
    p_mission_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 10,
    p_cursor_at TIMESTAMPTZ DEFAULT NULL,
    p_cursor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID;
    v_group TEXT := COALESCE(NULLIF(BTRIM(p_group), ''), 'all');
    v_self_type TEXT := NULLIF(BTRIM(p_self_type), '');
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
    v_items JSONB := '[]'::JSONB;
    v_has_more BOOLEAN := FALSE;
    v_next_at TIMESTAMPTZ;
    v_next_id UUID;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT student.class_id
    INTO v_class_id
    FROM public.students student
    JOIN public.classes class ON class.id = student.class_id
    WHERE student.id = v_student_id
      AND student.is_active IS DISTINCT FROM FALSE
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
      AND class.deleted_at IS NULL;

    IF v_class_id IS NULL THEN
        RAISE EXCEPTION '활성 학급을 찾을 수 없습니다.' USING ERRCODE = '42501';
    END IF;
    IF v_group NOT IN ('all', 'assignment', 'self') THEN
        RAISE EXCEPTION '지원하지 않는 공개 글 분류입니다.' USING ERRCODE = '22023';
    END IF;
    IF (p_cursor_at IS NULL) IS DISTINCT FROM (p_cursor_id IS NULL) THEN
        RAISE EXCEPTION '페이지 커서는 시각과 글 ID를 함께 보내야 합니다.' USING ERRCODE = '22023';
    END IF;
    IF p_mission_id IS NOT NULL AND v_group <> 'assignment' THEN
        RAISE EXCEPTION '과제 선택은 선생님 과제 분류에서만 사용할 수 있습니다.' USING ERRCODE = '22023';
    END IF;
    IF v_self_type IS NOT NULL AND v_group <> 'self' THEN
        RAISE EXCEPTION '자율 글 유형은 자율 글 분류에서만 사용할 수 있습니다.' USING ERRCODE = '22023';
    END IF;
    IF v_self_type IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM public.writing_types writing_type
        WHERE writing_type.id = v_self_type
          AND writing_type.is_active IS TRUE
    ) THEN
        RAISE EXCEPTION '등록되지 않은 자율 글 유형입니다.' USING ERRCODE = '22023';
    END IF;

    WITH candidates AS MATERIALIZED (
        SELECT
            post.id,
            post.class_id,
            post.student_id,
            post.mission_id,
            post.title,
            post.content,
            post.char_count,
            post.is_confirmed,
            post.is_submitted,
            post.created_at,
            post.updated_at,
            post.writing_context,
            post.self_writing_type,
            post.visibility,
            post.structured_content,
            post.show_original,
            CASE WHEN post.show_original IS TRUE THEN post.original_title ELSE NULL END AS original_title,
            CASE WHEN post.show_original IS TRUE THEN post.original_content ELSE NULL END AS original_content,
            post.published_at,
            COALESCE(post.published_at, post.first_submitted_at, post.created_at) AS feed_published_at,
            student.name AS student_name,
            student.pet_data AS student_pet_data,
            mission.title AS mission_title,
            mission.allow_comments AS mission_allow_comments,
            mission.mission_type,
            mission.input_template
        FROM public.student_posts post
        JOIN public.students student
          ON student.id = post.student_id
         AND student.class_id = post.class_id
        LEFT JOIN public.writing_missions mission
          ON mission.id = post.mission_id
         AND mission.class_id = post.class_id
        WHERE post.class_id = v_class_id
          AND post.is_submitted IS TRUE
          AND post.visibility = 'class'
          AND (
              v_group = 'all'
              OR (v_group = 'assignment' AND post.mission_id IS NOT NULL)
              OR (v_group = 'self' AND post.writing_context = 'self' AND post.mission_id IS NULL)
          )
          AND (v_self_type IS NULL OR post.self_writing_type = v_self_type)
          AND (p_mission_id IS NULL OR post.mission_id = p_mission_id)
          AND (
              p_cursor_at IS NULL
              OR (
                  COALESCE(post.published_at, post.first_submitted_at, post.created_at),
                  post.id
              ) < (p_cursor_at, p_cursor_id)
          )
        ORDER BY
            COALESCE(post.published_at, post.first_submitted_at, post.created_at) DESC,
            post.id DESC
        LIMIT v_limit + 1
    ), page AS (
        SELECT candidate.*
        FROM candidates candidate
        ORDER BY candidate.feed_published_at DESC, candidate.id DESC
        LIMIT v_limit
    ), serialized AS (
        SELECT
            page.feed_published_at,
            page.id,
            jsonb_build_object(
                'id', page.id,
                'class_id', page.class_id,
                'student_id', page.student_id,
                'mission_id', page.mission_id,
                'title', page.title,
                'content', page.content,
                'char_count', page.char_count,
                'is_confirmed', page.is_confirmed,
                'is_submitted', page.is_submitted,
                'created_at', page.created_at,
                'updated_at', page.updated_at,
                'published_at', page.published_at,
                'feed_published_at', page.feed_published_at,
                'writing_context', page.writing_context,
                'self_writing_type', page.self_writing_type,
                'visibility', page.visibility,
                'structured_content', page.structured_content,
                'show_original', page.show_original,
                'original_title', page.original_title,
                'original_content', page.original_content,
                'student_name', page.student_name,
                'students', jsonb_build_object(
                    'name', page.student_name,
                    'pet_data', page.student_pet_data
                ),
                'writing_missions', CASE
                    WHEN page.mission_id IS NULL THEN NULL
                    ELSE jsonb_build_object(
                        'id', page.mission_id,
                        'title', page.mission_title,
                        'allow_comments', page.mission_allow_comments,
                        'mission_type', page.mission_type,
                        'input_template', page.input_template
                    )
                END,
                'post_reactions', (
                    SELECT COALESCE(jsonb_agg(
                        jsonb_build_object(
                            'id', reaction.id,
                            'post_id', reaction.post_id,
                            'student_id', reaction.student_id,
                            'reaction_type', reaction.reaction_type
                        ) ORDER BY reaction.created_at, reaction.id
                    ), '[]'::JSONB)
                    FROM (
                        SELECT item.id, item.post_id, item.student_id, item.reaction_type, item.created_at
                        FROM public.post_reactions item
                        WHERE item.class_id = page.class_id
                          AND item.post_id = page.id
                        ORDER BY item.created_at, item.id
                        LIMIT 50
                    ) reaction
                )
            ) AS item
        FROM page
    )
    SELECT
        COALESCE(jsonb_agg(serialized.item ORDER BY serialized.feed_published_at DESC, serialized.id DESC), '[]'::JSONB),
        (SELECT COUNT(*) > v_limit FROM candidates),
        (SELECT page.feed_published_at FROM page ORDER BY page.feed_published_at, page.id LIMIT 1),
        (SELECT page.id FROM page ORDER BY page.feed_published_at, page.id LIMIT 1)
    INTO v_items, v_has_more, v_next_at, v_next_id
    FROM serialized;

    RETURN jsonb_build_object(
        'version', 1,
        'group', v_group,
        'self_type', v_self_type,
        'items', COALESCE(v_items, '[]'::JSONB),
        'has_more', COALESCE(v_has_more, FALSE),
        'next_cursor_at', CASE WHEN v_has_more THEN v_next_at ELSE NULL END,
        'next_cursor_id', CASE WHEN v_has_more THEN v_next_id ELSE NULL END,
        'max_rows', 50
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_class_public_writing_feed_v1(TEXT, TEXT, UUID, INTEGER, TIMESTAMPTZ, UUID)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_class_public_writing_feed_v1(TEXT, TEXT, UUID, INTEGER, TIMESTAMPTZ, UUID)
TO authenticated, service_role;

COMMIT;
