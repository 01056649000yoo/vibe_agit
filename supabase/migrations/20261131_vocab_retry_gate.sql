-- 어휘 어댑터를 재도전 관문에 잇는다(엔진 쪽은 20261130).
--
--   · 종료: 틀린 낱말을 `learning_engine_record_answer_v1` 로 넘겨 연습에서 틀린 것과 똑같이 내리고,
--           그 목록을 도전 기록의 보충 대상으로 남긴다.
--   · 시작: 보충이 끝나지 않았으면 시험을 열지 않고 몇 개가 남았는지 알려 준다.
--
-- 오답 낱말이 **실제로 속한 층**을 찾아 진도를 고친다. 정상 관문의 오답은 열 개 층에 흩어져 있어
-- 시험의 묶음 키(`g4:summit1`)를 그대로 쓰면 엉뚱한 곳에 기록된다.

BEGIN;

CREATE OR REPLACE FUNCTION public.finish_my_vocab_tower_master_v1(p_attempt_id uuid, p_completed boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_student public.students%ROWTYPE;
    v_class public.classes%ROWTYPE;
    v_answered SMALLINT; v_correct SMALLINT; v_input_correct SMALLINT;
    v_result JSONB;
    v_summit JSONB;
    v_wrong JSONB;
    v_wrong_keys TEXT[];
BEGIN
    SELECT s.* INTO v_student FROM public.students s
    WHERE s.auth_id = auth.uid() AND s.is_active IS DISTINCT FROM FALSE LIMIT 1;
    IF v_student.id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    SELECT c.* INTO v_class FROM public.classes c WHERE c.id = v_student.class_id;

    SELECT count(*) FILTER (WHERE answered_at IS NOT NULL)::SMALLINT,
           count(*) FILTER (WHERE is_correct)::SMALLINT,
           count(*) FILTER (WHERE is_correct AND is_input)::SMALLINT
      INTO v_answered, v_correct, v_input_correct
    FROM public.vocab_master_questions
    WHERE attempt_id = p_attempt_id AND student_id = v_student.id;


    -- 시험에서 틀린 낱말을 **연습에서 틀린 것과 똑같이** 다룬다. 새 규칙을 만들지 않고
    -- 엔진의 기존 판정을 그대로 써서 `다시 볼 낱말` 로 내리고 연속 성공을 0으로 되돌린다.
    -- 맞힌 낱말은 반영하지 않는다 — 시험이 익힘을 만들면 시험과 연습의 경계가 무너진다.
    SELECT COALESCE(array_agg(DISTINCT q.item_key), ARRAY[]::TEXT[]) INTO v_wrong_keys
    FROM public.vocab_master_questions q
    WHERE q.attempt_id = p_attempt_id AND q.student_id = v_student.id AND q.is_correct IS NOT TRUE;

    IF p_completed AND cardinality(v_wrong_keys) > 0 THEN
        PERFORM public.learning_engine_record_answer_v1(
            v_student.id, v_student.class_id, 'vocab',
            -- 오답 낱말이 실제로 속한 층을 찾아 넣는다(정상 관문은 열 개 층에 흩어져 있다).
            public.vocab_tower_v2_collection_key(v_class.vocab_tower_grade::SMALLINT, deck.deck_number::SMALLINT),
            item.item_key, 'meaningChoice', FALSE, FALSE)
        FROM public.vocab_tower_v2_review_items item
        JOIN public.vocab_tower_v2_review_decks deck ON deck.deck_id = item.deck_id
        WHERE deck.grade = v_class.vocab_tower_grade
          AND item.item_key = ANY(v_wrong_keys);
    END IF;

    v_result := public.learning_engine_close_challenge_v1(
        p_attempt_id, v_answered, v_correct, v_input_correct, p_completed,
        (v_class.vocab_master_pass_correct::NUMERIC / NULLIF(v_class.vocab_master_question_count, 0)),
        (v_class.vocab_master_pass_input::NUMERIC / NULLIF(v_class.vocab_master_input_count, 0)),
        v_wrong_keys
    );

    v_summit := public.vocab_tower_v2_summit_status_v1(
        v_student.id, v_student.class_id, v_class.vocab_tower_grade::SMALLINT);

    SELECT COALESCE(jsonb_agg(jsonb_build_object('word', word, 'definition', definition)
                              ORDER BY sequence_number), '[]'::JSONB)
      INTO v_wrong
    FROM public.vocab_master_questions
    WHERE attempt_id = p_attempt_id AND student_id = v_student.id AND is_correct IS NOT TRUE;

    RETURN v_result || jsonb_build_object(
        'challenge_kind', 'collection',
        'correct_count', v_correct,
        'question_count', v_class.vocab_master_question_count,
        'input_correct_count', v_input_correct,
        'input_question_count', v_class.vocab_master_input_count,
        -- 이번 합격으로 정상 관문이 막 열렸는지 결과 화면이 알아야 축하 문구를 띄운다.
        'summit_unlocked', (v_result->>'passed')::BOOLEAN AND (v_summit->>'eligible')::BOOLEAN
                           AND NOT (v_summit->>'awarded')::BOOLEAN,
        'summit', v_summit,
        'wrong_items', v_wrong
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.finish_my_vocab_master_summit_v1(p_attempt_id uuid, p_completed boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    v_wrong_keys TEXT[];
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


    -- 시험에서 틀린 낱말을 **연습에서 틀린 것과 똑같이** 다룬다. 새 규칙을 만들지 않고
    -- 엔진의 기존 판정을 그대로 써서 `다시 볼 낱말` 로 내리고 연속 성공을 0으로 되돌린다.
    -- 맞힌 낱말은 반영하지 않는다 — 시험이 익힘을 만들면 시험과 연습의 경계가 무너진다.
    SELECT COALESCE(array_agg(DISTINCT q.item_key), ARRAY[]::TEXT[]) INTO v_wrong_keys
    FROM public.vocab_master_questions q
    WHERE q.attempt_id = p_attempt_id AND q.student_id = v_student.id AND q.is_correct IS NOT TRUE;

    IF p_completed AND cardinality(v_wrong_keys) > 0 THEN
        PERFORM public.learning_engine_record_answer_v1(
            v_student.id, v_student.class_id, 'vocab',
            -- 오답 낱말이 실제로 속한 층을 찾아 넣는다(정상 관문은 열 개 층에 흩어져 있다).
            public.vocab_tower_v2_collection_key(v_class.vocab_tower_grade::SMALLINT, deck.deck_number::SMALLINT),
            item.item_key, 'meaningChoice', FALSE, FALSE)
        FROM public.vocab_tower_v2_review_items item
        JOIN public.vocab_tower_v2_review_decks deck ON deck.deck_id = item.deck_id
        WHERE deck.grade = v_class.vocab_tower_grade
          AND item.item_key = ANY(v_wrong_keys);
    END IF;

    v_result := public.learning_engine_close_challenge_v1(
        p_attempt_id, v_answered, v_correct, v_input_correct, p_completed,
        (v_class.vocab_summit_pass_correct::NUMERIC / NULLIF(v_class.vocab_summit_question_count, 0)),
        (v_pass_input::NUMERIC / NULLIF(v_input_count, 0)),
        v_wrong_keys
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
$function$;

CREATE OR REPLACE FUNCTION public.start_my_vocab_tower_master_v1(p_deck_number smallint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_student public.students%ROWTYPE;
    v_class public.classes%ROWTYPE;
    v_key TEXT;
    v_item_count INTEGER;
    v_eligibility JSONB;
    v_retry JSONB;
    v_attempt UUID;
    v_existing INTEGER;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    IF p_deck_number IS NULL OR p_deck_number NOT BETWEEN 1 AND 10 THEN
        RAISE EXCEPTION '층 번호가 올바르지 않습니다.' USING ERRCODE = '22023';
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

    v_key := public.vocab_tower_v2_collection_key(v_class.vocab_tower_grade::SMALLINT, p_deck_number);

    SELECT count(*)::INTEGER INTO v_item_count
    FROM public.vocab_tower_v2_review_items item
    JOIN public.vocab_tower_v2_review_decks deck ON deck.deck_id = item.deck_id
    WHERE deck.grade = v_class.vocab_tower_grade AND deck.deck_number = p_deck_number;

    v_eligibility := public.learning_engine_challenge_eligibility_v1(
        v_student.id, v_student.class_id, 'vocab', v_key, v_item_count,
        v_class.vocab_master_required_mastered_ratio);

    IF NOT (v_eligibility->>'eligible')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE, 'error', '아직 덱마스터에 도전할 수 없어요.', 'eligibility', v_eligibility);
    END IF;

    -- 지난 시험에서 틀린 낱말을 다시 익혀야 또 칠 수 있다(보충 수련).
    v_retry := public.learning_engine_retry_gate_v1(
        v_student.id, v_student.class_id, 'vocab', v_key, 'collection');
    IF (v_retry->>'blocked')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', format('지난 시험에서 틀린 낱말 %s개를 다시 익혀야 해요.', v_retry->>'remaining_count'),
            'retry_gate', v_retry);
    END IF;

    v_attempt := public.learning_engine_open_challenge_v1(
        v_student.id, v_student.class_id, 'vocab', v_key,
        v_class.vocab_master_question_count, v_class.vocab_master_input_count);

    -- 이미 문항이 만들어져 있으면 다시 뽑지 않는다(새로고침·재접속 시 같은 시험을 이어서 본다).
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
                    -- NTILE 결과를 같은 층에서 PARTITION BY 로 다시 쓰면 중첩 윈도 함수가 되어 거절된다.
                    -- 구간 계산과 구간별 뽑기를 단계로 나눈다.
                    SELECT banded.*,
                           ROW_NUMBER() OVER (PARTITION BY banded.band ORDER BY random()) AS pick
                    FROM (
                        SELECT
                            item.item_key, item.word, item.definition, item.questions,
                            NTILE(v_class.vocab_master_question_count)
                                OVER (ORDER BY item.item_order, item.item_key) AS band
                        FROM public.vocab_tower_v2_review_items item
                        JOIN public.vocab_tower_v2_review_decks deck ON deck.deck_id = item.deck_id
                        WHERE deck.grade = v_class.vocab_tower_grade
                          AND deck.deck_number = p_deck_number
                          AND item.questions IS NOT NULL
                    ) banded
                ) ranked
                WHERE ranked.pick = 1
            ) picked
            -- 어느 구간을 직접입력으로 쓸지 무작위로 정한다(뒤쪽 낱말 편중 제거).
            JOIN (
                SELECT band,
                       (ROW_NUMBER() OVER (ORDER BY random()) <= v_class.vocab_master_input_count) AS is_input
                FROM generate_series(1, v_class.vocab_master_question_count) band
            ) role ON role.band = picked.band
        ) chosen
        WHERE chosen.question IS NOT NULL;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'version', 1,
        'challenge_kind', 'collection',
        'attempt_id', v_attempt,
        'deck_number', p_deck_number,
        'question_count', (SELECT count(*) FROM public.vocab_master_questions WHERE attempt_id = v_attempt),
        'seconds_per_question', v_class.vocab_master_seconds_per_question,
        'pass_correct', v_class.vocab_master_pass_correct,
        'pass_input', v_class.vocab_master_pass_input
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.start_my_vocab_master_summit_v1(p_stage smallint DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    -- 지난 시험에서 틀린 낱말을 다시 익혀야 또 칠 수 있다. 정상 관문의 오답은 열 개 층에
    -- 흩어져 있어 자격(덱마스터 10개)만으로는 절대 잠기지 않으므로 이 관문이 유일한 제동이다.
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
$function$;

COMMIT;
