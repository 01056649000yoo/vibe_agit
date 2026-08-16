-- 어휘의 탑 V2 낱말 카드함 — 학생이 낱말별 익힘 근거를 직접 확인하는 조회 RPC.
--
-- 배경: 지금은 층 카드에 `처음 볼 낱말 / 연습 중 / 다시 볼 낱말 / 완전히 익힘` 개수만 보인다.
-- 학생은 "왜 아직 익힘이 아닌지", "언제 다시 만나는지"를 알 수 없어 다음에 뭘 해야 할지 모른다.
-- 낱말마다 시도·정답·오답 횟수, 성공한 문제 형태, 다음 복습 시점을 그대로 보여 준다.
--
-- **아직 만나지 않은 낱말은 목록에 넣지 않는다.** 카드함으로 앞으로 나올 낱말과 뜻을 미리 볼 수 있으면
-- 직접 입력형에서 정답을 감추는 장치(20261111)가 무의미해진다. 만나지 않은 수는 개수로만 알려 준다.
--
-- 새 표를 만들지 않고 기존 `vocab_tower_v2_item_progress` 를 읽기만 한다. 쓰기 경로 변경 없음.

CREATE OR REPLACE FUNCTION public.get_my_vocab_tower_v2_card_box_v1(p_deck_number SMALLINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID := public.auth_user_class_id();
    v_grade SMALLINT;
    v_enabled BOOLEAN;
    v_item_count INTEGER := 0;
    v_seen_count INTEGER := 0;
    v_cards JSONB;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL OR v_class_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    IF p_deck_number IS NULL OR p_deck_number NOT BETWEEN 1 AND 10 THEN
        RAISE EXCEPTION '층 번호가 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT
        LEAST(6, GREATEST(3, COALESCE(class.vocab_tower_grade, 3)))::SMALLINT,
        CASE
            WHEN class.enabled_modules IS NULL THEN COALESCE(class.vocab_tower_enabled, FALSE)
            ELSE 'vocab-tower' = ANY(class.enabled_modules)
        END
      INTO v_grade, v_enabled
    FROM public.classes class
    WHERE class.id = v_class_id
      AND class.vocab_tower_content_version = 'v2'
      AND class.deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION '이 학급은 V2 개인 연습을 사용하지 않습니다.' USING ERRCODE = '55000';
    END IF;
    IF NOT COALESCE(v_enabled, FALSE) THEN
        RETURN jsonb_build_object('success', FALSE, 'error', '선생님이 지금은 어휘의 탑을 열어두지 않았어요.');
    END IF;

    SELECT count(*)::INTEGER INTO v_item_count
    FROM public.vocab_tower_v2_review_items item
    JOIN public.vocab_tower_v2_review_decks deck ON deck.deck_id = item.deck_id
    WHERE deck.grade = v_grade
      AND deck.deck_number = p_deck_number
      AND deck.review_status = 'locked';

    -- 만난 낱말만 돌려준다. 한 층은 38~40개라 상한 안에서 끝난다.
    SELECT COALESCE(jsonb_agg(card ORDER BY card->>'sort_key'), '[]'::JSONB), count(*)::INTEGER
      INTO v_cards, v_seen_count
    FROM (
        SELECT jsonb_build_object(
            'item_key', item.item_key,
            'word', item.word,
            'definition', item.definition,
            'example', item.example,
            'learning_state', progress.learning_state,
            -- 화면 표시용 분류. 상태만으로는 `왜 아직 익힘이 아닌지`가 드러나지 않아 근거를 함께 나눈다.
            'card_state', CASE
                WHEN progress.learning_state = 'needs_review' AND progress.wrong_count >= 2 THEN 'confusing'
                WHEN progress.learning_state = 'needs_review' THEN 'review_now'
                WHEN progress.learning_state = 'mastered'
                     AND progress.next_review_at IS NOT NULL AND progress.next_review_at <= NOW() THEN 'review_due'
                WHEN progress.learning_state = 'mastered' THEN 'mastered'
                WHEN progress.learning_state = 'familiar'
                     AND progress.next_review_at IS NOT NULL AND progress.next_review_at <= NOW() THEN 'review_due'
                WHEN progress.learning_state = 'familiar' THEN 'almost'
                ELSE 'learning'
            END,
            'attempt_count', progress.attempt_count,
            'correct_count', progress.correct_count,
            'wrong_count', progress.wrong_count,
            'consecutive_correct', progress.consecutive_correct,
            'correct_question_types', to_jsonb(progress.correct_question_types),
            'correct_type_count', cardinality(progress.correct_question_types),
            'last_correct', progress.last_correct,
            'last_seen_at', progress.last_seen_at,
            'next_review_at', progress.next_review_at,
            'sort_key', CASE
                WHEN progress.learning_state = 'needs_review' THEN '1'
                WHEN progress.learning_state = 'learning' THEN '2'
                WHEN progress.learning_state = 'familiar' THEN '3'
                ELSE '4'
            END || item.word
        ) AS card
        FROM public.vocab_tower_v2_item_progress progress
        JOIN public.vocab_tower_v2_review_items item ON item.item_key = progress.item_key
        JOIN public.vocab_tower_v2_review_decks deck ON deck.deck_id = item.deck_id
        WHERE progress.student_id = v_student_id
          AND progress.class_id = v_class_id
          AND progress.grade = v_grade
          AND progress.deck_number = p_deck_number
          AND deck.grade = v_grade
          AND deck.deck_number = p_deck_number
          AND deck.review_status = 'locked'
        LIMIT 100
    ) cards;

    RETURN jsonb_build_object(
        'success', TRUE,
        'grade', v_grade,
        'deck_number', p_deck_number,
        'item_count', v_item_count,
        'seen_count', v_seen_count,
        'unseen_count', GREATEST(v_item_count - v_seen_count, 0),
        'cards', v_cards
    );
END;
$$;

COMMENT ON FUNCTION public.get_my_vocab_tower_v2_card_box_v1(SMALLINT) IS
    '학생 본인이 만난 낱말의 익힘 근거와 다음 복습 시점을 돌려준다. 만나지 않은 낱말은 개수만 알려 준다.';

REVOKE ALL ON FUNCTION public.get_my_vocab_tower_v2_card_box_v1(SMALLINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_vocab_tower_v2_card_box_v1(SMALLINT) TO authenticated;
