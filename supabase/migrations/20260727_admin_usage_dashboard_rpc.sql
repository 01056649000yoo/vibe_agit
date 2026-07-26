-- ============================================================================
-- 🛡️ 관리자 사용량 대시보드 RPC
-- 작성일: 2026-07-27
-- 목적:
--   1. 교사별 사용량(학급·학생·미션·글) 서버 집계 — 기존 클라이언트 전수 스캔 대체
--   2. 학생 학습 활동 집계
--   3. 장기 미접속 교사 식별
--   4. 가입만 하고 학급/학생을 만들지 않은 유령 계정 일괄 정리
-- 원칙:
--   - 전부 ADMIN 전용(SECURITY DEFINER + auth_user_role 검사)
--   - 집계는 DB에서 1회 수행 → 프론트에서 students/classes 전량 조회하지 않음
--   - 정리(삭제) 함수는 기본적으로 "비어 있는 계정"만 삭제하도록 안전장치 내장
-- ============================================================================

-- ----------------------------------------------------------------------------
-- [1] 교사별 사용량 집계
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_get_teacher_usage(INTEGER, INTEGER);

CREATE FUNCTION public.admin_get_teacher_usage(
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
    WITH live_classes AS (
        SELECT c.id, c.teacher_id
        FROM public.classes c
        WHERE c.deleted_at IS NULL
    ),
    class_agg AS (
        SELECT lc.teacher_id, COUNT(*)::INTEGER AS class_count
        FROM live_classes lc
        GROUP BY lc.teacher_id
    ),
    student_agg AS (
        SELECT lc.teacher_id, COUNT(s.id)::INTEGER AS student_count
        FROM live_classes lc
        JOIN public.students s
          ON s.class_id = lc.id
         AND s.deleted_at IS NULL
        GROUP BY lc.teacher_id
    ),
    mission_agg AS (
        SELECT m.teacher_id, COUNT(*)::INTEGER AS mission_count
        FROM public.writing_missions m
        GROUP BY m.teacher_id
    ),
    post_agg AS (
        SELECT
            lc.teacher_id,
            COUNT(sp.id)::INTEGER AS post_count,
            (COUNT(*) FILTER (WHERE sp.is_submitted IS TRUE))::INTEGER AS submitted_post_count,
            (COUNT(*) FILTER (WHERE sp.created_at >= v_activity_since))::INTEGER AS recent_post_count,
            (COUNT(DISTINCT sp.student_id) FILTER (WHERE sp.created_at >= v_activity_since))::INTEGER AS active_student_count,
            MAX(GREATEST(sp.created_at, COALESCE(sp.updated_at, sp.created_at))) AS last_student_activity_at
        FROM live_classes lc
        JOIN public.student_posts sp ON sp.class_id = lc.id
        GROUP BY lc.teacher_id
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
        COALESCE(p.api_mode, 'SYSTEM')::TEXT AS api_mode,
        p.created_at,
        p.last_login_at,
        FLOOR(
            EXTRACT(EPOCH FROM (NOW() - COALESCE(p.last_login_at, p.created_at))) / 86400
        )::INTEGER AS days_since_login,
        FLOOR(
            EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 86400
        )::INTEGER AS days_since_signup,
        COALESCE(ca.class_count, 0) AS class_count,
        COALESCE(sa.student_count, 0) AS student_count,
        COALESCE(ma.mission_count, 0) AS mission_count,
        COALESCE(pa.post_count, 0) AS post_count,
        COALESCE(pa.submitted_post_count, 0) AS submitted_post_count,
        COALESCE(pa.recent_post_count, 0) AS recent_post_count,
        COALESCE(pa.active_student_count, 0) AS active_student_count,
        pa.last_student_activity_at,
        -- 판정 우선순위: 미개설 > 학생없음 > 장기미접속 > 활동중 > 조용함
        CASE
            WHEN COALESCE(ca.class_count, 0) = 0 AND COALESCE(sa.student_count, 0) = 0 THEN 'NEVER_STARTED'
            WHEN COALESCE(sa.student_count, 0) = 0 THEN 'NO_STUDENT'
            WHEN COALESCE(p.last_login_at, p.created_at) < NOW() - (v_dormant_days || ' days')::INTERVAL THEN 'DORMANT'
            WHEN COALESCE(pa.recent_post_count, 0) > 0 THEN 'ACTIVE'
            ELSE 'IDLE'
        END::TEXT AS usage_status
    FROM public.profiles p
    LEFT JOIN public.teachers t ON t.id = p.id
    LEFT JOIN class_agg ca ON ca.teacher_id = p.id
    LEFT JOIN student_agg sa ON sa.teacher_id = p.id
    LEFT JOIN mission_agg ma ON ma.teacher_id = p.id
    LEFT JOIN post_agg pa ON pa.teacher_id = p.id
    WHERE p.role IN ('TEACHER', 'ADMIN')
    ORDER BY p.last_login_at DESC NULLS LAST, p.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_teacher_usage(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_teacher_usage(INTEGER, INTEGER) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- [2] 전체 요약 (상단 통계 카드용)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_get_usage_overview(INTEGER, INTEGER);

CREATE FUNCTION public.admin_get_usage_overview(
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

    WITH teacher_usage AS (
        SELECT * FROM public.admin_get_teacher_usage(p_dormant_days, v_activity_days)
    ),
    teacher_rollup AS (
        SELECT
            COUNT(*)::INTEGER AS teacher_total,
            (COUNT(*) FILTER (WHERE tu.is_approved))::INTEGER AS teacher_approved,
            (COUNT(*) FILTER (WHERE NOT tu.is_approved))::INTEGER AS teacher_pending,
            (COUNT(*) FILTER (WHERE tu.usage_status = 'ACTIVE'))::INTEGER AS teacher_active,
            (COUNT(*) FILTER (WHERE tu.usage_status = 'IDLE'))::INTEGER AS teacher_idle,
            (COUNT(*) FILTER (WHERE tu.usage_status = 'DORMANT'))::INTEGER AS teacher_dormant,
            (COUNT(*) FILTER (WHERE tu.usage_status = 'NO_STUDENT'))::INTEGER AS teacher_no_student,
            (COUNT(*) FILTER (WHERE tu.usage_status = 'NEVER_STARTED'))::INTEGER AS teacher_never_started
        FROM teacher_usage tu
    ),
    post_rollup AS (
        SELECT
            COUNT(*)::INTEGER AS total_posts,
            (COUNT(*) FILTER (WHERE sp.created_at >= v_activity_since))::INTEGER AS recent_posts,
            (COUNT(DISTINCT sp.student_id) FILTER (WHERE sp.created_at >= v_activity_since))::INTEGER AS recent_active_students
        FROM public.student_posts sp
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
        'class_total', (SELECT COUNT(*)::INTEGER FROM public.classes c WHERE c.deleted_at IS NULL),
        'student_total', (SELECT COUNT(*)::INTEGER FROM public.students s WHERE s.deleted_at IS NULL),
        'student_active', pr.recent_active_students,
        'post_total', pr.total_posts,
        'post_recent', pr.recent_posts,
        'dormant_days', GREATEST(COALESCE(p_dormant_days, 60), 1),
        'activity_days', v_activity_days,
        'generated_at', NOW()
    )
    INTO v_result
    FROM teacher_rollup tr, post_rollup pr;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_usage_overview(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_usage_overview(INTEGER, INTEGER) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- [3] 학생 학습 활동 집계
--     p_teacher_id를 주면 해당 교사 학급만, 없으면 전체에서 활동 많은 순
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_get_student_activity(UUID, INTEGER, INTEGER);

CREATE FUNCTION public.admin_get_student_activity(
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
    WITH target_students AS (
        SELECT s.id, s.name, s.class_id, s.total_points, s.created_at,
               c.name AS class_name, c.teacher_id
        FROM public.students s
        JOIN public.classes c ON c.id = s.class_id AND c.deleted_at IS NULL
        WHERE s.deleted_at IS NULL
          AND (p_teacher_id IS NULL OR c.teacher_id = p_teacher_id)
    ),
    post_agg AS (
        SELECT
            sp.student_id,
            COUNT(*)::INTEGER AS post_count,
            (COUNT(*) FILTER (WHERE sp.is_submitted IS TRUE))::INTEGER AS submitted_count,
            (COUNT(*) FILTER (WHERE sp.created_at >= v_activity_since))::INTEGER AS recent_post_count,
            MAX(GREATEST(sp.created_at, COALESCE(sp.updated_at, sp.created_at))) AS last_activity_at
        FROM public.student_posts sp
        WHERE sp.student_id IN (SELECT ts.id FROM target_students ts)
        GROUP BY sp.student_id
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
        COALESCE(pa.recent_post_count, 0) AS recent_post_count,
        pa.last_activity_at,
        ts.created_at AS joined_at
    FROM target_students ts
    LEFT JOIN post_agg pa ON pa.student_id = ts.id
    LEFT JOIN public.teachers t ON t.id = ts.teacher_id
    ORDER BY COALESCE(pa.recent_post_count, 0) DESC,
             pa.last_activity_at DESC NULLS LAST,
             ts.name
    LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_student_activity(UUID, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_student_activity(UUID, INTEGER, INTEGER) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- [4] 승인 상태 일괄 변경 (장기 미접속 계정 비활성화용)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_bulk_set_teacher_approval(UUID[], BOOLEAN);

CREATE FUNCTION public.admin_bulk_set_teacher_approval(
    p_teacher_ids UUID[],
    p_is_approved BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated UUID[];
BEGIN
    IF public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION 'Only admins can change teacher approval status';
    END IF;

    IF p_teacher_ids IS NULL OR array_length(p_teacher_ids, 1) IS NULL THEN
        RAISE EXCEPTION 'Teacher ids are required';
    END IF;

    WITH updated AS (
        UPDATE public.profiles
        SET is_approved = p_is_approved
        WHERE id = ANY(p_teacher_ids)
          AND id <> auth.uid()          -- 본인 계정은 항상 제외
          AND role IN ('TEACHER', 'ADMIN')
        RETURNING id
    )
    SELECT COALESCE(array_agg(id), '{}') INTO v_updated FROM updated;

    RETURN json_build_object(
        'success', true,
        'requested_count', array_length(p_teacher_ids, 1),
        'updated_count', COALESCE(array_length(v_updated, 1), 0),
        'updated_ids', v_updated,
        'is_approved', p_is_approved
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_bulk_set_teacher_approval(UUID[], BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_bulk_set_teacher_approval(UUID[], BOOLEAN) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- [5] 유령 계정 일괄 정리
--     p_only_empty = TRUE (기본): 살아있는 학급도 학생도 없는 계정만 삭제.
--     데이터가 있는 계정은 삭제하지 않고 skipped로 돌려준다.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_bulk_force_teacher_withdrawal(UUID[], BOOLEAN);

CREATE FUNCTION public.admin_bulk_force_teacher_withdrawal(
    p_teacher_ids UUID[],
    p_only_empty BOOLEAN DEFAULT TRUE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_target UUID;
    v_deleted UUID[] := '{}';
    v_skipped JSON[] := '{}';
    v_class_count INTEGER;
    v_student_count INTEGER;
BEGIN
    IF public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION 'Only admins can force teacher withdrawal';
    END IF;

    IF p_teacher_ids IS NULL OR array_length(p_teacher_ids, 1) IS NULL THEN
        RAISE EXCEPTION 'Teacher ids are required';
    END IF;

    FOREACH v_target IN ARRAY p_teacher_ids LOOP
        IF v_target = auth.uid() THEN
            v_skipped := v_skipped || json_build_object('teacher_id', v_target, 'reason', 'SELF');
            CONTINUE;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = v_target AND role IN ('TEACHER', 'ADMIN')
        ) THEN
            v_skipped := v_skipped || json_build_object('teacher_id', v_target, 'reason', 'NOT_FOUND');
            CONTINUE;
        END IF;

        SELECT COUNT(*)::INTEGER INTO v_class_count
        FROM public.classes
        WHERE teacher_id = v_target AND deleted_at IS NULL;

        SELECT COUNT(s.id)::INTEGER INTO v_student_count
        FROM public.classes c
        JOIN public.students s ON s.class_id = c.id AND s.deleted_at IS NULL
        WHERE c.teacher_id = v_target AND c.deleted_at IS NULL;

        IF p_only_empty AND (v_class_count > 0 OR v_student_count > 0) THEN
            v_skipped := v_skipped || json_build_object(
                'teacher_id', v_target,
                'reason', 'HAS_DATA',
                'class_count', v_class_count,
                'student_count', v_student_count
            );
            CONTINUE;
        END IF;

        DELETE FROM public.teachers WHERE id = v_target;
        DELETE FROM public.profiles WHERE id = v_target AND role IN ('TEACHER', 'ADMIN');

        v_deleted := v_deleted || v_target;
    END LOOP;

    RETURN json_build_object(
        'success', true,
        'requested_count', array_length(p_teacher_ids, 1),
        'deleted_count', COALESCE(array_length(v_deleted, 1), 0),
        'deleted_ids', v_deleted,
        'skipped_count', COALESCE(array_length(v_skipped, 1), 0),
        'skipped', COALESCE(array_to_json(v_skipped), '[]'::JSON),
        'only_empty', p_only_empty
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_bulk_force_teacher_withdrawal(UUID[], BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_bulk_force_teacher_withdrawal(UUID[], BOOLEAN) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- [6] 집계 성능 보조 인덱스
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_classes_teacher_live ON public.classes(teacher_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_students_class_live ON public.students(class_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_student_posts_class_created ON public.student_posts(class_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_posts_student_created ON public.student_posts(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_writing_missions_teacher ON public.writing_missions(teacher_id);

NOTIFY pgrst, 'reload schema';
