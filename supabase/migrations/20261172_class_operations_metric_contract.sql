-- 학급 운영 현황의 숫자를 실제 교사 업무 주기와 현재 활성 학생 범위에 맞춘다.
--   · 고쳐쓰기 저장 횟수 -> 다시쓰기 요청 / 수정 제출
--   · 받은 피드백 -> AI 생성과 교사 입력을 과거부터 분리할 수 없어 `피드백 반영`으로 정확히 표시
--   · 작성 완료 글 -> 현재 제출 상태가 아니라 최초 제출 이력 기준
--   · 접속 학생 -> students.last_login과 auth.users.last_sign_in_at 중 확인 가능한 최신 기록
--   · 모든 기간 이벤트 -> 현재 활성 학생만 포함

BEGIN;

DO $$
BEGIN
    IF to_regprocedure('public.get_class_operations_dashboard_core_v1(uuid,text)') IS NULL
       AND to_regprocedure('public.get_class_operations_dashboard(uuid,text)') IS NOT NULL THEN
        ALTER FUNCTION public.get_class_operations_dashboard(UUID, TEXT)
            RENAME TO get_class_operations_dashboard_core_v1;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_class_operations_dashboard_core_v1(UUID, TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_class_operations_dashboard_core_v1(UUID, TEXT)
TO service_role;

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
    v_period_start TIMESTAMPTZ;
    v_base JSONB;
    v_summary JSONB;
BEGIN
    -- 기존 함수가 권한, 교사 할 일과 최근 과제 목록 계약을 그대로 책임진다.
    v_base := public.get_class_operations_dashboard_core_v1(p_class_id, p_period);

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
    ELSIF p_period = 'all' THEN
        v_period_start := NULL;
    ELSE
        RAISE EXCEPTION '올바르지 않은 조회 기간입니다.' USING ERRCODE = '22023';
    END IF;

    WITH active_roster AS MATERIALIZED (
        SELECT
            student.id,
            student.name,
            GREATEST(student.last_login, auth_user.last_sign_in_at) AS last_access_at
        FROM public.students student
        LEFT JOIN auth.users auth_user ON auth_user.id = student.auth_id
        WHERE student.class_id = p_class_id
          AND student.is_active IS DISTINCT FROM FALSE
          AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
    ),
    submission_times AS MATERIALIZED (
        SELECT event.post_id, MIN(event.occurred_at) AS first_submitted_event_at
        FROM public.writing_activity_events event
        JOIN active_roster student ON student.id = event.student_id
        WHERE event.class_id = p_class_id
          AND event.post_id IS NOT NULL
          AND event.event_type IN ('post_submitted', 'post_resubmitted')
        GROUP BY event.post_id
    ),
    submitted_post_history AS MATERIALIZED (
        SELECT
            post.id,
            post.student_id,
            post.char_count,
            COALESCE(
                post.first_submitted_at,
                submission.first_submitted_event_at,
                CASE
                    WHEN post.is_submitted IS TRUE
                      OR post.is_returned IS TRUE
                      OR post.is_confirmed IS TRUE
                    THEN post.created_at
                    ELSE NULL
                END
            ) AS first_submitted_at
        FROM public.student_posts post
        JOIN active_roster student ON student.id = post.student_id
        LEFT JOIN submission_times submission ON submission.post_id = post.id
        WHERE post.class_id = p_class_id
    ),
    period_posts AS MATERIALIZED (
        SELECT history.id, history.student_id, history.char_count
        FROM submitted_post_history history
        WHERE history.first_submitted_at IS NOT NULL
          AND (
              v_period_start IS NULL
              OR history.first_submitted_at >= v_period_start
          )
    ),
    period_events AS MATERIALIZED (
        SELECT
            event.event_type,
            event.student_id,
            event.actor_student_id,
            event.metadata
        FROM public.writing_activity_events event
        JOIN active_roster student ON student.id = event.student_id
        WHERE event.class_id = p_class_id
          AND (v_period_start IS NULL OR event.occurred_at >= v_period_start)
          AND (
              event.actor_student_id IS NULL
              OR EXISTS (
                  SELECT 1
                  FROM active_roster actor
                  WHERE actor.id = event.actor_student_id
              )
          )
    ),
    period_rewrite_requests AS MATERIALIZED (
        SELECT event.id, event.student_id
        FROM public.student_notification_events event
        JOIN active_roster student ON student.id = event.student_id
        WHERE event.class_id = p_class_id
          AND event.event_type = 'writing.rewrite_requested'
          AND (v_period_start IS NULL OR event.created_at >= v_period_start)
    ),
    active_student_ids AS (
        SELECT post.student_id AS id FROM period_posts post
        UNION
        SELECT event.actor_student_id AS id
        FROM period_events event
        WHERE event.actor_student_id IS NOT NULL
    )
    SELECT jsonb_build_object(
        'students', (SELECT COUNT(*)::INTEGER FROM active_roster),
        'accessed_students', (
            SELECT COUNT(*)::INTEGER
            FROM active_roster student
            WHERE student.last_access_at IS NOT NULL
              AND (v_period_start IS NULL OR student.last_access_at >= v_period_start)
        ),
        'active_students', (SELECT COUNT(*)::INTEGER FROM active_student_ids),
        'submitted_posts', (SELECT COUNT(*)::INTEGER FROM period_posts),
        'rewrite_requests', (SELECT COUNT(*)::INTEGER FROM period_rewrite_requests),
        'revision_submissions', (
            SELECT COUNT(*)::INTEGER
            FROM period_events event
            WHERE event.event_type = 'post_resubmitted'
              AND event.metadata->>'writing_context' = 'assignment'
        ),
        'comments', (
            SELECT COUNT(*)::INTEGER
            FROM period_events event
            WHERE event.event_type = 'comment_added'
        ),
        'feedback_updates', (
            SELECT COUNT(*)::INTEGER
            FROM period_events event
            WHERE event.event_type = 'feedback_received'
        ),
        'avg_chars', (
            SELECT COALESCE(ROUND(AVG(NULLIF(post.char_count, 0)))::INTEGER, 0)
            FROM period_posts post
        )
    ) INTO v_summary;

    RETURN jsonb_set(
        v_base,
        '{summary}',
        (COALESCE(v_base->'summary', '{}'::JSONB) - 'revisions' - 'feedbacks') || v_summary,
        true
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_class_operations_dashboard(UUID, TEXT)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_class_operations_dashboard(UUID, TEXT)
TO authenticated, service_role;

COMMENT ON FUNCTION public.get_class_operations_dashboard(UUID, TEXT) IS
    '현재 활성 학생을 기준으로 접속, 최초 제출 이력, 다시쓰기 요청, 수정 제출, 댓글과 피드백 반영을 집계한다.';

NOTIFY pgrst, 'reload schema';

COMMIT;
