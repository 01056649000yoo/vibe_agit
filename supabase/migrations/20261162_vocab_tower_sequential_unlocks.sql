-- 어휘의 탑 진행 순서를 하나로 맞춘다.
--
-- 층:
--   · 1층은 항상 열린다.
--   · N층은 1~N-1층 덱마스터를 빠짐없이 통과해야 열린다.
--   · 규칙 적용 전에 시작한 연습·덱마스터는 학생이 갇히지 않도록 이어서 할 수 있다.
--
-- 정상 단계:
--   · 영구 휘장 단계와 실제 합격 기록 중 더 높은 값을 인정한다. 받은 별이 내려가지 않는다는
--     기존 계약을 지도 상태에도 적용해, 2단계 기록이 있는데 1단계가 미완료로 보이는 틈을 막는다.
--   · 통과한 이전 단계는 다시 도전할 수 있지만 다음 단계를 건너뛸 수는 없다.

BEGIN;

-- 첫 번째로 덱마스터가 비어 있는 층까지 연습할 수 있다.
-- 예: 통과 없음 → 1층, 1층 통과 → 2층, 1·2층 통과 → 3층.
CREATE OR REPLACE FUNCTION public.vocab_tower_v2_highest_unlocked_deck_v1(
    p_student_id UUID,
    p_class_id UUID,
    p_grade SMALLINT
)
RETURNS SMALLINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT COALESCE(MIN(candidate.deck_number)::SMALLINT, 10::SMALLINT)
    FROM generate_series(1, 9) AS candidate(deck_number)
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.learning_challenge_attempts attempt
        WHERE attempt.student_id = p_student_id
          AND attempt.class_id = p_class_id
          AND attempt.content_type = 'vocab'
          AND attempt.challenge_kind = 'collection'
          AND attempt.status = 'completed'
          AND attempt.passed IS TRUE
          AND attempt.collection_key = public.vocab_tower_v2_collection_key(
              p_grade, candidate.deck_number::SMALLINT)
    )
$$;

REVOKE ALL ON FUNCTION public.vocab_tower_v2_highest_unlocked_deck_v1(UUID, UUID, SMALLINT)
    FROM PUBLIC, anon, authenticated, service_role;

-- 이미 검증된 본문은 내부 기본 함수로 보존하고, 같은 공개 RPC 이름에 진행 규칙만 한 겹 둔다.
-- 이 방식이면 보상·복습·문항 출제 로직을 복사하지 않아 이후 두 사본이 어긋나지 않는다.
DO $$
BEGIN
    IF to_regprocedure('public.get_my_vocab_tower_v2_overview_base_v1()') IS NULL THEN
        ALTER FUNCTION public.get_my_vocab_tower_v2_overview_v1()
            RENAME TO get_my_vocab_tower_v2_overview_base_v1;
    END IF;
    IF to_regprocedure('public.start_my_vocab_tower_v2_practice_base_v1(smallint)') IS NULL THEN
        ALTER FUNCTION public.start_my_vocab_tower_v2_practice_v1(SMALLINT)
            RENAME TO start_my_vocab_tower_v2_practice_base_v1;
    END IF;
    IF to_regprocedure('public.start_my_vocab_tower_master_base_v1(smallint)') IS NULL THEN
        ALTER FUNCTION public.start_my_vocab_tower_master_v1(SMALLINT)
            RENAME TO start_my_vocab_tower_master_base_v1;
    END IF;
    IF to_regprocedure('public.vocab_tower_v2_summit_status_base_v1(uuid,uuid,smallint)') IS NULL THEN
        ALTER FUNCTION public.vocab_tower_v2_summit_status_v1(UUID, UUID, SMALLINT)
            RENAME TO vocab_tower_v2_summit_status_base_v1;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_vocab_tower_v2_overview_base_v1()
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.start_my_vocab_tower_v2_practice_base_v1(SMALLINT)
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.start_my_vocab_tower_master_base_v1(SMALLINT)
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.vocab_tower_v2_summit_status_base_v1(UUID, UUID, SMALLINT)
    FROM PUBLIC, anon, authenticated, service_role;

-- 지도 응답에 서버가 계산한 층별 잠금 상태를 붙인다.
CREATE OR REPLACE FUNCTION public.get_my_vocab_tower_v2_overview_v1()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_result JSONB;
    v_decks JSONB;
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID := public.auth_user_class_id();
    v_grade SMALLINT;
    v_highest SMALLINT;
    v_active_deck SMALLINT;
    v_open_master_keys JSONB;
