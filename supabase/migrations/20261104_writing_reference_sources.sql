BEGIN;

-- 글쓰기 과제는 연구소 구현을 직접 알지 않고, 표준 결과 종류와 활동방만 연결한다.
-- 브라우저는 이 테이블을 직접 읽거나 쓰지 않으며 아래 역할별 RPC만 사용한다.
CREATE TABLE IF NOT EXISTS public.writing_mission_lab_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mission_id UUID NOT NULL
        REFERENCES public.writing_missions(id) ON DELETE CASCADE,
    class_id UUID NOT NULL
        REFERENCES public.classes(id) ON DELETE CASCADE,
    room_id UUID NOT NULL
        REFERENCES writing_helper.rooms(id) ON DELETE CASCADE,
    result_kind TEXT NOT NULL
        CHECK (result_kind IN ('outline', 'selected_questions')),
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (mission_id, result_kind)
);

CREATE INDEX IF NOT EXISTS writing_mission_lab_sources_class_mission_idx
    ON public.writing_mission_lab_sources(class_id, mission_id);

ALTER TABLE public.writing_mission_lab_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.writing_mission_lab_sources FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.writing_mission_lab_sources IS
    '글쓰기 과제와 연구소 활동방의 표준 결과 연결. 교사·학생은 역할별 RPC로만 접근한다.';

