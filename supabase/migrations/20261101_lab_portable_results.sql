BEGIN;

CREATE TABLE IF NOT EXISTS writing_helper.portable_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL UNIQUE
        REFERENCES writing_helper.student_sessions(id) ON DELETE CASCADE,
    room_id UUID NOT NULL
        REFERENCES writing_helper.rooms(id) ON DELETE CASCADE,
    agit_student_id UUID NOT NULL
        REFERENCES public.students(id) ON DELETE CASCADE,
    class_id UUID NOT NULL
        REFERENCES public.classes(id) ON DELETE CASCADE,
    activity_type TEXT NOT NULL,
    activity_version INTEGER NOT NULL CHECK (activity_version BETWEEN 1 AND 1000),
    schema_version INTEGER NOT NULL CHECK (schema_version BETWEEN 1 AND 1000),
    result_kind TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    topic TEXT NOT NULL DEFAULT '',
    chunks JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(chunks) = 'array'),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(metadata) = 'object'),
    completed_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portable_results_student_completed_idx
    ON writing_helper.portable_results(agit_student_id, completed_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS portable_results_class_completed_idx
    ON writing_helper.portable_results(class_id, completed_at DESC, id DESC);

ALTER TABLE writing_helper.portable_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE writing_helper.portable_results FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE writing_helper.portable_results IS
    '연구소 활동 매니페스트가 만든 버전 있는 표준 결과. 아지트 글쓰기에서는 본인 RPC로만 읽는다.';

CREATE OR REPLACE FUNCTION writing_helper.upsert_portable_result_v1(
    p_session_id UUID,
    p_activity_type TEXT,
    p_activity_version INTEGER,
    p_schema_version INTEGER,
    p_result_kind TEXT,
    p_title TEXT,
    p_topic TEXT,
    p_chunks JSONB,
    p_metadata JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, writing_helper
AS $$
DECLARE
    v_session writing_helper.student_sessions%ROWTYPE;
    v_room writing_helper.rooms%ROWTYPE;
    v_result_id UUID;
BEGIN
    SELECT * INTO v_session
    FROM writing_helper.student_sessions
    WHERE id = p_session_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'lab session not found' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_room
    FROM writing_helper.rooms
    WHERE id = v_session.room_id;

    IF NOT FOUND OR v_room.agit_class_id IS NULL OR v_session.agit_student_id IS NULL THEN
        RAISE EXCEPTION 'integrated lab ownership is missing' USING ERRCODE = '42501';
    END IF;

    IF coalesce(v_room.activity_type, 'outline_builder') <> p_activity_type THEN
        RAISE EXCEPTION 'activity type mismatch' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.students student
        WHERE student.id = v_session.agit_student_id
          AND student.class_id = v_room.agit_class_id
          AND student.is_active IS DISTINCT FROM false
          AND student.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'student is not active in the room class' USING ERRCODE = '42501';
    END IF;

    IF p_activity_type IS NULL OR length(trim(p_activity_type)) NOT BETWEEN 1 AND 80
       OR p_result_kind IS NULL OR length(trim(p_result_kind)) NOT BETWEEN 1 AND 80
       OR p_activity_version NOT BETWEEN 1 AND 1000
       OR p_schema_version NOT BETWEEN 1 AND 1000 THEN
        RAISE EXCEPTION 'invalid portable result manifest' USING ERRCODE = '22023';
    END IF;

    IF p_chunks IS NULL OR jsonb_typeof(p_chunks) <> 'array'
       OR jsonb_array_length(p_chunks) NOT BETWEEN 1 AND 100 THEN
        RAISE EXCEPTION 'portable result chunks must contain 1 to 100 items' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_chunks) AS chunk
        WHERE jsonb_typeof(chunk) <> 'object'
           OR jsonb_typeof(chunk->'id') <> 'string'
           OR length(trim(chunk->>'id')) NOT BETWEEN 1 AND 100
           OR jsonb_typeof(chunk->'kind') <> 'string'
           OR length(trim(chunk->>'kind')) NOT BETWEEN 1 AND 80
           OR jsonb_typeof(chunk->'text') <> 'string'
           OR length(trim(chunk->>'text')) NOT BETWEEN 1 AND 10000
    ) THEN
        RAISE EXCEPTION 'portable result chunk is invalid' USING ERRCODE = '22023';
    END IF;

    IF p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object'
       OR pg_column_size(p_metadata) > 65536 THEN
        RAISE EXCEPTION 'portable result metadata is invalid' USING ERRCODE = '22023';
    END IF;

    -- 완료 상태와 표준 결과는 반드시 같은 트랜잭션에서 확정한다.
    -- 재시도된 완료 세션은 기존 완료 시각을 유지한다.
    IF v_session.status <> 'done' THEN
        UPDATE writing_helper.student_sessions
        SET status = 'done', updated_at = now()
        WHERE id = v_session.id
        RETURNING * INTO v_session;
    END IF;

    INSERT INTO writing_helper.portable_results (
        session_id,
        room_id,
        agit_student_id,
        class_id,
        activity_type,
        activity_version,
        schema_version,
        result_kind,
        title,
        topic,
        chunks,
        metadata,
        completed_at,
        updated_at
    ) VALUES (
        v_session.id,
        v_room.id,
        v_session.agit_student_id,
        v_room.agit_class_id,
        trim(p_activity_type),
        p_activity_version,
        p_schema_version,
        trim(p_result_kind),
        left(coalesce(trim(p_title), ''), 300),
        left(coalesce(trim(p_topic), ''), 300),
        p_chunks,
        p_metadata,
        v_session.updated_at,
        now()
    )
    ON CONFLICT (session_id) DO UPDATE SET
        room_id = EXCLUDED.room_id,
        agit_student_id = EXCLUDED.agit_student_id,
        class_id = EXCLUDED.class_id,
        activity_type = EXCLUDED.activity_type,
        activity_version = EXCLUDED.activity_version,
        schema_version = EXCLUDED.schema_version,
        result_kind = EXCLUDED.result_kind,
        title = EXCLUDED.title,
        topic = EXCLUDED.topic,
        chunks = EXCLUDED.chunks,
        metadata = EXCLUDED.metadata,
        completed_at = EXCLUDED.completed_at,
        updated_at = now()
    RETURNING id INTO v_result_id;

    RETURN v_result_id;
