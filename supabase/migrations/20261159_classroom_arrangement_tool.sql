BEGIN;

CREATE TABLE IF NOT EXISTS public.classroom_arrangement_settings (
    class_id UUID PRIMARY KEY REFERENCES public.classes(id) ON DELETE CASCADE,
    seat_settings JSONB NOT NULL DEFAULT '{}'::JSONB,
    role_settings JSONB NOT NULL DEFAULT '{}'::JSONB,
    student_groups JSONB NOT NULL DEFAULT '{}'::JSONB,
    updated_by UUID NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT classroom_arrangement_settings_payload_limit CHECK (
        OCTET_LENGTH(seat_settings::TEXT) <= 262144
        AND OCTET_LENGTH(role_settings::TEXT) <= 131072
        AND OCTET_LENGTH(student_groups::TEXT) <= 65536
    )
);

CREATE TABLE IF NOT EXISTS public.classroom_arrangement_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('seat', 'role')),
    title TEXT NOT NULL CHECK (CHAR_LENGTH(title) BETWEEN 1 AND 80),
    payload JSONB NOT NULL,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT classroom_arrangement_history_payload_limit CHECK (OCTET_LENGTH(payload::TEXT) <= 524288)
);

CREATE INDEX IF NOT EXISTS idx_classroom_arrangement_history_class_created
    ON public.classroom_arrangement_history (class_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.survival_legacy_archives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL,
    source_fingerprint TEXT NOT NULL,
    archive_version INTEGER NOT NULL DEFAULT 1 CHECK (archive_version BETWEEN 1 AND 20),
    summary JSONB NOT NULL DEFAULT '{}'::JSONB,
    payload JSONB NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT survival_legacy_archives_fingerprint CHECK (source_fingerprint ~ '^[a-f0-9]{64}$'),
    CONSTRAINT survival_legacy_archives_payload_limit CHECK (
        OCTET_LENGTH(summary::TEXT) <= 65536
        AND OCTET_LENGTH(payload::TEXT) <= 5242880
    ),
    CONSTRAINT survival_legacy_archives_teacher_fingerprint UNIQUE (teacher_id, source_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_survival_legacy_archives_teacher_imported
    ON public.survival_legacy_archives (teacher_id, imported_at DESC);

ALTER TABLE public.classroom_arrangement_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_arrangement_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survival_legacy_archives ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.classroom_arrangement_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.classroom_arrangement_history FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.survival_legacy_archives FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_teacher_classroom_arrangement_v1(
    p_class_id UUID,
    p_history_limit INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_history_limit, 50), 1), 50);
    v_result JSONB;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.classes class
        WHERE class.id = p_class_id
          AND class.teacher_id = auth.uid()
          AND class.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION '담당 학급만 확인할 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT JSONB_BUILD_OBJECT(
        'students', COALESCE((
            SELECT JSONB_AGG(JSONB_BUILD_OBJECT('id', roster.id, 'name', roster.name) ORDER BY LOWER(roster.name), roster.id)
            FROM (
                SELECT student.id, student.name
                FROM public.students student
                WHERE student.class_id = p_class_id
                  AND student.deleted_at IS NULL
                ORDER BY LOWER(student.name), student.id
                LIMIT 100
            ) roster
        ), '[]'::JSONB),
        'settings', JSONB_BUILD_OBJECT(
            'seat', COALESCE(settings.seat_settings, '{}'::JSONB),
            'role', COALESCE(settings.role_settings, '{}'::JSONB),
            'studentGroups', COALESCE(settings.student_groups, '{}'::JSONB),
            'updatedAt', settings.updated_at
        ),
        'history', COALESCE((
            SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
                'id', history.id,
                'kind', history.kind,
                'title', history.title,
                'payload', history.payload,
                'createdAt', history.created_at
            ) ORDER BY history.created_at DESC, history.id DESC)
            FROM (
                SELECT item.id, item.kind, item.title, item.payload, item.created_at
                FROM public.classroom_arrangement_history item
                WHERE item.class_id = p_class_id
                ORDER BY item.created_at DESC, item.id DESC
                LIMIT v_limit
            ) history
        ), '[]'::JSONB)
    ) INTO v_result
    FROM (SELECT 1) seed
    LEFT JOIN public.classroom_arrangement_settings settings ON settings.class_id = p_class_id;

    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_teacher_classroom_arrangement_settings_v1(
    p_class_id UUID,
    p_seat_settings JSONB,
    p_role_settings JSONB,
    p_student_groups JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.classes class
        WHERE class.id = p_class_id
          AND class.teacher_id = auth.uid()
          AND class.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION '담당 학급만 수정할 수 있습니다.' USING ERRCODE = '42501';
    END IF;
    IF JSONB_TYPEOF(COALESCE(p_seat_settings, '{}'::JSONB)) <> 'object'
       OR JSONB_TYPEOF(COALESCE(p_role_settings, '{}'::JSONB)) <> 'object'
       OR JSONB_TYPEOF(COALESCE(p_student_groups, '{}'::JSONB)) <> 'object' THEN
        RAISE EXCEPTION '배치 설정 형식이 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;
    IF OCTET_LENGTH(COALESCE(p_seat_settings, '{}'::JSONB)::TEXT) > 262144
       OR OCTET_LENGTH(COALESCE(p_role_settings, '{}'::JSONB)::TEXT) > 131072
       OR OCTET_LENGTH(COALESCE(p_student_groups, '{}'::JSONB)::TEXT) > 65536 THEN
        RAISE EXCEPTION '배치 설정이 허용 크기를 넘었습니다.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.classroom_arrangement_settings (
        class_id, seat_settings, role_settings, student_groups, updated_by, updated_at
    ) VALUES (
        p_class_id,
        COALESCE(p_seat_settings, '{}'::JSONB),
        COALESCE(p_role_settings, '{}'::JSONB),
        COALESCE(p_student_groups, '{}'::JSONB),
        auth.uid(),
        NOW()
    )
    ON CONFLICT (class_id) DO UPDATE SET
        seat_settings = EXCLUDED.seat_settings,
        role_settings = EXCLUDED.role_settings,
        student_groups = EXCLUDED.student_groups,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at;

    RETURN JSONB_BUILD_OBJECT('success', TRUE, 'updatedAt', NOW());
