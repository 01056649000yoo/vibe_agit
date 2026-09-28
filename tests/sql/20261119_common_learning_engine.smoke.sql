-- 20261120 파일에서 바뀜: 옛 어휘 진도 표는 얼었고 엔진 표만 쓴다(③ 존재만 대조, ④ 엔진에만 기록).
-- 20261156 파일에서 바뀜: 어휘 층당 진도 보상 총액 상한(500P)이 없어져 ② 대조 범위를 500P 이하로 좁히고 상한 없음을 따로 본다.
-- 공통 학습 엔진 1단계 스모크. 핵심 합격 조건은 **엔진 규칙이 어휘 V2와 완전히 같다**는 것이다.
-- 규칙이 한 곳이라도 달라지면 학생이 보는 익힘 판정·복습 시점이 조용히 바뀐다.
-- 반드시 ROLLBACK 트랜잭션에서 돌린다.

-- ① 상태 전이 규칙이 어휘 V2 계산과 모든 조합에서 일치하는가
DO $$
DECLARE
    r RECORD;
    v_engine RECORD;
    v_expect_state TEXT;
    v_expect_streak SMALLINT;
    v_expect_types TEXT[];
    v_expect_interval INTERVAL;
    v_checked INTEGER := 0;
BEGIN
    FOR r IN
        SELECT is_correct, used_hint, prev_state, prev_streak, prev_types, qtype
        FROM (VALUES (true), (false)) a(is_correct)
        CROSS JOIN (VALUES (true), (false)) b(used_hint)
        CROSS JOIN (VALUES (NULL), ('learning'), ('familiar'), ('needs_review'), ('mastered')) c(prev_state)
        CROSS JOIN (VALUES (0::SMALLINT), (1::SMALLINT), (2::SMALLINT)) d(prev_streak)
        CROSS JOIN (VALUES
            (ARRAY[]::TEXT[]),
            (ARRAY['meaningChoice']),
            (ARRAY['meaningChoice','definitionInput'])
        ) e(prev_types)
        CROSS JOIN (VALUES ('meaningChoice'), ('definitionInput'), ('clozeInput')) f(qtype)
    LOOP
        -- 어휘 V2 원본 규칙을 그대로 재현한 기대값
        v_expect_types := r.prev_types;
        IF r.is_correct AND NOT r.used_hint AND NOT (r.qtype = ANY(v_expect_types)) THEN
            v_expect_types := array_append(v_expect_types, r.qtype);
        END IF;
        v_expect_streak := CASE
            WHEN r.is_correct AND NOT r.used_hint THEN COALESCE(r.prev_streak, 0) + 1 ELSE 0 END;

        IF r.prev_state IS NULL THEN
            -- 처음 만난 항목: 원본 INSERT 분기와 같아야 한다
            v_expect_state := CASE
                WHEN NOT r.is_correct THEN 'needs_review'
                WHEN r.used_hint THEN 'learning'
                ELSE 'familiar' END;
        ELSE
            v_expect_state := CASE
                WHEN NOT r.is_correct THEN 'needs_review'
                WHEN r.used_hint THEN 'learning'
                WHEN cardinality(v_expect_types) >= 2 AND v_expect_streak >= 2 THEN 'mastered'
                ELSE 'familiar' END;
        END IF;

        v_expect_interval := CASE v_expect_state
            WHEN 'needs_review' THEN INTERVAL '0'
            WHEN 'mastered' THEN INTERVAL '14 days'
            WHEN 'familiar' THEN INTERVAL '3 days'
            ELSE INTERVAL '1 day' END;

        SELECT * INTO v_engine FROM public.learning_engine_next_state_v1(
            r.is_correct, r.used_hint, r.qtype, r.prev_state, r.prev_streak, r.prev_types);

        IF v_engine.learning_state IS DISTINCT FROM v_expect_state
           OR v_engine.consecutive_correct IS DISTINCT FROM v_expect_streak
           OR v_engine.correct_question_types IS DISTINCT FROM v_expect_types
           OR v_engine.review_interval IS DISTINCT FROM v_expect_interval THEN
            RAISE EXCEPTION '① 엔진 규칙이 어휘와 다릅니다 (정답=% 힌트=% 이전상태=% 연속=% 형태=% 유형=%): 엔진(%,%,%,%) 기대(%,%,%,%)',
                r.is_correct, r.used_hint, r.prev_state, r.prev_streak, r.prev_types, r.qtype,
                v_engine.learning_state, v_engine.consecutive_correct, v_engine.correct_question_types, v_engine.review_interval,
                v_expect_state, v_expect_streak, v_expect_types, v_expect_interval;
        END IF;
        v_checked := v_checked + 1;
    END LOOP;

    IF v_checked < 500 THEN
        RAISE EXCEPTION '① 검사한 조합이 %개뿐입니다(500개 이상이어야 함).', v_checked;
    END IF;
    RAISE NOTICE '① 상태 전이 규칙 %개 조합이 어휘 V2와 일치', v_checked;
