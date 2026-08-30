\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
    v_admin_id UUID;
    v_user_id UUID;
    v_class_id UUID;
    v_item RECORD;
BEGIN
    SELECT profile.id INTO v_admin_id
    FROM public.profiles profile
    WHERE profile.role = 'ADMIN'
    ORDER BY profile.created_at, profile.id
    LIMIT 1;

    IF v_admin_id IS NULL THEN
        RAISE EXCEPTION '관리자 프로필이 없어 이웃 아지트 테스트 자료를 만들 수 없습니다.';
    END IF;

    PERFORM set_config('app.bypass_profile_protection', 'true', TRUE);

    FOR v_item IN
        SELECT * FROM (VALUES
            ('neighbor-test-teacher-a@internal.invalid', '이웃아지트 테스트 교사 A', '이웃아지트 테스트 1반'),
            ('neighbor-test-teacher-b@internal.invalid', '이웃아지트 테스트 교사 B', '이웃아지트 테스트 2반')
        ) AS fixture(email, teacher_name, class_name)
    LOOP
        SELECT auth_user.id INTO v_user_id
        FROM auth.users auth_user
        WHERE auth_user.email = v_item.email;

        IF v_user_id IS NULL THEN
            INSERT INTO auth.users (
                id, aud, role, email, encrypted_password,
                raw_app_meta_data, raw_user_meta_data,
                is_super_admin, is_sso_user, is_anonymous,
                banned_until, created_at, updated_at
            ) VALUES (
                gen_random_uuid(), 'authenticated', 'authenticated', v_item.email, NULL,
                jsonb_build_object('provider', 'internal-test', 'providers', '[]'::JSONB),
                jsonb_build_object('full_name', v_item.teacher_name, 'fixture', 'neighbor-agit'),
                FALSE, FALSE, FALSE,
                'infinity'::TIMESTAMPTZ, NOW(), NOW()
            ) RETURNING id INTO v_user_id;
        END IF;

        INSERT INTO public.profiles (
            id, email, full_name, role, is_approved,
            approval_revoked_at, email_verified, api_mode
        ) VALUES (
            v_user_id, v_item.email, v_item.teacher_name, 'TEACHER', TRUE,
            NULL, FALSE, 'SYSTEM'
        )
        ON CONFLICT (id) DO UPDATE SET
            email = EXCLUDED.email,
            full_name = EXCLUDED.full_name,
            role = 'TEACHER',
            is_approved = TRUE,
            approval_revoked_at = NULL,
            email_verified = FALSE,
            api_mode = 'SYSTEM';

        INSERT INTO public.teachers (id, name, school_name, email)
        VALUES (v_user_id, v_item.teacher_name, '관리자 내부 시험', v_item.email)
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            school_name = EXCLUDED.school_name,
            email = EXCLUDED.email;

        SELECT class.id INTO v_class_id
        FROM public.classes class
        WHERE class.teacher_id = v_user_id
          AND class.name = v_item.class_name
        ORDER BY class.created_at, class.id
        LIMIT 1;

        IF v_class_id IS NULL THEN
            INSERT INTO public.classes (teacher_id, name)
            VALUES (v_user_id, v_item.class_name)
            RETURNING id INTO v_class_id;
        ELSE
            UPDATE public.classes SET deleted_at = NULL WHERE id = v_class_id;
        END IF;

        UPDATE public.profiles
        SET primary_class_id = v_class_id
        WHERE id = v_user_id;

        INSERT INTO public.neighbor_internal_test_classes (class_id, created_by, note)
        VALUES (v_class_id, v_admin_id, '관리자 이웃 아지트 내부 시험 전용')
        ON CONFLICT (class_id) DO UPDATE SET
            created_by = EXCLUDED.created_by,
            note = EXCLUDED.note;
    END LOOP;

    PERFORM set_config('app.bypass_profile_protection', '', TRUE);
END;
$$;

COMMIT;
