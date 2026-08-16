-- migrate:check가 만든 바깥 트랜잭션에서 실행되며 마지막에 전부 롤백된다.
-- 카드함이 만난 낱말만 돌려주고, 아직 만나지 않은 낱말의 뜻을 노출하지 않는지 확인한다.

SELECT set_config('test.vocab_card_class_id', class.id::TEXT, true),
       set_config('test.vocab_card_teacher_id', class.teacher_id::TEXT, true),
       set_config('test.vocab_card_student_id', student.id::TEXT, true),
       set_config('test.vocab_card_student_auth_id', student.auth_id::TEXT, true)
FROM public.classes class
JOIN public.profiles profile
  ON profile.id = class.teacher_id
 AND profile.role = 'TEACHER'
 AND profile.is_approved IS TRUE
 AND profile.approval_revoked_at IS NULL
JOIN public.students student
  ON student.class_id = class.id
 AND student.auth_id IS NOT NULL
 AND student.is_active IS DISTINCT FROM FALSE
 AND student.deleted_at IS NULL
WHERE class.deleted_at IS NULL
ORDER BY class.created_at
LIMIT 1;

DO $$
DECLARE
    v_student_id UUID := current_setting('test.vocab_card_student_id', true)::UUID;
    v_class_id UUID;
BEGIN
    IF current_setting('test.vocab_card_class_id', true) IS NULL OR v_student_id IS NULL THEN
        RAISE EXCEPTION '카드함 스모크용 fixture가 없습니다.';
    END IF;
    v_class_id := current_setting('test.vocab_card_class_id')::UUID;

    UPDATE public.classes class
       SET vocab_tower_grade = 3,
           vocab_tower_enabled = TRUE,
           enabled_modules = CASE
               WHEN class.enabled_modules IS NULL THEN ARRAY['vocab-tower']::TEXT[]
               WHEN 'vocab-tower' = ANY(class.enabled_modules) THEN class.enabled_modules
               ELSE array_append(class.enabled_modules, 'vocab-tower')
           END
     WHERE class.id = v_class_id;

    DELETE FROM public.vocab_tower_v2_item_progress progress
     WHERE progress.student_id = v_student_id
       AND progress.class_id = v_class_id;
END;
$$;

SELECT set_config('request.jwt.claim.sub', current_setting('test.vocab_card_teacher_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.vocab_card_teacher_id'), 'role', 'authenticated'
)::TEXT, true);
SELECT public.set_teacher_vocab_tower_content_version_v2(
    current_setting('test.vocab_card_class_id')::UUID, 'v2'
);

SELECT set_config('request.jwt.claim.sub', current_setting('test.vocab_card_student_auth_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.vocab_card_student_auth_id'), 'role', 'authenticated'
)::TEXT, true);

DO $$
DECLARE
    v_student_id UUID := current_setting('test.vocab_card_student_id')::UUID;
    v_class_id UUID := current_setting('test.vocab_card_class_id')::UUID;
    v_box JSONB;
    v_card JSONB;
    v_item_count INTEGER;
    v_first TEXT;
    v_second TEXT;
