-- 공통 학습 엔진 분리 1단계 — 학습 상태·묶음 진도를 콘텐츠 중립 계층으로 옮긴다.
--
-- 왜 지금인가: 어휘의 탑 V2가 쌓아 온 "무엇을 익혔고 무엇을 더 연습해야 하는지"는 어휘 고유 규칙이 아니다.
-- 속담·맞춤법·한자어에 똑같이 필요하다. 그런데 지금 그 규칙이 vocab_tower_v2_* 안에만 있어서, 콘텐츠를
-- 하나 더 붙일 때마다 같은 계산(상태 전이·복습 간격·묶음 진도 포인트)을 다시 만들게 된다.
-- 2026-08-17 기준 학생 진도가 48행·1명뿐이라(방학) 이관 비용이 사실상 없고, 학기가 시작되면 같은 작업이
-- 훨씬 무거워진다. 그래서 콘텐츠가 하나일 때 지금 분리한다.
--
-- 경계:
--   엔진 소유 — 항목별 학습 상태, 상태 전이 규칙, 복습 간격, 묶음 진도와 구간 포인트 계산
--   콘텐츠 소유 — 항목 데이터, 문제 생성, 채점, 문항 검수, 그리고 "무엇을 한 묶음으로 볼지"
--
-- 묶음(collection)은 엔진이 일반 개념으로 갖고 콘텐츠가 자기 키를 선언한다. 어휘는 `g3:d1` 처럼
-- 학년·덱을 담고, 속담·맞춤법은 자기 사정에 맞게 정한다. 엔진은 키를 해석하지 않고 묶음 단위로 세기만 한다.
--
-- 이번 단계는 **동작을 바꾸지 않는다.** 화면·포인트·출제 순서가 그대로여야 하며, 기존 어휘 스모크 9종이
-- 그대로 통과하는 것이 합격 기준이다. 옛 vocab_tower_v2_item_progress·deck_progress 표는 지우지 않고
-- 롤백용으로 남긴다(이관 후에는 읽지 않는다).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. 엔진 표
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.learning_item_progress (
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL,
    collection_key TEXT NOT NULL,
    item_key TEXT NOT NULL,
    learning_state TEXT NOT NULL DEFAULT 'learning',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    wrong_count INTEGER NOT NULL DEFAULT 0,
    consecutive_correct SMALLINT NOT NULL DEFAULT 0,
    -- 문제 형태 목록은 콘텐츠마다 다르므로 엔진은 값을 열거하지 않고 개수만 센다
    -- (익힘 조건인 "서로 다른 형태 2종 성공"은 형태 이름과 무관하게 성립한다).
    correct_question_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    last_question_type TEXT,
    last_correct BOOLEAN,
    first_seen_run_id UUID,
    last_seen_run_id UUID,
    last_mastered_run_id UUID,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    mastered_at TIMESTAMPTZ,
    next_review_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (student_id, class_id, content_type, collection_key, item_key),
    CONSTRAINT learning_item_progress_state_check
        CHECK (learning_state = ANY (ARRAY['learning', 'familiar', 'needs_review', 'mastered'])),
    CONSTRAINT learning_item_progress_content_type_check
        CHECK (char_length(content_type) BETWEEN 1 AND 40),
    CONSTRAINT learning_item_progress_collection_key_check
        CHECK (char_length(collection_key) BETWEEN 1 AND 80),
    CONSTRAINT learning_item_progress_item_key_check
        CHECK (char_length(item_key) BETWEEN 1 AND 120),
    CONSTRAINT learning_item_progress_question_type_check
        CHECK (last_question_type IS NULL OR char_length(last_question_type) BETWEEN 1 AND 40),
    CONSTRAINT learning_item_progress_attempt_count_check CHECK (attempt_count >= 0),
    CONSTRAINT learning_item_progress_correct_count_check CHECK (correct_count >= 0),
    CONSTRAINT learning_item_progress_wrong_count_check CHECK (wrong_count >= 0),
    CONSTRAINT learning_item_progress_consecutive_correct_check CHECK (consecutive_correct >= 0)
);

