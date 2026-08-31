-- 어휘의 탑 V2 개인 연습이 1층부터 10층까지 점진적으로 어려워지게 한다.
--
-- 정책 2 제한 공개 학급의 새 판에만 적용한다.
--   1) 층별 12문항의 뜻·문맥·쓰임 구별·직접 입력 구성을 한 함수에서 정한다.
--   2) 1~2층은 뜻·문맥 선택형 보기를 3개로 줄이고, 3층부터 원래 4개를 모두 쓴다.
--      쓰임 구별 원문항은 검수 데이터 자체가 2보기라 그대로 유지한다.
--   3) 운영 낱말 난이도가 실제로 1~3까지만 있으므로 1~2층 1·2, 3~4층 2·3,
--      5~10층 3을 우선하되 같은 학습 초점의 후보가 없으면 기존 후보를 그대로 쓴다.
--   4) 보충 수련은 방금 틀린 유형을 피하는 기존 선택형 규칙을 유지한다.
--
-- 기존 진행 판(practice_policy_version=1), 일반 학급, 덱마스터, 정상 관문은 바꾸지 않는다.

BEGIN;

CREATE OR REPLACE FUNCTION public.vocab_tower_v2_practice_floor_policy_v1(
    p_deck_number SMALLINT
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
    SELECT CASE p_deck_number
        WHEN 1 THEN jsonb_build_object(
            'stage', 1,
            'preferred_difficulties', jsonb_build_array(1, 2),
            'choice_option_count', 3,
            'question_types', jsonb_build_array(
                'meaningChoice', 'clozeChoice', 'meaningChoice', 'clozeChoice',
                'meaningChoice', 'clozeChoice', 'meaningChoice', 'clozeChoice',
                'meaningChoice', 'clozeChoice', 'meaningChoice', 'clozeChoice'
            )
        )
        WHEN 2 THEN jsonb_build_object(
            'stage', 1,
            'preferred_difficulties', jsonb_build_array(1, 2),
            'choice_option_count', 3,
            'question_types', jsonb_build_array(
                'meaningChoice', 'clozeChoice', 'meaningChoice', 'clozeChoice',
                'usageDistinction', 'meaningChoice', 'clozeChoice', 'meaningChoice',
                'clozeChoice', 'usageDistinction', 'meaningChoice', 'clozeChoice'
            )
        )
        WHEN 3 THEN jsonb_build_object(
            'stage', 2,
            'preferred_difficulties', jsonb_build_array(2, 3),
            'choice_option_count', 4,
            'question_types', jsonb_build_array(
                'meaningChoice', 'clozeChoice', 'meaningChoice', 'clozeChoice',
                'usageDistinction', 'clozeChoice', 'meaningChoice', 'clozeChoice',
                'usageDistinction', 'definitionInput', 'meaningChoice', 'clozeChoice'
            )
        )
        WHEN 4 THEN jsonb_build_object(
            'stage', 2,
            'preferred_difficulties', jsonb_build_array(2, 3),
            'choice_option_count', 4,
            'question_types', jsonb_build_array(
                'meaningChoice', 'clozeChoice', 'meaningChoice', 'usageDistinction',
                'clozeChoice', 'meaningChoice', 'usageDistinction', 'clozeChoice',
                'clozeInput', 'meaningChoice', 'usageDistinction', 'clozeChoice'
            )
        )
        WHEN 5 THEN jsonb_build_object(
            'stage', 3,
            'preferred_difficulties', jsonb_build_array(3),
            'choice_option_count', 4,
            'question_types', jsonb_build_array(
                'meaningChoice', 'clozeChoice', 'meaningChoice', 'usageDistinction',
                'clozeChoice', 'meaningChoice', 'definitionInput', 'usageDistinction',
                'clozeChoice', 'meaningChoice', 'clozeInput', 'usageDistinction'
            )
        )
        WHEN 6 THEN jsonb_build_object(
            'stage', 3,
            'preferred_difficulties', jsonb_build_array(3),
            'choice_option_count', 4,
            'question_types', jsonb_build_array(
                'meaningChoice', 'clozeChoice', 'meaningChoice', 'usageDistinction',
                'clozeChoice', 'definitionInput', 'usageDistinction', 'clozeChoice',
                'meaningChoice', 'clozeInput', 'usageDistinction', 'clozeChoice'
            )
        )
        WHEN 7 THEN jsonb_build_object(
            'stage', 4,
            'preferred_difficulties', jsonb_build_array(3),
            'choice_option_count', 4,
            'question_types', jsonb_build_array(
                'meaningChoice', 'clozeChoice', 'usageDistinction', 'meaningChoice',
                'definitionInput', 'clozeChoice', 'usageDistinction', 'clozeInput',
                'meaningChoice', 'clozeChoice', 'definitionInput', 'usageDistinction'
            )
        )
        WHEN 8 THEN jsonb_build_object(
            'stage', 4,
            'preferred_difficulties', jsonb_build_array(3),
            'choice_option_count', 4,
            'question_types', jsonb_build_array(
                'meaningChoice', 'clozeChoice', 'usageDistinction', 'definitionInput',
                'usageDistinction', 'clozeChoice', 'meaningChoice', 'clozeInput',
                'usageDistinction', 'clozeChoice', 'usageDistinction', 'definitionInput'
            )
        )
        WHEN 9 THEN jsonb_build_object(
            'stage', 5,
            'preferred_difficulties', jsonb_build_array(3),
            'choice_option_count', 4,
            'question_types', jsonb_build_array(
                'meaningChoice', 'clozeChoice', 'usageDistinction', 'definitionInput',
                'usageDistinction', 'clozeInput', 'meaningChoice', 'usageDistinction',
                'definitionInput', 'clozeChoice', 'usageDistinction', 'clozeInput'
            )
        )
        WHEN 10 THEN jsonb_build_object(
            'stage', 5,
            'preferred_difficulties', jsonb_build_array(3),
            'choice_option_count', 4,
            'question_types', jsonb_build_array(
                'meaningChoice', 'clozeChoice', 'usageDistinction', 'definitionInput',
                'meaningChoice', 'clozeInput', 'usageDistinction', 'definitionInput',
                'clozeChoice', 'clozeInput', 'usageDistinction', 'definitionInput'
            )
        )
        ELSE NULL
    END;
$$;

REVOKE ALL ON FUNCTION public.vocab_tower_v2_practice_floor_policy_v1(SMALLINT)
    FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.vocab_tower_v2_practice_floor_policy_v1(SMALLINT) IS
    '정책 2 개인 연습의 층별 12문항 구성·보기 수·우선 난이도의 단일 원본.';

-- 앞 마이그레이션과 호출 계약은 유지하되 입력 위치의 원본은 위 정책 함수 하나만 남긴다.
CREATE OR REPLACE FUNCTION public.vocab_tower_v2_practice_input_slots_v1(
    p_deck_number SMALLINT
)
RETURNS SMALLINT[]
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
    SELECT COALESCE(
        array_agg(entry.ordinality::SMALLINT ORDER BY entry.ordinality),
        ARRAY[]::SMALLINT[]
    )
    FROM jsonb_array_elements_text(
        COALESCE(
            public.vocab_tower_v2_practice_floor_policy_v1(p_deck_number)->'question_types',
            '[]'::JSONB
        )
    ) WITH ORDINALITY AS entry(question_type, ordinality)
    WHERE entry.question_type IN ('definitionInput', 'clozeInput');
$$;

REVOKE ALL ON FUNCTION public.vocab_tower_v2_practice_input_slots_v1(SMALLINT)
    FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.apply_vocab_tower_v2_practice_floor_policy_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_run public.vocab_tower_runs%ROWTYPE;
    v_item public.vocab_tower_v2_review_items%ROWTYPE;
    v_question JSONB;
    v_policy JSONB;
    v_planned_type TEXT;
    v_learning_state TEXT;
    v_preferred_difficulties SMALLINT[];
    v_choice_option_count SMALLINT;
    v_accepted JSONB;
    v_correct_answer TEXT;
    v_candidate RECORD;
BEGIN
    SELECT run.* INTO v_run
    FROM public.vocab_tower_runs run
    WHERE run.id = NEW.run_id;

    -- 기존 판과 보충 수련은 기존 출제 결과를 그대로 둔다.
    IF v_run.id IS NULL
       OR v_run.practice_policy_version < 2
       OR v_run.content_version <> 'v2'
       OR NEW.is_retry THEN
        RETURN NEW;
    END IF;

    v_policy := public.vocab_tower_v2_practice_floor_policy_v1(v_run.v2_deck_number);
    v_planned_type := v_policy->'question_types'->>(NEW.sequence_number - 1);
    v_choice_option_count := COALESCE((v_policy->>'choice_option_count')::SMALLINT, 4);

    SELECT COALESCE(array_agg(value::SMALLINT), ARRAY[]::SMALLINT[])
      INTO v_preferred_difficulties
    FROM jsonb_array_elements_text(COALESCE(v_policy->'preferred_difficulties', '[]'::JSONB));

    -- 원래 출제기가 고른 학습 초점(약점·새 낱말·복습)은 유지한다. 같은 초점 안에서만
    -- 이 층의 우선 난이도를 먼저 고르고, 없으면 원래 낱말로 돌아가므로 학습 누락이 생기지 않는다.
    SELECT candidate.item, candidate.learning_state
      INTO v_candidate
    FROM (
        SELECT
            item,
            progress.learning_state,
            CASE
                WHEN progress.item_key IS NULL THEN 'new'
                WHEN progress.learning_state = 'needs_review' THEN 'weak'
                WHEN progress.learning_state = 'learning' THEN 'review'
                WHEN progress.next_review_at IS NULL OR progress.next_review_at <= NOW() THEN 'review'
                ELSE 'mastered'
            END AS selection_focus
        FROM public.vocab_tower_v2_review_items item
        JOIN public.vocab_tower_v2_review_decks deck ON deck.deck_id = item.deck_id
        LEFT JOIN public.learning_item_progress progress
          ON progress.student_id = NEW.student_id
         AND progress.class_id = NEW.class_id
         AND progress.content_type = 'vocab'
         AND progress.collection_key = public.vocab_tower_v2_collection_key(
             v_run.grade, v_run.v2_deck_number)
         AND progress.item_key = item.item_key
        WHERE deck.grade = v_run.grade
          AND deck.deck_number = v_run.v2_deck_number
          AND deck.review_status = 'locked'
          AND item.difficulty = ANY(v_preferred_difficulties)
          AND NOT EXISTS (
              SELECT 1
              FROM public.vocab_tower_v2_run_questions used
              WHERE used.run_id = NEW.run_id
                AND used.item_key = item.item_key
          )
    ) candidate
    WHERE candidate.selection_focus = NEW.selection_focus
    ORDER BY random()
    LIMIT 1;

    IF FOUND THEN
        v_item := v_candidate.item;
        v_learning_state := v_candidate.learning_state;
    END IF;

    IF v_item.item_key IS NULL THEN
        SELECT item, progress.learning_state
          INTO v_candidate
        FROM public.vocab_tower_v2_review_items item
        LEFT JOIN public.learning_item_progress progress
          ON progress.student_id = NEW.student_id
         AND progress.class_id = NEW.class_id
         AND progress.content_type = 'vocab'
         AND progress.collection_key = public.vocab_tower_v2_collection_key(
             v_run.grade, v_run.v2_deck_number)
         AND progress.item_key = item.item_key
        WHERE item.item_key = NEW.item_key;

        IF FOUND THEN
            v_item := v_candidate.item;
            v_learning_state := v_candidate.learning_state;
        END IF;
    END IF;

    IF v_item.item_key IS NULL OR v_planned_type IS NULL THEN
        RAISE EXCEPTION '층별 개인 연습 정책에 맞는 문항을 찾지 못했습니다.' USING ERRCODE = '55000';
    END IF;

    -- 직접 입력은 familiar/mastered 낱말에서만 허용한다. 아직 준비되지 않은 낱말이면
    -- 같은 인지 과정의 선택형으로 낮춰 학생이 막히지 않게 한다.
    IF v_planned_type = 'definitionInput'
       AND v_learning_state NOT IN ('familiar', 'mastered') THEN
        v_planned_type := 'meaningChoice';
    ELSIF v_planned_type = 'clozeInput'
       AND v_learning_state NOT IN ('familiar', 'mastered') THEN
        v_planned_type := 'clozeChoice';
    END IF;

    v_question := v_item.questions->v_planned_type;
    IF v_question->>'status' <> 'reviewed' THEN
        RAISE EXCEPTION '검수 완료 문항만 층별 연습에 출제할 수 있습니다.' USING ERRCODE = '55000';
    END IF;

    NEW.item_key := v_item.item_key;
    NEW.deck_id := v_item.deck_id;
    NEW.question_type := v_planned_type;
    NEW.prompt := v_question->>'prompt';
    NEW.explanation := COALESCE(NULLIF(BTRIM(v_question->>'explanation'), ''), v_item.definition);
    NEW.word := v_item.word;
    NEW.definition := v_item.definition;
    NEW.example := v_item.example;
    NEW.difficulty := v_item.difficulty;
    NEW.category := v_item.category;

    IF v_planned_type IN ('definitionInput', 'clozeInput') THEN
        SELECT jsonb_agg(DISTINCT answer)
          INTO v_accepted
        FROM jsonb_array_elements_text(COALESCE(v_question->'acceptedAnswers', '[]'::JSONB)) answer
        WHERE char_length(BTRIM(answer)) BETWEEN 1 AND 100;

        IF v_accepted IS NULL OR jsonb_array_length(v_accepted) NOT BETWEEN 1 AND 10 THEN
            RAISE EXCEPTION 'V2 직접 입력 문항의 허용 정답이 올바르지 않습니다.' USING ERRCODE = '55000';
        END IF;

        NEW.room_type := CASE v_planned_type WHEN 'definitionInput' THEN 'meaning' ELSE 'sentence' END;
        NEW.options := '[]'::JSONB;
        NEW.accepted_answers := v_accepted;
        NEW.correct_answer := v_accepted->>0;
    ELSE
        SELECT option->>'value'
          INTO v_correct_answer
        FROM jsonb_array_elements(v_question->'options') option
        WHERE option->>'isCorrect' = 'true'
        LIMIT 1;

        SELECT jsonb_agg(chosen.value ORDER BY random())
          INTO NEW.options
        FROM (
            SELECT option->'value' AS value
            FROM jsonb_array_elements(v_question->'options') option
            ORDER BY CASE WHEN option->>'isCorrect' = 'true' THEN 0 ELSE 1 END, random()
            LIMIT v_choice_option_count
        ) chosen;

        IF v_correct_answer IS NULL OR jsonb_array_length(NEW.options) NOT BETWEEN 2 AND 6 THEN
            RAISE EXCEPTION 'V2 선택 문항의 정답과 보기가 올바르지 않습니다.' USING ERRCODE = '55000';
        END IF;

        NEW.room_type := CASE v_planned_type
            WHEN 'clozeChoice' THEN 'sentence'
            WHEN 'usageDistinction' THEN 'distinction'
            ELSE 'meaning'
        END;
        NEW.accepted_answers := '[]'::JSONB;
        NEW.correct_answer := v_correct_answer;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_vocab_tower_v2_practice_floor_policy_v1()
    FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS apply_vocab_tower_v2_practice_floor_policy_v1
    ON public.vocab_tower_v2_run_questions;
CREATE TRIGGER apply_vocab_tower_v2_practice_floor_policy_v1
BEFORE INSERT ON public.vocab_tower_v2_run_questions
FOR EACH ROW EXECUTE FUNCTION public.apply_vocab_tower_v2_practice_floor_policy_v1();

COMMENT ON FUNCTION public.apply_vocab_tower_v2_practice_floor_policy_v1() IS
    '정책 2 개인 연습 문항을 층별 구성·보기 수·우선 난이도에 맞춰 삽입 직전에 완성한다.';

-- 지도 응답에 현재 판 또는 제한 공개 학급의 정책 버전을 싣는다. 화면은 이 값이 2일 때만
-- 난이도 단계 안내를 보여 주므로 일반 학급에는 아직 새 UI가 나타나지 않는다.
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
    v_practice_policy_version SMALLINT;
BEGIN
    v_result := public.get_my_vocab_tower_v2_overview_base_v1();
    IF NOT COALESCE((v_result->>'success')::BOOLEAN, FALSE) THEN
        RETURN v_result;
    END IF;

    v_grade := (v_result->>'grade')::SMALLINT;
    v_highest := public.vocab_tower_v2_highest_unlocked_deck_v1(
        v_student_id, v_class_id, v_grade);
    v_active_deck := NULLIF(v_result->'active_run'->>'deck_number', '')::SMALLINT;

    SELECT COALESCE(
        (
            SELECT run.practice_policy_version
            FROM public.vocab_tower_runs run
            WHERE run.student_id = v_student_id
              AND run.class_id = v_class_id
              AND run.status = 'active'
              AND run.content_version = 'v2'
            ORDER BY run.started_at DESC
            LIMIT 1
        ),
        (
            SELECT rollout.policy_version
            FROM public.vocab_tower_practice_policy_classes rollout
            WHERE rollout.class_id = v_class_id
        ),
        1
    )::SMALLINT INTO v_practice_policy_version;

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
                OR (
                    v_active_deck IS NOT NULL
                    AND (entry.value->>'deck_number')::SMALLINT = v_active_deck
                )
                OR v_open_master_keys ? public.vocab_tower_v2_collection_key(
                    v_grade, (entry.value->>'deck_number')::SMALLINT),
            'unlock_required_deck', CASE
                WHEN (entry.value->>'deck_number')::SMALLINT <= v_highest
                  OR (
                      v_active_deck IS NOT NULL
                      AND (entry.value->>'deck_number')::SMALLINT = v_active_deck
                  )
                  OR v_open_master_keys ? public.vocab_tower_v2_collection_key(
                      v_grade, (entry.value->>'deck_number')::SMALLINT)
                    THEN NULL
                ELSE v_highest
            END,
            'unlock_grandfathered',
                (entry.value->>'deck_number')::SMALLINT > v_highest
                AND (
                    (
                        v_active_deck IS NOT NULL
                        AND (entry.value->>'deck_number')::SMALLINT = v_active_deck
                    )
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
            'highest_unlocked_deck', v_highest,
            'practice_policy_version', v_practice_policy_version
        );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_vocab_tower_v2_overview_v1()
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_vocab_tower_v2_overview_v1()
    TO authenticated, service_role;

COMMIT;
