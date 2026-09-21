-- 방학(여름/겨울방학) 학사 일정을 고려하여, 과거 학생 글쓰기 작성 이력이 있는 교사를 ACTIVE(활동 중)로 포함
-- 1학기에 활발히 활동했으나 방학 후 2학기 초 아직 새 글을 올리지 않은 교사들이 IDLE로 왜곡되는 문제 해소

CREATE OR REPLACE FUNCTION public.admin_get_teacher_usage(
    p_dormant_days INTEGER DEFAULT 60,
    p_activity_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    teacher_id UUID,
    email TEXT,
    display_name TEXT,
    school_name TEXT,
    phone TEXT,
    role TEXT,
    is_approved BOOLEAN,
    approval_revoked_at TIMESTAMPTZ,
    api_mode TEXT,
    created_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    days_since_login INTEGER,
    days_since_signup INTEGER,
    class_count INTEGER,
    student_count INTEGER,
    mission_count INTEGER,
    post_count INTEGER,
    submitted_post_count INTEGER,
    recent_post_count INTEGER,
    active_student_count INTEGER,
    last_student_activity_at TIMESTAMPTZ,
    usage_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_dormant_days INTEGER := GREATEST(COALESCE(p_dormant_days, 60), 1);
    v_activity_days INTEGER := GREATEST(COALESCE(p_activity_days, 30), 1);
    v_activity_since TIMESTAMPTZ := NOW() - (v_activity_days || ' days')::INTERVAL;
BEGIN
    IF public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION 'Only admins can read teacher usage';
    END IF;

    RETURN QUERY
    WITH live_classes AS MATERIALIZED (
        SELECT c.id, c.teacher_id
        FROM public.classes c
        WHERE c.deleted_at IS NULL OR c.deleted_at > NOW()
    ),
    live_students AS MATERIALIZED (
        SELECT s.id, s.class_id, lc.teacher_id
        FROM public.students s
        JOIN live_classes lc ON lc.id = s.class_id
        WHERE s.deleted_at IS NULL OR s.deleted_at > NOW()
    ),
    class_agg AS (
        SELECT lc.teacher_id, COUNT(*)::INTEGER AS class_count
        FROM live_classes lc
        GROUP BY lc.teacher_id
    ),
    student_agg AS (
        SELECT ls.teacher_id, COUNT(*)::INTEGER AS student_count
        FROM live_students ls
        GROUP BY ls.teacher_id
    ),
    mission_agg AS (
        SELECT lc.teacher_id, COUNT(*)::INTEGER AS mission_count
        FROM public.writing_missions m
        JOIN live_classes lc ON lc.id = m.class_id
        GROUP BY lc.teacher_id
    ),
    post_agg AS (
        SELECT
            lc.teacher_id,
            COUNT(sp.id)::INTEGER AS post_count,
            COUNT(*) FILTER (WHERE sp.is_submitted IS TRUE)::INTEGER AS submitted_post_count
        FROM public.student_posts sp
        JOIN live_classes lc ON lc.id = sp.class_id
        JOIN live_students ls
          ON ls.id = sp.student_id
         AND ls.class_id = sp.class_id
        GROUP BY lc.teacher_id
    ),
    student_post_activity AS MATERIALIZED (
        SELECT lc.teacher_id, sp.student_id, sp.id AS post_id, sp.created_at AS occurred_at
        FROM public.student_posts sp
        JOIN live_classes lc ON lc.id = sp.class_id
        JOIN live_students ls
          ON ls.id = sp.student_id
         AND ls.class_id = sp.class_id
        UNION ALL
        SELECT lc.teacher_id, e.actor_student_id, e.post_id, e.occurred_at
        FROM public.writing_activity_events e
        JOIN live_classes lc ON lc.id = e.class_id
        JOIN live_students ls
          ON ls.id = e.actor_student_id
         AND ls.class_id = e.class_id
        JOIN public.student_posts sp
          ON sp.id = e.post_id
         AND sp.class_id = e.class_id
        WHERE e.actor_student_id IS NOT NULL
          AND e.post_id IS NOT NULL
          AND e.event_type LIKE 'post_%'
          AND e.event_type <> 'post_deleted'
    ),
    recent_activity_agg AS (
        SELECT
            a.teacher_id,
            COUNT(DISTINCT a.post_id) FILTER (WHERE a.occurred_at >= v_activity_since)::INTEGER AS recent_post_count,
            COUNT(DISTINCT a.student_id) FILTER (WHERE a.occurred_at >= v_activity_since)::INTEGER AS active_student_count
        FROM student_post_activity a
        GROUP BY a.teacher_id
    ),
    student_activity_times AS MATERIALIZED (
        SELECT lc.teacher_id, sp.created_at AS occurred_at
        FROM public.student_posts sp
        JOIN live_classes lc ON lc.id = sp.class_id
        JOIN live_students ls
          ON ls.id = sp.student_id
         AND ls.class_id = sp.class_id
        UNION ALL
        SELECT lc.teacher_id, e.occurred_at
        FROM public.writing_activity_events e
        JOIN live_classes lc ON lc.id = e.class_id
        JOIN live_students ls
          ON ls.id = e.actor_student_id
         AND ls.class_id = e.class_id
        WHERE e.actor_student_id IS NOT NULL
    ),
    last_activity_agg AS (
        SELECT a.teacher_id, MAX(a.occurred_at) AS last_student_activity_at
        FROM student_activity_times a
        GROUP BY a.teacher_id
    )
    SELECT
        p.id AS teacher_id,
        p.email::TEXT,
        COALESCE(
            NULLIF(t.name, ''),
            CASE WHEN COALESCE(p.full_name, '') LIKE '%@%' THEN NULL ELSE NULLIF(p.full_name, '') END,
            '이름 없음'
        )::TEXT AS display_name,
        COALESCE(NULLIF(t.school_name, ''), '')::TEXT AS school_name,
        COALESCE(NULLIF(t.phone, ''), '')::TEXT AS phone,
        p.role::TEXT,
        COALESCE(p.is_approved, FALSE) AS is_approved,
        p.approval_revoked_at,
        COALESCE(p.api_mode, 'SYSTEM')::TEXT AS api_mode,
        p.created_at,
        p.last_login_at,
        FLOOR(EXTRACT(EPOCH FROM (NOW() - COALESCE(p.last_login_at, p.created_at))) / 86400)::INTEGER AS days_since_login,
        FLOOR(EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 86400)::INTEGER AS days_since_signup,
        COALESCE(ca.class_count, 0) AS class_count,
        COALESCE(sa.student_count, 0) AS student_count,
        COALESCE(ma.mission_count, 0) AS mission_count,
        COALESCE(pa.post_count, 0) AS post_count,
        COALESCE(pa.submitted_post_count, 0) AS submitted_post_count,
        COALESCE(ra.recent_post_count, 0) AS recent_post_count,
        COALESCE(ra.active_student_count, 0) AS active_student_count,
        la.last_student_activity_at,
        CASE
            WHEN COALESCE(ca.class_count, 0) = 0 AND COALESCE(sa.student_count, 0) = 0 THEN 'NEVER_STARTED'
            WHEN COALESCE(sa.student_count, 0) = 0 THEN 'NO_STUDENT'
            WHEN COALESCE(p.last_login_at, p.created_at) < NOW() - (v_dormant_days || ' days')::INTERVAL THEN 'DORMANT'
            WHEN COALESCE(ra.recent_post_count, 0) > 0 OR COALESCE(pa.post_count, 0) > 0 THEN 'ACTIVE'
            ELSE 'IDLE'
        END::TEXT AS usage_status
    FROM public.profiles p
    LEFT JOIN public.teachers t ON t.id = p.id
    LEFT JOIN class_agg ca ON ca.teacher_id = p.id
    LEFT JOIN student_agg sa ON sa.teacher_id = p.id
    LEFT JOIN mission_agg ma ON ma.teacher_id = p.id
    LEFT JOIN post_agg pa ON pa.teacher_id = p.id
    LEFT JOIN recent_activity_agg ra ON ra.teacher_id = p.id
    LEFT JOIN last_activity_agg la ON la.teacher_id = p.id
    WHERE p.role = 'TEACHER'
    ORDER BY p.last_login_at DESC NULLS LAST, p.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_teacher_usage(INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_teacher_usage(INTEGER, INTEGER) TO authenticated, service_role;