END; $$;

-- ② 구간 포인트가 어휘 함수와 완전히 같은가
DO $$
DECLARE r RECORD; v_diff INTEGER;
BEGIN
    -- 20261156 파일에서 바뀜: 어휘 함수는 층당 총액 500P 상한을 없앴다. 엔진 함수는 아무도 부르지 않은 채
    -- 옛 상한이 남아 있으므로 500P 이하에서만 둘을 대조하고, 상한 없음은 아래에서 어휘 함수만 본다.
    IF (SELECT SUM(v.reward_points) FROM public.vocab_tower_v2_progress_milestones_v1(157, 999) v) <> 999 THEN
        RAISE EXCEPTION '② 어휘 층당 보상 총액이 다시 500P 등으로 잘립니다(20261156 상한 없음 계약).';
    END IF;
    FOR r IN SELECT * FROM (VALUES (0,0),(1,100),(12,100),(157,100),(157,0),(157,500)) v(items, pts)
    LOOP
        -- 두 함수는 반환 컬럼 이름만 다르고(엔진은 콘텐츠 중립 이름) 값은 같아야 한다.
        SELECT count(*) INTO v_diff FROM (
            SELECT e.percent, e.required_items, e.points
              FROM public.learning_engine_collection_milestones_v1(r.items, r.pts) e
            EXCEPT
            SELECT v.milestone_percent, v.mastered_threshold, v.reward_points
              FROM public.vocab_tower_v2_progress_milestones_v1(r.items, r.pts) v
        ) d;
        IF v_diff <> 0 THEN
            RAISE EXCEPTION '② 구간 포인트가 어휘와 다릅니다 (항목 %, 총액 %)', r.items, r.pts;
        END IF;
    END LOOP;
    RAISE NOTICE '② 구간 포인트가 어휘 V2와 일치';
END; $$;

-- ③ 기존 진도가 빠짐없이 옮겨졌는가
DO $$
DECLARE v_old INTEGER; v_new INTEGER; v_mismatch INTEGER;
BEGIN
    SELECT count(*) INTO v_old FROM public.vocab_tower_v2_item_progress;
    SELECT count(*) INTO v_new FROM public.learning_item_progress WHERE content_type = 'vocab';
    IF v_new < v_old THEN
        RAISE EXCEPTION '③ 항목 진도가 덜 옮겨졌습니다: 옛 % → 새 %', v_old, v_new;
    END IF;

    -- 20261120 부터 옛 표는 얼어 있고 엔진 표만 계속 바뀐다. 값 대조는 이관 당시에만 의미가 있으므로
    -- 이제는 옛 행마다 엔진 행이 빠짐없이 있는지만 본다.
    SELECT count(*) INTO v_mismatch
    FROM public.vocab_tower_v2_item_progress old
    LEFT JOIN public.learning_item_progress new
      ON new.student_id = old.student_id AND new.class_id = old.class_id
     AND new.content_type = 'vocab'
     AND new.collection_key = public.vocab_tower_v2_collection_key(old.grade, old.deck_number)
     AND new.item_key = old.item_key
    WHERE new.item_key IS NULL;
    IF v_mismatch <> 0 THEN
        RAISE EXCEPTION '③ 엔진 표로 옮겨지지 않은 옛 진도 행이 %개 있습니다', v_mismatch;
    END IF;

    RAISE NOTICE '③ 항목 진도 이관 완료 (옛 %행 → 새 %행)', v_old, v_new;
    SELECT count(*) INTO v_old FROM public.vocab_tower_v2_deck_progress;
    SELECT count(*) INTO v_new FROM public.learning_collection_progress WHERE content_type = 'vocab';
    IF v_new < v_old THEN
        RAISE EXCEPTION '③ 묶음 진도가 덜 옮겨졌습니다: 옛 % → 새 %', v_old, v_new;
    END IF;
    RAISE NOTICE '③ 묶음 진도 이관 완료 (옛 %행 → 새 %행)', v_old, v_new;