BEGIN
    v_result := public.get_my_vocab_tower_v2_overview_base_v1();
    IF NOT COALESCE((v_result->>'success')::BOOLEAN, FALSE) THEN
        RETURN v_result;
    END IF;

    v_grade := (v_result->>'grade')::SMALLINT;
    v_highest := public.vocab_tower_v2_highest_unlocked_deck_v1(
        v_student_id, v_class_id, v_grade);
    v_active_deck := NULLIF(v_result->'active_run'->>'deck_number', '')::SMALLINT;

    -- 규칙 도입 전에 시작한 덱마스터도 지도에서 다시 열 수 있어야 한다.
    SELECT COALESCE(jsonb_object_agg(attempt.collection_key, TRUE), '{}'::JSONB)
      INTO v_open_master_keys
    FROM public.learning_challenge_attempts attempt
    WHERE attempt.student_id = v_student_id
      AND attempt.class_id = v_class_id
      AND attempt.content_type = 'vocab'
      AND attempt.challenge_kind = 'collection'
      AND attempt.status = 'in_progress';

    SELECT COALESCE(jsonb_agg(
        entry.value || jsonb_build_object(
            'unlocked',
                (entry.value->>'deck_number')::SMALLINT <= v_highest
                OR (entry.value->>'deck_number')::SMALLINT = v_active_deck
                OR v_open_master_keys ? public.vocab_tower_v2_collection_key(
                    v_grade, (entry.value->>'deck_number')::SMALLINT),
            'unlock_required_deck', CASE
                WHEN (entry.value->>'deck_number')::SMALLINT <= v_highest
                  OR (entry.value->>'deck_number')::SMALLINT = v_active_deck
                  OR v_open_master_keys ? public.vocab_tower_v2_collection_key(
                      v_grade, (entry.value->>'deck_number')::SMALLINT)
                    THEN NULL
                ELSE v_highest
            END,
            'unlock_grandfathered',
                (entry.value->>'deck_number')::SMALLINT > v_highest
                AND (
                    (entry.value->>'deck_number')::SMALLINT = v_active_deck
                    OR v_open_master_keys ? public.vocab_tower_v2_collection_key(
                        v_grade, (entry.value->>'deck_number')::SMALLINT)
                )
        ) ORDER BY entry.ordinality
    ), '[]'::JSONB)
      INTO v_decks
    FROM jsonb_array_elements(COALESCE(v_result->'decks', '[]'::JSONB))
         WITH ORDINALITY AS entry(value, ordinality);

    RETURN jsonb_set(v_result, '{decks}', v_decks, TRUE)
        || jsonb_build_object(
            'floor_unlock_rule_version', 1,
            'highest_unlocked_deck', v_highest
        );
END;
$$;

-- 개인 연습은 화면을 우회해 호출해도 잠긴 층에서 새로 시작할 수 없다.
CREATE OR REPLACE FUNCTION public.start_my_vocab_tower_v2_practice_v1(p_deck_number SMALLINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID := public.auth_user_class_id();
    v_grade SMALLINT;
    v_highest SMALLINT;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL OR v_class_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    IF p_deck_number IS NULL OR p_deck_number NOT BETWEEN 1 AND 10 THEN
        RAISE EXCEPTION '연습할 층은 1~10층이어야 합니다.' USING ERRCODE = '22023';
    END IF;

    -- 새 규칙 전에 시작한 판은 같은 RPC로 끝까지 이어 간다.
    IF EXISTS (
        SELECT 1 FROM public.vocab_tower_runs run
        WHERE run.student_id = v_student_id
          AND run.class_id = v_class_id
          AND run.status = 'active'
          AND run.content_version = 'v2'
          AND run.v2_deck_number = p_deck_number
    ) THEN
        RETURN public.start_my_vocab_tower_v2_practice_base_v1(p_deck_number);
    END IF;

    SELECT LEAST(6, GREATEST(3, COALESCE(class.vocab_tower_grade, 3)))::SMALLINT
      INTO v_grade
    FROM public.classes class
    WHERE class.id = v_class_id
      AND class.vocab_tower_content_version = 'v2'
      AND class.deleted_at IS NULL;
    IF NOT FOUND THEN
        RETURN public.start_my_vocab_tower_v2_practice_base_v1(p_deck_number);
    END IF;

    v_highest := public.vocab_tower_v2_highest_unlocked_deck_v1(
        v_student_id, v_class_id, v_grade);
    IF p_deck_number > v_highest THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'locked', TRUE,
            'required_deck_number', v_highest,
            'highest_unlocked_deck', v_highest,
            'error', format('%s층 덱마스터를 먼저 통과해야 다음 층이 열려요.', v_highest)
        );
    END IF;

    RETURN public.start_my_vocab_tower_v2_practice_base_v1(p_deck_number);
