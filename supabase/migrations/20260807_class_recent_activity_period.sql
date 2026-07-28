-- ============================================================================
-- 교사용 학급 최근 활동 기간 필터
--
-- 최근 활동 피드를 1일(기본)·7일·14일·30일 안으로 DB에서 먼저 제한한다.
-- 직전 4인자 함수는 마지막 기간 인자에 기본값이 있는 5인자 함수로 교체하므로
-- 구버전 프론트의 4인자 호출도 배포 전환 중 계속 동작한다.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.get_class_recent_activity(UUID, TEXT, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.get_class_recent_activity(
    p_class_id UUID,
    p_kind TEXT DEFAULT 'all',
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0,
    p_period TEXT DEFAULT '1d'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_admin BOOLEAN := false;
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
    v_offset INTEGER := LEAST(GREATEST(COALESCE(p_offset, 0), 0), 10000);
    v_period_start TIMESTAMPTZ;
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    IF p_kind NOT IN ('all', 'assignment', 'reading_log', 'comment') THEN
        RAISE EXCEPTION '올바르지 않은 활동 유형입니다.' USING ERRCODE = '22023';
    END IF;

    IF p_period NOT IN ('1d', '7d', '14d', '30d') THEN
        RAISE EXCEPTION '올바르지 않은 조회 기간입니다.' USING ERRCODE = '22023';
    END IF;

    v_period_start := NOW() - CASE p_period
        WHEN '1d' THEN INTERVAL '1 day'
        WHEN '7d' THEN INTERVAL '7 days'
        WHEN '14d' THEN INTERVAL '14 days'
        ELSE INTERVAL '30 days'
    END;

    v_is_admin := public.auth_user_role() = 'ADMIN';
    IF NOT v_is_admin AND NOT EXISTS (
        SELECT 1
        FROM public.classes c
        WHERE c.id = p_class_id
          AND c.teacher_id = auth.uid()
    ) THEN
        RAISE EXCEPTION '이 학급의 최근 활동을 볼 권한이 없습니다.'
            USING ERRCODE = '42501';
    END IF;

    WITH active_roster AS MATERIALIZED (
        SELECT s.id, s.name
        FROM public.students s
        WHERE s.class_id = p_class_id
          AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
    ),
    all_activity AS MATERIALIZED (
        SELECT
            'assignment'::TEXT AS kind,
            p.id AS activity_id,
            p.id AS post_id,
            p.student_id AS actor_student_id,
            author.name AS actor_name,
            p.student_id AS post_owner_id,
            author.name AS post_owner_name,
            COALESCE(NULLIF(btrim(p.title), ''), '제목 없는 글') AS title,
            COALESCE(NULLIF(btrim(m.title), ''), '선생님 과제') AS context_title,
            NULL::TEXT AS preview,
            COALESCE(p.first_submitted_at, p.created_at) AS occurred_at
        FROM public.student_posts p
        JOIN active_roster author ON author.id = p.student_id
        JOIN public.writing_missions m
          ON m.id = p.mission_id
         AND m.class_id = p_class_id
        WHERE p.class_id = p_class_id
          AND p.writing_context = 'assignment'
          AND p.is_submitted = true
          AND COALESCE(p.first_submitted_at, p.created_at) >= v_period_start

        UNION ALL

        SELECT
            'reading_log'::TEXT AS kind,
            p.id AS activity_id,
            p.id AS post_id,
            p.student_id AS actor_student_id,
            author.name AS actor_name,
            p.student_id AS post_owner_id,
            author.name AS post_owner_name,
            COALESCE(NULLIF(btrim(p.title), ''), '제목 없는 독서록') AS title,
            '학생 독서록'::TEXT AS context_title,
            NULL::TEXT AS preview,
            COALESCE(p.first_submitted_at, p.created_at) AS occurred_at
        FROM public.student_posts p
        JOIN active_roster author ON author.id = p.student_id
        WHERE p.class_id = p_class_id
          AND p.writing_context = 'self'
          AND p.self_writing_type = 'reading_log'
          AND p.is_submitted = true
          AND COALESCE(p.first_submitted_at, p.created_at) >= v_period_start

        UNION ALL

        SELECT
            'comment'::TEXT AS kind,
            comment.id AS activity_id,
            comment.post_id,
            comment.student_id AS actor_student_id,
            commenter.name AS actor_name,
            post.student_id AS post_owner_id,
            owner.name AS post_owner_name,
            COALESCE(NULLIF(btrim(post.title), ''), '제목 없는 글') AS title,
            CASE
                WHEN post.writing_context = 'self' THEN '학생 독서록'
                ELSE COALESCE(NULLIF(btrim(mission.title), ''), '선생님 과제')
            END AS context_title,
            left(regexp_replace(COALESCE(comment.content, ''), E'[\\n\\r]+', ' ', 'g'), 160)
                AS preview,
            comment.created_at AS occurred_at
        FROM public.post_comments comment
        JOIN active_roster commenter ON commenter.id = comment.student_id
        JOIN public.student_posts post
          ON post.id = comment.post_id
         AND post.class_id = p_class_id
        JOIN active_roster owner ON owner.id = post.student_id
        LEFT JOIN public.writing_missions mission
          ON mission.id = post.mission_id
         AND mission.class_id = p_class_id
        WHERE comment.class_id = p_class_id
          AND comment.status = 'approved'
          AND comment.student_id IS NOT NULL
          AND comment.created_at >= v_period_start
    ),
    activity_counts AS (
        SELECT
            COUNT(*)::INTEGER AS total,
            COUNT(*) FILTER (WHERE kind = 'assignment')::INTEGER AS assignments,
            COUNT(*) FILTER (WHERE kind = 'reading_log')::INTEGER AS reading_logs,
            COUNT(*) FILTER (WHERE kind = 'comment')::INTEGER AS comments
        FROM all_activity
    ),
    filtered_activity AS MATERIALIZED (
        SELECT *
        FROM all_activity
        WHERE p_kind = 'all' OR kind = p_kind
    ),
    page AS (
        SELECT *
        FROM filtered_activity
        ORDER BY occurred_at DESC, activity_id DESC
        LIMIT v_limit + 1
        OFFSET v_offset
    ),
    visible_page AS (
        SELECT *
        FROM page
        ORDER BY occurred_at DESC, activity_id DESC
        LIMIT v_limit
    )
    SELECT jsonb_build_object(
        'period', p_period,
        'period_start', v_period_start,
        'counts', jsonb_build_object(
            'all', counts.total,
            'assignment', counts.assignments,
            'reading_log', counts.reading_logs,
            'comment', counts.comments
        ),
        'items', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'kind', item.kind,
                'activity_id', item.activity_id,
                'post_id', item.post_id,
                'actor_student_id', item.actor_student_id,
                'actor_name', item.actor_name,
                'post_owner_id', item.post_owner_id,
                'post_owner_name', item.post_owner_name,
                'title', item.title,
                'context_title', item.context_title,
                'preview', item.preview,
                'occurred_at', item.occurred_at
            ) ORDER BY item.occurred_at DESC, item.activity_id DESC)
            FROM visible_page item
        ), '[]'::JSONB),
        'has_more', (SELECT COUNT(*) > v_limit FROM page),
        'next_offset', v_offset + LEAST(
            v_limit,
            (SELECT COUNT(*)::INTEGER FROM visible_page)
        )
    )
    INTO v_result
    FROM activity_counts counts;

    RETURN COALESCE(v_result, jsonb_build_object(
        'period', p_period,
        'period_start', v_period_start,
        'counts', jsonb_build_object(
            'all', 0, 'assignment', 0, 'reading_log', 0, 'comment', 0
        ),
        'items', '[]'::JSONB,
        'has_more', false,
        'next_offset', v_offset
    ));
END;
$$;

REVOKE ALL ON FUNCTION public.get_class_recent_activity(UUID, TEXT, INTEGER, INTEGER, TEXT)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_class_recent_activity(UUID, TEXT, INTEGER, INTEGER, TEXT)
TO authenticated, service_role;

COMMIT;