CREATE OR REPLACE FUNCTION public.get_teacher_mission_lab_sources_v1(
    p_mission_id UUID
)
RETURNS TABLE (
    room_id UUID,
    activity_type TEXT,
    result_kind TEXT,
    title TEXT,
    topic TEXT,
    created_at TIMESTAMPTZ,
    is_active BOOLEAN,
    is_linked BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, writing_helper
AS $$
DECLARE
    v_class_id UUID;
    v_class_teacher_id UUID;
BEGIN
    IF p_mission_id IS NULL OR auth.uid() IS NULL THEN
        RAISE EXCEPTION 'teacher authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT mission.class_id, class.teacher_id
      INTO v_class_id, v_class_teacher_id
    FROM public.writing_missions mission
    JOIN public.classes class
      ON class.id = mission.class_id
     AND class.deleted_at IS NULL
    WHERE mission.id = p_mission_id
      AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN');

    IF v_class_id IS NULL OR v_class_teacher_id IS NULL THEN
        RAISE EXCEPTION 'teacher mission access required' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        room.id,
        COALESCE(NULLIF(room.activity_type, ''), 'outline_builder') AS activity_type,
        CASE COALESCE(NULLIF(room.activity_type, ''), 'outline_builder')
            WHEN 'outline_builder' THEN 'outline'
            WHEN 'question_voting' THEN 'selected_questions'
        END AS result_kind,
        room.title,
        room.topic,
        room.created_at,
        room.is_active IS TRUE AS is_active,
        source.room_id IS NOT NULL AS is_linked
    FROM writing_helper.rooms room
    LEFT JOIN public.writing_mission_lab_sources source
      ON source.mission_id = p_mission_id
     AND source.class_id = v_class_id
     AND source.room_id = room.id
     AND source.result_kind = CASE COALESCE(NULLIF(room.activity_type, ''), 'outline_builder')
         WHEN 'outline_builder' THEN 'outline'
         WHEN 'question_voting' THEN 'selected_questions'
     END
    WHERE room.agit_class_id = v_class_id
      AND room.teacher_id = v_class_teacher_id
      AND COALESCE(NULLIF(room.activity_type, ''), 'outline_builder')
          IN ('outline_builder', 'question_voting')
    ORDER BY (source.room_id IS NOT NULL) DESC, room.created_at DESC, room.id DESC
    LIMIT 100;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_teacher_mission_lab_source_v1(
    p_mission_id UUID,
    p_result_kind TEXT,
    p_room_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, writing_helper
AS $$
DECLARE
    v_class_id UUID;
    v_class_teacher_id UUID;
    v_room_activity_type TEXT;
BEGIN
    IF p_mission_id IS NULL OR auth.uid() IS NULL THEN
        RAISE EXCEPTION 'teacher authentication required' USING ERRCODE = '42501';
    END IF;

    IF p_result_kind NOT IN ('outline', 'selected_questions') THEN
        RAISE EXCEPTION 'unsupported writing reference result kind' USING ERRCODE = '22023';
    END IF;

    SELECT mission.class_id, class.teacher_id
      INTO v_class_id, v_class_teacher_id
    FROM public.writing_missions mission
    JOIN public.classes class
      ON class.id = mission.class_id
     AND class.deleted_at IS NULL
    WHERE mission.id = p_mission_id
      AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN');

    IF v_class_id IS NULL OR v_class_teacher_id IS NULL THEN
        RAISE EXCEPTION 'teacher mission access required' USING ERRCODE = '42501';
    END IF;

    IF p_room_id IS NULL THEN
        DELETE FROM public.writing_mission_lab_sources source
        WHERE source.mission_id = p_mission_id
          AND source.class_id = v_class_id
          AND source.result_kind = p_result_kind;
        RETURN TRUE;
    END IF;

    SELECT COALESCE(NULLIF(room.activity_type, ''), 'outline_builder')
      INTO v_room_activity_type
    FROM writing_helper.rooms room
    WHERE room.id = p_room_id
      AND room.agit_class_id = v_class_id
      AND room.teacher_id = v_class_teacher_id;

    IF v_room_activity_type IS NULL
       OR (p_result_kind = 'outline' AND v_room_activity_type <> 'outline_builder')
       OR (p_result_kind = 'selected_questions' AND v_room_activity_type <> 'question_voting') THEN
        RAISE EXCEPTION 'lab room does not match mission class or result kind' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.writing_mission_lab_sources (
        mission_id, class_id, room_id, result_kind, created_by
    ) VALUES (
        p_mission_id, v_class_id, p_room_id, p_result_kind, auth.uid()
    )
    ON CONFLICT (mission_id, result_kind) DO UPDATE
    SET class_id = EXCLUDED.class_id,
        room_id = EXCLUDED.room_id,
        created_by = EXCLUDED.created_by,
        updated_at = now();

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_writing_references_v1(
    p_mission_id UUID,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    id UUID,
    session_id UUID,
    room_id UUID,
    activity_type TEXT,
    activity_version INTEGER,
    schema_version INTEGER,
    result_kind TEXT,
    title TEXT,
    topic TEXT,
    chunks JSONB,
    completed_at TIMESTAMPTZ,
    is_linked BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, writing_helper
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID;
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 20);
BEGIN
    IF v_student_id IS NULL OR p_mission_id IS NULL THEN
        RAISE EXCEPTION 'student authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT student.class_id
      INTO v_class_id
    FROM public.students student
    WHERE student.id = v_student_id
      AND student.is_active IS DISTINCT FROM FALSE
      AND student.deleted_at IS NULL;

    IF v_class_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.writing_missions mission
        WHERE mission.id = p_mission_id
          AND mission.class_id = v_class_id
    ) THEN
        RAISE EXCEPTION 'student mission access required' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        portable.id,
        portable.session_id,
        portable.room_id,
        portable.activity_type,
        portable.activity_version,
        portable.schema_version,
        portable.result_kind,
        portable.title,
        portable.topic,
        portable.chunks,
        portable.completed_at,
        source.room_id IS NOT NULL AS is_linked
    FROM writing_helper.portable_results portable
    LEFT JOIN public.writing_mission_lab_sources source
      ON source.mission_id = p_mission_id
     AND source.class_id = portable.class_id
     AND source.room_id = portable.room_id
     AND source.result_kind = portable.result_kind
    WHERE portable.agit_student_id = v_student_id
      AND portable.class_id = v_class_id
      AND portable.result_kind IN ('outline', 'selected_questions')
    ORDER BY (source.room_id IS NOT NULL) DESC,
             portable.completed_at DESC,
             portable.id DESC
    LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_mission_lab_sources_v1(UUID)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_mission_lab_sources_v1(UUID)
    TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_teacher_mission_lab_source_v1(UUID, TEXT, UUID)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_teacher_mission_lab_source_v1(UUID, TEXT, UUID)
    TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_my_writing_references_v1(UUID, INTEGER)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_writing_references_v1(UUID, INTEGER)
    TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