END;
$$;

-- 덱마스터도 같은 층 잠금을 따른다. 과거에 이미 열어 둔 시험만 이어서 허용한다.
CREATE OR REPLACE FUNCTION public.start_my_vocab_tower_master_v1(p_deck_number SMALLINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_student public.students%ROWTYPE;
    v_class public.classes%ROWTYPE;
    v_key TEXT;
    v_highest SMALLINT;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    IF p_deck_number IS NULL OR p_deck_number NOT BETWEEN 1 AND 10 THEN
        RAISE EXCEPTION '층 번호가 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT student.* INTO v_student
    FROM public.students student
    WHERE student.auth_id = auth.uid()
      AND student.is_active IS DISTINCT FROM FALSE
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
    LIMIT 1;
    IF v_student.id IS NULL THEN
        RAISE EXCEPTION '현재 로그인과 연결된 학생을 찾을 수 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT class.* INTO v_class
    FROM public.classes class
    WHERE class.id = v_student.class_id
      AND class.deleted_at IS NULL
      AND class.vocab_tower_enabled IS TRUE
      AND class.vocab_tower_content_version = 'v2';
    IF v_class.id IS NULL THEN
        RETURN public.start_my_vocab_tower_master_base_v1(p_deck_number);
    END IF;

    v_key := public.vocab_tower_v2_collection_key(
        v_class.vocab_tower_grade::SMALLINT, p_deck_number);
    IF EXISTS (
        SELECT 1 FROM public.learning_challenge_attempts attempt
        WHERE attempt.student_id = v_student.id
          AND attempt.class_id = v_student.class_id
          AND attempt.content_type = 'vocab'
          AND attempt.collection_key = v_key
          AND attempt.challenge_kind = 'collection'
          AND attempt.status = 'in_progress'
    ) THEN
        RETURN public.start_my_vocab_tower_master_base_v1(p_deck_number);
    END IF;

    v_highest := public.vocab_tower_v2_highest_unlocked_deck_v1(
        v_student.id, v_student.class_id, v_class.vocab_tower_grade::SMALLINT);
    IF p_deck_number > v_highest THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'locked', TRUE,
            'required_deck_number', v_highest,
            'highest_unlocked_deck', v_highest,
            'error', format('%s층 덱마스터를 먼저 통과해야 다음 층이 열려요.', v_highest)
        );
    END IF;

    RETURN public.start_my_vocab_tower_master_base_v1(p_deck_number);
END;
$$;

