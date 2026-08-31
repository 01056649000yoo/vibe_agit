-- 어휘의 탑 개인 연습의 직접 입력을 층에 따라 완만하게 늘린다.
--
-- 기존 규칙은 낱말이 familiar/mastered이면 1층에서도 곧바로 직접 입력을 냈다.
-- 정책 2는 12문항 중 직접 입력이 가능한 위치를 층별 상한으로 제한한다.
-- 이미 시작한 판은 정책 1을 유지하고, 관리자 소유 `테스트` 학급의 새 판만 먼저 정책 2를 스냅샷한다.
-- 덱마스터·정상 공식 도전은 별도 함수와 학급 설정을 사용하므로 바꾸지 않는다.

BEGIN;

ALTER TABLE public.vocab_tower_runs
    ADD COLUMN IF NOT EXISTS practice_policy_version SMALLINT NOT NULL DEFAULT 1;

ALTER TABLE public.vocab_tower_runs
    DROP CONSTRAINT IF EXISTS vocab_tower_runs_practice_policy_version_check;
ALTER TABLE public.vocab_tower_runs
    ADD CONSTRAINT vocab_tower_runs_practice_policy_version_check
    CHECK (practice_policy_version IN (1, 2));

COMMENT ON COLUMN public.vocab_tower_runs.practice_policy_version IS
    'V2 개인 연습 시작 시 고정한 출제 정책. 1=기존 숙련 기반 입력, 2=층별 직접 입력 상한.';

