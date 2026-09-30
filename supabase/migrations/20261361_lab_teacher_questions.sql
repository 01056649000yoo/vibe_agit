-- 연구소 `질문 만들기` 방에 선생님이 질문을 더한다 (2026-09-30).
--
-- 선생님 요청: 학생 질문이 모자랄 때 선생님이 질문을 더해 넣고, 그 질문을 학생들이 이어서 불러올 수 있게.
--   학생 제출(student_sessions)에 끼워 넣으면 `제출 N명`·학생별 결과가 어긋나므로 **방에 딸린 표**로 따로 둔다.
--   연구소(service_role)만 쓰고 읽는다. 이어지는 길:
--     ① 좋은 질문 고르기 후보 — 연구소가 이 표를 함께 읽는다(후보에는 누가 냈는지 남기지 않는다: 익명 투표)
--     ② 개요 짜기 `친구들과 만든 질문` — ① 의 후보를 그대로 따른다
--     ③ 아지트 과제 만들기 `연구소 질문 불러오기` — 아래 두 함수가 `선생님` 으로 싣는다

BEGIN;

CREATE TABLE IF NOT EXISTS writing_helper.room_teacher_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES writing_helper.rooms(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL,
    text TEXT NOT NULL CONSTRAINT room_teacher_questions_text_length CHECK (char_length(btrim(text)) BETWEEN 1 AND 300),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS room_teacher_questions_room_created_idx
    ON writing_helper.room_teacher_questions (room_id, created_at);

ALTER TABLE writing_helper.room_teacher_questions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE writing_helper.room_teacher_questions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE writing_helper.room_teacher_questions TO service_role;

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
            -- 2026-09-30: 선생님이 더한 질문도 함께 센다.
            ELSE (
                SELECT COALESCE(SUM(jsonb_array_length(pr.chunks)), 0)::INTEGER
                FROM writing_helper.portable_results pr
                WHERE pr.room_id = r.id AND pr.result_kind = 'questions'
            ) + (
                SELECT COUNT(*)::INTEGER FROM writing_helper.room_teacher_questions tq WHERE tq.room_id = r.id
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
    -- 2026-09-30: 선생님이 더한 질문은 맨 앞에, 쓴 사람 자리에 `선생님` 으로 싣는다(학생 수에는 섞지 않는다).
    SELECT pool.question_id, pool.q_text, pool.picked_count, pool.authors
    FROM (
        SELECT
            'teacher-' || tq.id::TEXT AS question_id,
            tq.text AS q_text,
            0::BIGINT AS picked_count,
            '선생님'::TEXT AS authors,
            0 AS source_order,
            tq.created_at AS added_at
        FROM writing_helper.room_teacher_questions tq
        WHERE tq.room_id = p_room_id
        UNION ALL
        SELECT
            md5(q.q_text),
            q.q_text,
            COUNT(DISTINCT q.agit_student_id)::BIGINT,
            COALESCE(
                (SELECT string_agg(DISTINCT left(st.name, 20), ', ')
                 FROM public.students st
                 WHERE st.id = ANY(array_agg(DISTINCT q.agit_student_id))
                   AND st.class_id = p_class_id),
                ''
            ),
            1,
            NULL::TIMESTAMPTZ
        FROM student_questions q
        GROUP BY q.q_text
    ) AS pool
    ORDER BY pool.source_order, pool.picked_count DESC, pool.added_at, pool.q_text
    LIMIT 330;
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_question_rooms_v1(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_teacher_room_question_pool_v1(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_question_rooms_v1(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_teacher_room_question_pool_v1(uuid, uuid) TO authenticated, service_role;

COMMIT;