END; $$;

-- ④ 새 답안이 양쪽에 같은 상태로 남는가 (실제 트리거 경로)
DO $$
DECLARE
    v_q public.vocab_tower_v2_run_questions%ROWTYPE;
    v_run public.vocab_tower_runs%ROWTYPE;
    v_key TEXT;
    v_old TEXT; v_new TEXT;
BEGIN
    -- 문항 하나당 답안은 한 번만 넣을 수 있으므로 아직 답하지 않은 문항을 고른다.
    SELECT question.* INTO v_q
    FROM public.vocab_tower_v2_run_questions question
    WHERE NOT EXISTS (
        SELECT 1 FROM public.vocab_tower_answers a
        WHERE a.run_id = question.run_id AND a.question_key = question.id::TEXT
    )
    LIMIT 1;
    IF v_q.id IS NULL THEN RAISE NOTICE '④ 답하지 않은 실행 문항이 없어 건너뜀'; RETURN; END IF;
    SELECT run.* INTO v_run FROM public.vocab_tower_runs run WHERE run.id = v_q.run_id;
    IF v_run.id IS NULL OR v_run.v2_deck_number IS NULL THEN
        RAISE NOTICE '④ V2 실행을 찾지 못해 건너뜀'; RETURN;
    END IF;
    v_key := public.vocab_tower_v2_collection_key(v_run.grade, v_run.v2_deck_number);
    SELECT row_to_json(old)::TEXT INTO v_old FROM public.vocab_tower_v2_item_progress old
     WHERE student_id = v_q.student_id AND class_id = v_q.class_id
       AND grade = v_run.grade AND deck_number = v_run.v2_deck_number AND item_key = v_q.item_key;
    INSERT INTO public.vocab_tower_answers
        (run_id, student_id, class_id, question_key, room_type, word, selected_answer, is_correct, used_hint)
    VALUES (v_q.run_id, v_q.student_id, v_q.class_id, v_q.id::TEXT,
            'meaning', v_q.item_key, '스모크', true, false);

    -- 20261120 파일에서 바뀜: 양쪽 쓰기를 끝냈다. 답안은 엔진 표에만 남고 옛 표 행은 그대로여야 한다.
    IF (SELECT row_to_json(old)::TEXT FROM public.vocab_tower_v2_item_progress old
         WHERE student_id = v_q.student_id AND class_id = v_q.class_id
           AND grade = v_run.grade AND deck_number = v_run.v2_deck_number AND item_key = v_q.item_key)
       IS DISTINCT FROM v_old THEN
        RAISE EXCEPTION '④ 쓰지 않기로 한 옛 어휘 진도 표에 답안이 기록됐습니다';
    END IF;
    SELECT learning_state INTO v_new FROM public.learning_item_progress
     WHERE student_id = v_q.student_id AND class_id = v_q.class_id
       AND content_type = 'vocab' AND collection_key = v_key AND item_key = v_q.item_key;

    IF v_new IS NULL THEN RAISE EXCEPTION '④ 엔진에 답안이 기록되지 않았습니다'; END IF;
    RAISE NOTICE '④ 새 답안이 엔진 표에만 기록됨(%)', v_new;
END; $$;

-- ⑤ 엔진 표가 학생·교사에게 직접 열려 있지 않은가
DO $$
BEGIN
    IF has_table_privilege('authenticated', 'public.learning_item_progress', 'SELECT')
       OR has_table_privilege('anon', 'public.learning_item_progress', 'SELECT')
       OR has_table_privilege('authenticated', 'public.learning_collection_progress', 'SELECT') THEN
        RAISE EXCEPTION '⑤ 엔진 진도 표가 직접 조회 가능합니다';
    END IF;
    IF has_function_privilege('authenticated',
        'public.learning_engine_record_answer_v1(uuid,uuid,text,text,text,text,boolean,boolean,uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION '⑤ 엔진 기록 함수가 로그인 사용자에게 공개되었습니다';
    END IF;
    RAISE NOTICE '⑤ 엔진 표·기록 함수 잠금 확인';
END; $$;