END;
$$;

CREATE OR REPLACE FUNCTION public.create_teacher_classroom_arrangement_history_v1(
    p_class_id UUID,
    p_kind TEXT,
    p_title TEXT,
    p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
    v_created_at TIMESTAMPTZ;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.classes class
        WHERE class.id = p_class_id
          AND class.teacher_id = auth.uid()
          AND class.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION '담당 학급만 기록할 수 있습니다.' USING ERRCODE = '42501';
    END IF;
    IF p_kind NOT IN ('seat', 'role') THEN
        RAISE EXCEPTION '지원하지 않는 배치 기록입니다.' USING ERRCODE = '22023';
    END IF;
    IF CHAR_LENGTH(BTRIM(COALESCE(p_title, ''))) NOT BETWEEN 1 AND 80
       OR JSONB_TYPEOF(COALESCE(p_payload, '{}'::JSONB)) <> 'object'
       OR OCTET_LENGTH(COALESCE(p_payload, '{}'::JSONB)::TEXT) > 524288 THEN
        RAISE EXCEPTION '배치 기록 형식이 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.classroom_arrangement_history (class_id, kind, title, payload, created_by)
    VALUES (p_class_id, p_kind, BTRIM(p_title), p_payload, auth.uid())
    RETURNING id, created_at INTO v_id, v_created_at;
    RETURN JSONB_BUILD_OBJECT('id', v_id, 'createdAt', v_created_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_teacher_classroom_arrangement_history_v1(p_history_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM public.classroom_arrangement_history history
    USING public.classes class
    WHERE history.id = p_history_id
      AND class.id = history.class_id
      AND class.teacher_id = auth.uid();
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    IF v_deleted = 0 THEN
        RAISE EXCEPTION '삭제할 수 있는 기록이 아닙니다.' USING ERRCODE = '42501';
    END IF;
    RETURN JSONB_BUILD_OBJECT('success', TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION public.import_teacher_survival_archive_v1(
    p_source_fingerprint TEXT,
    p_archive_version INTEGER,
    p_summary JSONB,
    p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() NOT IN ('TEACHER', 'ADMIN') THEN
        RAISE EXCEPTION '교사 계정으로 로그인해야 합니다.' USING ERRCODE = '42501';
    END IF;
    IF COALESCE(p_source_fingerprint, '') !~ '^[a-f0-9]{64}$'
       OR COALESCE(p_archive_version, 0) NOT BETWEEN 1 AND 20
       OR JSONB_TYPEOF(COALESCE(p_summary, '{}'::JSONB)) <> 'object'
       OR JSONB_TYPEOF(COALESCE(p_payload, '{}'::JSONB)) <> 'object'
       OR OCTET_LENGTH(COALESCE(p_summary, '{}'::JSONB)::TEXT) > 65536
       OR OCTET_LENGTH(COALESCE(p_payload, '{}'::JSONB)::TEXT) > 5242880 THEN
        RAISE EXCEPTION '서바이벌 보관 파일 형식 또는 크기가 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.survival_legacy_archives (
        teacher_id, source_fingerprint, archive_version, summary, payload
    ) VALUES (
        auth.uid(), p_source_fingerprint, p_archive_version, p_summary, p_payload
    )
    ON CONFLICT (teacher_id, source_fingerprint) DO UPDATE SET
        summary = EXCLUDED.summary,
        payload = EXCLUDED.payload,
        imported_at = NOW()
    RETURNING id INTO v_id;

    RETURN JSONB_BUILD_OBJECT('success', TRUE, 'archiveId', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_classroom_arrangement_v1(UUID, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_teacher_classroom_arrangement_settings_v1(UUID, JSONB, JSONB, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_teacher_classroom_arrangement_history_v1(UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_teacher_classroom_arrangement_history_v1(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.import_teacher_survival_archive_v1(TEXT, INTEGER, JSONB, JSONB) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_teacher_classroom_arrangement_v1(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_teacher_classroom_arrangement_settings_v1(UUID, JSONB, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_teacher_classroom_arrangement_history_v1(UUID, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_teacher_classroom_arrangement_history_v1(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_teacher_survival_archive_v1(TEXT, INTEGER, JSONB, JSONB) TO authenticated;

COMMIT;
