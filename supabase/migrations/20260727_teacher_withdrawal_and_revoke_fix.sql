-- ============================================================================
-- 🧹 강제 탈퇴 완결성 + 승인 취소 우회 차단
-- 작성일: 2026-07-27
--
-- 배경 (운영 DB 실측):
--   1. classes.teacher_id 는 profiles 가 아니라 auth.users 를 참조하고 삭제 규칙이
--      NO ACTION 이다. 기존 admin_force_teacher_withdrawal 은 teachers·profiles 만
--      지우므로 학급이 주인 없는 채로 남았다.
--   2. profiles 를 지워도 auth.users 가 남는다. 그 사람이 다시 로그인하면
--      setup_teacher_profile 이 프로필을 재생성하고, auto_approval=true 이므로
--      즉시 승인 상태로 부활한다. 승인 취소도 같은 이유로 우회된다.
--      (승인 대기 화면의 `정보 다시 입력` → setup_teacher_profile 재실행)
--
-- 이 마이그레이션:
--   [1] profiles.approval_revoked_at 추가 — 관리자가 취소한 계정 표시
--   [2] setup_teacher_profile 수정 — 취소 이력이 있으면 자동승인에서 제외
--   [3] 승인 RPC 수정 — 취소/복구 시 approval_revoked_at 기록·해제
--   [4] 탈퇴 RPC 수정 — 빈 학급까지 정리하고 auth.users 까지 삭제(진짜 탈퇴)
--       안전조건을 "학급 없음"에서 "학생 0명 AND 학생 글 0건"으로 변경
-- ============================================================================

-- ----------------------------------------------------------------------------
-- [1] 승인 취소 이력 컬럼
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS approval_revoked_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.approval_revoked_at IS
    '관리자가 승인을 취소한 시각. NULL 이 아니면 자동승인 대상에서 제외된다(본인 재저장으로 부활 불가).';