BEGIN
    SELECT count(*)::INTEGER INTO v_item_count
    FROM public.vocab_tower_v2_review_items item
    JOIN public.vocab_tower_v2_review_decks deck ON deck.deck_id = item.deck_id
    WHERE deck.grade = 3 AND deck.deck_number = 4 AND deck.review_status = 'locked';

    -- 1) 아무 낱말도 만나지 않았으면 카드가 없고 전체가 미확인으로 잡힌다.
    v_box := public.get_my_vocab_tower_v2_card_box_v1(4::SMALLINT);
    IF (v_box->>'success')::BOOLEAN IS NOT TRUE THEN
        RAISE EXCEPTION '카드함 조회가 실패했습니다: %', v_box;
    END IF;
    IF jsonb_array_length(v_box->'cards') <> 0
       OR (v_box->>'unseen_count')::INTEGER <> v_item_count THEN
        RAISE EXCEPTION '만나지 않은 낱말이 카드로 노출됐습니다: %', v_box;
    END IF;

    -- 2) 두 낱말만 만난 상태를 만든다.
    SELECT item.item_key INTO v_first
    FROM public.vocab_tower_v2_review_items item
    JOIN public.vocab_tower_v2_review_decks deck ON deck.deck_id = item.deck_id
    WHERE deck.grade = 3 AND deck.deck_number = 4 AND deck.review_status = 'locked'
    ORDER BY item.item_key LIMIT 1;
    SELECT item.item_key INTO v_second
    FROM public.vocab_tower_v2_review_items item
    JOIN public.vocab_tower_v2_review_decks deck ON deck.deck_id = item.deck_id
    WHERE deck.grade = 3 AND deck.deck_number = 4 AND deck.review_status = 'locked'
      AND item.item_key <> v_first
    ORDER BY item.item_key LIMIT 1;

    INSERT INTO public.vocab_tower_v2_item_progress (
        student_id, class_id, grade, deck_number, item_key,
        learning_state, attempt_count, correct_count, wrong_count,
        consecutive_correct, correct_question_types, last_correct, next_review_at
    ) VALUES
        (v_student_id, v_class_id, 3, 4, v_first,
         'needs_review', 3, 1, 2, 0, ARRAY['meaningChoice']::TEXT[], FALSE, NOW()),
        (v_student_id, v_class_id, 3, 4, v_second,
         'mastered', 4, 4, 0, 2, ARRAY['meaningChoice', 'definitionInput']::TEXT[], TRUE,
         NOW() + INTERVAL '14 days');

    v_box := public.get_my_vocab_tower_v2_card_box_v1(4::SMALLINT);
    IF jsonb_array_length(v_box->'cards') <> 2 THEN
        RAISE EXCEPTION '만난 낱말 2개가 카드로 나오지 않았습니다: %', v_box->'cards';
    END IF;
    IF (v_box->>'seen_count')::INTEGER <> 2
       OR (v_box->>'unseen_count')::INTEGER <> v_item_count - 2 THEN
        RAISE EXCEPTION '만난/미확인 개수가 맞지 않습니다: %', v_box;
    END IF;

    -- 3) 자주 틀린 낱말이 맨 앞에 오고 `자주 헷갈림`으로 분류된다.
    v_card := v_box->'cards'->0;
    IF v_card->>'item_key' <> v_first OR v_card->>'card_state' <> 'confusing' THEN
        RAISE EXCEPTION '두 번 이상 틀린 낱말이 먼저·자주 헷갈림으로 분류되지 않았습니다: %', v_card;
    END IF;
    IF (v_card->>'wrong_count')::INTEGER <> 2 OR (v_card->>'correct_type_count')::INTEGER <> 1 THEN
        RAISE EXCEPTION '익힘 근거 수치가 그대로 전달되지 않았습니다: %', v_card;
    END IF;

    -- 4) 익힘 낱말은 성공한 두 유형을 근거로 함께 돌려준다.
    v_card := v_box->'cards'->1;
    IF v_card->>'card_state' <> 'mastered' OR (v_card->>'correct_type_count')::INTEGER <> 2 THEN
        RAISE EXCEPTION '익힘 낱말의 근거가 올바르지 않습니다: %', v_card;
    END IF;
    IF v_card->'correct_question_types' IS NULL
       OR NOT (v_card->'correct_question_types' @> '["definitionInput"]'::JSONB) THEN
        RAISE EXCEPTION '성공한 문제 형태가 전달되지 않았습니다: %', v_card;
    END IF;
    IF v_card->>'next_review_at' IS NULL THEN
        RAISE EXCEPTION '다음 복습 시점이 비어 있습니다: %', v_card;
    END IF;

    -- 5) 복습 시점이 지난 익힘 낱말은 `복습할 때`로 바뀐다.
    UPDATE public.vocab_tower_v2_item_progress progress
       SET next_review_at = NOW() - INTERVAL '1 day'
     WHERE progress.student_id = v_student_id
       AND progress.class_id = v_class_id
       AND progress.grade = 3
       AND progress.deck_number = 4
       AND progress.item_key = v_second;

    v_box := public.get_my_vocab_tower_v2_card_box_v1(4::SMALLINT);
    SELECT card INTO v_card
    FROM jsonb_array_elements(v_box->'cards') card
    WHERE card->>'item_key' = v_second;
    IF v_card->>'card_state' <> 'review_due' THEN
        RAISE EXCEPTION '복습 시점이 지난 낱말이 복습할 때로 바뀌지 않았습니다: %', v_card;
    END IF;
END;
$$;

-- 다른 학생의 카드함을 볼 수 없다(RPC는 본인 것만 조회한다).
DO $$
BEGIN
    IF has_function_privilege('anon', 'public.get_my_vocab_tower_v2_card_box_v1(smallint)', 'EXECUTE') THEN
        RAISE EXCEPTION '비로그인 사용자가 카드함을 조회할 수 있습니다.';
    END IF;
END;
$$;
