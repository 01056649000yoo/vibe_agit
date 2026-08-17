-- 공식 도전(덱 마스터) 엔진 스모크. 반드시 ROLLBACK 트랜잭션에서 돌린다.
-- 규칙은 ROADMAP `2단계 공식 도전`에서 왔다: 모든 항목을 확인하고 숙달해야 도전할 수 있고,
-- 전체와 직접 입력 기준을 함께 채워야 합격하며, 중도 종료는 최고 기록이 되지 않는다.

-- ① 합격 판정 — 전체와 직접 입력 기준을 **함께** 본다
DO $$
BEGIN
    -- 12문항 중 9개(75%), 직접 입력 4개 중 2개(50%) → 딱 기준 → 합격
    IF NOT public.learning_engine_challenge_passed_v1(9::SMALLINT, 12::SMALLINT, 2::SMALLINT, 4::SMALLINT) THEN
        RAISE EXCEPTION '① 기준을 정확히 채웠는데 불합격입니다';
    END IF;
    -- 전체는 넉넉한데 직접 입력이 모자라면 불합격이어야 한다(선택형만 찍어서 통과 방지)
    IF public.learning_engine_challenge_passed_v1(12::SMALLINT, 12::SMALLINT, 1::SMALLINT, 4::SMALLINT) THEN
        RAISE EXCEPTION '① 직접 입력이 모자란데 합격했습니다';
    END IF;
    -- 직접 입력은 다 맞았지만 전체가 모자라면 불합격
    IF public.learning_engine_challenge_passed_v1(8::SMALLINT, 12::SMALLINT, 4::SMALLINT, 4::SMALLINT) THEN
        RAISE EXCEPTION '① 전체 정답이 모자란데 합격했습니다';
    END IF;
    -- 직접 입력 문항이 아예 없으면 그 기준은 적용하지 않는다
    IF NOT public.learning_engine_challenge_passed_v1(9::SMALLINT, 12::SMALLINT, 0::SMALLINT, 0::SMALLINT) THEN
        RAISE EXCEPTION '① 직접 입력 문항이 없는데 그 기준으로 막았습니다';
    END IF;
    IF public.learning_engine_challenge_passed_v1(0::SMALLINT, 0::SMALLINT, 0::SMALLINT, 0::SMALLINT) THEN
        RAISE EXCEPTION '① 문항이 없는데 합격 처리되었습니다';
    END IF;
    RAISE NOTICE '① 합격 판정 5가지 통과';
END; $$;

-- ② 도전 자격 — 다 만나고 숙달해야 열린다
DO $$
DECLARE
    v_student public.students%ROWTYPE;
    v_key TEXT := 'smoke:deck';
    v_res JSONB;
    v_items INTEGER := 10;
BEGIN
    SELECT s.* INTO v_student FROM public.students s
    WHERE s.deleted_at IS NULL AND s.is_active IS DISTINCT FROM FALSE LIMIT 1;
    IF v_student.id IS NULL THEN RAISE EXCEPTION '② 스모크 학생을 찾지 못했습니다.'; END IF;

    -- 아직 아무것도 안 만난 상태
    v_res := public.learning_engine_challenge_eligibility_v1(
        v_student.id, v_student.class_id, 'smoke', v_key, v_items);
    IF (v_res->>'eligible')::boolean THEN RAISE EXCEPTION '② 아무것도 안 익혔는데 자격이 있습니다'; END IF;
    IF (v_res->>'unseen_count')::int <> v_items THEN
        RAISE EXCEPTION '② 안 만난 개수가 틀립니다: %', v_res->>'unseen_count';
    END IF;

    -- 10개를 만났지만 익힘은 7개(70%) → 기준 80% 미달
    INSERT INTO public.learning_item_progress
        (student_id, class_id, content_type, collection_key, item_key, learning_state)
    SELECT v_student.id, v_student.class_id, 'smoke', v_key, 'item' || g,
           CASE WHEN g <= 7 THEN 'mastered' ELSE 'familiar' END
    FROM generate_series(1, v_items) g;

    v_res := public.learning_engine_challenge_eligibility_v1(
        v_student.id, v_student.class_id, 'smoke', v_key, v_items);
    IF (v_res->>'eligible')::boolean THEN
        RAISE EXCEPTION '② 익힘 70%%인데 자격이 있습니다: %', v_res;
    END IF;
    IF (v_res->>'missing_mastered')::int <> 1 THEN
        RAISE EXCEPTION '② 남은 익힘 개수가 틀립니다: %', v_res->>'missing_mastered';
    END IF;

    -- 8개(80%)로 올리면 자격이 열린다
    UPDATE public.learning_item_progress SET learning_state = 'mastered'
     WHERE student_id = v_student.id AND content_type = 'smoke' AND item_key = 'item8';
    v_res := public.learning_engine_challenge_eligibility_v1(
        v_student.id, v_student.class_id, 'smoke', v_key, v_items);
    IF NOT (v_res->>'eligible')::boolean THEN
        RAISE EXCEPTION '② 기준을 채웠는데 자격이 없습니다: %', v_res;
    END IF;
    RAISE NOTICE '② 도전 자격 판정 통과 (익힘 %/%)', v_res->>'mastered_count', v_items;