END;
$$;

REVOKE ALL ON FUNCTION writing_helper.upsert_portable_result_v1(
    UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION writing_helper.upsert_portable_result_v1(
    UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, JSONB
) TO service_role;

-- 확정된 아지트 학생 연결이 있고 실제 내용이 남아 있는 과거 완료 결과만 표준 원장에 보강한다.
WITH eligible AS (
    SELECT
        session.id AS session_id,
        session.room_id,
        session.agit_student_id,
        room.agit_class_id AS class_id,
        coalesce(room.activity_type, 'outline_builder') AS activity_type,
        room.title,
        room.topic,
        room.activity_config,
        session.answers,
        session.submission,
        session.updated_at
    FROM writing_helper.student_sessions session
    JOIN writing_helper.rooms room ON room.id = session.room_id
    JOIN public.students student
      ON student.id = session.agit_student_id
     AND student.class_id = room.agit_class_id
     AND student.is_active IS DISTINCT FROM false
     AND student.deleted_at IS NULL
    WHERE session.status = 'done'
      AND session.agit_student_id IS NOT NULL
      AND room.agit_class_id IS NOT NULL
), normalized AS (
    SELECT
        eligible.*,
        CASE eligible.activity_type
            WHEN 'outline_builder' THEN coalesce((
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', coalesce(nullif(answer.value->>'itemId', ''), 'outline-' || answer.ordinality),
                        'kind', 'outline_item',
                        'section', coalesce(nullif(answer.value->>'section', ''), '처음'),
                        'label', coalesce(answer.value->>'label', ''),
                        'text', trim(answer.value->>'answer')
                    ) ORDER BY answer.ordinality
                )
                FROM jsonb_array_elements(
                    CASE WHEN jsonb_typeof(eligible.answers) = 'array' THEN eligible.answers ELSE '[]'::jsonb END
                ) WITH ORDINALITY AS answer(value, ordinality)
                WHERE length(trim(coalesce(answer.value->>'answer', ''))) > 0
            ), '[]'::jsonb)
            WHEN 'question_generator' THEN coalesce((
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', coalesce(nullif(selection.value->>'id', ''), 'question-' || selection.ordinality),
                        'kind', 'question',
                        'label', coalesce(selection.value->>'cardSetLabel', ''),
                        'text', trim(selection.value->>'remixedQuestion')
                    ) ORDER BY selection.ordinality
                )
                FROM jsonb_array_elements(
                    CASE WHEN jsonb_typeof(eligible.submission->'selections') = 'array'
                        THEN eligible.submission->'selections' ELSE '[]'::jsonb END
                ) WITH ORDINALITY AS selection(value, ordinality)
                WHERE length(trim(coalesce(selection.value->>'remixedQuestion', ''))) > 0
            ), '[]'::jsonb)
            WHEN 'question_voting' THEN coalesce((
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', selected.question_id,
                        'kind', 'selected_question',
                        'label', '좋은 질문',
                        'text', trim(question.value->>'text')
                    ) ORDER BY selected.ordinality
                )
                FROM jsonb_array_elements_text(
                    CASE WHEN jsonb_typeof(eligible.submission->'selectedQuestionIds') = 'array'
                        THEN eligible.submission->'selectedQuestionIds' ELSE '[]'::jsonb END
                ) WITH ORDINALITY AS selected(question_id, ordinality)
                JOIN jsonb_array_elements(
                    CASE WHEN jsonb_typeof(eligible.activity_config->'sourceQuestions') = 'array'
                        THEN eligible.activity_config->'sourceQuestions' ELSE '[]'::jsonb END
                ) AS question(value)
                  ON question.value->>'id' = selected.question_id
                WHERE length(trim(coalesce(question.value->>'text', ''))) > 0
            ), '[]'::jsonb)
            WHEN 'one_line_share' THEN CASE
                WHEN length(trim(coalesce(eligible.submission->>'content', ''))) > 0
                THEN jsonb_build_array(jsonb_build_object(
                    'id', coalesce(nullif(eligible.submission->>'entryId', ''), 'one-line'),
                    'kind', 'sentence',
                    'label', '한줄모아',
                    'text', trim(eligible.submission->>'content')
                ))
                ELSE '[]'::jsonb
            END
            WHEN 'hanja_writing' THEN coalesce((
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', 'hanja-sentence-' || sentence.ordinality,
                        'kind', 'sentence',
                        'label', '한자 활용 문장',
                        'text', trim(sentence.value)
                    ) ORDER BY sentence.ordinality
                )
                FROM jsonb_array_elements_text(
                    CASE
                        WHEN jsonb_typeof(eligible.submission->'contents') = 'array'
                            THEN eligible.submission->'contents'
                        WHEN length(trim(coalesce(eligible.submission->>'content', ''))) > 0
                            THEN jsonb_build_array(eligible.submission->>'content')
                        ELSE '[]'::jsonb
                    END
                ) WITH ORDINALITY AS sentence(value, ordinality)
                WHERE length(trim(sentence.value)) > 0
            ), '[]'::jsonb)
            ELSE '[]'::jsonb
        END AS chunks
    FROM eligible
)
INSERT INTO writing_helper.portable_results (
    session_id,
    room_id,
    agit_student_id,
    class_id,
    activity_type,
    activity_version,
    schema_version,
    result_kind,
    title,
    topic,
    chunks,
    metadata,
    completed_at
)
SELECT
    normalized.session_id,
    normalized.room_id,
    normalized.agit_student_id,
    normalized.class_id,
    normalized.activity_type,
    CASE WHEN normalized.activity_type = 'outline_builder' THEN 2 ELSE 1 END,
    1,
    CASE normalized.activity_type
        WHEN 'outline_builder' THEN 'outline'
        WHEN 'question_generator' THEN 'questions'
        WHEN 'question_voting' THEN 'selected_questions'
        WHEN 'one_line_share' THEN 'one_line'
        WHEN 'hanja_writing' THEN 'hanja_sentences'
    END,
    coalesce(nullif(trim(normalized.title), ''), nullif(trim(normalized.topic), ''), '글쓰기 연구소 활동'),
    coalesce(normalized.topic, ''),
    normalized.chunks,
    jsonb_build_object('backfilled', true),
    normalized.updated_at
FROM normalized
WHERE jsonb_array_length(normalized.chunks) > 0
  AND normalized.activity_type IN (
      'outline_builder',
      'question_generator',
      'question_voting',
      'one_line_share',
      'hanja_writing'
  )
ON CONFLICT (session_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
COMMIT;
