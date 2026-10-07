-- 관리자 화면 빠르게(2026-10-07, 선생님 요청: "관리자 모드의 가입 교사수·현황 조회가 너무 길다,
-- 실시간일 필요 없으니 2시간 단위로 캐싱", "가입교사를 가입 날짜별로도 정렬").
--
-- ① 사용량 개요(6.4초)·교사별 사용량(3.2초)을 2시간마다(짝수 시 5분) 미리 계산해 admin_dashboard_cache 에 둔다.
--    관리자 화면은 admin_get_dashboard_cache_v1 로 저장된 값을 바로 읽는다(기준 시각을 함께 돌려준다).
--    `지금 새로 계산` 은 p_refresh=TRUE — 그때만 오래 걸린다. 기간 선택지 7·30·90일(useAdminUsage ACTIVITY_DAY_OPTIONS)을 모두 계산한다.
-- ② 가입 교사 목록에 정렬(최근 접속순·가입 최신순·가입 오래된순) — 새 판 v2, 옛 판 v1 은 지운다.

CREATE TABLE IF NOT EXISTS public.admin_dashboard_cache (
    cache_key TEXT PRIMARY KEY,
    payload JSONB NOT NULL,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.admin_dashboard_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_dashboard_cache FROM PUBLIC, anon, authenticated;

-- 한 조합(미접속 기준·활동 기간)을 계산해 저장한다. 호출하는 쪽이 관리자 권한 문맥이어야 한다(기존 함수가 관리자를 확인).
CREATE OR REPLACE FUNCTION public.admin_compute_dashboard_cache_v1(p_dormant_days INTEGER, p_activity_days INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_payload JSONB;
BEGIN
    IF public.auth_user_role() <> 'ADMIN' THEN RAISE EXCEPTION 'Only admins can refresh the dashboard cache' USING ERRCODE = '42501'; END IF;
    v_payload := jsonb_build_object(
        'overview', public.admin_get_usage_overview(p_dormant_days, p_activity_days)::JSONB,
        'teachers', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.admin_get_teacher_usage(p_dormant_days, p_activity_days) t), '[]'::JSONB)
    );
    INSERT INTO public.admin_dashboard_cache (cache_key, payload, computed_at)
    VALUES (format('usage:%s:%s', p_dormant_days, p_activity_days), v_payload, NOW())
    ON CONFLICT (cache_key) DO UPDATE SET payload = EXCLUDED.payload, computed_at = EXCLUDED.computed_at;
    RETURN v_payload;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_compute_dashboard_cache_v1(INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;

-- 관리자 화면용: 저장된 값(없거나 새로 계산을 누르면 그때 계산).
CREATE OR REPLACE FUNCTION public.admin_get_dashboard_cache_v1(p_dormant_days INTEGER, p_activity_days INTEGER, p_refresh BOOLEAN DEFAULT FALSE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row public.admin_dashboard_cache%ROWTYPE;
BEGIN
    IF public.auth_user_role() <> 'ADMIN' THEN RAISE EXCEPTION 'Only admins can read usage overview' USING ERRCODE = '42501'; END IF;
    IF p_dormant_days NOT BETWEEN 1 AND 3650 OR p_activity_days NOT BETWEEN 1 AND 365 THEN
        RAISE EXCEPTION '기간을 확인해 주세요.' USING ERRCODE = '22023';
    END IF;
    IF NOT COALESCE(p_refresh, FALSE) THEN
        SELECT * INTO v_row FROM public.admin_dashboard_cache WHERE cache_key = format('usage:%s:%s', p_dormant_days, p_activity_days);
        IF FOUND THEN
            RETURN v_row.payload || jsonb_build_object('computed_at', v_row.computed_at, 'cached', TRUE);
        END IF;
    END IF;
    PERFORM public.admin_compute_dashboard_cache_v1(p_dormant_days, p_activity_days);
    SELECT * INTO v_row FROM public.admin_dashboard_cache WHERE cache_key = format('usage:%s:%s', p_dormant_days, p_activity_days);
    RETURN v_row.payload || jsonb_build_object('computed_at', v_row.computed_at, 'cached', FALSE);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_get_dashboard_cache_v1(INTEGER, INTEGER, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_dashboard_cache_v1(INTEGER, INTEGER, BOOLEAN) TO authenticated;

-- 2시간마다 도는 미리 계산(pg_cron, postgres). 관리자 한 명의 문맥으로 기존 집계 함수를 부른다.
CREATE OR REPLACE FUNCTION public.admin_refresh_dashboard_cache_v1()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin UUID;
    v_days INTEGER;
    v_count INTEGER := 0;
BEGIN
    SELECT id INTO v_admin FROM public.profiles WHERE role = 'ADMIN' ORDER BY created_at LIMIT 1;
    IF v_admin IS NULL THEN RETURN 0; END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::TEXT, TRUE);
    -- 미접속 기준 90일(useAdminUsage DORMANT_DAYS) × 활동 기간 7·30·90일(ACTIVITY_DAY_OPTIONS)
    FOREACH v_days IN ARRAY ARRAY[7, 30, 90] LOOP
        PERFORM public.admin_compute_dashboard_cache_v1(90, v_days);
        v_count := v_count + 1;
    END LOOP;
    RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_refresh_dashboard_cache_v1() FROM PUBLIC, anon, authenticated;

DO $cron$
BEGIN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'admin-dashboard-cache';
    PERFORM cron.schedule('admin-dashboard-cache', '5 */2 * * *', 'SELECT public.admin_refresh_dashboard_cache_v1()');
END;
$cron$;

-- 가입 교사 목록 v2(정렬) — 옛 판 v1 은 같은 마이그레이션에서 지운다.
CREATE OR REPLACE FUNCTION public.admin_get_teacher_accounts_page_v2(p_status text DEFAULT 'APPROVED'::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0, p_sort text DEFAULT 'login'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_status TEXT := UPPER(COALESCE(NULLIF(BTRIM(p_status), ''), 'APPROVED'));
    v_search TEXT := NULLIF(LEFT(BTRIM(COALESCE(p_search, '')), 80), '');
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
    v_offset INTEGER := LEAST(GREATEST(COALESCE(p_offset, 0), 0), 100000);
    v_total_count INTEGER := 0;
    v_items JSONB := '[]'::JSONB;
    v_counts JSONB := '{}'::JSONB;
    -- 정렬(2026-10-07 선생님 요청: 가입 날짜순으로도): login(최근 접속순, 처음 값) · joined_desc(가입 최신순) · joined_asc(가입 오래된순)
    v_sort TEXT := LOWER(COALESCE(NULLIF(BTRIM(p_sort), ''), 'login'));
BEGIN
    IF public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION 'Only admins can read teacher accounts';
    END IF;

    IF v_sort NOT IN ('login', 'joined_desc', 'joined_asc') THEN
        RAISE EXCEPTION '정렬 방식을 확인해 주세요.' USING ERRCODE = '22023';
    END IF;

    IF v_status NOT IN ('APPROVED', 'PENDING_NEW', 'PENDING_REVOKED') THEN
        RAISE EXCEPTION 'invalid teacher account status' USING ERRCODE = '22023';
    END IF;

    SELECT jsonb_build_object(
        'approved', COUNT(*) FILTER (WHERE COALESCE(p.is_approved, FALSE)),
        'pending_new', COUNT(*) FILTER (
            WHERE NOT COALESCE(p.is_approved, FALSE) AND p.approval_revoked_at IS NULL
        ),
        'pending_revoked', COUNT(*) FILTER (
            WHERE NOT COALESCE(p.is_approved, FALSE) AND p.approval_revoked_at IS NOT NULL
        )
    )
    INTO v_counts
    FROM public.profiles p
    WHERE p.role IN ('TEACHER', 'ADMIN');

    WITH filtered AS MATERIALIZED (
        SELECT
            p.id,
            p.role::TEXT AS role,
            p.email::TEXT AS email,
            p.full_name::TEXT AS full_name,
            COALESCE(p.is_approved, FALSE) AS is_approved,
            p.approval_revoked_at,
            COALESCE(p.api_mode, 'SYSTEM')::TEXT AS api_mode,
            p.created_at,
            p.last_login_at,
            COALESCE(NULLIF(t.name, ''), '')::TEXT AS teacher_name,
            COALESCE(NULLIF(t.school_name, ''), '')::TEXT AS school_name,
            COALESCE(NULLIF(t.phone, ''), '')::TEXT AS phone
        FROM public.profiles p
        LEFT JOIN public.teachers t ON t.id = p.id
        WHERE p.role IN ('TEACHER', 'ADMIN')
          AND CASE v_status
              WHEN 'APPROVED' THEN COALESCE(p.is_approved, FALSE)
              WHEN 'PENDING_NEW' THEN NOT COALESCE(p.is_approved, FALSE) AND p.approval_revoked_at IS NULL
              WHEN 'PENDING_REVOKED' THEN NOT COALESCE(p.is_approved, FALSE) AND p.approval_revoked_at IS NOT NULL
          END
          AND (
              v_search IS NULL
              OR COALESCE(p.email, '') ILIKE '%' || v_search || '%'
              OR COALESCE(p.full_name, '') ILIKE '%' || v_search || '%'
              OR COALESCE(t.name, '') ILIKE '%' || v_search || '%'
              OR COALESCE(t.school_name, '') ILIKE '%' || v_search || '%'
          )
    ),
    page_profiles AS MATERIALIZED (
        SELECT *
        FROM filtered
        ORDER BY
            CASE WHEN v_sort = 'joined_desc' THEN created_at END DESC NULLS LAST,
            CASE WHEN v_sort = 'joined_asc' THEN created_at END ASC NULLS LAST,
            CASE WHEN v_sort = 'login' THEN last_login_at END DESC NULLS LAST,
            created_at DESC, id DESC
        LIMIT v_limit OFFSET v_offset
    ),
    page_student_counts AS (
        SELECT c.teacher_id, COUNT(s.id)::INTEGER AS student_count
        FROM public.classes c
        JOIN public.students s
          ON s.class_id = c.id
         AND s.deleted_at IS NULL
        WHERE c.deleted_at IS NULL
          AND c.teacher_id IN (SELECT pp.id FROM page_profiles pp)
        GROUP BY c.teacher_id
    )
    SELECT
        (SELECT COUNT(*)::INTEGER FROM filtered),
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', pp.id,
                    'role', pp.role,
                    'email', pp.email,
                    'full_name', pp.full_name,
                    'is_approved', pp.is_approved,
                    'approval_revoked_at', pp.approval_revoked_at,
                    'api_mode', pp.api_mode,
                    'created_at', pp.created_at,
                    'last_login_at', pp.last_login_at,
                    'teacher_name', pp.teacher_name,
                    'school_name', pp.school_name,
                    'phone', pp.phone,
                    'student_count', COALESCE(psc.student_count, 0)
                )
                ORDER BY
                    CASE WHEN v_sort = 'joined_desc' THEN pp.created_at END DESC NULLS LAST,
                    CASE WHEN v_sort = 'joined_asc' THEN pp.created_at END ASC NULLS LAST,
                    CASE WHEN v_sort = 'login' THEN pp.last_login_at END DESC NULLS LAST,
                    pp.created_at DESC, pp.id DESC
            ),
            '[]'::JSONB
        )
    INTO v_total_count, v_items
    FROM page_profiles pp
    LEFT JOIN page_student_counts psc ON psc.teacher_id = pp.id;

    RETURN jsonb_build_object(
        'items', v_items,
        'total_count', v_total_count,
        'counts', v_counts,
        'limit', v_limit,
        'offset', v_offset
    );
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_get_teacher_accounts_page_v2(TEXT, TEXT, INTEGER, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_teacher_accounts_page_v2(TEXT, TEXT, INTEGER, INTEGER, TEXT) TO authenticated, service_role;
DROP FUNCTION IF EXISTS public.admin_get_teacher_accounts_page_v1(TEXT, TEXT, INTEGER, INTEGER);

NOTIFY pgrst, 'reload schema';
