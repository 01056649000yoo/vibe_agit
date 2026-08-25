-- 학생별 글쓰기 발자국의 모호한 `다듬기`를 실제 업무 주기 두 개로 나눈다.
--   · 다시쓰기 요청: 교사가 과제 글을 학생에게 돌려보낸 횟수
--   · 수정 제출: 학생이 돌려받은 과제 글을 다시 제출한 횟수
--
-- 맞춤법 통계는 DB에 쌓였지만 기존 응답에는 `detail` 부모 객체가 없었다.
-- jsonb_set(..., '{detail,spelling_labels}', ..., true)는 중간 부모를 만들지 않으므로
-- 통계가 있어도 화면에는 빈 배열처럼 보였다. detail을 먼저 만든 뒤 값을 넣는다.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_class_writing_footprint_dashboard(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_base JSONB;
    v_labels JSONB;
    v_students JSONB;
    v_year_start DATE;
    v_year_end DATE;
BEGIN
    -- 권한·학급 범위와 기존 발자국 집계는 공용 코어가 그대로 책임진다.
    v_base := public.get_class_writing_footprint_dashboard_core_v1(p_class_id);
    v_year_start := (v_base #>> '{school_year,start}')::DATE;
    v_year_end := (v_base #>> '{school_year,end}')::DATE;

    WITH student_rows AS MATERIALIZED (
        SELECT
            item.value AS student,
            item.ordinality AS sort_order,
            (item.value->>'student_id')::UUID AS student_id
        FROM jsonb_array_elements(COALESCE(v_base->'students', '[]'::JSONB))
            WITH ORDINALITY AS item(value, ordinality)
    ), rewrite_counts AS MATERIALIZED (
        SELECT event.student_id, count(*)::INTEGER AS total
        FROM public.student_notification_events event
        WHERE event.class_id = p_class_id
          AND event.event_type = 'writing.rewrite_requested'
          AND event.created_at >= v_year_start::TIMESTAMP AT TIME ZONE 'Asia/Seoul'
          AND event.created_at < (v_year_end + 1)::TIMESTAMP AT TIME ZONE 'Asia/Seoul'
          AND EXISTS (
              SELECT 1 FROM student_rows student
              WHERE student.student_id = event.student_id
          )
        GROUP BY event.student_id
    ), revision_submission_counts AS MATERIALIZED (
        SELECT event.student_id, count(*)::INTEGER AS total
        FROM public.writing_activity_events event
        WHERE event.class_id = p_class_id
          AND event.event_type = 'post_resubmitted'
          AND event.metadata->>'writing_context' = 'assignment'
          AND event.occurred_at >= v_year_start::TIMESTAMP AT TIME ZONE 'Asia/Seoul'
          AND event.occurred_at < (v_year_end + 1)::TIMESTAMP AT TIME ZONE 'Asia/Seoul'
          AND EXISTS (
              SELECT 1 FROM student_rows student
              WHERE student.student_id = event.student_id
          )
        GROUP BY event.student_id
    )
    SELECT COALESCE(jsonb_agg(
        student.student || jsonb_build_object(
            'rewrite_requests', COALESCE(rewrite.total, 0),
            'revision_submissions', COALESCE(submission.total, 0)
        ) ORDER BY student.sort_order
    ), '[]'::JSONB)
    INTO v_students
    FROM student_rows student
    LEFT JOIN rewrite_counts rewrite ON rewrite.student_id = student.student_id
    LEFT JOIN revision_submission_counts submission ON submission.student_id = student.student_id;

    v_base := jsonb_set(v_base, '{students}', v_students, true);

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object('type', row.label, 'total', row.total)
        ORDER BY row.total DESC, row.label
    ), '[]'::JSONB)
    INTO v_labels
    FROM (
        SELECT max(stats.label) AS label, sum(stats.search_count)::INTEGER AS total
        FROM public.class_spelling_daily_stats stats
        WHERE stats.class_id = p_class_id
          AND stats.event_date >= CURRENT_DATE - 30
        GROUP BY stats.label
        ORDER BY total DESC, label
        LIMIT 10
    ) row;

    -- jsonb_set은 없는 중간 부모를 만들지 않는다. detail 객체를 먼저 보장한다.
    v_base := jsonb_set(
        v_base,
        '{detail}',
        COALESCE(v_base->'detail', '{}'::JSONB)
            || jsonb_build_object('spelling_labels', v_labels),
        true
    );

    RETURN v_base;
END;
$$;

REVOKE ALL ON FUNCTION public.get_class_writing_footprint_dashboard(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_class_writing_footprint_dashboard(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_class_writing_footprint_dashboard(UUID) IS
    '학급 글쓰기 발자국과 학생별 다시쓰기 요청·수정 제출 횟수, 최근 맞춤법 검색 유형을 반환한다.';

NOTIFY pgrst, 'reload schema';

COMMIT;
