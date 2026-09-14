-- 교사가 학생이 만든 질문도 골라 과제 핵심 질문으로 가공할 수 있게 한다 (2026-09-14).
--
-- 지금까지: 과제 만들기의 `연구소 질문 불러오기` 는 **투표방(question_voting)만** 보여 줬다.
--   그래서 `질문 만들기`(question_generator) 활동만 하고 투표를 안 한 방의 질문은 교사가 쓸 수 없었다.
--   투표는 좋은 활동이지만, 학생이 낸 질문을 교사가 직접 추려 주는 길도 필요하다는 요청.
--
-- 두 활동은 질문이 있는 자리가 다르다.
--   투표방      : 후보가 `rooms.activity_config->'sourceQuestions'` 에 한 벌 있고, 표는 학생 제출에 있다.
--   질문 만들기 : 학생마다 자기 질문을 `portable_results.chunks` 에 남긴다(한 벌이 아니다).
-- 그래서 조회를 활동별로 갈라 두지 않고, **질문 꾸러미**라는 같은 모양으로 맞춰 돌려준다.
--   투표방의 `표 수` 자리에는 질문 만들기 방에서 **같은 질문을 쓴 학생 수**가 들어간다(같은 구실을 한다).
--
-- 옛 함수 둘은 이 모달에서만 쓰였으므로 새 이름으로 갈아끼우고 지운다.

BEGIN;

-- [1] 질문을 가져올 수 있는 활동방 목록. 두 종류를 함께 싣고 어느 쪽인지 알려 준다.
CREATE OR REPLACE FUNCTION public.get_teacher_question_rooms_v1(p_class_id uuid)
RETURNS TABLE(
    room_id uuid, activity_type text, title text, topic text,
    created_at timestamptz, is_active boolean,
    question_count integer, participant_count bigint
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
        r.activity_type::TEXT,
        r.title,
        r.topic,
        r.created_at,
        r.is_active IS TRUE AS is_active,
        CASE r.activity_type
            -- 투표방은 후보 질문이 방 설정에 한 벌 있다.
            WHEN 'question_voting' THEN
                COALESCE(jsonb_array_length(r.activity_config->'sourceQuestions'), 0)::INTEGER
            -- 질문 만들기 방은 학생들이 낸 질문을 모두 센다(서로 겹치는 것은 아래 꾸러미에서 묶는다).
            ELSE (
                SELECT COALESCE(SUM(jsonb_array_length(pr.chunks)), 0)::INTEGER
                FROM writing_helper.portable_results pr
                WHERE pr.room_id = r.id AND pr.result_kind = 'questions'
            )
        END AS question_count,
        COUNT(s.id) FILTER (WHERE s.status = 'done') AS participant_count
    FROM writing_helper.rooms r
    LEFT JOIN writing_helper.student_sessions s ON s.room_id = r.id
    WHERE r.agit_class_id = p_class_id
      AND r.teacher_id = auth.uid()
      AND r.activity_type IN ('question_voting', 'question_generator')
    GROUP BY r.id, r.activity_type, r.title, r.topic, r.created_at, r.is_active, r.activity_config
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT 50;
END;
$$;

-- [2] 방 하나의 질문 꾸러미. 두 활동이 같은 모양으로 나온다.
--     picked_count: 투표방이면 받은 표, 질문 만들기 방이면 같은 질문을 쓴 학생 수.
--     authors: 질문 만들기 방에서 누가 썼는지(교사가 가공할 때 맥락이 된다). 투표방은 비어 있다.
CREATE OR REPLACE FUNCTION public.get_teacher_room_question_pool_v1(p_class_id uuid, p_room_id uuid)
RETURNS TABLE(question_id text, text text, picked_count bigint, authors text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, writing_helper
AS $$
DECLARE
    v_activity TEXT;
    v_config JSONB;
BEGIN
    IF p_class_id IS NULL OR p_room_id IS NULL OR auth.uid() IS NULL THEN
        RAISE EXCEPTION 'teacher authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT r.activity_type::TEXT, r.activity_config
      INTO v_activity, v_config
    FROM writing_helper.rooms r
    WHERE r.id = p_room_id
      AND r.agit_class_id = p_class_id
      AND r.teacher_id = auth.uid()
      AND r.activity_type IN ('question_voting', 'question_generator');

    IF v_activity IS NULL THEN
        RAISE EXCEPTION 'question room not found' USING ERRCODE = '42501';
    END IF;

    IF v_activity = 'question_voting' THEN
        RETURN QUERY
        WITH candidate_questions AS (
            SELECT elem->>'id' AS q_id, elem->>'text' AS q_text
            FROM jsonb_array_elements(COALESCE(v_config->'sourceQuestions', '[]'::jsonb)) AS elem
            WHERE (elem->>'id') IS NOT NULL AND (elem->>'text') IS NOT NULL
        ),
        session_votes AS (
            SELECT vote_id.value #>> '{}' AS voted_q_id
            FROM writing_helper.student_sessions s,
                 jsonb_array_elements(COALESCE(s.submission->'selectedQuestionIds', '[]'::jsonb)) AS vote_id
            WHERE s.room_id = p_room_id AND s.status = 'done'
        )
        SELECT
            c.q_id,
            c.q_text,
            COALESCE((SELECT COUNT(*) FROM session_votes v WHERE v.voted_q_id = c.q_id), 0)::BIGINT,
            ''::TEXT
        FROM candidate_questions c
        ORDER BY 3 DESC, c.q_text;
        RETURN;
    END IF;

    -- 질문 만들기 방: 학생마다 낸 질문을 모아 **같은 문장끼리 묶는다.**
    -- 똑같이 쓴 아이가 여럿이면 그만큼 관심이 모인 질문이라, 투표의 표와 같은 구실을 한다.
    RETURN QUERY
    WITH student_questions AS (
        SELECT
            btrim(elem->>'text') AS q_text,
            pr.agit_student_id
        FROM writing_helper.portable_results pr
        JOIN jsonb_array_elements(COALESCE(pr.chunks, '[]'::jsonb)) AS elem ON TRUE
        WHERE pr.room_id = p_room_id
          AND pr.class_id = p_class_id
          AND pr.result_kind = 'questions'
          AND COALESCE(btrim(elem->>'text'), '') <> ''
    )
    SELECT
        md5(q.q_text) AS question_id,
        q.q_text,
        COUNT(DISTINCT q.agit_student_id)::BIGINT AS picked_count,
        COALESCE(
            (SELECT string_agg(DISTINCT left(st.name, 20), ', ')
             FROM public.students st
             WHERE st.id = ANY(array_agg(DISTINCT q.agit_student_id))
               AND st.class_id = p_class_id),
            ''
        ) AS authors
    FROM student_questions q
    GROUP BY q.q_text
    ORDER BY 3 DESC, q.q_text
    LIMIT 300;
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_question_rooms_v1(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_teacher_room_question_pool_v1(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_question_rooms_v1(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_teacher_room_question_pool_v1(uuid, uuid) TO authenticated, service_role;

-- 옛 함수는 이 모달에서만 쓰였고 새 함수가 그대로 대신한다.
DROP FUNCTION IF EXISTS public.get_teacher_question_voting_rooms_v1(uuid);
DROP FUNCTION IF EXISTS public.get_teacher_question_voting_ranking_v1(uuid, uuid);

COMMIT;
