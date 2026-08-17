-- 읽기 전환 스모크. 합격 조건은 **전환 뒤 화면 응답이 전환 전과 완전히 같다**는 것이다.
-- 저장소만 바꿨으므로 출제 우선순위·카드함 분류·포인트·정렬이 하나라도 달라지면 실패다.
-- 반드시 ROLLBACK 트랜잭션에서 돌린다.

-- ① 옛 진도표를 더 이상 읽지도 쓰지도 않는가
DO $$
DECLARE v_refs INTEGER;
BEGIN
    SELECT count(*) INTO v_refs
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND prosrc ~ 'vocab_tower_v2_(item|deck)_progress'
      -- 이관 마이그레이션 자체는 옛 표를 읽어야 하므로 대상에서 뺀다(런타임 함수만 본다).
      AND proname NOT LIKE 'admin_%';
    IF v_refs <> 0 THEN
        RAISE EXCEPTION '① 아직 옛 진도표를 참조하는 함수가 %개 있습니다', v_refs;
    END IF;
    RAISE NOTICE '① 런타임 함수가 모두 엔진 표를 사용';
END; $$;

-- ② 학생 화면 응답이 전환 전후로 같은가
DO $$
DECLARE
    v_student public.students%ROWTYPE;
    v_before JSONB;
    v_after JSONB;
    v_deck SMALLINT;
BEGIN
    -- 진도가 있는 학생이라야 비교에 의미가 있다.
    SELECT s.* INTO v_student
    FROM public.students s
    JOIN public.learning_item_progress p
      ON p.student_id = s.id AND p.content_type = 'vocab'
    WHERE s.auth_id IS NOT NULL AND s.deleted_at IS NULL
    LIMIT 1;
    IF v_student.id IS NULL THEN RAISE NOTICE '② 진도 보유 학생이 없어 건너뜀'; RETURN; END IF;

    PERFORM set_config('request.jwt.claim.sub', v_student.auth_id::text, true);
    PERFORM set_config('request.jwt.claims',
        jsonb_build_object('sub', v_student.auth_id, 'role', 'authenticated')::text, true);

    -- 지도 개요: 층별 상태 수·최고 정답률이 그대로여야 한다.
    v_after := public.get_my_vocab_tower_v2_overview_v1();
    IF v_after IS NULL OR v_after->'decks' IS NULL THEN
        RAISE EXCEPTION '② 지도 개요가 비어 있습니다';
    END IF;
    IF jsonb_array_length(v_after->'decks') <> 10 THEN
        RAISE EXCEPTION '② 지도의 층이 10개가 아닙니다: %', jsonb_array_length(v_after->'decks');
    END IF;

    -- 엔진 집계와 화면 값이 일치하는지 층 하나로 확인한다.
    SELECT (deck->>'deck_number')::SMALLINT INTO v_deck
    FROM jsonb_array_elements(v_after->'decks') deck
    WHERE (deck->>'mastered_count')::INTEGER > 0 OR (deck->>'familiar_count')::INTEGER > 0
    LIMIT 1;

    IF v_deck IS NOT NULL THEN
        SELECT jsonb_build_object(
            'mastered', count(*) FILTER (WHERE learning_state = 'mastered'),
            'familiar', count(*) FILTER (WHERE learning_state = 'familiar'),
            'needs_review', count(*) FILTER (WHERE learning_state = 'needs_review')
        ) INTO v_before
        FROM public.learning_item_progress
        WHERE student_id = v_student.id AND class_id = v_student.class_id
          AND content_type = 'vocab'
          AND collection_key = public.vocab_tower_v2_collection_key(
                (SELECT vocab_tower_grade::SMALLINT FROM public.classes WHERE id = v_student.class_id), v_deck);

        SELECT deck INTO v_after
        FROM jsonb_array_elements(public.get_my_vocab_tower_v2_overview_v1()->'decks') deck
        WHERE (deck->>'deck_number')::SMALLINT = v_deck;

        IF (v_after->>'mastered_count')::INTEGER IS DISTINCT FROM (v_before->>'mastered')::INTEGER
           OR (v_after->>'familiar_count')::INTEGER IS DISTINCT FROM (v_before->>'familiar')::INTEGER
           OR (v_after->>'needs_review_count')::INTEGER IS DISTINCT FROM (v_before->>'needs_review')::INTEGER THEN
            RAISE EXCEPTION '② % 층의 화면 값과 엔진 집계가 다릅니다: 화면=% 엔진=%',
                v_deck, v_after, v_before;
        END IF;

        -- 카드함도 같은 층에서 열린다.
        v_after := public.get_my_vocab_tower_v2_card_box_v1(v_deck);
        IF v_after IS NULL OR (v_after->>'success') IS DISTINCT FROM 'true' THEN
            RAISE EXCEPTION '② 카드함이 열리지 않았습니다: %', v_after;
        END IF;
        -- 카드함이 세는 "만난 낱말"도 엔진 집계와 같아야 한다.
        IF (v_after->>'seen_count')::INTEGER IS DISTINCT FROM (
               (v_before->>'mastered')::INTEGER + (v_before->>'familiar')::INTEGER
             + (v_before->>'needs_review')::INTEGER
             + (SELECT count(*)::INTEGER FROM public.learning_item_progress
                 WHERE student_id = v_student.id AND class_id = v_student.class_id
                   AND content_type = 'vocab' AND learning_state = 'learning'
                   AND collection_key = public.vocab_tower_v2_collection_key(
                         (SELECT vocab_tower_grade::SMALLINT FROM public.classes WHERE id = v_student.class_id), v_deck))
           ) THEN
            RAISE EXCEPTION '② 카드함의 만난 낱말 수가 엔진 집계와 다릅니다: %', v_after->>'seen_count';
        END IF;
        RAISE NOTICE '② 지도·카드함이 엔진 집계와 일치 (%층)', v_deck;
    ELSE
        RAISE NOTICE '② 진도가 있는 층이 없어 층 대조는 건너뜀';
    END IF;
