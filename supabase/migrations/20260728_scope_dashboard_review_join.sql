-- ============================================================================
-- 학급 운영 대시보드: 확인 기록 조인을 학급 안으로 좁힌다
--
-- get_class_operations_dashboard 가 확인 기록을 post_id 로만 붙이고 있었다.
-- WORKLOG "학급 글 조회 기준" ②를 어긴 것으로, 앞서 독서록 RPC에서 측정으로
-- 확인한 문제와 같다 — 조인 조건에 학급이 없으면 계획기가 한 학급 몫을 고를
-- 방법이 없어 **전 학급의 확인 기록을 통째로 Seq Scan** 한다.
-- (측정: 확인 기록 7.7만 행 기준 8~16ms → 2.5ms, 20260728_reading_log_scope_review_join 참조)
--
-- reading_log_teacher_reviews 에는 class_id 와 idx_reading_log_reviews_class_status
-- 가 이미 있다. 확인 기록은 저장할 때 그 글의 class_id 를 넣으므로
-- review.class_id = p_class_id 는 항상 참이고, 결과는 바뀌지 않는다.
--
-- 본문은 운영 DB의 현재 정의(pg_get_functiondef)를 그대로 가져와 조인 2줄만 고쳤다.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_class_operations_dashboard(p_class_id uuid, p_period text DEFAULT '7d'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_is_admin BOOLEAN := false;
    v_period_start TIMESTAMPTZ;
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    IF p_period NOT IN ('7d', '30d', 'all') THEN
        RAISE EXCEPTION '올바르지 않은 조회 기간입니다.' USING ERRCODE = '22023';
    END IF;

    v_is_admin := public.auth_user_role() = 'ADMIN';
    IF NOT v_is_admin AND NOT EXISTS (
        SELECT 1
        FROM public.classes c
        WHERE c.id = p_class_id
          AND c.teacher_id = auth.uid()
    ) THEN
        RAISE EXCEPTION '이 학급의 운영 현황을 볼 권한이 없습니다.'
            USING ERRCODE = '42501';
    END IF;

    IF p_period = '7d' THEN
        v_period_start := (
            ((timezone('Asia/Seoul', NOW()))::DATE - 6)::TIMESTAMP
            AT TIME ZONE 'Asia/Seoul'
        );
    ELSIF p_period = '30d' THEN
        v_period_start := (
            ((timezone('Asia/Seoul', NOW()))::DATE - 29)::TIMESTAMP
            AT TIME ZONE 'Asia/Seoul'
        );
    ELSE
        v_period_start := NULL;
    END IF;

    WITH active_roster AS MATERIALIZED (
        SELECT s.id, s.name
        FROM public.students s
        WHERE s.class_id = p_class_id
          AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
    ),
    period_posts AS MATERIALIZED (
        SELECT p.id, p.student_id, p.char_count
        FROM public.student_posts p
        JOIN active_roster r ON r.id = p.student_id
        WHERE p.class_id = p_class_id
          AND p.is_submitted = true
          AND (
              v_period_start IS NULL
              OR COALESCE(p.first_submitted_at, p.updated_at, p.created_at) >= v_period_start
          )
    ),
    period_events AS MATERIALIZED (
        SELECT e.event_type, e.student_id, e.actor_student_id
        FROM public.writing_activity_events e
        WHERE e.class_id = p_class_id
          AND (v_period_start IS NULL OR e.occurred_at >= v_period_start)
    ),
    active_student_ids AS (
        SELECT pp.student_id AS id FROM period_posts pp
        UNION
        SELECT pe.actor_student_id AS id
        FROM period_events pe
        JOIN active_roster r ON r.id = pe.actor_student_id
        WHERE pe.actor_student_id IS NOT NULL
    ),
    roster_post_activity AS MATERIALIZED (
        SELECT p.student_id, MAX(p.updated_at) AS last_activity_at
        FROM public.student_posts p
        WHERE p.class_id = p_class_id
        GROUP BY p.student_id
    ),
    roster_event_activity AS MATERIALIZED (
        SELECT e.actor_student_id AS student_id, MAX(e.occurred_at) AS last_activity_at
        FROM public.writing_activity_events e
        WHERE e.class_id = p_class_id
          AND e.actor_student_id IS NOT NULL
        GROUP BY e.actor_student_id
    ),
    roster_last_activity AS (
        SELECT
            r.id,
            r.name,
            GREATEST(
                p.last_activity_at,
                e.last_activity_at
            ) AS last_activity_at
        FROM active_roster r
        LEFT JOIN roster_post_activity p ON p.student_id = r.id
        LEFT JOIN roster_event_activity e ON e.student_id = r.id
    ),
    recent_missions AS MATERIALIZED (
        SELECT m.id, m.title, m.mission_type, m.created_at, m.evaluation_rubric
        FROM public.writing_missions m
        WHERE m.class_id = p_class_id
          AND m.is_archived IS DISTINCT FROM true
        ORDER BY m.created_at DESC, m.id
        LIMIT 6
    ),
    mission_rows AS (
        SELECT
            m.id,
            m.title,
            m.mission_type,
            m.created_at,
            COALESCE(m.evaluation_rubric->>'use_rubric', 'false') = 'true'
                AS rubric_enabled,
            COUNT(DISTINCT p.student_id) FILTER (WHERE p.is_submitted = true)::INTEGER
                AS submitted_count,
            COUNT(DISTINCT p.student_id) FILTER (
                WHERE p.is_submitted = true AND p.is_confirmed = true
            )::INTEGER AS confirmed_count,
            COUNT(DISTINCT p.student_id) FILTER (
                WHERE p.is_submitted = true
                  AND (p.initial_eval IS NOT NULL OR p.final_eval IS NOT NULL)
            )::INTEGER AS evaluated_count,
            COALESCE(
                ROUND(AVG(NULLIF(p.char_count, 0)) FILTER (WHERE p.is_submitted = true))::INTEGER,
                0
            ) AS avg_chars
        FROM recent_missions m
        LEFT JOIN public.student_posts p
          ON p.class_id = p_class_id
         AND p.mission_id = m.id
         AND EXISTS (SELECT 1 FROM active_roster r WHERE r.id = p.student_id)
        GROUP BY m.id, m.title, m.mission_type, m.created_at, m.evaluation_rubric
    )
    SELECT jsonb_build_object(
        'period', p_period,
        'period_start', v_period_start,
        'generated_at', NOW(),
        'summary', jsonb_build_object(
            'students', (SELECT COUNT(*)::INTEGER FROM active_roster),
            'active_students', (SELECT COUNT(*)::INTEGER FROM active_student_ids),
            'submitted_posts', (SELECT COUNT(*)::INTEGER FROM period_posts),
            'revisions', (
                SELECT COUNT(*)::INTEGER FROM period_events WHERE event_type = 'post_revised'
            ),
            'comments', (
                SELECT COUNT(*)::INTEGER FROM period_events WHERE event_type = 'comment_added'
            ),
            'feedbacks', (
                SELECT COUNT(*)::INTEGER FROM period_events WHERE event_type = 'feedback_received'
            ),
            'avg_chars', (
                SELECT COALESCE(ROUND(AVG(NULLIF(char_count, 0)))::INTEGER, 0)
                FROM period_posts
            )
        ),
        'actions', jsonb_build_object(
            'assignment_pending', jsonb_build_object(
                'count', (
                    SELECT COUNT(*)::INTEGER
                    FROM public.student_posts p
                    JOIN active_roster r ON r.id = p.student_id
                    JOIN public.writing_missions m
                      ON m.id = p.mission_id AND m.class_id = p_class_id
                    WHERE p.class_id = p_class_id
                      AND p.writing_context = 'assignment'
                      AND p.is_submitted = true
                      AND COALESCE(p.is_confirmed, false) = false
                      AND m.is_archived IS DISTINCT FROM true
                ),
                'items', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                        'post_id', item.post_id,
                        'student_id', item.student_id,
                        'student_name', item.student_name,
                        'title', item.title,
                        'mission_title', item.mission_title,
                        'updated_at', item.updated_at
                    ) ORDER BY item.updated_at DESC, item.post_id)
                    FROM (
                        SELECT
                            p.id AS post_id, p.student_id, r.name AS student_name,
                            p.title, m.title AS mission_title, p.updated_at
                        FROM public.student_posts p
                        JOIN active_roster r ON r.id = p.student_id
                        JOIN public.writing_missions m
                          ON m.id = p.mission_id AND m.class_id = p_class_id
                        WHERE p.class_id = p_class_id
                          AND p.writing_context = 'assignment'
                          AND p.is_submitted = true
                          AND COALESCE(p.is_confirmed, false) = false
                          AND m.is_archived IS DISTINCT FROM true
                        ORDER BY p.updated_at DESC, p.id
                        LIMIT 8
                    ) item
                ), '[]'::JSONB)
            ),
            'reading_pending', jsonb_build_object(
                'count', (
                    SELECT COUNT(*)::INTEGER
                    FROM public.student_posts p
                    JOIN active_roster r ON r.id = p.student_id
                    LEFT JOIN public.reading_log_teacher_reviews review
                           ON review.post_id = p.id AND review.class_id = p_class_id
                    WHERE p.class_id = p_class_id
                      AND p.writing_context = 'self'
                      AND p.self_writing_type = 'reading_log'
                      AND p.is_submitted = true
                      AND review.post_id IS NULL
                ),
                'items', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                        'post_id', item.post_id,
                        'student_id', item.student_id,
                        'student_name', item.student_name,
                        'title', item.title,
                        'updated_at', item.updated_at
                    ) ORDER BY item.updated_at DESC, item.post_id)
                    FROM (
                        SELECT
                            p.id AS post_id, p.student_id, r.name AS student_name,
                            p.title, p.updated_at
                        FROM public.student_posts p
                        JOIN active_roster r ON r.id = p.student_id
                        LEFT JOIN public.reading_log_teacher_reviews review
                           ON review.post_id = p.id AND review.class_id = p_class_id
                        WHERE p.class_id = p_class_id
                          AND p.writing_context = 'self'
                          AND p.self_writing_type = 'reading_log'
                          AND p.is_submitted = true
                          AND review.post_id IS NULL
                        ORDER BY p.updated_at DESC, p.id
                        LIMIT 8
                    ) item
                ), '[]'::JSONB)
            ),
            'evaluation_pending', jsonb_build_object(
                'count', (
                    SELECT COUNT(*)::INTEGER
                    FROM public.student_posts p
                    JOIN active_roster r ON r.id = p.student_id
                    JOIN public.writing_missions m
                      ON m.id = p.mission_id AND m.class_id = p_class_id
                    WHERE p.class_id = p_class_id
                      AND p.is_submitted = true
                      AND m.is_archived IS DISTINCT FROM true
                      AND COALESCE(m.evaluation_rubric->>'use_rubric', 'false') = 'true'
                      AND p.initial_eval IS NULL
                      AND p.final_eval IS NULL
                ),
                'items', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                        'post_id', item.post_id,
                        'student_id', item.student_id,
                        'student_name', item.student_name,
                        'title', item.title,
                        'mission_title', item.mission_title,
                        'updated_at', item.updated_at
                    ) ORDER BY item.updated_at DESC, item.post_id)
                    FROM (
                        SELECT
                            p.id AS post_id, p.student_id, r.name AS student_name,
                            p.title, m.title AS mission_title, p.updated_at
                        FROM public.student_posts p
                        JOIN active_roster r ON r.id = p.student_id
                        JOIN public.writing_missions m
                          ON m.id = p.mission_id AND m.class_id = p_class_id
                        WHERE p.class_id = p_class_id
                          AND p.is_submitted = true
                          AND m.is_archived IS DISTINCT FROM true
                          AND COALESCE(m.evaluation_rubric->>'use_rubric', 'false') = 'true'
                          AND p.initial_eval IS NULL
                          AND p.final_eval IS NULL
                        ORDER BY p.updated_at DESC, p.id
                        LIMIT 8
                    ) item
                ), '[]'::JSONB)
            ),
            'inactive_students', jsonb_build_object(
                'count', (
                    SELECT COUNT(*)::INTEGER
                    FROM roster_last_activity a
                    WHERE a.last_activity_at IS NULL
                       OR a.last_activity_at < NOW() - INTERVAL '7 days'
                ),
                'items', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                        'student_id', item.student_id,
                        'student_name', item.student_name,
                        'last_activity_at', item.last_activity_at
                    ) ORDER BY item.last_activity_at ASC NULLS FIRST, item.student_id)
                    FROM (
                        SELECT
                            a.id AS student_id, a.name AS student_name, a.last_activity_at
                        FROM roster_last_activity a
                        WHERE a.last_activity_at IS NULL
                           OR a.last_activity_at < NOW() - INTERVAL '7 days'
                        ORDER BY a.last_activity_at ASC NULLS FIRST, a.id
                        LIMIT 8
                    ) item
                ), '[]'::JSONB)
            )
        ),
        'missions', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', mr.id,
                'title', mr.title,
                'mission_type', mr.mission_type,
                'created_at', mr.created_at,
                'rubric_enabled', mr.rubric_enabled,
                'submitted_count', mr.submitted_count,
                'confirmed_count', mr.confirmed_count,
                'evaluated_count', mr.evaluated_count,
                'missing_count', GREATEST(
                    (SELECT COUNT(*)::INTEGER FROM active_roster) - mr.submitted_count,
                    0
                ),
                'avg_chars', mr.avg_chars
            ) ORDER BY mr.created_at DESC, mr.id)
            FROM mission_rows mr
        ), '[]'::JSONB)
    )
    INTO v_result;

    RETURN COALESCE(v_result, jsonb_build_object(
        'period', p_period,
        'period_start', v_period_start,
        'generated_at', NOW(),
        'summary', jsonb_build_object(
            'students', 0, 'active_students', 0, 'submitted_posts', 0,
            'revisions', 0, 'comments', 0, 'feedbacks', 0, 'avg_chars', 0
        ),
        'actions', jsonb_build_object(),
        'missions', '[]'::JSONB
    ));
END;
$function$;

COMMIT;