CREATE TABLE IF NOT EXISTS public.vocab_tower_practice_policy_classes (
    class_id UUID PRIMARY KEY REFERENCES public.classes(id) ON DELETE CASCADE,
    policy_version SMALLINT NOT NULL DEFAULT 2 CHECK (policy_version = 2),
    enabled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.vocab_tower_practice_policy_classes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.vocab_tower_practice_policy_classes
    FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.vocab_tower_practice_policy_classes IS
    '층별 직접 입력 완화 정책의 제한 배포 학급. 브라우저 직접 접근 없이 새 개인 연습 시작 시에만 읽는다.';

-- 운영 수업 학급과 이름이 겹쳐도 관리자 소유인 정확한 테스트 학급만 제한 배포 대상으로 잡는다.
INSERT INTO public.vocab_tower_practice_policy_classes (class_id, policy_version)
SELECT class.id, 2
FROM public.classes class
JOIN public.profiles profile
  ON profile.id = class.teacher_id
 AND profile.role = 'ADMIN'
 AND profile.is_approved IS TRUE
 AND profile.approval_revoked_at IS NULL
WHERE class.deleted_at IS NULL
  AND class.name = '테스트'
ON CONFLICT (class_id) DO UPDATE
SET policy_version = EXCLUDED.policy_version;

CREATE OR REPLACE FUNCTION public.vocab_tower_v2_practice_input_slots_v1(
    p_deck_number SMALLINT
)
RETURNS SMALLINT[]
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
    SELECT CASE p_deck_number
        WHEN 1 THEN ARRAY[]::SMALLINT[]
        WHEN 2 THEN ARRAY[]::SMALLINT[]
        WHEN 3 THEN ARRAY[10]::SMALLINT[]
        WHEN 4 THEN ARRAY[9]::SMALLINT[]
        WHEN 5 THEN ARRAY[7, 11]::SMALLINT[]
        WHEN 6 THEN ARRAY[6, 10]::SMALLINT[]
        WHEN 7 THEN ARRAY[5, 8, 11]::SMALLINT[]
        WHEN 8 THEN ARRAY[4, 8, 12]::SMALLINT[]
        WHEN 9 THEN ARRAY[4, 6, 9, 12]::SMALLINT[]
        WHEN 10 THEN ARRAY[4, 6, 8, 10, 12]::SMALLINT[]
        ELSE ARRAY[]::SMALLINT[]
    END
$$;

REVOKE ALL ON FUNCTION public.vocab_tower_v2_practice_input_slots_v1(SMALLINT)
    FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.snapshot_vocab_tower_practice_policy_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF NEW.content_version = 'v2' AND NEW.v2_deck_number IS NOT NULL THEN
        SELECT COALESCE(MAX(rollout.policy_version), 1)::SMALLINT
          INTO NEW.practice_policy_version
        FROM public.vocab_tower_practice_policy_classes rollout
        WHERE rollout.class_id = NEW.class_id;
    ELSE
        NEW.practice_policy_version := 1;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.snapshot_vocab_tower_practice_policy_v1()
    FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS snapshot_vocab_tower_practice_policy_v1
    ON public.vocab_tower_runs;
CREATE TRIGGER snapshot_vocab_tower_practice_policy_v1
BEFORE INSERT ON public.vocab_tower_runs
FOR EACH ROW EXECUTE FUNCTION public.snapshot_vocab_tower_practice_policy_v1();

CREATE OR REPLACE FUNCTION public.get_next_my_vocab_tower_v2_practice_question_v1(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID := public.auth_user_class_id();
    v_run public.vocab_tower_runs%ROWTYPE;
    v_existing public.vocab_tower_v2_run_questions%ROWTYPE;
    v_item public.vocab_tower_v2_review_items%ROWTYPE;
    v_deck public.vocab_tower_v2_review_decks%ROWTYPE;
    v_item_key TEXT;
    v_question JSONB;
    v_question_type TEXT;
    v_room_type TEXT;
    v_options JSONB;
    v_accepted JSONB;
    v_correct_answer TEXT;
    v_sequence SMALLINT;
    v_target_focus TEXT;
    v_selection_focus TEXT;
    v_learning_state TEXT;
    v_is_input BOOLEAN;
    v_is_retry BOOLEAN := FALSE;
    v_retry_source_type TEXT;
    v_candidate TEXT;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL OR v_class_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT run.* INTO v_run
    FROM public.vocab_tower_runs run
    WHERE run.id = p_run_id
      AND run.student_id = v_student_id
      AND run.class_id = v_class_id
    FOR UPDATE;

    IF NOT FOUND OR v_run.status <> 'active' OR v_run.content_version <> 'v2'
       OR v_run.v2_deck_number IS NULL OR v_run.target_question_count <> 12 THEN
        RAISE EXCEPTION '진행 중인 V2 개인 연습을 찾을 수 없습니다.' USING ERRCODE = '22023';
    END IF;
    IF v_run.answer_count >= v_run.target_question_count THEN
        RAISE EXCEPTION '이 덱의 개인 연습 문항을 모두 풀었어요.' USING ERRCODE = '22023';
    END IF;

    SELECT question.* INTO v_existing
    FROM public.vocab_tower_v2_run_questions question
    WHERE question.run_id = v_run.id
      AND question.sequence_number = v_run.answer_count + 1
      AND question.answered_at IS NULL
    LIMIT 1;

    IF v_existing.id IS NOT NULL THEN
        RETURN public.build_vocab_tower_v2_question_payload_v1(
            v_existing, v_run.target_question_count, v_run.v2_deck_number);
    END IF;

    v_sequence := (v_run.answer_count + 1)::SMALLINT;

    -- 보충 수련 우선: 3문항 이상 지난 오답 중 아직 다시 내지 않은 가장 오래된 낱말을 고른다.
    SELECT asked.item_key, asked.question_type
      INTO v_item_key, v_retry_source_type
    FROM public.vocab_tower_v2_run_questions asked
    JOIN public.vocab_tower_answers answer
      ON answer.run_id = asked.run_id
     AND answer.question_key = asked.id::TEXT
    WHERE asked.run_id = v_run.id
      AND answer.is_correct IS FALSE
      AND asked.sequence_number <= v_sequence - 3
      AND NOT EXISTS (
          SELECT 1
          FROM public.vocab_tower_v2_run_questions repeated
          WHERE repeated.run_id = v_run.id
            AND repeated.item_key = asked.item_key
            AND repeated.sequence_number > asked.sequence_number
      )
    ORDER BY asked.sequence_number
    LIMIT 1;

    IF v_item_key IS NOT NULL THEN
        v_is_retry := TRUE;
        v_selection_focus := 'retry';
    ELSE
        v_target_focus := CASE MOD(v_sequence - 1, 12)
            WHEN 0 THEN 'weak'
            WHEN 1 THEN 'new'
            WHEN 2 THEN 'review'
            WHEN 3 THEN 'weak'
            WHEN 4 THEN 'review'
            WHEN 5 THEN 'new'
            WHEN 6 THEN 'weak'
            WHEN 7 THEN 'review'
            WHEN 8 THEN 'weak'
            WHEN 9 THEN 'weak'
            WHEN 10 THEN 'review'
            ELSE 'new'
        END;

        WITH candidates AS (
            SELECT
                item.item_key,
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
              ON progress.student_id = v_student_id
             AND progress.class_id = v_class_id
             AND progress.content_type = 'vocab'
             AND progress.collection_key = public.vocab_tower_v2_collection_key(v_run.grade, v_run.v2_deck_number)
             AND progress.item_key = item.item_key
            WHERE deck.grade = v_run.grade
              AND deck.deck_number = v_run.v2_deck_number
              AND deck.review_status = 'locked'
              AND NOT EXISTS (
                  SELECT 1 FROM public.vocab_tower_v2_run_questions used
                  WHERE used.run_id = v_run.id AND used.item_key = item.item_key
              )
        )
        SELECT candidate.item_key, candidate.selection_focus, candidate.learning_state
          INTO v_item_key, v_selection_focus, v_learning_state
        FROM candidates candidate
        ORDER BY
            CASE v_target_focus
                WHEN 'weak' THEN CASE candidate.selection_focus
                    WHEN 'weak' THEN 0 WHEN 'new' THEN 1 WHEN 'review' THEN 2 ELSE 3 END
                WHEN 'review' THEN CASE candidate.selection_focus
                    WHEN 'review' THEN 0 WHEN 'new' THEN 1 WHEN 'weak' THEN 2 ELSE 3 END
                ELSE CASE candidate.selection_focus
                    WHEN 'new' THEN 0 WHEN 'review' THEN 1 WHEN 'weak' THEN 2 ELSE 3 END
            END,
            random()
        LIMIT 1;
    END IF;

    IF v_item_key IS NOT NULL THEN
        SELECT item.* INTO v_item
        FROM public.vocab_tower_v2_review_items item
        WHERE item.item_key = v_item_key;
    END IF;
    IF v_item.item_key IS NOT NULL THEN
        SELECT deck.* INTO v_deck
        FROM public.vocab_tower_v2_review_decks deck
        WHERE deck.deck_id = v_item.deck_id
          AND deck.grade = v_run.grade
          AND deck.deck_number = v_run.v2_deck_number
          AND deck.review_status = 'locked';
    END IF;
    IF v_item.item_key IS NULL OR v_deck.deck_id IS NULL THEN
        RAISE EXCEPTION '잠긴 V2 덱에서 연습 문항을 찾지 못했습니다.' USING ERRCODE = '55000';
    END IF;

    -- 정책 1은 기존 숙련 기반 입력을 유지한다. 정책 2는 층별 슬롯에서만 입력형을 허용한다.
    -- 슬롯의 낱말이 입력 조건을 충족하지 못하면 아래 기존 안전장치에 따라 선택형으로 내려간다.
    v_is_input := NOT v_is_retry
        AND v_learning_state IN ('familiar', 'mastered')
        AND (
            v_run.practice_policy_version = 1
            OR v_sequence = ANY(public.vocab_tower_v2_practice_input_slots_v1(v_run.v2_deck_number))
        );
    IF v_is_input THEN
        v_question_type := CASE MOD(v_sequence::INTEGER, 2) WHEN 0 THEN 'definitionInput' ELSE 'clozeInput' END;
        v_question := v_item.questions->v_question_type;
        SELECT jsonb_agg(DISTINCT answer) INTO v_accepted
        FROM jsonb_array_elements_text(COALESCE(v_question->'acceptedAnswers', '[]'::jsonb)) answer
        WHERE char_length(btrim(answer)) BETWEEN 1 AND 100;
        IF v_question->>'status' <> 'reviewed'
           OR v_accepted IS NULL
           OR jsonb_array_length(v_accepted) NOT BETWEEN 1 AND 10 THEN
            v_is_input := FALSE;
        END IF;
    END IF;

    IF v_is_input THEN
        v_room_type := CASE v_question_type WHEN 'definitionInput' THEN 'meaning' ELSE 'sentence' END;
        v_options := '[]'::jsonb;
        v_correct_answer := v_accepted->>0;
    ELSE
        v_accepted := '[]'::jsonb;
        v_question_type := NULL;

        IF v_is_retry THEN
            -- 방금 틀린 형태를 피해 다른 선택형부터 시도한다.
            FOREACH v_candidate IN ARRAY ARRAY['meaningChoice', 'clozeChoice', 'usageDistinction'] LOOP
                CONTINUE WHEN v_candidate = v_retry_source_type;
                IF (v_item.questions->v_candidate)->>'status' = 'reviewed' THEN
                    v_question_type := v_candidate;
                    EXIT;
                END IF;
            END LOOP;
        END IF;

        IF v_question_type IS NULL THEN
            v_room_type := CASE MOD(v_run.answer_count, 3)
                WHEN 0 THEN 'meaning'
                WHEN 1 THEN 'sentence'
                ELSE 'distinction'
            END;
            v_question_type := CASE v_room_type
                WHEN 'sentence' THEN 'clozeChoice'
                WHEN 'distinction' THEN 'usageDistinction'
                ELSE 'meaningChoice'
            END;
        END IF;

        v_room_type := CASE v_question_type
            WHEN 'clozeChoice' THEN 'sentence'
            WHEN 'usageDistinction' THEN 'distinction'
            ELSE 'meaning'
        END;
        v_question := v_item.questions->v_question_type;
        IF v_question->>'status' <> 'reviewed' THEN
            RAISE EXCEPTION '검수 완료 문항만 출제할 수 있습니다.' USING ERRCODE = '55000';
        END IF;

        SELECT option->>'value' INTO v_correct_answer
        FROM jsonb_array_elements(v_question->'options') option
        WHERE option->>'isCorrect' = 'true'
        LIMIT 1;
        SELECT jsonb_agg(option->'value' ORDER BY random()) INTO v_options
        FROM jsonb_array_elements(v_question->'options') option;

        IF v_correct_answer IS NULL OR jsonb_array_length(v_options) NOT BETWEEN 2 AND 6 THEN
            RAISE EXCEPTION 'V2 선택 문항의 정답과 보기가 올바르지 않습니다.' USING ERRCODE = '55000';
        END IF;
    END IF;

    INSERT INTO public.vocab_tower_v2_run_questions (
        run_id, student_id, class_id, item_key, deck_id, sequence_number,
        room_type, question_type, prompt, options, accepted_answers, correct_answer, explanation,
        word, definition, example, difficulty, category, is_review, is_retry, selection_focus
    ) VALUES (
        v_run.id, v_student_id, v_class_id, v_item.item_key, v_deck.deck_id, v_sequence,
        v_room_type, v_question_type, v_question->>'prompt', v_options, v_accepted, v_correct_answer,
        COALESCE(NULLIF(BTRIM(v_question->>'explanation'), ''), v_item.definition),
        v_item.word, v_item.definition, v_item.example, v_item.difficulty, v_item.category,
        v_is_retry OR v_selection_focus IN ('weak', 'review'), v_is_retry, v_selection_focus
    ) RETURNING * INTO v_existing;

    RETURN public.build_vocab_tower_v2_question_payload_v1(
        v_existing, v_run.target_question_count, v_run.v2_deck_number);
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_next_my_vocab_tower_v2_practice_question_v1(UUID)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_next_my_vocab_tower_v2_practice_question_v1(UUID)
    TO authenticated;

COMMIT;