-- 시험 이력이 일부 정리되거나 학급이 바뀌어도 영구 휘장 단계는 내려가지 않는다.
-- 높은 단계 합격 기록 하나가 남아 있으면 그보다 앞선 단계도 논리적으로 완료된 것으로 복구한다.
CREATE OR REPLACE FUNCTION public.vocab_tower_v2_summit_status_v1(
    p_student_id UUID,
    p_class_id UUID,
    p_grade SMALLINT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_result JSONB;
    v_stages JSONB;
    v_level_count SMALLINT;
    v_base_level SMALLINT;
    v_recorded_level SMALLINT := 0;
    v_award_level SMALLINT := 0;
    v_level SMALLINT;
    v_eligible BOOLEAN;
BEGIN
    v_result := public.vocab_tower_v2_summit_status_base_v1(
        p_student_id, p_class_id, p_grade);
    v_level_count := COALESCE((v_result->>'level_count')::SMALLINT, 3);
    v_base_level := COALESCE((v_result->>'level')::SMALLINT, 0);
    v_eligible := COALESCE((v_result->>'eligible')::BOOLEAN, FALSE);

    SELECT COALESCE(MAX((stage->>'stage')::SMALLINT), 0)
      INTO v_recorded_level
    FROM jsonb_array_elements(COALESCE(v_result->'stages', '[]'::JSONB)) stage
    WHERE COALESCE((stage->>'passed')::BOOLEAN, FALSE);

    SELECT COALESCE(award.summit_level, 0)
      INTO v_award_level
    FROM public.learning_summit_awards award
    WHERE award.student_id = p_student_id
      AND award.content_type = 'vocab';

    v_level := LEAST(v_level_count, GREATEST(
        v_base_level, COALESCE(v_recorded_level, 0), COALESCE(v_award_level, 0)));

    SELECT COALESCE(jsonb_agg(
        stage.value || jsonb_build_object(
            'passed', (stage.value->>'stage')::SMALLINT <= v_level,
            'recovered',
                (stage.value->>'stage')::SMALLINT <= v_level
                AND NOT COALESCE((stage.value->>'passed')::BOOLEAN, FALSE),
            'unlocked',
                v_eligible
                AND (stage.value->>'stage')::SMALLINT <= LEAST(v_level + 1, v_level_count)
        ) ORDER BY stage.ordinality
    ), '[]'::JSONB)
      INTO v_stages
    FROM jsonb_array_elements(COALESCE(v_result->'stages', '[]'::JSONB))
         WITH ORDINALITY AS stage(value, ordinality);

    RETURN v_result || jsonb_build_object(
        'version', 3,
        'level', v_level,
        'next_stage', CASE WHEN v_level >= v_level_count THEN NULL ELSE v_level + 1 END,
        'awarded', COALESCE((v_result->>'awarded')::BOOLEAN, FALSE) OR v_level > 0,
        'level_recovered', v_level > v_base_level,
        'stages', v_stages
    );
END;
$$;

-- 정상 관문은 통과한 단계의 재도전을 허용한다. 별은 grant 함수의 GREATEST 계약으로 내려가지 않고,
-- 다음 단계 건너뛰기와 단계별 보충 수련 제한은 그대로 유지한다.
CREATE OR REPLACE FUNCTION public.start_my_vocab_master_summit_v1(p_stage SMALLINT DEFAULT NULL)
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
    v_retry JSONB;
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

    -- 단계를 생략하면 아직 통과하지 않은 다음 단계, 번호를 주면 통과한 이전 단계의 재도전도 허용한다.
    v_stage := COALESCE(p_stage, (v_status->>'next_stage')::SMALLINT);
    IF v_stage IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE, 'error', '다시 도전할 단계를 골라 주세요.', 'summit', v_status);
    END IF;
    IF v_stage NOT BETWEEN 1 AND (v_status->>'level_count')::SMALLINT THEN
        RAISE EXCEPTION '단계 번호가 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;
    IF v_stage > (v_status->>'level')::SMALLINT + 1 THEN
        RETURN jsonb_build_object(
            'success', FALSE, 'error', '앞 단계를 먼저 통과해야 해요.', 'summit', v_status);
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
    v_retry := public.learning_engine_retry_gate_v1(
        v_student.id, v_student.class_id, 'vocab', v_key, 'summit');
    IF (v_retry->>'blocked')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', format('지난 시험에서 틀린 낱말 %s개를 다시 익혀야 해요.', v_retry->>'remaining_count'),
            'retry_gate', v_retry);
    END IF;
    v_attempt := public.learning_engine_open_challenge_v1(
        v_student.id, v_student.class_id, 'vocab', v_key,
        v_class.vocab_summit_question_count, v_input_count, 'summit');

    SELECT count(*)::INTEGER INTO v_existing
    FROM public.vocab_master_questions WHERE attempt_id = v_attempt;

    IF v_existing = 0 THEN
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
        'version', 3,
        'challenge_kind', 'summit',
        'stage', v_stage,
        'replay', v_stage <= (v_status->>'level')::SMALLINT,
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

REVOKE ALL ON FUNCTION public.get_my_vocab_tower_v2_overview_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_vocab_tower_v2_overview_v1() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.start_my_vocab_tower_v2_practice_v1(SMALLINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_my_vocab_tower_v2_practice_v1(SMALLINT) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.start_my_vocab_tower_master_v1(SMALLINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_my_vocab_tower_master_v1(SMALLINT) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.vocab_tower_v2_summit_status_v1(UUID, UUID, SMALLINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vocab_tower_v2_summit_status_v1(UUID, UUID, SMALLINT) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.start_my_vocab_master_summit_v1(SMALLINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_my_vocab_master_summit_v1(SMALLINT) TO authenticated, service_role;

COMMIT;