-- ----------------------------------------------------------------------------
-- [2] 자동승인 우회 차단
--     기존 로직은 auto_approval 이 켜져 있으면 무조건 승인했다.
--     관리자가 취소한 계정(approval_revoked_at IS NOT NULL)은 제외한다.
-- ----------------------------------------------------------------------------
-- [주의] 기존 함수와 파라미터 기본값이 하나라도 다르면 CREATE OR REPLACE 가 거부된다.
--        운영 정의(pg_get_functiondef)와 동일하게 세 파라미터 모두 기본값을 유지한다.
CREATE OR REPLACE FUNCTION public.setup_teacher_profile(
    p_full_name TEXT DEFAULT NULL::TEXT,
    p_email TEXT DEFAULT NULL::TEXT,
    p_api_mode TEXT DEFAULT 'PERSONAL'::TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth_id UUID;
    v_auto_approve BOOLEAN := false;
    v_existing RECORD;
    v_is_approved BOOLEAN;
    v_final_role TEXT;
    v_revoked BOOLEAN := false;
BEGIN
    v_auth_id := auth.uid();
    IF v_auth_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', '인증되지 않은 요청입니다.');
    END IF;

    SELECT * INTO v_existing FROM public.profiles WHERE id = v_auth_id;

    IF v_existing.role = 'ADMIN' THEN
        RETURN json_build_object('success', true, 'role', 'ADMIN', 'is_approved', true);
    END IF;

    BEGIN
        SELECT (value = to_jsonb(true)) INTO v_auto_approve
        FROM public.system_settings WHERE key = 'auto_approval';
    EXCEPTION WHEN OTHERS THEN
        v_auto_approve := false;
    END;

    -- [변경] 관리자가 승인을 취소한 계정은 자동승인 대상에서 제외
    v_revoked := (v_existing.approval_revoked_at IS NOT NULL);
    IF v_revoked THEN
        v_auto_approve := false;
    END IF;

    v_is_approved := COALESCE(v_existing.is_approved, false) OR COALESCE(v_auto_approve, false);
    v_final_role := COALESCE(v_existing.role, 'TEACHER');
    IF v_final_role != 'ADMIN' THEN v_final_role := 'TEACHER'; END IF;

    PERFORM set_config('app.bypass_profile_protection', 'true', true);

    INSERT INTO public.profiles (id, role, email, full_name, is_approved, api_mode)
    VALUES (v_auth_id, v_final_role, COALESCE(p_email, ''), p_full_name, v_is_approved, COALESCE(p_api_mode, 'PERSONAL'))
    ON CONFLICT (id) DO UPDATE SET
        email = COALESCE(EXCLUDED.email, public.profiles.email),
        full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        api_mode = COALESCE(EXCLUDED.api_mode, public.profiles.api_mode),
        role = CASE WHEN public.profiles.role = 'ADMIN' THEN 'ADMIN' ELSE 'TEACHER' END,
        is_approved = CASE
            WHEN public.profiles.approval_revoked_at IS NOT NULL THEN public.profiles.is_approved
            WHEN public.profiles.is_approved = true THEN true
            WHEN v_auto_approve THEN true
            ELSE public.profiles.is_approved
        END;

    PERFORM set_config('app.bypass_profile_protection', '', true);

    RETURN json_build_object(
        'success', true,
        'role', v_final_role,
        'is_approved', v_is_approved,
        'revoked_by_admin', v_revoked
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- [3] 승인 상태 변경 시 취소 이력 기록/해제
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_teacher_approval(
    p_teacher_id UUID,
    p_is_approved BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
BEGIN
    v_role := public.auth_user_role();

    IF v_role <> 'ADMIN' THEN
        RAISE EXCEPTION 'Only admins can change teacher approval status';
    END IF;

    IF p_teacher_id IS NULL THEN
        RAISE EXCEPTION 'Teacher id is required';
    END IF;

    IF auth.uid() = p_teacher_id THEN
        RAISE EXCEPTION 'Admins cannot change their own approval status';
    END IF;

    UPDATE public.profiles
    SET is_approved = p_is_approved,
        -- 취소하면 시각 기록(자동승인 차단), 승인하면 해제
        approval_revoked_at = CASE WHEN p_is_approved THEN NULL ELSE NOW() END
    WHERE id = p_teacher_id
      AND role IN ('TEACHER', 'ADMIN');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target teacher profile not found';
    END IF;

    RETURN json_build_object(
        'success', true,
        'teacher_id', p_teacher_id,
        'is_approved', p_is_approved
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_teacher_approval(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_teacher_approval(UUID, BOOLEAN) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_bulk_set_teacher_approval(
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
        SET is_approved = p_is_approved,
            approval_revoked_at = CASE WHEN p_is_approved THEN NULL ELSE NOW() END
        WHERE id = ANY(p_teacher_ids)
          AND id <> auth.uid()
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
-- [4] 완결된 탈퇴 처리
--     내부 공용 함수 — 한 계정을 끝까지 지운다.
--     안전조건(p_only_empty)은 "학생 0명 AND 학생 글 0건".
--     빈 학급은 정리 대상이지 보호 대상이 아니다.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_withdraw_teacher_internal(
    p_teacher_id UUID,
    p_only_empty BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_count INTEGER;
    v_post_count INTEGER;
    v_class_count INTEGER;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = p_teacher_id AND role IN ('TEACHER', 'ADMIN')
    ) THEN
        RETURN json_build_object('deleted', false, 'reason', 'NOT_FOUND');
    END IF;

    SELECT count(*)::INTEGER INTO v_class_count
    FROM public.classes WHERE teacher_id = p_teacher_id AND deleted_at IS NULL;

    SELECT count(s.id)::INTEGER INTO v_student_count
    FROM public.classes c
    JOIN public.students s ON s.class_id = c.id AND s.deleted_at IS NULL
    WHERE c.teacher_id = p_teacher_id AND c.deleted_at IS NULL;

    SELECT count(sp.id)::INTEGER INTO v_post_count
    FROM public.classes c
    JOIN public.student_posts sp ON sp.class_id = c.id
    WHERE c.teacher_id = p_teacher_id;

    -- 학생이나 학생 글이 하나라도 있으면 거부 (삭제된 학급의 글까지 확인)
    IF p_only_empty AND (v_student_count > 0 OR v_post_count > 0) THEN
        RETURN json_build_object(
            'deleted', false,
            'reason', 'HAS_DATA',
            'student_count', v_student_count,
            'post_count', v_post_count,
            'class_count', v_class_count
        );
    END IF;

    -- auth.users 를 참조하면서 삭제 규칙이 NO ACTION 인 테이블은 직접 지워야 한다.
    -- 남아 있으면 아래 auth.users 삭제가 FK 위반으로 막힌다. (실측: classes, point_logs)

    -- ① 포인트 로그 (class_id 가 NULL 인 과거 행은 학급 CASCADE 로 정리되지 않음)
    DELETE FROM public.point_logs WHERE teacher_id = p_teacher_id;

    -- ② 학급 삭제 — students·student_posts·point_logs 는 class_id CASCADE 로 함께 정리
    DELETE FROM public.classes WHERE teacher_id = p_teacher_id;

    -- ③ 프로필 삭제 (teachers·writing_missions·student_records·profile_secrets 는 CASCADE)
    DELETE FROM public.profiles WHERE id = p_teacher_id;

    -- ④ 로그인 계정 삭제 — 이게 없으면 재로그인 시 프로필이 재생성되어 부활한다.
    --    주의: writing_helper(연구소)의 rooms·question_sets 등도 auth.users CASCADE 로 함께 삭제된다.
    DELETE FROM auth.users WHERE id = p_teacher_id;

    RETURN json_build_object(
        'deleted', true,
        'teacher_id', p_teacher_id,
        'removed_classes', v_class_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_withdraw_teacher_internal(UUID, BOOLEAN) FROM PUBLIC;

-- 단건 탈퇴
CREATE OR REPLACE FUNCTION public.admin_force_teacher_withdrawal(
    p_teacher_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSON;
BEGIN
    IF public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION 'Only admins can force teacher withdrawal';
    END IF;

    IF p_teacher_id IS NULL THEN
        RAISE EXCEPTION 'Teacher id is required';
    END IF;

    IF auth.uid() = p_teacher_id THEN
        RAISE EXCEPTION 'Admins cannot delete their own account from admin dashboard';
    END IF;

    -- 단건 탈퇴는 관리자가 대상을 직접 보고 누르는 동선이므로 데이터가 있어도 진행한다
    v_result := public.admin_withdraw_teacher_internal(p_teacher_id, FALSE);

    IF (v_result ->> 'deleted')::BOOLEAN IS NOT TRUE THEN
        RAISE EXCEPTION 'Target teacher profile not found';
    END IF;

    RETURN json_build_object('success', true, 'teacher_id', p_teacher_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_force_teacher_withdrawal(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_force_teacher_withdrawal(UUID) TO authenticated, service_role;

-- 일괄 탈퇴
CREATE OR REPLACE FUNCTION public.admin_bulk_force_teacher_withdrawal(
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
    v_one JSON;
    v_deleted UUID[] := '{}';
    v_skipped JSON[] := '{}';
    v_removed_classes INTEGER := 0;
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

        v_one := public.admin_withdraw_teacher_internal(v_target, p_only_empty);

        IF (v_one ->> 'deleted')::BOOLEAN THEN
            v_deleted := v_deleted || v_target;
            v_removed_classes := v_removed_classes + COALESCE((v_one ->> 'removed_classes')::INTEGER, 0);
        ELSE
            v_skipped := v_skipped || v_one;
        END IF;
    END LOOP;

    RETURN json_build_object(
        'success', true,
        'requested_count', array_length(p_teacher_ids, 1),
        'deleted_count', COALESCE(array_length(v_deleted, 1), 0),
        'deleted_ids', v_deleted,
        'removed_classes', v_removed_classes,
        'skipped_count', COALESCE(array_length(v_skipped, 1), 0),
        'skipped', COALESCE(array_to_json(v_skipped), '[]'::JSON),
        'only_empty', p_only_empty
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_bulk_force_teacher_withdrawal(UUID[], BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_bulk_force_teacher_withdrawal(UUID[], BOOLEAN) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- [5] 사용량 집계에 승인 취소 이력 노출
--     관리자 화면에서 "신규 가입 대기"와 "관리자가 정리한 계정"을 구분하기 위함
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
        p.approval_revoked_at,
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

NOTIFY pgrst, 'reload schema';