END; $$;

-- ③ 도전 열기·끝내기와 최고 기록
DO $$
DECLARE
    v_student public.students%ROWTYPE;
    v_key TEXT := 'smoke:deck';
    v_a1 UUID; v_a2 UUID; v_again UUID;
    v_res JSONB; v_best JSONB;
BEGIN
    SELECT s.* INTO v_student FROM public.students s
    WHERE s.deleted_at IS NULL AND s.is_active IS DISTINCT FROM FALSE LIMIT 1;

    v_a1 := public.learning_engine_open_challenge_v1(
        v_student.id, v_student.class_id, 'smoke', v_key, 12::SMALLINT, 4::SMALLINT);
    IF v_a1 IS NULL THEN RAISE EXCEPTION '③ 도전이 열리지 않았습니다'; END IF;

    -- 같은 묶음에 또 열면 새로 만들지 않고 같은 도전을 돌려줘야 한다(새로고침 대비)
    v_again := public.learning_engine_open_challenge_v1(
        v_student.id, v_student.class_id, 'smoke', v_key, 12::SMALLINT, 4::SMALLINT);
    IF v_again <> v_a1 THEN RAISE EXCEPTION '③ 도전이 중복으로 열렸습니다'; END IF;

    -- 중도 종료: 합격이 아니고 최고 기록도 되면 안 된다
    v_res := public.learning_engine_close_challenge_v1(v_a1, 5::SMALLINT, 5::SMALLINT, 2::SMALLINT, FALSE);
    IF (v_res->>'passed')::boolean THEN RAISE EXCEPTION '③ 중도 종료가 합격 처리되었습니다'; END IF;

    v_best := public.learning_engine_challenge_best_v1(v_student.id, v_student.class_id, 'smoke', v_key);
    IF v_best->>'attempt_id' IS NOT NULL THEN
        RAISE EXCEPTION '③ 중도 종료가 최고 기록이 되었습니다: %', v_best;
    END IF;

    -- 완주해서 합격
    v_a2 := public.learning_engine_open_challenge_v1(
        v_student.id, v_student.class_id, 'smoke', v_key, 12::SMALLINT, 4::SMALLINT);
    v_res := public.learning_engine_close_challenge_v1(v_a2, 12::SMALLINT, 10::SMALLINT, 3::SMALLINT, TRUE);
    IF NOT (v_res->>'passed')::boolean THEN
        RAISE EXCEPTION '③ 기준을 넘겼는데 불합격입니다: %', v_res;
    END IF;

    v_best := public.learning_engine_challenge_best_v1(v_student.id, v_student.class_id, 'smoke', v_key);
    IF (v_best->>'correct_count')::int <> 10 OR NOT (v_best->>'passed')::boolean THEN
        RAISE EXCEPTION '③ 최고 기록이 완주 결과와 다릅니다: %', v_best;
    END IF;
    IF (v_best->>'elapsed_seconds') IS NULL THEN
        RAISE EXCEPTION '③ 소요 시간이 기록되지 않았습니다';
    END IF;
    RAISE NOTICE '③ 도전 열기·중도 종료·완주·최고 기록 통과 (%점)', v_best->>'correct_count';
END; $$;

-- ④ 권한 경계
DO $$
BEGIN
    IF has_table_privilege('authenticated', 'public.learning_challenge_attempts', 'SELECT')
       OR has_table_privilege('anon', 'public.learning_challenge_attempts', 'SELECT') THEN
        RAISE EXCEPTION '④ 도전 기록 표가 직접 조회 가능합니다';
    END IF;
    IF has_function_privilege('authenticated',
        'public.learning_engine_open_challenge_v1(uuid,uuid,text,text,smallint,smallint,text)', 'EXECUTE')
       OR has_function_privilege('authenticated',
        'public.learning_engine_close_challenge_v1(uuid,smallint,smallint,smallint,boolean,numeric,numeric)', 'EXECUTE') THEN
        RAISE EXCEPTION '④ 도전 열기·끝내기 함수가 로그인 사용자에게 공개되었습니다';
    END IF;
    RAISE NOTICE '④ 권한 경계 통과';
END; $$;
