BEGIN;

-- 관리자 첫 화면에서 교사 계정 전체를 브라우저로 내려보내던 경로를 페이지 RPC로 바꾼다.
-- 검색·승인 상태·정렬·상한을 서버가 소유하고, 학생 수 집계도 현재 페이지 교사에게만 수행한다.
CREATE OR REPLACE FUNCTION public.admin_get_teacher_accounts_page_v1(
    p_status TEXT DEFAULT 'APPROVED',
    p_search TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 10,
    p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_status TEXT := UPPER(COALESCE(NULLIF(BTRIM(p_status), ''), 'APPROVED'));
    v_search TEXT := NULLIF(LEFT(BTRIM(COALESCE(p_search, '')), 80), '');
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
    v_offset INTEGER := LEAST(GREATEST(COALESCE(p_offset, 0), 0), 100000);
    v_total_count INTEGER := 0;
    v_items JSONB := '[]'::JSONB;
    v_counts JSONB := '{}'::JSONB;
BEGIN
    IF public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION 'Only admins can read teacher accounts';
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
        ORDER BY last_login_at DESC NULLS LAST, created_at DESC, id DESC
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
                ORDER BY pp.last_login_at DESC NULLS LAST, pp.created_at DESC, pp.id DESC
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
$$;

REVOKE ALL ON FUNCTION public.admin_get_teacher_accounts_page_v1(TEXT, TEXT, INTEGER, INTEGER)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_teacher_accounts_page_v1(TEXT, TEXT, INTEGER, INTEGER)
TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_profiles_admin_teacher_accounts
ON public.profiles (is_approved, last_login_at DESC, created_at DESC, id DESC)
WHERE role IN ('TEACHER', 'ADMIN');

NOTIFY pgrst, 'reload schema';

COMMIT;
