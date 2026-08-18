BEGIN;

-- 1. writing_mission_lab_sources 테이블의 result_kind 제약조건에 'one_line' 추가
ALTER TABLE public.writing_mission_lab_sources
    DROP CONSTRAINT IF EXISTS writing_mission_lab_sources_result_kind_check;

ALTER TABLE public.writing_mission_lab_sources
    ADD CONSTRAINT writing_mission_lab_sources_result_kind_check
    CHECK (result_kind IN ('outline', 'selected_questions', 'one_line'));

-- 2. 교사용 미션 연구소 자료 목록 조회 RPC 갱신 (한줄모아 포함)
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
            WHEN 'one_line_share' THEN 'one_line'
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
         WHEN 'one_line_share' THEN 'one_line'
     END
    WHERE room.agit_class_id = v_class_id
      AND room.teacher_id = v_class_teacher_id
      AND COALESCE(NULLIF(room.activity_type, ''), 'outline_builder')
          IN ('outline_builder', 'question_voting', 'one_line_share')
    ORDER BY (source.room_id IS NOT NULL) DESC, room.created_at DESC, room.id DESC
    LIMIT 100;
END;
$$;

-- 3. 교사용 미션 연구소 자료 연결 설정 RPC 갱신 (한줄모아 포함)
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

    IF p_result_kind NOT IN ('outline', 'selected_questions', 'one_line') THEN
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
       OR (p_result_kind = 'selected_questions' AND v_room_activity_type <> 'question_voting')
       OR (p_result_kind = 'one_line' AND v_room_activity_type <> 'one_line_share') THEN
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

-- 4. 학생용 미션 연구소 참고자료 조회 RPC 갱신 (한줄모아 포함)
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
      AND portable.result_kind IN ('outline', 'selected_questions', 'one_line')
    ORDER BY (source.room_id IS NOT NULL) DESC,
             portable.completed_at DESC,
             portable.id DESC
    LIMIT v_limit;
END;
$$;

-- 5. 교사용: 학급의 좋은 질문 고르기 활동 목록 조회 RPC
CREATE OR REPLACE FUNCTION public.get_teacher_question_voting_rooms_v1(
    p_class_id UUID
)
RETURNS TABLE (
    room_id UUID,
    title TEXT,
    topic TEXT,
    created_at TIMESTAMPTZ,
    is_active BOOLEAN,
    question_count INTEGER,
    participant_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, writing_helper
AS $$
BEGIN
    IF p_class_id IS NULL OR auth.uid() IS NULL THEN
        RAISE EXCEPTION 'teacher authentication required' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = p_class_id
          AND (c.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN')
          AND c.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'class access denied' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        r.id AS room_id,
        r.title,
        r.topic,
        r.created_at,
        r.is_active IS TRUE AS is_active,
        COALESCE(jsonb_array_length(r.activity_config->'sourceQuestions'), 0)::INTEGER AS question_count,
        COUNT(s.id) FILTER (WHERE s.status = 'done') AS participant_count
    FROM writing_helper.rooms r
    LEFT JOIN writing_helper.student_sessions s
      ON s.room_id = r.id
    WHERE r.agit_class_id = p_class_id
      AND r.teacher_id = auth.uid()
      AND r.activity_type = 'question_voting'
    GROUP BY r.id, r.title, r.topic, r.created_at, r.is_active, r.activity_config
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT 50;
END;
$$;

-- 6. 교사용: 특정 좋은 질문 고르기 활동의 득표순 질문 목록 조회 RPC
CREATE OR REPLACE FUNCTION public.get_teacher_question_voting_ranking_v1(
    p_class_id UUID,
    p_room_id UUID
)
RETURNS TABLE (
    question_id TEXT,
    text TEXT,
    votes BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, writing_helper
AS $$
DECLARE
    v_config JSONB;
BEGIN
    IF p_class_id IS NULL OR p_room_id IS NULL OR auth.uid() IS NULL THEN
        RAISE EXCEPTION 'teacher authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT r.activity_config
      INTO v_config
    FROM writing_helper.rooms r
    WHERE r.id = p_room_id
      AND r.agit_class_id = p_class_id
      AND r.teacher_id = auth.uid()
      AND r.activity_type = 'question_voting';

    IF v_config IS NULL THEN
        RAISE EXCEPTION 'question voting room not found' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH candidate_questions AS (
        SELECT
            elem->>'id' AS q_id,
            elem->>'text' AS q_text
        FROM jsonb_array_elements(COALESCE(v_config->'sourceQuestions', '[]'::jsonb)) AS elem
        WHERE (elem->>'id') IS NOT NULL AND (elem->>'text') IS NOT NULL
    ),
    session_votes AS (
        SELECT
            vote_id.value #>> '{}' AS voted_q_id
        FROM writing_helper.student_sessions s,
             jsonb_array_elements(COALESCE(s.submission->'selectedQuestionIds', '[]'::jsonb)) AS vote_id
        WHERE s.room_id = p_room_id
          AND s.status = 'done'
    ),
    vote_counts AS (
        SELECT
            voted_q_id,
            COUNT(*) AS vote_cnt
        FROM session_votes
        GROUP BY voted_q_id
    )
    SELECT
        cq.q_id AS question_id,
        cq.q_text AS text,
        COALESCE(vc.vote_cnt, 0)::BIGINT AS votes
    FROM candidate_questions cq
    LEFT JOIN vote_counts vc ON vc.voted_q_id = cq.q_id
    ORDER BY votes DESC, cq.q_id ASC;
END;
$$;

-- 권한 부여
REVOKE ALL ON FUNCTION public.get_teacher_question_voting_rooms_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_question_voting_rooms_v1(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_teacher_question_voting_ranking_v1(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_question_voting_ranking_v1(UUID, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_teacher_mission_lab_sources_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_mission_lab_sources_v1(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_teacher_mission_lab_source_v1(UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_teacher_mission_lab_source_v1(UUID, TEXT, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_my_writing_references_v1(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_writing_references_v1(UUID, INTEGER) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
