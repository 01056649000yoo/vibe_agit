-- 대시보드 지표 정확도 보강 (2026-08-24)
--
-- 1. 학생 로그인/세션 복구 때 last_login 을 기록한다.
-- 2. 관리자 서비스 현황은 한국 날짜와 실제 제출 시각을 기준으로 센다.
-- 3. 교사 학급 현황은 접속 학생과 글쓰기 활동 학생을 분리한다.
-- 4. 관리자 사용량은 실제 교사·활성 학급/학생과 학생 본인의 글쓰기 활동만 센다.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_students_last_login
    ON public.students (last_login DESC)
    WHERE last_login IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_students_class_last_login
    ON public.students (class_id, last_login DESC)
    WHERE last_login IS NOT NULL;

-- 새 코드 로그인은 항상 접속 시각을 남긴다.
CREATE OR REPLACE FUNCTION public.bind_student_auth(p_student_code TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth_id UUID := auth.uid();
    v_student RECORD;
    v_previous_auth_id UUID;
BEGIN
    IF v_auth_id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Login session expired. Please refresh and try again.'
        );
    END IF;

    IF COALESCE(BTRIM(p_student_code), '') = '' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Student code is required.'
        );
    END IF;

    SELECT
        s.id,
        s.name,
        s.student_code,
        s.class_id,
        s.auth_id,
        c.name AS class_name
    INTO v_student
    FROM public.students s
    LEFT JOIN public.classes c
      ON c.id = s.class_id
    WHERE s.student_code = UPPER(BTRIM(p_student_code))
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Student code not found.'
        );
    END IF;

    v_previous_auth_id := v_student.auth_id;
    PERFORM set_config('app.bypass_student_trigger', 'true', true);

    UPDATE public.students
       SET auth_id = NULL
     WHERE auth_id = v_auth_id
       AND id <> v_student.id;

    UPDATE public.students
       SET auth_id = v_auth_id,
           last_login = NOW()
     WHERE id = v_student.id;

    PERFORM set_config('app.bypass_student_trigger', 'false', true);

    RETURN json_build_object(
        'success', true,
        'replacedExistingSession', (v_previous_auth_id IS NOT NULL AND v_previous_auth_id <> v_auth_id),
        'student', json_build_object(
            'id', v_student.id,
            'name', v_student.name,
            'code', v_student.student_code,
            'classId', v_student.class_id,
            'className', COALESCE(v_student.class_name, 'Class')
        )
    );
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.bypass_student_trigger', 'false', true);
    RAISE;
END;
$$;

