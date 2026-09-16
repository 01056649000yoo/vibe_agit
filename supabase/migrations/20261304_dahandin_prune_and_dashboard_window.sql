-- 다했니 정산 기록 정리 + 대시보드 기간 창 (2026-09-16)
--
-- 1) 오래된 정산 로그를 자동으로 지운다(기본 180일). 화면엔 어차피 최근 것만 보이지만,
--    테이블이 무한정 커지지 않게 시계가 매일 정리한다. items 는 runs 에 FK CASCADE 라 함께 지워진다.
-- 2) 대시보드의 "최근 정산"도 고른 기간(v_since) 안의 것만 보이게 해, 오래된 기록이 섞여
--    지저분해지지 않게 한다(여전히 최대 20건).

BEGIN;

-- ── 1) 오래된 로그 정리 함수 + 매일 시계 ──
CREATE OR REPLACE FUNCTION public.dahandin_prune_old_logs(p_retention_days INTEGER DEFAULT 180)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_runtime_role TEXT := current_setting('role', true);
    v_cutoff TIMESTAMPTZ := NOW() - make_interval(days => GREATEST(COALESCE(p_retention_days, 180), 30));
    v_deleted INTEGER;
BEGIN
    IF auth.uid() IS NOT NULL
       OR v_runtime_role NOT IN ('service_role', 'supabase_admin', 'postgres') THEN
        RAISE EXCEPTION '[보안] 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    DELETE FROM public.dahandin_sync_runs WHERE started_at < v_cutoff;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;   -- items 는 CASCADE 로 함께 삭제됨
    RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.dahandin_prune_old_logs(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dahandin_prune_old_logs(INTEGER) TO service_role;

-- 매일 새벽 3시(GMT) 한 번 정리. 시각은 중요치 않다(하루 한 번이면 충분).
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'dahandin-prune-logs';
SELECT cron.schedule('dahandin-prune-logs', '0 3 * * *', $job$SELECT public.dahandin_prune_old_logs(180)$job$);

-- ── 2) 대시보드: 최근 정산도 고른 기간 안의 것만 ──
CREATE OR REPLACE FUNCTION public.get_dahandin_dashboard_v1(
    p_class_id UUID,
    p_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_days INTEGER := LEAST(GREATEST(COALESCE(p_days, 30), 1), 180);
    v_since DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE - (v_days - 1);
    v_result JSONB;
BEGIN
    IF NOT public.dahandin_can_manage_class(p_class_id) THEN
        RAISE EXCEPTION '[보안] 이 학급을 볼 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    WITH grants AS (
        SELECT pl.student_id, pl.amount, pl.created_at,
               (pl.created_at AT TIME ZONE 'Asia/Seoul')::DATE AS day_kst
        FROM public.point_logs pl
        JOIN public.students st ON st.id = pl.student_id
        WHERE st.class_id = p_class_id
          AND pl.metadata->>'source' = 'dahandin_cookie'
          AND (pl.created_at AT TIME ZONE 'Asia/Seoul')::DATE >= v_since
    ),
    daily AS (
        SELECT day_kst, SUM(amount)::INTEGER AS points, COUNT(*)::INTEGER AS grants
        FROM grants GROUP BY day_kst ORDER BY day_kst
    ),
    per_student AS (
        SELECT g.student_id, st.name, SUM(g.amount)::INTEGER AS points, COUNT(*)::INTEGER AS grants
        FROM grants g JOIN public.students st ON st.id = g.student_id
        GROUP BY g.student_id, st.name ORDER BY SUM(g.amount) DESC
    ),
    runs AS (
        SELECT r.id, r.trigger, r.started_at, r.finished_at,
               r.ok_count, r.fail_count, r.total_points_granted, r.note
        FROM public.dahandin_sync_runs r
        WHERE r.class_id = p_class_id
          AND (r.started_at AT TIME ZONE 'Asia/Seoul')::DATE >= v_since
        ORDER BY r.started_at DESC LIMIT 20
    )
    SELECT jsonb_build_object(
        'class_id', p_class_id,
        'days', v_days,
        'summary', jsonb_build_object(
            'total_points', COALESCE((SELECT SUM(points) FROM daily), 0),
            'total_grants', COALESCE((SELECT SUM(grants) FROM daily), 0),
            'student_count', COALESCE((SELECT COUNT(*) FROM per_student), 0),
            'linked_count', COALESCE((SELECT COUNT(*) FROM public.dahandin_student_links l
                                       WHERE l.class_id = p_class_id AND l.active), 0)
        ),
        'settings', (
            SELECT to_jsonb(cs) - 'class_id'
            FROM public.dahandin_class_settings cs WHERE cs.class_id = p_class_id
        ),
        'daily', COALESCE((SELECT jsonb_agg(to_jsonb(daily)) FROM daily), '[]'::JSONB),
        'per_student', COALESCE((SELECT jsonb_agg(to_jsonb(per_student)) FROM per_student), '[]'::JSONB),
        'recent_runs', COALESCE((SELECT jsonb_agg(to_jsonb(runs)) FROM runs), '[]'::JSONB)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_dahandin_dashboard_v1(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dahandin_dashboard_v1(UUID, INTEGER) TO authenticated;

COMMIT;
