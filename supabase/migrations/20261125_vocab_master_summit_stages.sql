-- 어휘 마스터 정상 관문을 1·2·3단계 순차 관문으로 나눈다.
--
-- 어제 만든 정상 관문은 한 번 통과하면 끝이라, 열 층을 다 오른 학생이 도착하자마자 할 일이 없어졌다.
-- 정상을 세 번 오르게 한다. 1단계를 통과해야 2단계가, 2단계를 통과해야 3단계가 열린다.
--
-- 난이도 축은 **직접입력 비중 하나만** 쓴다(사용자와 정함):
--   1단계  선택형 12 + 직접입력 8    합격 17/20, 직접입력 6/8
--   2단계  선택형 6  + 직접입력 14   합격 17/20, 직접입력 11/14
--   3단계  전부 직접입력 20          합격 17/20, 직접입력 15/20
-- 문항 수·합격 정답 수·문항당 시간은 세 단계가 같다. 시간을 줄이지 않은 이유는 이 저장소의
-- "빠른 시간에 점수를 주지 않는다" 규칙 때문이고, 합격선을 올리지 않은 이유는 만점에 가까운
-- 요구가 실수 한 번으로 좌절시키기 때문이다. 어려움은 **고르기에서 쓰기로 넘어가는 것**으로 준다.
--
-- 휘장은 1단계부터 나온다. 단계가 오를 때마다 별이 하나씩 늘어난다(어휘 마스터 ⭐ → ⭐⭐ → ⭐⭐⭐).
-- 정상에 한 번도 못 오른 학생과 세 번 오른 학생이 친구 아지트에서 구분된다.
--
-- 정상 시도 기록이 아직 하나도 없어(운영 0건) 키 구조를 바꾸는 데 이관이 필요 없다.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. 엔진 — 콘텐츠마다 정상 단계 수가 다를 수 있다
-- ---------------------------------------------------------------------------
ALTER TABLE public.learning_content_types
    ADD COLUMN IF NOT EXISTS summit_level_count SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE public.learning_content_types
    DROP CONSTRAINT IF EXISTS learning_content_types_summit_levels_check;
ALTER TABLE public.learning_content_types
    ADD CONSTRAINT learning_content_types_summit_levels_check
        CHECK (summit_level_count BETWEEN 1 AND 5);

UPDATE public.learning_content_types SET summit_level_count = 3, updated_at = NOW()
WHERE content_type = 'vocab' AND summit_level_count <> 3;

-- 정상 휘장에 단계를 담는다. 이미 받은 휘장은 단계가 내려가지 않는다.
ALTER TABLE public.learning_summit_awards
    ADD COLUMN IF NOT EXISTS summit_level SMALLINT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.learning_summit_awards
    DROP CONSTRAINT IF EXISTS learning_summit_awards_level_check;
ALTER TABLE public.learning_summit_awards
    ADD CONSTRAINT learning_summit_awards_level_check CHECK (summit_level BETWEEN 1 AND 5);

-- ---------------------------------------------------------------------------
-- 2. 학급 설정 — 단계별 직접입력 문항 수와 합격 기준
-- ---------------------------------------------------------------------------
-- 1단계는 어제 만든 `vocab_summit_input_count`·`vocab_summit_pass_input` 를 그대로 쓴다.
ALTER TABLE public.classes
    ADD COLUMN IF NOT EXISTS vocab_summit_input_count_2 SMALLINT NOT NULL DEFAULT 14,
    ADD COLUMN IF NOT EXISTS vocab_summit_pass_input_2 SMALLINT NOT NULL DEFAULT 11,
    ADD COLUMN IF NOT EXISTS vocab_summit_input_count_3 SMALLINT NOT NULL DEFAULT 20,
    ADD COLUMN IF NOT EXISTS vocab_summit_pass_input_3 SMALLINT NOT NULL DEFAULT 15;

ALTER TABLE public.classes
    DROP CONSTRAINT IF EXISTS classes_vocab_summit_settings_check;
