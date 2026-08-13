-- 학생 놀이터에서 본인 포인트 내역만 최근순으로 제한 조회한다.
-- 클라이언트가 학생·학급 ID를 보내지 않으며 실제 auth_id 연결로 범위를 고정한다.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_point_logs_class_student_created
    ON public.point_logs (class_id, student_id, created_at DESC, id DESC);

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
        (SELECT COUNT(*) > v_limit FROM candidates)
    INTO v_items, v_has_more
    FROM page;

    RETURN jsonb_build_object(
        'version', 1,
        'items', COALESCE(v_items, '[]'::JSONB),
        'has_more', COALESCE(v_has_more, FALSE),
        'max_rows', 50
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_point_history_v1(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_point_history_v1(INTEGER) TO authenticated, service_role;

COMMIT;
