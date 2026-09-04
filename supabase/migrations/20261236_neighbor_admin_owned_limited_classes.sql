-- 실제 ADMIN이 자기 계정으로 운영하는 학급도 제한 공개 후보로 사용할 수 있게 한다.
-- 승인 TEACHER 학급 계약은 유지하고, 다른 ADMIN 소유 학급과 내부 합성 시험 학급은 허용하지 않는다.

BEGIN;

CREATE OR REPLACE FUNCTION public.set_neighbor_limited_class_v1(
    p_class_id UUID,
    p_enabled BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_selected_count INTEGER;
    v_enabled BOOLEAN := COALESCE(p_enabled, FALSE);
BEGIN
    v_user_id := public.assert_neighbor_admin_v1();
    PERFORM pg_advisory_xact_lock(hashtext('neighbor-limited-classes'));
    IF p_class_id IS NULL OR p_enabled IS NULL THEN
        RAISE EXCEPTION '제한 공개에 사용할 승인 교사 또는 관리자 본인 학급이 아닙니다.' USING ERRCODE = '22023';
    END IF;
    IF v_enabled AND NOT EXISTS (
        SELECT 1
        FROM public.classes class
        JOIN public.profiles profile
          ON profile.id = class.teacher_id
         AND (
              (
                  profile.role = 'TEACHER'
                  AND profile.is_approved IS TRUE
                  AND profile.approval_revoked_at IS NULL
              )
              OR (
                  profile.role = 'ADMIN'
                  AND profile.id = v_user_id
              )
         )
        WHERE class.id = p_class_id
          AND class.deleted_at IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM public.neighbor_internal_test_classes internal_test
              WHERE internal_test.class_id = class.id
          )
    ) THEN
        RAISE EXCEPTION '제한 공개에 사용할 승인 교사 또는 관리자 본인 학급이 아닙니다.' USING ERRCODE = '22023';
    END IF;
    IF NOT v_enabled AND NOT EXISTS (
        SELECT 1 FROM public.neighbor_limited_classes limited WHERE limited.class_id = p_class_id
    ) THEN
        RAISE EXCEPTION '제한 공개에 사용할 승인 교사 또는 관리자 본인 학급이 아닙니다.' USING ERRCODE = '22023';
    END IF;

    IF v_enabled THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.neighbor_limited_classes limited
            WHERE limited.class_id = p_class_id
        ) AND (SELECT count(*) FROM public.neighbor_limited_classes) >= 8 THEN
            RAISE EXCEPTION '제한 공개 학급은 최대 8개까지 선택할 수 있습니다.' USING ERRCODE = '23514';
        END IF;
        INSERT INTO public.neighbor_limited_classes (class_id, enabled_by)
        VALUES (p_class_id, v_user_id)
        ON CONFLICT (class_id) DO NOTHING;
    ELSE
        IF (SELECT mode FROM public.neighbor_rollout_state WHERE singleton) = 'limited_beta'
           AND (SELECT count(*) FROM public.neighbor_limited_classes) <= 2 THEN
            RAISE EXCEPTION '제한 공개 중에는 두 학급 이상을 유지해야 합니다. 먼저 공개 단계를 중지해 주세요.'
                USING ERRCODE = '55000';
        END IF;
        DELETE FROM public.neighbor_limited_classes limited
        WHERE limited.class_id = p_class_id;
        UPDATE public.neighbor_space_classes membership
        SET student_access_enabled = FALSE
        WHERE membership.class_id = p_class_id
          AND membership.status = 'active';
        UPDATE public.classes class
        SET enabled_modules = array_remove(
            COALESCE(class.enabled_modules, ARRAY[]::TEXT[]), 'neighbor-agit'
        )
        WHERE class.id = p_class_id;
    END IF;

    INSERT INTO public.neighbor_limited_class_events (class_id, action, changed_by)
    VALUES (p_class_id, CASE WHEN v_enabled THEN 'enabled' ELSE 'disabled' END, v_user_id);

    SELECT count(*)::INTEGER INTO v_selected_count
    FROM public.neighbor_limited_classes;
    RETURN jsonb_build_object(
        'success', TRUE,
        'class_id', p_class_id,
        'selected', v_enabled,
        'selected_count', v_selected_count
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_neighbor_admin_dashboard_v1(p_space_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_base JSONB;
    v_classes JSONB := '[]'::JSONB;
BEGIN
    v_user_id := public.assert_neighbor_admin_v1();
    v_base := public.get_neighbor_admin_dashboard_core_20261201(p_space_id);

    SELECT COALESCE(jsonb_agg(candidate.item ORDER BY candidate.selected DESC, candidate.created_at DESC, candidate.class_id), '[]'::JSONB)
    INTO v_classes
    FROM (
        SELECT
            class.id AS class_id,
            class.created_at,
            limited.class_id IS NOT NULL AS selected,
            jsonb_build_object(
                'class_id', class.id,
                'class_name', class.name,
                'teacher_name', COALESCE(NULLIF(teacher.name, ''), NULLIF(profile.full_name, ''), '선생님'),
                'selected', limited.class_id IS NOT NULL,
                'has_active_space', EXISTS (
                    SELECT 1 FROM public.neighbor_space_classes membership
                    WHERE membership.class_id = class.id
                      AND membership.status IN ('pending', 'active')
                )
            ) AS item
        FROM public.classes class
        JOIN public.profiles profile ON profile.id = class.teacher_id
        LEFT JOIN public.teachers teacher ON teacher.id = profile.id
        LEFT JOIN public.neighbor_limited_classes limited ON limited.class_id = class.id
        WHERE class.deleted_at IS NULL
          AND (
              limited.class_id IS NOT NULL
              OR (
                  profile.role = 'TEACHER'
                  AND profile.is_approved IS TRUE
                  AND profile.approval_revoked_at IS NULL
              )
              OR (
                  profile.role = 'ADMIN'
                  AND profile.id = v_user_id
              )
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.neighbor_internal_test_classes internal_test
              WHERE internal_test.class_id = class.id
          )
        ORDER BY (limited.class_id IS NOT NULL) DESC, class.created_at DESC, class.id
        LIMIT 100
    ) candidate;

    RETURN v_base || jsonb_build_object(
        'limited_classes', v_classes,
        'limited_class_count', (SELECT count(*)::INTEGER FROM public.neighbor_limited_classes),
        'limited_class_max', 8
    );
END;
$$;

REVOKE ALL ON FUNCTION public.set_neighbor_limited_class_v1(UUID, BOOLEAN)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_neighbor_admin_dashboard_v1(UUID)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_neighbor_limited_class_v1(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_neighbor_admin_dashboard_v1(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