ALTER TABLE public.classes
    ADD CONSTRAINT classes_vocab_summit_settings_check CHECK (
        vocab_summit_question_count BETWEEN 10 AND 40
        AND vocab_summit_pass_correct BETWEEN 1 AND vocab_summit_question_count
        AND vocab_summit_input_count BETWEEN 0 AND vocab_summit_question_count
        AND vocab_summit_pass_input BETWEEN 0 AND vocab_summit_input_count
        AND vocab_summit_input_count_2 BETWEEN 0 AND vocab_summit_question_count
        AND vocab_summit_pass_input_2 BETWEEN 0 AND vocab_summit_input_count_2
        AND vocab_summit_input_count_3 BETWEEN 0 AND vocab_summit_question_count
        AND vocab_summit_pass_input_3 BETWEEN 0 AND vocab_summit_input_count_3
        -- 뒤 단계가 앞 단계보다 직접입력이 적으면 "순차로 어려워진다"는 약속이 깨진다.
        AND vocab_summit_input_count_2 >= vocab_summit_input_count
        AND vocab_summit_input_count_3 >= vocab_summit_input_count_2
    );

-- ---------------------------------------------------------------------------
-- 3. 단계별 묶음 키
-- ---------------------------------------------------------------------------
-- 단계마다 별도의 도전으로 기록되어야 "1단계는 통과, 2단계는 진행 중"이 표현된다.
DROP FUNCTION IF EXISTS public.vocab_tower_v2_summit_key(SMALLINT);
CREATE OR REPLACE FUNCTION public.vocab_tower_v2_summit_key(p_grade SMALLINT, p_stage SMALLINT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT format('g%s:summit%s',
                  GREATEST(3, LEAST(6, COALESCE(p_grade, 3))),
                  GREATEST(1, LEAST(5, COALESCE(p_stage, 1))))
$$;

REVOKE ALL ON FUNCTION public.vocab_tower_v2_summit_key(SMALLINT, SMALLINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vocab_tower_v2_summit_key(SMALLINT, SMALLINT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. 정상 관문 상태 — 단계별 통과 여부와 다음에 칠 단계
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vocab_tower_v2_summit_status_v1(
    p_student_id UUID,
    p_class_id UUID,
    p_grade SMALLINT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_required SMALLINT := 10;
    v_levels SMALLINT := 3;
    v_passed INTEGER := 0;
    v_class public.classes%ROWTYPE;
    v_award public.learning_summit_awards%ROWTYPE;
    v_stages JSONB;
    v_level SMALLINT := 0;
    v_next SMALLINT;
    v_open BOOLEAN;
BEGIN
    SELECT c.* INTO v_class FROM public.classes c WHERE c.id = p_class_id;

    -- 자격: 현재 학년 10개 층의 덱마스터를 모두 통과했는가.
    SELECT count(DISTINCT attempt.collection_key)::INTEGER INTO v_passed
    FROM public.learning_challenge_attempts attempt
    WHERE attempt.student_id = p_student_id
      AND attempt.class_id = p_class_id
      AND attempt.content_type = 'vocab'
      AND attempt.challenge_kind = 'collection'
      AND attempt.status = 'completed'
      AND attempt.passed IS TRUE
      AND attempt.collection_key IN (
          SELECT public.vocab_tower_v2_collection_key(p_grade, deck_number::SMALLINT)
          FROM generate_series(1, 10) deck_number
      );

    v_open := v_passed >= v_required;

    SELECT award.* INTO v_award FROM public.learning_summit_awards award
    WHERE award.student_id = p_student_id AND award.content_type = 'vocab';

    -- 단계별 통과 여부. 앞 단계를 통과해야 다음 단계가 열린다.
    SELECT jsonb_agg(stage_row ORDER BY (stage_row->>'stage')::INT) INTO v_stages
    FROM (
        SELECT jsonb_build_object(
            'stage', stage.n,
            'passed', done.passed_at IS NOT NULL,
            'passed_at', done.passed_at,
            'question_count', v_class.vocab_summit_question_count,
            'pass_correct', v_class.vocab_summit_pass_correct,
            'input_count', CASE stage.n
                WHEN 1 THEN v_class.vocab_summit_input_count
                WHEN 2 THEN v_class.vocab_summit_input_count_2
                ELSE v_class.vocab_summit_input_count_3 END,
            'pass_input', CASE stage.n
                WHEN 1 THEN v_class.vocab_summit_pass_input
                WHEN 2 THEN v_class.vocab_summit_pass_input_2
                ELSE v_class.vocab_summit_pass_input_3 END
        ) AS stage_row
        FROM generate_series(1, v_levels) stage(n)
        LEFT JOIN LATERAL (
            SELECT max(attempt.finished_at) AS passed_at
            FROM public.learning_challenge_attempts attempt
            WHERE attempt.student_id = p_student_id
              AND attempt.class_id = p_class_id
              AND attempt.content_type = 'vocab'
              AND attempt.challenge_kind = 'summit'
              AND attempt.status = 'completed'
              AND attempt.passed IS TRUE
              AND attempt.collection_key
                  = public.vocab_tower_v2_summit_key(p_grade, stage.n::SMALLINT)
        ) done ON TRUE
    ) stages;

    -- 통과한 최고 단계. 중간을 건너뛸 수 없으므로 연속으로 센다.
    SELECT COALESCE(max((s->>'stage')::SMALLINT), 0) INTO v_level
    FROM jsonb_array_elements(v_stages) s
    WHERE (s->>'passed')::BOOLEAN
      AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(v_stages) earlier
          WHERE (earlier->>'stage')::INT < (s->>'stage')::INT
            AND NOT (earlier->>'passed')::BOOLEAN
      );

    v_next := CASE WHEN v_level >= v_levels THEN NULL ELSE (v_level + 1)::SMALLINT END;

    RETURN jsonb_build_object(
        'version', 2,
        -- 1단계 도전 자격(덱마스터 10개)이다. 화면의 잠금 판단에 그대로 쓴다.
        'eligible', v_open,
        'passed_count', v_passed,
        'required_count', v_required,
        'missing_count', GREATEST(v_required - v_passed, 0),
        'level', v_level,
        'level_count', v_levels,
        'next_stage', v_next,
        'awarded', v_award.student_id IS NOT NULL,
        'awarded_at', v_award.awarded_at,
        'stages', COALESCE(v_stages, '[]'::JSONB)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.vocab_tower_v2_summit_status_v1(UUID, UUID, SMALLINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vocab_tower_v2_summit_status_v1(UUID, UUID, SMALLINT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. 엔진 — 정상 휘장에 단계를 담는다
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.learning_engine_grant_summit_v1(
    p_student_id UUID,
    p_class_id UUID,
    p_content_type TEXT,
    p_level SMALLINT DEFAULT 1
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_required SMALLINT;
    v_max_level SMALLINT;
    v_passed INTEGER;
    v_level SMALLINT;
    v_changed BOOLEAN := FALSE;
BEGIN
    SELECT collection_count, summit_level_count INTO v_required, v_max_level
    FROM public.learning_content_types
    WHERE content_type = p_content_type AND is_active;
    IF v_required IS NULL THEN
        RETURN FALSE;
    END IF;

    v_level := GREATEST(1, LEAST(COALESCE(v_max_level, 1), COALESCE(p_level, 1)));

    -- 관문을 다 통과했는지는 여기서 한 번 더 본다. 시험만 잘 봐서 되는 것이 아니다.
    SELECT count(DISTINCT collection_key)::INTEGER INTO v_passed
    FROM public.learning_challenge_attempts
    WHERE student_id = p_student_id
      AND class_id = p_class_id
      AND content_type = p_content_type
      AND challenge_kind = 'collection'
      AND status = 'completed'
      AND passed IS TRUE;

    IF v_passed < v_required THEN
        RETURN FALSE;
    END IF;

    INSERT INTO public.learning_summit_awards
        (student_id, class_id, content_type, collection_count, summit_level)
    VALUES (p_student_id, p_class_id, p_content_type, v_required, v_level)
    ON CONFLICT (student_id, content_type) DO UPDATE
        -- 단계는 올라가기만 한다. 조건이 바뀌어도 이미 받은 별은 사라지지 않는다.
        SET summit_level = GREATEST(public.learning_summit_awards.summit_level, EXCLUDED.summit_level),
            updated_at = NOW()
        WHERE public.learning_summit_awards.summit_level < EXCLUDED.summit_level;
    GET DIAGNOSTICS v_changed = ROW_COUNT;
    RETURN v_changed;
END;
$$;

REVOKE ALL ON FUNCTION public.learning_engine_grant_summit_v1(UUID, UUID, TEXT, SMALLINT)
    FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. 정상 관문 시작 — 단계를 받고 앞 단계 통과를 확인한다
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_my_vocab_master_summit_v1(p_stage SMALLINT DEFAULT 1)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student public.students%ROWTYPE;
    v_class public.classes%ROWTYPE;
    v_grade SMALLINT;
    v_stage SMALLINT;
    v_key TEXT;
    v_status JSONB;
    v_attempt UUID;
    v_existing INTEGER;
    v_input_count SMALLINT;
    v_pass_input SMALLINT;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT s.* INTO v_student FROM public.students s
    WHERE s.auth_id = auth.uid() AND s.is_active IS DISTINCT FROM FALSE
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW()) LIMIT 1;
    IF v_student.id IS NULL THEN
        RAISE EXCEPTION '현재 로그인과 연결된 학생을 찾을 수 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT c.* INTO v_class FROM public.classes c
    WHERE c.id = v_student.class_id AND c.deleted_at IS NULL
      AND c.vocab_tower_enabled IS TRUE AND c.vocab_tower_content_version = 'v2';
    IF v_class.id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', '선생님이 지금은 어휘의 탑을 열어두지 않았어요.');
    END IF;

    v_grade := v_class.vocab_tower_grade::SMALLINT;
    v_status := public.vocab_tower_v2_summit_status_v1(v_student.id, v_student.class_id, v_grade);

    IF NOT (v_status->>'eligible')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE, 'error', '아직 어휘 마스터에 도전할 수 없어요.', 'summit', v_status);
    END IF;

    -- 단계를 안 주면 다음에 칠 단계로 본다. 화면이 굳이 계산하지 않아도 되게 한다.
    v_stage := COALESCE(p_stage, (v_status->>'next_stage')::SMALLINT);
    IF v_stage IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE, 'error', '이미 마지막 단계까지 통과했어요.', 'summit', v_status);
    END IF;
    IF v_stage NOT BETWEEN 1 AND (v_status->>'level_count')::SMALLINT THEN
        RAISE EXCEPTION '단계 번호가 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;
    -- 앞 단계를 건너뛸 수 없다. 화면이 잘못 보내도 서버가 막는다.
    IF v_stage > (v_status->>'level')::SMALLINT + 1 THEN
        RETURN jsonb_build_object(
            'success', FALSE, 'error', '앞 단계를 먼저 통과해야 해요.', 'summit', v_status);
    END IF;
    IF v_stage <= (v_status->>'level')::SMALLINT THEN
        RETURN jsonb_build_object(
            'success', FALSE, 'error', '이미 통과한 단계예요.', 'summit', v_status);
    END IF;

    v_input_count := CASE v_stage
        WHEN 1 THEN v_class.vocab_summit_input_count
        WHEN 2 THEN v_class.vocab_summit_input_count_2
        ELSE v_class.vocab_summit_input_count_3 END;
    v_pass_input := CASE v_stage
        WHEN 1 THEN v_class.vocab_summit_pass_input
        WHEN 2 THEN v_class.vocab_summit_pass_input_2
        ELSE v_class.vocab_summit_pass_input_3 END;

    v_key := public.vocab_tower_v2_summit_key(v_grade, v_stage);
    v_attempt := public.learning_engine_open_challenge_v1(
        v_student.id, v_student.class_id, 'vocab', v_key,
        v_class.vocab_summit_question_count, v_input_count, 'summit');

    SELECT count(*)::INTEGER INTO v_existing
    FROM public.vocab_master_questions WHERE attempt_id = v_attempt;

    IF v_existing = 0 THEN
        -- 10개 층 낱말을 층·순서대로 한 줄로 세운 뒤 문항 수만큼 구간으로 나눈다.
        -- 20문항이면 층마다 2문항이 되어 어느 층도 빠지지 않는다.
        INSERT INTO public.vocab_master_questions (
            attempt_id, student_id, class_id, sequence_number, item_key,
            question_type, is_input, prompt, options, accepted_answers, word, definition
        )
        SELECT
            v_attempt, v_student.id, v_student.class_id,
            ROW_NUMBER() OVER (ORDER BY random())::SMALLINT,
            chosen.item_key, chosen.question_type, chosen.is_input,
            chosen.question->>'prompt',
            CASE WHEN chosen.is_input THEN NULL ELSE chosen.question->'options' END,
            CASE
                WHEN chosen.is_input THEN COALESCE(
                    ARRAY(SELECT jsonb_array_elements_text(chosen.question->'acceptedAnswers')),
                    ARRAY[chosen.word])
                ELSE ARRAY(SELECT option->>'value'
                           FROM jsonb_array_elements(chosen.question->'options') option
                           WHERE (option->>'isCorrect')::BOOLEAN)
            END,
            chosen.word, chosen.definition
        FROM (
            SELECT
                picked.item_key, picked.word, picked.definition,
                role.is_input,
                CASE WHEN role.is_input
                     THEN (ARRAY['definitionInput', 'clozeInput'])[1 + (picked.band % 2)]
                     ELSE (ARRAY['meaningChoice', 'clozeChoice'])[1 + (picked.band % 2)]
                END AS question_type,
                picked.questions -> (CASE WHEN role.is_input
                     THEN (ARRAY['definitionInput', 'clozeInput'])[1 + (picked.band % 2)]
                     ELSE (ARRAY['meaningChoice', 'clozeChoice'])[1 + (picked.band % 2)]
                END) AS question
            FROM (
                SELECT ranked.item_key, ranked.word, ranked.definition, ranked.questions, ranked.band
                FROM (
                    SELECT banded.*,
                           ROW_NUMBER() OVER (PARTITION BY banded.band ORDER BY random()) AS pick
                    FROM (
                        SELECT
                            item.item_key, item.word, item.definition, item.questions,
                            NTILE(v_class.vocab_summit_question_count)
                                OVER (ORDER BY deck.deck_number, item.item_order, item.item_key) AS band
                        FROM public.vocab_tower_v2_review_items item
                        JOIN public.vocab_tower_v2_review_decks deck ON deck.deck_id = item.deck_id
                        WHERE deck.grade = v_grade
                          AND deck.review_status = 'locked'
                          AND item.questions IS NOT NULL
                    ) banded
                ) ranked
                WHERE ranked.pick = 1
            ) picked
            -- 어느 구간을 직접입력으로 쓸지 무작위로 정한다(뒤쪽 층 편중 제거).
            JOIN (
                SELECT band,
                       (ROW_NUMBER() OVER (ORDER BY random()) <= v_input_count) AS is_input
                FROM generate_series(1, v_class.vocab_summit_question_count) band
            ) role ON role.band = picked.band
        ) chosen
        WHERE chosen.question IS NOT NULL;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'version', 2,
        'challenge_kind', 'summit',
        'stage', v_stage,
        'level_count', (v_status->>'level_count')::SMALLINT,
        'attempt_id', v_attempt,
        'question_count', (SELECT count(*) FROM public.vocab_master_questions WHERE attempt_id = v_attempt),
        'input_count', v_input_count,
        'seconds_per_question', v_class.vocab_master_seconds_per_question,
        'pass_correct', v_class.vocab_summit_pass_correct,
        'pass_input', v_pass_input
    );
END;
$$;

REVOKE ALL ON FUNCTION public.start_my_vocab_master_summit_v1(SMALLINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_my_vocab_master_summit_v1(SMALLINT) TO authenticated, service_role;
-- 어제 만든 인자 없는 판은 더 쓰지 않는다.
DROP FUNCTION IF EXISTS public.start_my_vocab_master_summit_v1();

-- ---------------------------------------------------------------------------
-- 7. 정상 관문 종료 — 통과한 단계까지 별을 올린다
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finish_my_vocab_master_summit_v1(
    p_attempt_id UUID,
    p_completed BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student public.students%ROWTYPE;
    v_class public.classes%ROWTYPE;
    v_attempt public.learning_challenge_attempts%ROWTYPE;
    v_stage SMALLINT;
    v_answered SMALLINT; v_correct SMALLINT; v_input_correct SMALLINT;
    v_pass_input SMALLINT;
    v_input_count SMALLINT;
    v_result JSONB;
    v_awarded BOOLEAN := FALSE;
    v_wrong JSONB;
    v_summit JSONB;
BEGIN
    SELECT s.* INTO v_student FROM public.students s
    WHERE s.auth_id = auth.uid() AND s.is_active IS DISTINCT FROM FALSE LIMIT 1;
    IF v_student.id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    SELECT c.* INTO v_class FROM public.classes c WHERE c.id = v_student.class_id;

    SELECT a.* INTO v_attempt FROM public.learning_challenge_attempts a
    WHERE a.id = p_attempt_id AND a.student_id = v_student.id;
    IF v_attempt.id IS NULL THEN
        RAISE EXCEPTION '도전을 찾을 수 없습니다.' USING ERRCODE = 'P0002';
    END IF;

    -- 어느 단계였는지는 묶음 키 끝자리로 안다(`g4:summit2`).
    v_stage := GREATEST(1, LEAST(3,
        COALESCE(NULLIF(right(v_attempt.collection_key, 1), '')::SMALLINT, 1)));
    v_input_count := CASE v_stage
        WHEN 1 THEN v_class.vocab_summit_input_count
        WHEN 2 THEN v_class.vocab_summit_input_count_2
        ELSE v_class.vocab_summit_input_count_3 END;
    v_pass_input := CASE v_stage
        WHEN 1 THEN v_class.vocab_summit_pass_input
        WHEN 2 THEN v_class.vocab_summit_pass_input_2
        ELSE v_class.vocab_summit_pass_input_3 END;

    SELECT count(*) FILTER (WHERE answered_at IS NOT NULL)::SMALLINT,
           count(*) FILTER (WHERE is_correct)::SMALLINT,
           count(*) FILTER (WHERE is_correct AND is_input)::SMALLINT
      INTO v_answered, v_correct, v_input_correct
    FROM public.vocab_master_questions
    WHERE attempt_id = p_attempt_id AND student_id = v_student.id;

    v_result := public.learning_engine_close_challenge_v1(
        p_attempt_id, v_answered, v_correct, v_input_correct, p_completed,
        (v_class.vocab_summit_pass_correct::NUMERIC / NULLIF(v_class.vocab_summit_question_count, 0)),
        (v_pass_input::NUMERIC / NULLIF(v_input_count, 0))
    );

    IF (v_result->>'passed')::BOOLEAN THEN
        v_awarded := public.learning_engine_grant_summit_v1(
            v_student.id, v_student.class_id, 'vocab', v_stage);
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('word', word, 'definition', definition)
                              ORDER BY sequence_number), '[]'::JSONB)
      INTO v_wrong
    FROM public.vocab_master_questions
    WHERE attempt_id = p_attempt_id AND student_id = v_student.id AND is_correct IS NOT TRUE;

    v_summit := public.vocab_tower_v2_summit_status_v1(
        v_student.id, v_student.class_id, v_class.vocab_tower_grade::SMALLINT);

    RETURN v_result || jsonb_build_object(
        'challenge_kind', 'summit',
        'stage', v_stage,
        'level_count', (v_summit->>'level_count')::SMALLINT,
        'correct_count', v_correct,
        'question_count', v_class.vocab_summit_question_count,
        'input_correct_count', v_input_correct,
        'input_question_count', v_input_count,
        'pass_correct', v_class.vocab_summit_pass_correct,
        'pass_input', v_pass_input,
        -- 이번에 별이 하나 늘었는지. 재도전으로 같은 단계를 또 통과하면 FALSE 다.
        'summit_reached', v_awarded,
        'summit', v_summit,
        'wrong_items', v_wrong
    );
END;
$$;

REVOKE ALL ON FUNCTION public.finish_my_vocab_master_summit_v1(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_my_vocab_master_summit_v1(UUID, BOOLEAN) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. 성취 요약 — 휘장에 단계를 실어 보낸다
-- ---------------------------------------------------------------------------
-- 별 개수는 완성된 성취라 친구에게도 보인다(진행 중인 숫자만 본인·교사 전용이다).
CREATE OR REPLACE FUNCTION public.learning_engine_mastery_summary_v1(
    p_student_id UUID,
    p_class_id UUID,
    p_include_progress BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_items JSONB;
BEGIN
    SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'content_type'), '[]'::JSONB)
    INTO v_items
    FROM (
        SELECT jsonb_strip_nulls(jsonb_build_object(
            'content_type', content.content_type,
            'display_name', content.display_name,
            'emblem_icon', content.emblem_icon,
            'collection_label', content.collection_label,
            'summit_label', content.summit_label,
            'master_title', content.master_title,
            'collection_count', content.collection_count,
            'summit_reached', award.student_id IS NOT NULL,
            'summit_awarded_at', award.awarded_at,
            'summit_level', award.summit_level,
            'summit_level_count', content.summit_level_count,
            'all_collections_cleared', passed.passed_count >= content.collection_count,
            'passed_count', CASE WHEN p_include_progress THEN passed.passed_count ELSE NULL END
        )) AS entry
        FROM public.learning_content_types content
        LEFT JOIN LATERAL (
            SELECT count(DISTINCT attempt.collection_key)::INTEGER AS passed_count
            FROM public.learning_challenge_attempts attempt
            WHERE attempt.student_id = p_student_id
              AND attempt.class_id = p_class_id
              AND attempt.content_type = content.content_type
              AND attempt.challenge_kind = 'collection'
              AND attempt.status = 'completed'
              AND attempt.passed IS TRUE
        ) passed ON TRUE
        LEFT JOIN public.learning_summit_awards award
          ON award.student_id = p_student_id
         AND award.content_type = content.content_type
        WHERE content.is_active
    ) rows;

    RETURN jsonb_build_object('version', 2, 'contents', v_items);
END;
$$;

REVOKE ALL ON FUNCTION public.learning_engine_mastery_summary_v1(UUID, UUID, BOOLEAN)
    FROM PUBLIC, anon, authenticated;

COMMIT;
