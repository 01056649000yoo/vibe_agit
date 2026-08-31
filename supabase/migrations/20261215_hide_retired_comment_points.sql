-- 종료된 댓글 포인트는 잔액·감사 원장에만 보존하고 현재 학생 활동 화면에서는 숨긴다.
-- 신규 지급은 20261181부터 공용 포인트 엔진과 댓글 승인 경로 양쪽에서 이미 차단돼 있다.

BEGIN;

DO $$
BEGIN
    IF to_regprocedure('public.get_my_writing_footprint_detail_core_v1()') IS NULL THEN
        ALTER FUNCTION public.get_my_writing_footprint_detail()
            RENAME TO get_my_writing_footprint_detail_core_v1;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_writing_footprint_detail_core_v1()
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_writing_footprint_detail()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID;
    v_base JSONB;
    v_year_start DATE;
    v_year_end DATE;
    v_activity_points INTEGER := 0;
    v_points_monthly JSONB := '[]'::JSONB;
    v_points_by_type JSONB := '[]'::JSONB;
BEGIN
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT student.class_id
    INTO v_class_id
    FROM public.students student
    WHERE student.id = v_student_id
      AND student.auth_id = auth.uid()
      AND student.is_active IS DISTINCT FROM FALSE
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW());

    IF v_class_id IS NULL THEN
        RAISE EXCEPTION '활성 학생 계정을 확인할 수 없습니다.' USING ERRCODE = '42501';
    END IF;

    v_base := public.get_my_writing_footprint_detail_core_v1();
    v_year_start := (v_base #>> '{school_year,start}')::DATE;
    v_year_end := (v_base #>> '{school_year,end}')::DATE;

    SELECT COALESCE(sum(point_log.amount), 0)::INTEGER
    INTO v_activity_points
    FROM public.point_logs point_log
    WHERE point_log.class_id = v_class_id
      AND point_log.student_id = v_student_id
      AND point_log.amount > 0
      AND COALESCE(point_log.activity_type, 'etc') NOT IN (
          'private_adjustment', 'starting_bonus', 'comment_reward'
      );

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'm', month_key,
            'earned', earned,
            'spent', spent
        ) ORDER BY month_key
    ), '[]'::JSONB)
    INTO v_points_monthly
    FROM (
        SELECT
            to_char(point_log.created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') AS month_key,
            COALESCE(sum(point_log.amount) FILTER (WHERE point_log.amount > 0), 0)::INTEGER AS earned,
            COALESCE(-sum(point_log.amount) FILTER (WHERE point_log.amount < 0), 0)::INTEGER AS spent
        FROM public.point_logs point_log
        WHERE point_log.class_id = v_class_id
          AND point_log.student_id = v_student_id
          AND COALESCE(point_log.activity_type, 'etc') <> 'comment_reward'
          AND (point_log.created_at AT TIME ZONE 'Asia/Seoul')::DATE
              BETWEEN v_year_start AND v_year_end
        GROUP BY 1
    ) monthly_rows;

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object('type', activity_type, 'total', total)
        ORDER BY total DESC, activity_type
    ), '[]'::JSONB)
    INTO v_points_by_type
    FROM (
        SELECT
            COALESCE(point_log.activity_type, 'etc') AS activity_type,
            sum(point_log.amount)::INTEGER AS total
        FROM public.point_logs point_log
        WHERE point_log.class_id = v_class_id
          AND point_log.student_id = v_student_id
          AND point_log.amount > 0
          AND COALESCE(point_log.activity_type, 'etc') <> 'comment_reward'
        GROUP BY 1
    ) type_rows;

    v_base := jsonb_set(v_base, '{totals,activity_points_earned}', to_jsonb(v_activity_points), TRUE);
    v_base := jsonb_set(v_base, '{points_monthly}', v_points_monthly, TRUE);
    v_base := jsonb_set(v_base, '{points_by_type}', v_points_by_type, TRUE);

    RETURN v_base;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_writing_footprint_detail() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_writing_footprint_detail()
TO authenticated, service_role;

COMMENT ON FUNCTION public.get_my_writing_footprint_detail_core_v1() IS
    '학생 글쓰기 발자국 원자료 내부 코어. 브라우저 역할은 직접 실행할 수 없다.';
COMMENT ON FUNCTION public.get_my_writing_footprint_detail() IS
    '학생 본인 발자국을 반환하되 종료된 댓글 포인트 유형은 현재 활동 통계에서 제외한다.';

CREATE OR REPLACE FUNCTION public.get_my_point_history_v1(
    p_limit INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID;
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
    v_items JSONB := '[]'::JSONB;
    v_has_more BOOLEAN := FALSE;
BEGIN
    IF auth.uid() IS NULL
       OR public.auth_user_role() <> 'STUDENT'
       OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT student.class_id
    INTO v_class_id
    FROM public.students student
    JOIN public.classes class ON class.id = student.class_id
    WHERE student.id = v_student_id
      AND student.auth_id = auth.uid()
      AND student.is_active IS DISTINCT FROM FALSE
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
      AND class.deleted_at IS NULL;

    IF v_class_id IS NULL THEN
        RAISE EXCEPTION '활성 학생 정보를 찾을 수 없습니다.' USING ERRCODE = '42501';
    END IF;

    WITH candidates AS MATERIALIZED (
        SELECT
            point_log.id,
            point_log.amount,
            point_log.reason,
            point_log.activity_type,
            point_log.created_at
        FROM public.point_logs point_log
        WHERE point_log.class_id = v_class_id
          AND point_log.student_id = v_student_id
          AND COALESCE(point_log.activity_type, 'etc') <> 'comment_reward'
        ORDER BY point_log.created_at DESC, point_log.id DESC
        LIMIT v_limit + 1
    ), page AS (
        SELECT candidate.*
        FROM candidates candidate
        ORDER BY candidate.created_at DESC, candidate.id DESC
        LIMIT v_limit
    )
    SELECT
        COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', page.id,
                'amount', page.amount,
                'reason', page.reason,
                'activity_type', page.activity_type,
                'created_at', page.created_at
            ) ORDER BY page.created_at DESC, page.id DESC
        ), '[]'::JSONB),
        (SELECT count(*) > v_limit FROM candidates)
    INTO v_items, v_has_more
    FROM page;

    RETURN jsonb_build_object(
        'version', 2,
        'items', COALESCE(v_items, '[]'::JSONB),
        'has_more', COALESCE(v_has_more, FALSE),
        'max_rows', 50
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_point_history_v1(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_point_history_v1(INTEGER)
TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