-- 저장된 세션 복구도 접속으로 보되, 반복 확인 때문에 쓰기가 폭증하지 않도록 10분에 한 번만 갱신한다.
CREATE OR REPLACE FUNCTION public.get_student_by_auth()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student RECORD;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'No auth session');
    END IF;

    SELECT
        s.id,
        s.name,
        s.student_code,
        s.class_id,
        c.name AS class_name
    INTO v_student
    FROM public.students s
    LEFT JOIN public.classes c
      ON c.id = s.class_id
    WHERE s.auth_id = auth.uid()
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Student binding not found');
    END IF;

    UPDATE public.students
       SET last_login = NOW()
     WHERE id = v_student.id
       AND (last_login IS NULL OR last_login < NOW() - INTERVAL '10 minutes');

    RETURN json_build_object(
        'success', true,
        'student', json_build_object(
            'id', v_student.id,
            'name', v_student.name,
            'code', v_student.student_code,
            'classId', v_student.class_id,
            'className', COALESCE(v_student.class_name, 'Class')
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.bind_student_auth(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_student_by_auth() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bind_student_auth(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_student_by_auth() TO authenticated, service_role;

-- 5분 기록으로 값이 바뀌면 화면의 "마지막 서버 기록" 시각도 함께 바뀌어야 한다.
CREATE OR REPLACE FUNCTION public.record_system_peak_v1(
    p_day DATE,
    p_mem_total_mb INTEGER,
    p_mem_available_mb INTEGER,
    p_swap_used_mb INTEGER,
    p_gateway_cpu_pct NUMERIC,
    p_gateway_mem_mb INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF public.auth_user_role() IN ('TEACHER', 'STUDENT') THEN
        RAISE EXCEPTION '호스트 기록기만 부를 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.system_daily_metrics AS m (
        metric_day, vm_mem_total_mb, vm_mem_available_min_mb,
        vm_swap_used_max_mb, gateway_cpu_max_pct, gateway_mem_max_mb
    ) VALUES (
        p_day, p_mem_total_mb, p_mem_available_mb,
        p_swap_used_mb, p_gateway_cpu_pct, p_gateway_mem_mb
    )
    ON CONFLICT (metric_day) DO UPDATE SET
        vm_mem_total_mb = COALESCE(EXCLUDED.vm_mem_total_mb, m.vm_mem_total_mb),
        vm_mem_available_min_mb = LEAST(
            COALESCE(m.vm_mem_available_min_mb, EXCLUDED.vm_mem_available_min_mb),
            COALESCE(EXCLUDED.vm_mem_available_min_mb, m.vm_mem_available_min_mb)
        ),
        vm_swap_used_max_mb = GREATEST(
            COALESCE(m.vm_swap_used_max_mb, EXCLUDED.vm_swap_used_max_mb),
            COALESCE(EXCLUDED.vm_swap_used_max_mb, m.vm_swap_used_max_mb)
        ),
        gateway_cpu_max_pct = GREATEST(
            COALESCE(m.gateway_cpu_max_pct, EXCLUDED.gateway_cpu_max_pct),
            COALESCE(EXCLUDED.gateway_cpu_max_pct, m.gateway_cpu_max_pct)
        ),
        gateway_mem_max_mb = GREATEST(
            COALESCE(m.gateway_mem_max_mb, EXCLUDED.gateway_mem_max_mb),
            COALESCE(EXCLUDED.gateway_mem_max_mb, m.gateway_mem_max_mb)
        ),
        recorded_at = NOW();
END;
$function$;

REVOKE ALL ON FUNCTION public.record_system_peak_v1(DATE, INTEGER, INTEGER, INTEGER, NUMERIC, INTEGER)
    FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_service_overview_v1(p_trend_days INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_days INTEGER := LEAST(GREATEST(COALESCE(p_trend_days, 30), 7), 90);
    v_today_date DATE := timezone('Asia/Seoul', NOW())::DATE;
    v_today_start TIMESTAMPTZ;
    v_week_start TIMESTAMPTZ;
    v_scope_start TIMESTAMPTZ;
    v_today JSONB;
    v_week JSONB;
    v_ai_scopes JSONB;
    v_trend JSONB;
    v_latest JSONB;
    v_alerts JSONB;
BEGIN
    IF public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION '관리자만 볼 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    v_today_start := v_today_date::TIMESTAMP AT TIME ZONE 'Asia/Seoul';
    v_week_start := (v_today_date - 6)::TIMESTAMP AT TIME ZONE 'Asia/Seoul';
    v_scope_start := (v_today_date - (v_days - 1))::TIMESTAMP AT TIME ZONE 'Asia/Seoul';

    SELECT jsonb_build_object(
        'teachers', (SELECT count(*) FROM public.profiles
                     WHERE role = 'TEACHER' AND last_login_at >= v_today_start),
        'students', (SELECT count(*) FROM public.students
                     WHERE last_login >= v_today_start
                       AND (deleted_at IS NULL OR deleted_at > NOW())),
        'ai_calls', (SELECT count(*) FROM public.ai_request_events
                     WHERE created_at >= v_today_start),
        'posts',    (SELECT count(*) FROM public.student_posts
                     WHERE is_submitted IS TRUE
                       AND COALESCE(first_submitted_at, created_at) >= v_today_start)
    ) INTO v_today;

    SELECT jsonb_build_object(
        'teachers', (SELECT count(*) FROM public.profiles
                     WHERE role = 'TEACHER' AND last_login_at >= v_week_start),
        'students', (SELECT count(*) FROM public.students
                     WHERE last_login >= v_week_start
                       AND (deleted_at IS NULL OR deleted_at > NOW())),
        'ai_calls', (SELECT count(*) FROM public.ai_request_events
                     WHERE created_at >= v_week_start),
        'posts',    (SELECT count(*) FROM public.student_posts
                     WHERE is_submitted IS TRUE
                       AND COALESCE(first_submitted_at, created_at) >= v_week_start)
    ) INTO v_week;

    SELECT COALESCE(jsonb_object_agg(scope, cnt), '{}'::JSONB) INTO v_ai_scopes
    FROM (
        SELECT scope, count(*) AS cnt
        FROM public.ai_request_events
        WHERE created_at >= v_scope_start
        GROUP BY scope
    ) s;

    SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.metric_day), '[]'::JSONB) INTO v_trend
    FROM (
        SELECT metric_day, rx_bytes, tx_bytes, disk_free_gb, db_size_mb,
               container_total, container_healthy,
               vm_mem_total_mb, vm_mem_available_min_mb, vm_swap_used_max_mb,
               gateway_cpu_max_pct, gateway_mem_max_mb
        FROM public.system_daily_metrics
        WHERE metric_day >= v_today_date - (v_days - 1)
          AND metric_day <= v_today_date
        ORDER BY metric_day
    ) d;

    SELECT to_jsonb(m) INTO v_latest FROM (
        SELECT metric_day, rx_bytes, tx_bytes, disk_free_gb, db_size_mb,
               container_total, container_healthy, recorded_at,
               vm_mem_total_mb, vm_mem_available_min_mb, vm_swap_used_max_mb,
               gateway_cpu_max_pct, gateway_mem_max_mb
        FROM public.system_daily_metrics
        WHERE metric_day <= v_today_date
        ORDER BY metric_day DESC
        LIMIT 1
    ) m;

    SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.last_seen_at DESC), '[]'::JSONB) INTO v_alerts
    FROM (
        SELECT alert_key, status, detail, first_seen_at, last_seen_at, resolved_at, notified_at
        FROM public.system_alert_events
        ORDER BY last_seen_at DESC
        LIMIT 20
    ) a;

    RETURN jsonb_build_object(
        'version', 1,
        'trend_days', v_days,
        'today', v_today,
        'week', v_week,
        'ai_scopes', v_ai_scopes,
        'trend', v_trend,
        'latest', COALESCE(v_latest, 'null'::JSONB),
        'alerts', v_alerts,
        'open_alerts', (SELECT count(*) FROM public.system_alert_events WHERE status = 'open')
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_get_service_overview_v1(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_service_overview_v1(INTEGER) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_class_operations_dashboard(
    p_class_id UUID,
    p_period TEXT DEFAULT '7d'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
        SELECT s.id, s.name, s.last_login
        FROM public.students s
        WHERE s.class_id = p_class_id
          AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
    ),
    submission_times AS MATERIALIZED (
        SELECT e.post_id, MIN(e.occurred_at) AS first_submitted_event_at
        FROM public.writing_activity_events e
        WHERE e.class_id = p_class_id
          AND e.post_id IS NOT NULL
          AND e.event_type IN ('post_submitted', 'post_resubmitted')
        GROUP BY e.post_id
    ),
    period_posts AS MATERIALIZED (
        SELECT p.id, p.student_id, p.char_count
        FROM public.student_posts p
        JOIN active_roster r ON r.id = p.student_id
        LEFT JOIN submission_times st ON st.post_id = p.id
        WHERE p.class_id = p_class_id
          AND p.is_submitted IS TRUE
          AND (
              v_period_start IS NULL
              OR COALESCE(p.first_submitted_at, st.first_submitted_event_at, p.created_at) >= v_period_start
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
        SELECT
            p.student_id,
            MAX(
                CASE
                    WHEN p.is_submitted IS TRUE THEN COALESCE(p.first_submitted_at, p.created_at)
                    ELSE p.created_at
                END
            ) AS last_activity_at
        FROM public.student_posts p
        JOIN active_roster r ON r.id = p.student_id
        WHERE p.class_id = p_class_id
        GROUP BY p.student_id
    ),
    roster_event_activity AS MATERIALIZED (
        SELECT e.actor_student_id AS student_id, MAX(e.occurred_at) AS last_activity_at
        FROM public.writing_activity_events e
        JOIN active_roster r ON r.id = e.actor_student_id
        WHERE e.class_id = p_class_id
          AND e.actor_student_id IS NOT NULL
        GROUP BY e.actor_student_id
    ),
    roster_last_activity AS (
        SELECT
            r.id,
            r.name,
            GREATEST(p.last_activity_at, e.last_activity_at) AS last_activity_at
        FROM active_roster r
        LEFT JOIN roster_post_activity p ON p.student_id = r.id
        LEFT JOIN roster_event_activity e ON e.student_id = r.id
    ),
    recent_missions AS MATERIALIZED (
        SELECT m.id, m.title, m.mission_type, m.created_at, m.evaluation_rubric
        FROM public.writing_missions m
        WHERE m.class_id = p_class_id
          AND m.is_archived IS DISTINCT FROM TRUE
        ORDER BY m.created_at DESC, m.id
        LIMIT 6
    ),
    mission_rows AS (
        SELECT
            m.id,
            m.title,
            m.mission_type,
            m.created_at,
            COALESCE(m.evaluation_rubric->>'use_rubric', 'false') = 'true' AS rubric_enabled,
            COUNT(DISTINCT p.student_id) FILTER (WHERE p.is_submitted IS TRUE)::INTEGER AS submitted_count,
            COUNT(DISTINCT p.student_id) FILTER (
                WHERE p.is_submitted IS TRUE AND p.is_confirmed IS TRUE
            )::INTEGER AS confirmed_count,
            COUNT(DISTINCT p.student_id) FILTER (
                WHERE p.is_submitted IS TRUE
                  AND (p.initial_eval IS NOT NULL OR p.final_eval IS NOT NULL)
            )::INTEGER AS evaluated_count,
            COALESCE(
                ROUND(AVG(NULLIF(p.char_count, 0)) FILTER (WHERE p.is_submitted IS TRUE))::INTEGER,
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
            'accessed_students', (
                SELECT COUNT(*)::INTEGER
                FROM active_roster
                WHERE last_login IS NOT NULL
                  AND (v_period_start IS NULL OR last_login >= v_period_start)
            ),
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
                      AND p.is_submitted IS TRUE
                      AND COALESCE(p.is_confirmed, FALSE) = FALSE
                      AND m.is_archived IS DISTINCT FROM TRUE
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
                          AND p.is_submitted IS TRUE
                          AND COALESCE(p.is_confirmed, FALSE) = FALSE
                          AND m.is_archived IS DISTINCT FROM TRUE
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
                      ON review.post_id = p.id
                     AND review.class_id = p_class_id
                    WHERE p.class_id = p_class_id
                      AND p.writing_context = 'self'
                      AND p.self_writing_type = 'reading_log'
                      AND p.is_submitted IS TRUE
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
                          ON review.post_id = p.id
                         AND review.class_id = p_class_id
                        WHERE p.class_id = p_class_id
                          AND p.writing_context = 'self'
                          AND p.self_writing_type = 'reading_log'
                          AND p.is_submitted IS TRUE
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
                      AND p.is_submitted IS TRUE
                      AND m.is_archived IS DISTINCT FROM TRUE
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
                          AND p.is_submitted IS TRUE
                          AND m.is_archived IS DISTINCT FROM TRUE
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
                        SELECT a.id AS student_id, a.name AS student_name, a.last_activity_at
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
    ) INTO v_result;

    RETURN COALESCE(v_result, jsonb_build_object(
        'period', p_period,
        'period_start', v_period_start,
        'generated_at', NOW(),
        'summary', jsonb_build_object(
            'students', 0, 'accessed_students', 0, 'active_students', 0,
            'submitted_posts', 0, 'revisions', 0, 'comments', 0,
            'feedbacks', 0, 'avg_chars', 0
        ),
        'actions', jsonb_build_object(),
        'missions', '[]'::JSONB
    ));
END;
$$;

REVOKE ALL ON FUNCTION public.get_class_operations_dashboard(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_class_operations_dashboard(UUID, TEXT) TO authenticated, service_role;

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
            WHEN COALESCE(ra.recent_post_count, 0) > 0 THEN 'ACTIVE'
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

CREATE OR REPLACE FUNCTION public.admin_get_usage_overview(
    p_dormant_days INTEGER DEFAULT 60,
    p_activity_days INTEGER DEFAULT 30
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_activity_days INTEGER := GREATEST(COALESCE(p_activity_days, 30), 1);
    v_activity_since TIMESTAMPTZ := NOW() - (v_activity_days || ' days')::INTERVAL;
    v_result JSON;
BEGIN
    IF public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION 'Only admins can read usage overview';
    END IF;

    WITH teacher_usage AS MATERIALIZED (
        SELECT * FROM public.admin_get_teacher_usage(p_dormant_days, v_activity_days)
    ),
    teacher_rollup AS (
        SELECT
            COUNT(*)::INTEGER AS teacher_total,
            COUNT(*) FILTER (WHERE tu.is_approved)::INTEGER AS teacher_approved,
            COUNT(*) FILTER (WHERE NOT tu.is_approved)::INTEGER AS teacher_pending,
            COUNT(*) FILTER (WHERE tu.usage_status = 'ACTIVE')::INTEGER AS teacher_active,
            COUNT(*) FILTER (WHERE tu.usage_status = 'IDLE')::INTEGER AS teacher_idle,
            COUNT(*) FILTER (WHERE tu.usage_status = 'DORMANT')::INTEGER AS teacher_dormant,
            COUNT(*) FILTER (WHERE tu.usage_status = 'NO_STUDENT')::INTEGER AS teacher_no_student,
            COUNT(*) FILTER (WHERE tu.usage_status = 'NEVER_STARTED')::INTEGER AS teacher_never_started
        FROM teacher_usage tu
    ),
    live_classes AS MATERIALIZED (
        SELECT c.id
        FROM public.classes c
        WHERE c.deleted_at IS NULL OR c.deleted_at > NOW()
    ),
    live_students AS MATERIALIZED (
        SELECT s.id, s.class_id
        FROM public.students s
        JOIN live_classes lc ON lc.id = s.class_id
        WHERE s.deleted_at IS NULL OR s.deleted_at > NOW()
    ),
    current_posts AS MATERIALIZED (
        SELECT sp.id, sp.student_id, sp.class_id, sp.created_at
        FROM public.student_posts sp
        JOIN live_classes lc ON lc.id = sp.class_id
        JOIN live_students ls
          ON ls.id = sp.student_id
         AND ls.class_id = sp.class_id
    ),
    student_post_activity AS MATERIALIZED (
        SELECT p.student_id, p.id AS post_id, p.created_at AS occurred_at
        FROM current_posts p
        UNION ALL
        SELECT e.actor_student_id, e.post_id, e.occurred_at
        FROM public.writing_activity_events e
        JOIN live_students ls
          ON ls.id = e.actor_student_id
         AND ls.class_id = e.class_id
        JOIN current_posts p
          ON p.id = e.post_id
         AND p.class_id = e.class_id
        WHERE e.actor_student_id IS NOT NULL
          AND e.post_id IS NOT NULL
          AND e.event_type LIKE 'post_%'
          AND e.event_type <> 'post_deleted'
    ),
    post_rollup AS (
        SELECT
            (SELECT COUNT(*)::INTEGER FROM current_posts) AS total_posts,
            COUNT(DISTINCT a.post_id) FILTER (WHERE a.occurred_at >= v_activity_since)::INTEGER AS recent_posts,
            COUNT(DISTINCT a.student_id) FILTER (WHERE a.occurred_at >= v_activity_since)::INTEGER AS recent_active_students
        FROM student_post_activity a
    )
    SELECT json_build_object(
        'teacher_total', tr.teacher_total,
        'teacher_approved', tr.teacher_approved,
        'teacher_pending', tr.teacher_pending,
        'teacher_active', tr.teacher_active,
        'teacher_idle', tr.teacher_idle,
        'teacher_dormant', tr.teacher_dormant,
        'teacher_no_student', tr.teacher_no_student,
        'teacher_never_started', tr.teacher_never_started,
        'class_total', (SELECT COUNT(*)::INTEGER FROM live_classes),
        'student_total', (SELECT COUNT(*)::INTEGER FROM live_students),
        'student_active', COALESCE(pr.recent_active_students, 0),
        'post_total', COALESCE(pr.total_posts, 0),
        'post_recent', COALESCE(pr.recent_posts, 0),
        'dormant_days', GREATEST(COALESCE(p_dormant_days, 60), 1),
        'activity_days', v_activity_days,
        'generated_at', NOW()
    )
    INTO v_result
    FROM teacher_rollup tr, post_rollup pr;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_usage_overview(INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_usage_overview(INTEGER, INTEGER) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_get_student_activity(
    p_teacher_id UUID DEFAULT NULL,
    p_activity_days INTEGER DEFAULT 30,
    p_limit INTEGER DEFAULT 200
)
RETURNS TABLE (
    student_id UUID,
    student_name TEXT,
    class_id UUID,
    class_name TEXT,
    teacher_id UUID,
    teacher_name TEXT,
    school_name TEXT,
    total_points INTEGER,
    post_count INTEGER,
    submitted_count INTEGER,
    recent_post_count INTEGER,
    last_activity_at TIMESTAMPTZ,
    joined_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_activity_days INTEGER := GREATEST(COALESCE(p_activity_days, 30), 1);
    v_activity_since TIMESTAMPTZ := NOW() - (v_activity_days || ' days')::INTERVAL;
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000);
BEGIN
    IF public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION 'Only admins can read student activity';
    END IF;

    RETURN QUERY
    WITH target_students AS MATERIALIZED (
        SELECT
            s.id, s.name, s.class_id, s.total_points, s.created_at,
            c.name AS class_name, c.teacher_id
        FROM public.students s
        JOIN public.classes c
          ON c.id = s.class_id
         AND (c.deleted_at IS NULL OR c.deleted_at > NOW())
        WHERE (s.deleted_at IS NULL OR s.deleted_at > NOW())
          AND (p_teacher_id IS NULL OR c.teacher_id = p_teacher_id)
    ),
    current_posts AS MATERIALIZED (
        SELECT sp.id, sp.student_id, sp.class_id, sp.is_submitted, sp.created_at
        FROM public.student_posts sp
        JOIN target_students ts
          ON ts.id = sp.student_id
         AND ts.class_id = sp.class_id
    ),
    post_agg AS (
        SELECT
            p.student_id,
            COUNT(*)::INTEGER AS post_count,
            COUNT(*) FILTER (WHERE p.is_submitted IS TRUE)::INTEGER AS submitted_count
        FROM current_posts p
        GROUP BY p.student_id
    ),
    student_post_activity AS MATERIALIZED (
        SELECT p.student_id, p.id AS post_id, p.created_at AS occurred_at
        FROM current_posts p
        UNION ALL
        SELECT e.actor_student_id, e.post_id, e.occurred_at
        FROM public.writing_activity_events e
        JOIN target_students ts
          ON ts.id = e.actor_student_id
         AND ts.class_id = e.class_id
        JOIN current_posts p
          ON p.id = e.post_id
         AND p.class_id = e.class_id
        WHERE e.actor_student_id IS NOT NULL
          AND e.post_id IS NOT NULL
          AND e.event_type LIKE 'post_%'
          AND e.event_type <> 'post_deleted'
    ),
    recent_activity AS (
        SELECT
            a.student_id,
            COUNT(DISTINCT a.post_id) FILTER (WHERE a.occurred_at >= v_activity_since)::INTEGER AS recent_post_count
        FROM student_post_activity a
        GROUP BY a.student_id
    ),
    all_activity AS MATERIALIZED (
        SELECT p.student_id, p.created_at AS occurred_at
        FROM current_posts p
        UNION ALL
        SELECT e.actor_student_id, e.occurred_at
        FROM public.writing_activity_events e
        JOIN target_students ts
          ON ts.id = e.actor_student_id
         AND ts.class_id = e.class_id
        WHERE e.actor_student_id IS NOT NULL
    ),
    last_activity AS (
        SELECT a.student_id, MAX(a.occurred_at) AS last_activity_at
        FROM all_activity a
        GROUP BY a.student_id
    )
    SELECT
        ts.id AS student_id,
        ts.name::TEXT AS student_name,
        ts.class_id,
        ts.class_name::TEXT,
        ts.teacher_id,
        COALESCE(NULLIF(t.name, ''), '이름 없음')::TEXT AS teacher_name,
        COALESCE(NULLIF(t.school_name, ''), '')::TEXT AS school_name,
        COALESCE(ts.total_points, 0)::INTEGER AS total_points,
        COALESCE(pa.post_count, 0) AS post_count,
        COALESCE(pa.submitted_count, 0) AS submitted_count,
        COALESCE(ra.recent_post_count, 0) AS recent_post_count,
        la.last_activity_at,
        ts.created_at AS joined_at
    FROM target_students ts
    LEFT JOIN post_agg pa ON pa.student_id = ts.id
    LEFT JOIN recent_activity ra ON ra.student_id = ts.id
    LEFT JOIN last_activity la ON la.student_id = ts.id
    LEFT JOIN public.teachers t ON t.id = ts.teacher_id
    ORDER BY COALESCE(ra.recent_post_count, 0) DESC,
             la.last_activity_at DESC NULLS LAST,
             ts.name
    LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_student_activity(UUID, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_student_activity(UUID, INTEGER, INTEGER) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