CREATE INDEX IF NOT EXISTS learning_item_progress_collection_state_idx
    ON public.learning_item_progress
       (student_id, class_id, content_type, collection_key, learning_state, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS learning_item_progress_class_updated_idx
    ON public.learning_item_progress (class_id, content_type, updated_at DESC);
-- 예정 복습 조회는 지난 것만 보므로 부분 인덱스로 좁힌다.
CREATE INDEX IF NOT EXISTS learning_item_progress_due_review_idx
    ON public.learning_item_progress (student_id, class_id, content_type, next_review_at)
    WHERE next_review_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.learning_collection_progress (
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL,
    collection_key TEXT NOT NULL,
    practice_runs INTEGER NOT NULL DEFAULT 0,
    completed_runs INTEGER NOT NULL DEFAULT 0,
    best_accuracy SMALLINT NOT NULL DEFAULT 0,
    last_accuracy SMALLINT NOT NULL DEFAULT 0,
    last_answer_count SMALLINT NOT NULL DEFAULT 0,
    last_practiced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (student_id, class_id, content_type, collection_key),
    CONSTRAINT learning_collection_progress_best_accuracy_check
        CHECK (best_accuracy >= 0 AND best_accuracy <= 100),
    CONSTRAINT learning_collection_progress_last_accuracy_check
        CHECK (last_accuracy >= 0 AND last_accuracy <= 100),
    CONSTRAINT learning_collection_progress_runs_check
        CHECK (practice_runs >= 0 AND completed_runs >= 0)
);

CREATE INDEX IF NOT EXISTS learning_collection_progress_student_updated_idx
    ON public.learning_collection_progress (student_id, content_type, updated_at DESC);

-- 어휘 진도 표와 같은 잠금 방식: RLS를 켜되 정책을 두지 않아 SECURITY DEFINER 함수만 접근한다.
ALTER TABLE public.learning_item_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_collection_progress ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.learning_item_progress FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.learning_collection_progress FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. 상태 전이 규칙 (엔진의 핵심)
-- ---------------------------------------------------------------------------
-- 저장소를 모르는 순수 계산 함수다. 콘텐츠는 현재 상태와 이번 답안을 넘기고 새 상태를 돌려받는다.
-- 규칙은 어휘 V2에서 그대로 옮겼다(2026-08-17 시점 동작 보존):
--   · 힌트를 쓰면 정답이어도 연속·형태로 인정하지 않는다(외워 누르는 것을 익힘으로 세지 않기 위해).
--   · 서로 다른 문제 형태 2종을 힌트 없이 맞히고 연속 2회여야 익힘이다(한 형태만 잘하는 것을 거른다).
--   · 복습 간격: 다시 볼 항목=지금, 익힘=14일, 익숙=3일, 그 외=1일.
CREATE OR REPLACE FUNCTION public.learning_engine_next_state_v1(
    p_is_correct BOOLEAN,
    p_used_hint BOOLEAN,
    p_question_type TEXT,
    p_prev_state TEXT DEFAULT NULL,
    p_prev_streak SMALLINT DEFAULT 0,
    p_prev_types TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS TABLE (
    learning_state TEXT,
    consecutive_correct SMALLINT,
    correct_question_types TEXT[],
    review_interval INTERVAL
)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_types TEXT[] := COALESCE(p_prev_types, ARRAY[]::TEXT[]);
    v_streak SMALLINT;
    v_state TEXT;
    v_first_seen BOOLEAN := p_prev_state IS NULL;
BEGIN
    IF p_is_correct AND NOT p_used_hint AND NOT (p_question_type = ANY(v_types)) THEN
        v_types := array_append(v_types, p_question_type);
    END IF;

    v_streak := CASE
        WHEN p_is_correct AND NOT p_used_hint THEN COALESCE(p_prev_streak, 0) + 1
        ELSE 0
    END;

    IF v_first_seen THEN
        -- 처음 만난 항목은 아직 비교할 이력이 없어 익힘까지 가지 않는다.
        v_state := CASE
            WHEN NOT p_is_correct THEN 'needs_review'
            WHEN p_used_hint THEN 'learning'
            ELSE 'familiar'
        END;
    ELSE
        v_state := CASE
            WHEN NOT p_is_correct THEN 'needs_review'
            WHEN p_used_hint THEN 'learning'
            WHEN cardinality(v_types) >= 2 AND v_streak >= 2 THEN 'mastered'
            ELSE 'familiar'
        END;
    END IF;

    RETURN QUERY SELECT
        v_state,
        v_streak,
        v_types,
        CASE v_state
            WHEN 'needs_review' THEN INTERVAL '0'
            WHEN 'mastered' THEN INTERVAL '14 days'
            WHEN 'familiar' THEN INTERVAL '3 days'
            ELSE INTERVAL '1 day'
        END;
END;
$$;

REVOKE ALL ON FUNCTION public.learning_engine_next_state_v1(BOOLEAN, BOOLEAN, TEXT, TEXT, SMALLINT, TEXT[])
    FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. 답안 한 건을 엔진에 기록한다
-- ---------------------------------------------------------------------------
-- 콘텐츠 트리거가 "누가·어느 묶음·어느 항목·맞았는지"만 넘기면 나머지는 엔진이 처리한다.
CREATE OR REPLACE FUNCTION public.learning_engine_record_answer_v1(
    p_student_id UUID,
    p_class_id UUID,
    p_content_type TEXT,
    p_collection_key TEXT,
    p_item_key TEXT,
    p_question_type TEXT,
    p_is_correct BOOLEAN,
    p_used_hint BOOLEAN,
    p_run_id UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_prev public.learning_item_progress%ROWTYPE;
    v_next RECORD;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    SELECT progress.* INTO v_prev
    FROM public.learning_item_progress progress
    WHERE progress.student_id = p_student_id
      AND progress.class_id = p_class_id
      AND progress.content_type = p_content_type
      AND progress.collection_key = p_collection_key
      AND progress.item_key = p_item_key
    FOR UPDATE;

    SELECT * INTO v_next FROM public.learning_engine_next_state_v1(
        p_is_correct, p_used_hint, p_question_type,
        v_prev.learning_state, v_prev.consecutive_correct, v_prev.correct_question_types
    );

    INSERT INTO public.learning_item_progress (
        student_id, class_id, content_type, collection_key, item_key,
        learning_state, attempt_count, correct_count, wrong_count,
        consecutive_correct, correct_question_types, last_question_type, last_correct,
        first_seen_run_id, last_seen_run_id, last_mastered_run_id,
        first_seen_at, last_seen_at, mastered_at, next_review_at, updated_at
    ) VALUES (
        p_student_id, p_class_id, p_content_type, p_collection_key, p_item_key,
        v_next.learning_state, 1,
        CASE WHEN p_is_correct THEN 1 ELSE 0 END,
        CASE WHEN p_is_correct THEN 0 ELSE 1 END,
        v_next.consecutive_correct, v_next.correct_question_types, p_question_type, p_is_correct,
        p_run_id, p_run_id,
        CASE WHEN v_next.learning_state = 'mastered' THEN p_run_id ELSE NULL END,
        v_now, v_now,
        CASE WHEN v_next.learning_state = 'mastered' THEN v_now ELSE NULL END,
        v_now + v_next.review_interval, v_now
    )
    ON CONFLICT (student_id, class_id, content_type, collection_key, item_key) DO UPDATE SET
        learning_state = v_next.learning_state,
        attempt_count = public.learning_item_progress.attempt_count + 1,
        correct_count = public.learning_item_progress.correct_count
            + CASE WHEN p_is_correct THEN 1 ELSE 0 END,
        wrong_count = public.learning_item_progress.wrong_count
            + CASE WHEN p_is_correct THEN 0 ELSE 1 END,
        consecutive_correct = v_next.consecutive_correct,
        correct_question_types = v_next.correct_question_types,
        last_question_type = p_question_type,
        last_correct = p_is_correct,
        last_seen_run_id = p_run_id,
        last_seen_at = v_now,
        -- 익힘으로 "새로" 올라선 순간만 기록한다. 이미 익힘이면 최초 시점을 보존한다.
        last_mastered_run_id = CASE
            WHEN v_next.learning_state = 'mastered'
             AND public.learning_item_progress.learning_state <> 'mastered' THEN p_run_id
            ELSE public.learning_item_progress.last_mastered_run_id
        END,
        mastered_at = CASE
            WHEN v_next.learning_state = 'mastered'
             AND public.learning_item_progress.learning_state <> 'mastered' THEN v_now
            ELSE public.learning_item_progress.mastered_at
        END,
        next_review_at = v_now + v_next.review_interval,
        updated_at = v_now;

    RETURN v_next.learning_state;
END;
$$;

REVOKE ALL ON FUNCTION public.learning_engine_record_answer_v1(UUID, UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, UUID)
    FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. 묶음 진도 구간 포인트 (콘텐츠 중립)
-- ---------------------------------------------------------------------------
-- 어휘의 `vocab_tower_v2_progress_milestones_v1`을 그대로 옮겼다. 총액과 항목 수만 받으므로
-- 속담·맞춤법도 자기 묶음 크기와 교사 설정 총액을 넣으면 같은 구간을 얻는다.
CREATE OR REPLACE FUNCTION public.learning_engine_collection_milestones_v1(
    p_item_count INTEGER,
    p_total_points INTEGER
)
RETURNS TABLE (percent SMALLINT, required_items INTEGER, points INTEGER)
LANGUAGE sql
IMMUTABLE
AS $$
    WITH base AS (
        SELECT
            GREATEST(COALESCE(p_item_count, 0), 0) AS items,
            LEAST(500, GREATEST(0, COALESCE(p_total_points, 0))) AS total
    ), split AS (
        SELECT
            items, total,
            ROUND(total * 0.20)::INTEGER AS first_points,
            ROUND(total * 0.20)::INTEGER AS second_points,
            ROUND(total * 0.30)::INTEGER AS third_points
        FROM base
    )
    SELECT 25::SMALLINT, CEIL(items * 0.25)::INTEGER, first_points FROM split
    UNION ALL
    SELECT 50::SMALLINT, CEIL(items * 0.50)::INTEGER, second_points FROM split
    UNION ALL
    SELECT 75::SMALLINT, CEIL(items * 0.75)::INTEGER, third_points FROM split
    UNION ALL
    SELECT 100::SMALLINT, items, (total - first_points - second_points - third_points) FROM split
    ORDER BY 1;
$$;

REVOKE ALL ON FUNCTION public.learning_engine_collection_milestones_v1(INTEGER, INTEGER)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.learning_engine_collection_milestones_v1(INTEGER, INTEGER)
    TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. 어휘를 첫 콘텐츠로 등록하고 기존 진도를 옮긴다
-- ---------------------------------------------------------------------------
-- 어휘의 묶음 키는 `g{학년}:d{덱번호}`다. 엔진은 이 문자열을 해석하지 않는다.
CREATE OR REPLACE FUNCTION public.vocab_tower_v2_collection_key(p_grade SMALLINT, p_deck_number SMALLINT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$ SELECT format('g%s:d%s', p_grade, p_deck_number) $$;

INSERT INTO public.learning_item_progress (
    student_id, class_id, content_type, collection_key, item_key,
    learning_state, attempt_count, correct_count, wrong_count,
    consecutive_correct, correct_question_types, last_question_type, last_correct,
    first_seen_run_id, last_seen_run_id, last_mastered_run_id,
    first_seen_at, last_seen_at, mastered_at, next_review_at, created_at, updated_at
)
SELECT
    old.student_id, old.class_id, 'vocab',
    public.vocab_tower_v2_collection_key(old.grade, old.deck_number), old.item_key,
    old.learning_state, old.attempt_count, old.correct_count, old.wrong_count,
    old.consecutive_correct, COALESCE(old.correct_question_types, ARRAY[]::TEXT[]),
    old.last_question_type, old.last_correct,
    old.first_seen_run_id, old.last_seen_run_id, old.last_mastered_run_id,
    old.first_seen_at, old.last_seen_at, old.mastered_at, old.next_review_at,
    old.created_at, old.updated_at
FROM public.vocab_tower_v2_item_progress old
ON CONFLICT (student_id, class_id, content_type, collection_key, item_key) DO NOTHING;

INSERT INTO public.learning_collection_progress (
    student_id, class_id, content_type, collection_key,
    practice_runs, completed_runs, best_accuracy, last_accuracy,
    last_answer_count, last_practiced_at, created_at, updated_at
)
SELECT
    old.student_id, old.class_id, 'vocab',
    public.vocab_tower_v2_collection_key(old.grade, old.deck_number),
    old.practice_runs, old.completed_runs, old.best_accuracy, old.last_accuracy,
    old.last_answer_count, old.last_practiced_at, old.created_at, old.updated_at
FROM public.vocab_tower_v2_deck_progress old
ON CONFLICT (student_id, class_id, content_type, collection_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. 어휘 답안을 엔진에도 함께 기록한다 (양쪽 쓰기)
-- ---------------------------------------------------------------------------
-- 읽기까지 한 번에 옮기면 출제 우선순위·카드함·포인트 지급 737줄을 동시에 다시 써야 하고,
-- 한 곳만 어긋나도 학생이 보는 동작이 조용히 달라진다. 그래서 이 단계에서는 **쓰기만 양쪽에 남긴다**.
--   · 기존 vocab_tower_v2_item_progress: 지금까지처럼 계속 쓰고, 화면도 계속 이것을 읽는다(동작 변화 0).
--   · learning_item_progress: 같은 답안을 엔진 규칙으로 함께 기록해 최신 상태를 유지한다.
-- 다음 단계에서 읽기를 엔진으로 옮기고 두 표가 일치하는지 확인한 뒤 옛 표를 정리한다.
CREATE OR REPLACE FUNCTION public.record_vocab_tower_v2_item_progress_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_question public.vocab_tower_v2_run_questions%ROWTYPE;
    v_run public.vocab_tower_runs%ROWTYPE;
    v_progress public.vocab_tower_v2_item_progress%ROWTYPE;
    v_correct_types TEXT[] := ARRAY[]::TEXT[];
    v_streak SMALLINT := 0;
    v_state TEXT := 'learning';
    v_now TIMESTAMPTZ := NOW();
BEGIN
    SELECT question.* INTO v_question
    FROM public.vocab_tower_v2_run_questions question
    WHERE question.id::TEXT = NEW.question_key
      AND question.run_id = NEW.run_id
      AND question.student_id = NEW.student_id
      AND question.class_id = NEW.class_id;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    SELECT run.* INTO v_run
    FROM public.vocab_tower_runs run
    WHERE run.id = NEW.run_id
      AND run.student_id = NEW.student_id
      AND run.class_id = NEW.class_id
      AND run.content_version = 'v2'
      AND run.v2_deck_number IS NOT NULL
      AND run.target_question_count = 12;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    -- 공통 엔진에도 같은 답안을 남긴다. 엔진이 상태 전이·복습 간격을 스스로 계산하므로
    -- 아래 어휘 전용 계산과 결과가 같아야 한다(스모크에서 두 표를 대조한다).
    PERFORM public.learning_engine_record_answer_v1(
        NEW.student_id, NEW.class_id, 'vocab',
        public.vocab_tower_v2_collection_key(v_run.grade, v_run.v2_deck_number),
        v_question.item_key, v_question.question_type,
        NEW.is_correct, NEW.used_hint, NEW.run_id
    );

    SELECT progress.* INTO v_progress
    FROM public.vocab_tower_v2_item_progress progress
    WHERE progress.student_id = NEW.student_id
      AND progress.class_id = NEW.class_id
      AND progress.grade = v_run.grade
      AND progress.deck_number = v_run.v2_deck_number
      AND progress.item_key = v_question.item_key
    FOR UPDATE;

    IF v_progress.item_key IS NULL THEN
        IF NEW.is_correct AND NOT NEW.used_hint THEN
            v_correct_types := ARRAY[v_question.question_type];
            v_streak := 1;
            v_state := 'familiar';
        ELSIF NOT NEW.is_correct THEN
            v_state := 'needs_review';
        END IF;

        INSERT INTO public.vocab_tower_v2_item_progress (
            student_id, class_id, grade, deck_number, item_key,
            learning_state, attempt_count, correct_count, wrong_count,
            consecutive_correct, correct_question_types, last_question_type,
            last_correct, first_seen_run_id, last_seen_run_id,
            first_seen_at, last_seen_at, next_review_at, updated_at
        ) VALUES (
            NEW.student_id, NEW.class_id, v_run.grade, v_run.v2_deck_number, v_question.item_key,
            v_state, 1, CASE WHEN NEW.is_correct THEN 1 ELSE 0 END,
            CASE WHEN NEW.is_correct THEN 0 ELSE 1 END,
            v_streak, v_correct_types, v_question.question_type,
            NEW.is_correct, NEW.run_id, NEW.run_id,
            v_now, v_now,
            CASE v_state
                WHEN 'needs_review' THEN v_now
                WHEN 'familiar' THEN v_now + INTERVAL '3 days'
                ELSE v_now + INTERVAL '1 day'
            END,
            v_now
        );
        RETURN NEW;
    END IF;

    v_correct_types := v_progress.correct_question_types;
    IF NEW.is_correct
       AND NOT NEW.used_hint
       AND NOT (v_question.question_type = ANY(v_correct_types)) THEN
        v_correct_types := array_append(v_correct_types, v_question.question_type);
    END IF;
    v_streak := CASE
        WHEN NEW.is_correct AND NOT NEW.used_hint THEN v_progress.consecutive_correct + 1
        ELSE 0
    END;
    v_state := CASE
        WHEN NOT NEW.is_correct THEN 'needs_review'
        WHEN NEW.used_hint THEN 'learning'
        WHEN cardinality(v_correct_types) >= 2 AND v_streak >= 2 THEN 'mastered'
        ELSE 'familiar'
    END;

    UPDATE public.vocab_tower_v2_item_progress progress
       SET learning_state = v_state,
           attempt_count = progress.attempt_count + 1,
           correct_count = progress.correct_count + CASE WHEN NEW.is_correct THEN 1 ELSE 0 END,
           wrong_count = progress.wrong_count + CASE WHEN NEW.is_correct THEN 0 ELSE 1 END,
           consecutive_correct = v_streak,
           correct_question_types = v_correct_types,
           last_question_type = v_question.question_type,
           last_correct = NEW.is_correct,
           last_seen_run_id = NEW.run_id,
           last_seen_at = v_now,
           last_mastered_run_id = CASE
               WHEN v_state = 'mastered' AND progress.learning_state <> 'mastered' THEN NEW.run_id
               ELSE progress.last_mastered_run_id
           END,
           mastered_at = CASE
               WHEN v_state = 'mastered' AND progress.learning_state <> 'mastered' THEN v_now
               ELSE progress.mastered_at
           END,
           next_review_at = CASE v_state
               WHEN 'needs_review' THEN v_now
               WHEN 'mastered' THEN v_now + INTERVAL '14 days'
               WHEN 'familiar' THEN v_now + INTERVAL '3 days'
               ELSE v_now + INTERVAL '1 day'
           END,
           updated_at = v_now
     WHERE progress.student_id = NEW.student_id
       AND progress.class_id = NEW.class_id
       AND progress.grade = v_run.grade
       AND progress.deck_number = v_run.v2_deck_number
       AND progress.item_key = v_question.item_key;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_vocab_tower_v2_item_progress_v1()
    FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
