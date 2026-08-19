-- 연구소 결과에 "무엇을 한 활동인지" 한 줄을 붙인다 (2026-08-20)
--
-- 배경: 학생이 한줄모아 결과를 불러올 때 **두 활동이 똑같이 보였다.** 운영 데이터를 보니
-- 한줄모아 방은 제목이 모두 `한줄모아`이고 주제도 `핵심단어 문장 만들기`처럼 비슷하다.
-- 실제로 다른 것은 **선생님이 준 핵심 낱말**(`폭우` / `자연재해·지진·해일·폭우`)이다.
--
-- 그래서 결과마다 `hint` 한 줄을 함께 돌려준다. 화면은 이 줄만 덧붙이면 된다.
--   · 한줄모아  → `핵심 낱말: 폭우, 자연재해`(없으면 선생님 설명)
--   · 좋은 질문 → `고른 질문 3개`
--   · 개요      → 글 종류
-- 방이 지워졌으면 hint 는 NULL 이고 화면은 그냥 그리지 않는다.

BEGIN;

-- 활동 설정에서 학생에게 보여 줄 한 줄을 만든다. 두 RPC 가 같은 규칙을 쓰도록 함수로 뺀다.
CREATE OR REPLACE FUNCTION public.lab_result_hint_v1(p_room_id UUID, p_result_kind TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, writing_helper
AS $$
DECLARE
    v_config JSONB;
    v_description TEXT;
    v_keywords TEXT;
BEGIN
    SELECT room.activity_config, NULLIF(btrim(room.topic_description), '')
      INTO v_config, v_description
    FROM writing_helper.rooms room
    WHERE room.id = p_room_id;

    IF v_config IS NULL THEN RETURN NULL; END IF;

    IF p_result_kind = 'one_line' THEN
        SELECT string_agg(value, ', ')
          INTO v_keywords
        FROM jsonb_array_elements_text(COALESCE(v_config->'coreKeywords', '[]'::JSONB)) AS value;

        IF v_keywords IS NOT NULL AND btrim(v_keywords) <> '' THEN
            RETURN left('핵심 낱말: ' || v_keywords, 120);
        END IF;
        RETURN left(COALESCE(NULLIF(btrim(v_config->>'promptDescription'), ''), v_description, ''), 120);
    END IF;

    IF p_result_kind = 'selected_questions' THEN
        RETURN left(COALESCE(NULLIF(btrim(v_config->>'sourceRoomTitle'), ''), v_description, ''), 120);
    END IF;

    RETURN left(COALESCE(NULLIF(btrim(v_config->>'subjectType'), ''), v_description, ''), 120);
END;
$$;

-- 반환 열이 늘어 CREATE OR REPLACE 로는 못 바꾼다. 지우고 다시 만든다(권한도 다시 준다).
DROP FUNCTION IF EXISTS public.get_my_lab_results_v1(INTEGER, TIMESTAMPTZ, UUID, TEXT[]);
CREATE OR REPLACE FUNCTION public.get_my_lab_results_v1(
    p_limit INTEGER DEFAULT 20,
    p_before_completed_at TIMESTAMPTZ DEFAULT NULL,
    p_before_id UUID DEFAULT NULL,
    p_result_kinds TEXT[] DEFAULT NULL
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
    hint TEXT,
    chunks JSONB,
    completed_at TIMESTAMPTZ,
    has_more BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, writing_helper
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_limit INTEGER := LEAST(GREATEST(coalesce(p_limit, 20), 1), 50);
BEGIN
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION 'student authentication required' USING ERRCODE = '42501';
    END IF;

    IF (p_before_completed_at IS NULL) <> (p_before_id IS NULL) THEN
        RAISE EXCEPTION 'both cursor values are required' USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    WITH page AS (
        SELECT portable.*
        FROM writing_helper.portable_results portable
        JOIN public.students student
          ON student.id = portable.agit_student_id
         AND student.class_id = portable.class_id
         AND student.is_active IS DISTINCT FROM false
         AND student.deleted_at IS NULL
        WHERE portable.agit_student_id = v_student_id
          AND (
              p_result_kinds IS NULL
              OR cardinality(p_result_kinds) = 0
              OR portable.result_kind = ANY(p_result_kinds)
          )
          AND (
              p_before_completed_at IS NULL
              OR (portable.completed_at, portable.id) < (p_before_completed_at, p_before_id)
          )
        ORDER BY portable.completed_at DESC, portable.id DESC
        LIMIT v_limit + 1
    ), page_meta AS (
        SELECT count(*) > v_limit AS has_more
        FROM page
    )
    SELECT
        page.id,
        page.session_id,
        page.room_id,
        page.activity_type,
        page.activity_version,
        page.schema_version,
        page.result_kind,
        page.title,
        page.topic,
        public.lab_result_hint_v1(page.room_id, page.result_kind) AS hint,
        page.chunks,
        page.completed_at,
        page_meta.has_more
    FROM page
    CROSS JOIN page_meta
    ORDER BY page.completed_at DESC, page.id DESC
    LIMIT v_limit;
END;
$$;

DROP FUNCTION IF EXISTS public.get_my_writing_references_v1(UUID, INTEGER);
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
    hint TEXT,
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
        public.lab_result_hint_v1(portable.room_id, portable.result_kind) AS hint,
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

REVOKE ALL ON FUNCTION public.lab_result_hint_v1(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lab_result_hint_v1(UUID, TEXT) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_my_lab_results_v1(INTEGER, TIMESTAMPTZ, UUID, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_lab_results_v1(INTEGER, TIMESTAMPTZ, UUID, TEXT[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_my_writing_references_v1(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_writing_references_v1(UUID, INTEGER) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
