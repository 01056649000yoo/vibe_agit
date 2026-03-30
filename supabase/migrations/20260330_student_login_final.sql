-- ============================================================================
-- VIBE_TEST - 2026-03-30 final student login SQL
-- Purpose:
-- 1. Switch student login to "new device wins"
-- 2. Make auth helpers trust current students.auth_id first
-- 3. Remove legacy metadata sync triggers that conflict with takeover login
-- 4. Keep bind_student_auth compatible with protect_student_sensitive_columns()
-- ============================================================================

-- --------------------------------------------------------------------------
-- Remove legacy triggers that mutate auth metadata after auth_id changes.
-- They are no longer needed because the helper functions below read the
-- current students.auth_id mapping directly.
-- --------------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_student_auth_linked ON public.students;
DROP TRIGGER IF EXISTS trg_sync_student_metadata ON public.students;

-- --------------------------------------------------------------------------
-- Auth helper functions
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.students s
        WHERE s.auth_id = auth.uid()
          AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
    ) THEN
        RETURN 'STUDENT';
    END IF;

    v_role := NULLIF(auth.jwt() -> 'app_metadata' ->> 'role', '');
    IF v_role IS NOT NULL THEN
        RETURN v_role;
    END IF;

    SELECT p.role
    INTO v_role
    FROM public.profiles p
    WHERE p.id = auth.uid();

    RETURN COALESCE(v_role, '');
END;
$$;

CREATE OR REPLACE FUNCTION public.auth_user_class_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_class_id UUID;
BEGIN
    SELECT s.class_id
    INTO v_class_id
    FROM public.students s
    WHERE s.auth_id = auth.uid()
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
    LIMIT 1;

    IF v_class_id IS NOT NULL THEN
        RETURN v_class_id;
    END IF;

    RETURN (NULLIF(auth.jwt() -> 'app_metadata' ->> 'class_id', ''))::UUID;
END;
$$;

CREATE OR REPLACE FUNCTION public.auth_student_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID;
BEGIN
    SELECT s.id
    INTO v_student_id
    FROM public.students s
    WHERE s.auth_id = auth.uid()
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
    LIMIT 1;

    IF v_student_id IS NOT NULL THEN
        RETURN v_student_id;
    END IF;

    RETURN (NULLIF(auth.jwt() -> 'app_metadata' ->> 'student_id', ''))::UUID;
END;
$$;

-- --------------------------------------------------------------------------
-- Student auth binding RPCs
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bind_student_auth(
    p_student_code TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth_id UUID := auth.uid();
    v_student RECORD;
    v_previous_auth_id UUID;
BEGIN
    IF v_auth_id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Login session expired. Please refresh and try again.'
        );
    END IF;

    IF COALESCE(BTRIM(p_student_code), '') = '' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Student code is required.'
        );
    END IF;

    SELECT
        s.id,
        s.name,
        s.student_code,
        s.class_id,
        s.auth_id,
        c.name AS class_name
    INTO v_student
    FROM public.students s
    LEFT JOIN public.classes c
      ON c.id = s.class_id
    WHERE s.student_code = UPPER(BTRIM(p_student_code))
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Student code not found.'
        );
    END IF;

    v_previous_auth_id := v_student.auth_id;

    PERFORM set_config('app.bypass_student_trigger', 'true', true);

    UPDATE public.students
    SET auth_id = NULL
    WHERE auth_id = v_auth_id
      AND id <> v_student.id;

    UPDATE public.students
    SET auth_id = v_auth_id
    WHERE id = v_student.id;

    PERFORM set_config('app.bypass_student_trigger', 'false', true);

    RETURN json_build_object(
        'success', true,
        'replacedExistingSession', (v_previous_auth_id IS NOT NULL AND v_previous_auth_id <> v_auth_id),
        'student', json_build_object(
            'id', v_student.id,
            'name', v_student.name,
            'code', v_student.student_code,
            'classId', v_student.class_id,
            'className', COALESCE(v_student.class_name, 'Class')
        )
    );
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.bypass_student_trigger', 'false', true);
    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_student_by_auth()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student RECORD;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'No auth session');
    END IF;

    SELECT
        s.id,
        s.name,
        s.student_code,
        s.class_id,
        c.name AS class_name
    INTO v_student
    FROM public.students s
    LEFT JOIN public.classes c
      ON c.id = s.class_id
    WHERE s.auth_id = auth.uid()
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Student binding not found');
    END IF;

    RETURN json_build_object(
        'success', true,
        'student', json_build_object(
            'id', v_student.id,
            'name', v_student.name,
            'code', v_student.student_code,
            'classId', v_student.class_id,
            'className', COALESCE(v_student.class_name, 'Class')
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.unbind_student_auth()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'No auth session');
    END IF;

    PERFORM set_config('app.bypass_student_trigger', 'true', true);

    UPDATE public.students
    SET auth_id = NULL
    WHERE auth_id = auth.uid();

    PERFORM set_config('app.bypass_student_trigger', 'false', true);

    RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.bypass_student_trigger', 'false', true);
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.auth_user_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_user_class_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_student_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bind_student_auth(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_student_by_auth() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unbind_student_auth() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.auth_user_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_user_class_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_student_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bind_student_auth(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_student_by_auth() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unbind_student_auth() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