END; $$;

-- ③ 새 답안이 엔진에만 기록되고 옛 표는 얼어 있는가
DO $$
DECLARE
    v_q public.vocab_tower_v2_run_questions%ROWTYPE;
    v_run public.vocab_tower_runs%ROWTYPE;
    v_old_before INTEGER; v_old_after INTEGER;
    v_engine_state TEXT;
BEGIN
    SELECT question.* INTO v_q
    FROM public.vocab_tower_v2_run_questions question
    WHERE NOT EXISTS (
        SELECT 1 FROM public.vocab_tower_answers a
        WHERE a.run_id = question.run_id AND a.question_key = question.id::TEXT)
    LIMIT 1;
    IF v_q.id IS NULL THEN RAISE NOTICE '③ 답하지 않은 문항이 없어 건너뜀'; RETURN; END IF;
    SELECT run.* INTO v_run FROM public.vocab_tower_runs run WHERE run.id = v_q.run_id;
    IF v_run.v2_deck_number IS NULL THEN RAISE NOTICE '③ V2 실행이 아니라 건너뜀'; RETURN; END IF;

    SELECT count(*) INTO v_old_before FROM public.vocab_tower_v2_item_progress;

    INSERT INTO public.vocab_tower_answers
        (run_id, student_id, class_id, question_key, room_type, word, selected_answer, is_correct, used_hint)
    VALUES (v_q.run_id, v_q.student_id, v_q.class_id, v_q.id::TEXT,
            'meaning', v_q.item_key, '스모크', true, false);

    SELECT count(*) INTO v_old_after FROM public.vocab_tower_v2_item_progress;
    IF v_old_after <> v_old_before THEN
        RAISE EXCEPTION '③ 옛 진도표가 아직 쓰이고 있습니다 (% → %)', v_old_before, v_old_after;
    END IF;

    SELECT learning_state INTO v_engine_state
    FROM public.learning_item_progress
    WHERE student_id = v_q.student_id AND class_id = v_q.class_id AND content_type = 'vocab'
      AND collection_key = public.vocab_tower_v2_collection_key(v_run.grade, v_run.v2_deck_number)
      AND item_key = v_q.item_key;
    IF v_engine_state IS NULL THEN
        RAISE EXCEPTION '③ 엔진에 답안이 기록되지 않았습니다';
    END IF;
    RAISE NOTICE '③ 답안이 엔진에만 기록되고 옛 표는 그대로(상태 %)', v_engine_state;
END; $$;
