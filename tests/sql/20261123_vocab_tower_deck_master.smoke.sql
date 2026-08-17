-- 덱마스터 시험 스모크. 반드시 ROLLBACK 트랜잭션에서 돌린다.
-- 가장 중요한 조건은 **정답이 문항과 함께 내려가지 않는 것**과 **채점을 서버가 하는 것**이다.
DO $$
DECLARE
    v_student public.students%ROWTYPE;
    v_class public.classes%ROWTYPE;
    v_grade SMALLINT;
    v_deck SMALLINT := 1;
    v_key TEXT;
    v_res JSONB; v_q JSONB; v_fin JSONB;
    v_attempt UUID;
    v_item RECORD;
    v_input_seen INTEGER := 0; v_choice_seen INTEGER := 0;
    v_answer TEXT;
    v_correct_target INTEGER;
    v_given INTEGER := 0;
BEGIN
    SELECT s.* INTO v_student FROM public.students s
    JOIN public.classes c ON c.id = s.class_id
    WHERE s.auth_id IS NOT NULL AND s.deleted_at IS NULL AND s.is_active IS DISTINCT FROM FALSE
      AND c.vocab_tower_enabled IS TRUE AND c.vocab_tower_content_version = 'v2'
    LIMIT 1;
    IF v_student.id IS NULL THEN RAISE NOTICE '어휘 V2 학급 학생이 없어 건너뜀'; RETURN; END IF;
    SELECT c.* INTO v_class FROM public.classes c WHERE c.id = v_student.class_id;
    v_grade := v_class.vocab_tower_grade::SMALLINT;
    v_key := public.vocab_tower_v2_collection_key(v_grade, v_deck);

    PERFORM set_config('request.jwt.claim.sub', v_student.auth_id::text, true);
    PERFORM set_config('request.jwt.claims',
        jsonb_build_object('sub', v_student.auth_id, 'role', 'authenticated')::text, true);

    -- ① 자격이 없으면 시작할 수 없다
    DELETE FROM public.learning_item_progress
     WHERE student_id = v_student.id AND content_type = 'vocab' AND collection_key = v_key;
    v_res := public.start_my_vocab_tower_master_v1(v_deck);
    IF (v_res->>'success')::BOOLEAN THEN
        RAISE EXCEPTION '① 자격이 없는데 시험이 시작되었습니다';
    END IF;
    IF v_res->'eligibility' IS NULL THEN
        RAISE EXCEPTION '① 자격 미달 사유를 알려 주지 않습니다';
    END IF;
    RAISE NOTICE '① 자격 미달 차단 (%)', v_res->'eligibility'->>'missing_mastered';

    -- ② 자격을 채우면 시작된다 — 덱 전체를 익힘으로 만든다
    INSERT INTO public.learning_item_progress
        (student_id, class_id, content_type, collection_key, item_key, learning_state)
    SELECT v_student.id, v_student.class_id, 'vocab', v_key, item.item_key, 'mastered'
    FROM public.vocab_tower_v2_review_items item
    JOIN public.vocab_tower_v2_review_decks deck ON deck.deck_id = item.deck_id
    WHERE deck.grade = v_grade AND deck.deck_number = v_deck
    ON CONFLICT DO NOTHING;

    v_res := public.start_my_vocab_tower_master_v1(v_deck);
    IF NOT (v_res->>'success')::BOOLEAN THEN
        RAISE EXCEPTION '② 자격을 채웠는데 시작되지 않습니다: %', v_res;
    END IF;
    v_attempt := (v_res->>'attempt_id')::UUID;
    IF (v_res->>'question_count')::INTEGER <> v_class.vocab_master_question_count THEN
        RAISE EXCEPTION '② 문항 수가 설정과 다릅니다: %', v_res->>'question_count';
    END IF;

    -- 같은 층을 다시 시작해도 새 시험이 만들어지지 않는다(새로고침 대비)
    IF (public.start_my_vocab_tower_master_v1(v_deck)->>'attempt_id')::UUID <> v_attempt THEN
        RAISE EXCEPTION '② 시험이 중복 생성되었습니다';
    END IF;

    -- 선택형·직접 입력 구성이 설정대로인지
    SELECT count(*) FILTER (WHERE is_input), count(*) FILTER (WHERE NOT is_input)
      INTO v_input_seen, v_choice_seen
    FROM public.vocab_master_questions WHERE attempt_id = v_attempt;
    IF v_input_seen <> v_class.vocab_master_input_count THEN
        RAISE EXCEPTION '② 직접 입력 문항 수가 다릅니다: % (설정 %)', v_input_seen, v_class.vocab_master_input_count;
    END IF;
    RAISE NOTICE '② 시험 시작 — 선택형 %개, 직접 입력 %개', v_choice_seen, v_input_seen;

    -- ③ 문항 응답에 정답이 섞여 나가지 않는다
    v_q := public.get_my_vocab_tower_master_question_v1(v_attempt);
    IF (v_q->>'finished')::BOOLEAN THEN RAISE EXCEPTION '③ 첫 문항이 없습니다'; END IF;
    IF v_q ? 'accepted_answers' OR v_q ? 'word' OR v_q ? 'is_correct' THEN
        RAISE EXCEPTION '③ 문항 응답에 정답 정보가 들어 있습니다: %', v_q;
    END IF;
    -- 선택형 보기는 값만 나가고 정답 표시가 없어야 한다
    IF NOT (v_q->>'is_input')::BOOLEAN AND (v_q->'options')::TEXT ILIKE '%isCorrect%' THEN
        RAISE EXCEPTION '③ 보기에 정답 표시가 남아 있습니다';
    END IF;
    RAISE NOTICE '③ 문항 응답에 정답 노출 없음';

    -- ④ 서버가 채점한다 — 정답 개수를 정확히 맞춰 합격선 바로 위로 만든다
    v_correct_target := v_class.vocab_master_pass_correct;
    FOR v_item IN
        SELECT id, is_input, accepted_answers, sequence_number
        FROM public.vocab_master_questions WHERE attempt_id = v_attempt ORDER BY sequence_number
    LOOP
        IF v_given < v_correct_target THEN
            v_answer := v_item.accepted_answers[1];
            v_given := v_given + 1;
        ELSE
            v_answer := '틀린답변XYZ';
        END IF;
        PERFORM public.submit_my_vocab_tower_master_answer_v1(v_item.id, v_answer);
    END LOOP;

    -- 같은 문항에 두 번 답할 수 없다
    BEGIN
        SELECT id INTO v_item FROM public.vocab_master_questions WHERE attempt_id = v_attempt LIMIT 1;
        PERFORM public.submit_my_vocab_tower_master_answer_v1(v_item.id, '재제출');
        RAISE EXCEPTION '④ 같은 문항에 두 번 답할 수 있습니다';
    EXCEPTION WHEN sqlstate '23505' THEN NULL;
    END;
    RAISE NOTICE '④ 서버 채점·중복 제출 차단 (정답 %개 제출)', v_given;

    -- ⑤ 합격 판정과 결과
    v_fin := public.finish_my_vocab_tower_master_v1(v_attempt, TRUE);
    IF (v_fin->>'correct_count')::INTEGER <> v_correct_target THEN
        RAISE EXCEPTION '⑤ 채점 결과가 다릅니다: % (기대 %)', v_fin->>'correct_count', v_correct_target;
    END IF;
    IF v_fin->'wrong_items' IS NULL THEN
        RAISE EXCEPTION '⑤ 틀린 낱말 목록이 없습니다(카드함 연결용)';
    END IF;
    RAISE NOTICE '⑤ 채점 완료 — %/%점, 합격 %, 틀린 낱말 %개',
        v_fin->>'correct_count', v_fin->>'question_count', v_fin->>'passed',
        jsonb_array_length(v_fin->'wrong_items');

    -- ⑥ 끝난 시험에는 더 답할 수 없다
    SELECT id INTO v_item FROM public.vocab_master_questions WHERE attempt_id = v_attempt LIMIT 1;
    BEGIN
        UPDATE public.vocab_master_questions SET answered_at = NULL WHERE id = v_item.id;
        PERFORM public.submit_my_vocab_tower_master_answer_v1(v_item.id, '늦은답');
        RAISE EXCEPTION '⑥ 끝난 시험에 답을 넣을 수 있습니다';
    EXCEPTION WHEN sqlstate '22023' THEN NULL;
    END;
    RAISE NOTICE '⑥ 종료된 시험 답안 차단';
END; $$;

-- ⑦ 권한 경계
DO $$
BEGIN
    IF has_table_privilege('authenticated', 'public.vocab_master_questions', 'SELECT') THEN
        RAISE EXCEPTION '⑦ 시험 문항 표가 직접 조회 가능합니다(정답이 그대로 보입니다)';
    END IF;
    IF has_function_privilege('anon', 'public.start_my_vocab_tower_master_v1(smallint)', 'EXECUTE') THEN
        RAISE EXCEPTION '⑦ 시험 시작이 비로그인에 공개되었습니다';
    END IF;
    RAISE NOTICE '⑦ 권한 경계 확인';
END; $$;
