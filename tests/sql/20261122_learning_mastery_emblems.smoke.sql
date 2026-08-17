-- 덱마스터 상징·어휘 마스터 휘장 스모크. 반드시 ROLLBACK 트랜잭션에서 돌린다.
-- 핵심 합격 조건은 **친구에게는 완성된 것만 보이고 진행도는 서버가 아예 안 내려보낸다**는 것이다(A안).
DO $$
DECLARE
    v_me public.students%ROWTYPE;
    v_friend public.students%ROWTYPE;
    v_teacher UUID;
    v_res JSONB;
    v_vocab JSONB;
    v_granted BOOLEAN;
    v_key TEXT;
    v_attempt UUID;
    i INTEGER;
BEGIN
    SELECT s.* INTO v_me FROM public.students s
    JOIN public.classes c ON c.id = s.class_id AND c.teacher_id IS NOT NULL AND c.deleted_at IS NULL
    WHERE s.auth_id IS NOT NULL AND s.deleted_at IS NULL AND s.is_active IS DISTINCT FROM FALSE
    LIMIT 1;
    IF v_me.id IS NULL THEN RAISE EXCEPTION '스모크 학생을 찾지 못했습니다.'; END IF;

    SELECT s.* INTO v_friend FROM public.students s
    WHERE s.class_id = v_me.class_id AND s.id <> v_me.id AND s.auth_id IS NOT NULL
      AND s.deleted_at IS NULL AND s.is_active IS DISTINCT FROM FALSE LIMIT 1;
    SELECT c.teacher_id INTO v_teacher FROM public.classes c WHERE c.id = v_me.class_id;

    -- ① 아직 아무 관문도 통과하지 않은 상태
    PERFORM set_config('request.jwt.claim.sub', v_me.auth_id::text, true);
    PERFORM set_config('request.jwt.claims',
        jsonb_build_object('sub', v_me.auth_id, 'role', 'authenticated')::text, true);

    v_res := public.get_my_learning_mastery_v1();
    SELECT c INTO v_vocab FROM jsonb_array_elements(v_res->'contents') c
     WHERE c->>'content_type' = 'vocab';
    IF v_vocab IS NULL THEN RAISE EXCEPTION '① 어휘 콘텐츠가 등록되지 않았습니다'; END IF;
    IF v_vocab->>'collection_label' <> '덱마스터' OR v_vocab->>'summit_label' <> '어휘 마스터' THEN
        RAISE EXCEPTION '① 관문 이름이 다릅니다: % / %', v_vocab->>'collection_label', v_vocab->>'summit_label';
    END IF;
    IF (v_vocab->>'passed_count')::int <> 0 OR (v_vocab->>'summit_reached')::boolean THEN
        RAISE EXCEPTION '① 통과 기록이 없는데 성취가 있습니다: %', v_vocab;
    END IF;
    RAISE NOTICE '① 초기 상태 확인 (%, 관문 %개)', v_vocab->>'display_name', v_vocab->>'collection_count';

    -- ② 덱마스터 7개 통과 → 본인은 7/10 이 보인다
    FOR i IN 1..7 LOOP
        v_key := 'g3:d' || i;
        v_attempt := public.learning_engine_open_challenge_v1(
            v_me.id, v_me.class_id, 'vocab', v_key, 12::SMALLINT, 4::SMALLINT);
        PERFORM public.learning_engine_close_challenge_v1(
            v_attempt, 12::SMALLINT, 11::SMALLINT, 4::SMALLINT, TRUE);
    END LOOP;

    v_res := public.get_my_learning_mastery_v1();
    SELECT c INTO v_vocab FROM jsonb_array_elements(v_res->'contents') c WHERE c->>'content_type' = 'vocab';
    IF (v_vocab->>'passed_count')::int <> 7 THEN
        RAISE EXCEPTION '② 본인 진행도가 7이 아닙니다: %', v_vocab->>'passed_count';
    END IF;
    IF (v_vocab->>'all_collections_cleared')::boolean THEN
        RAISE EXCEPTION '② 7개인데 전부 완성으로 표시됩니다';
    END IF;
    RAISE NOTICE '② 본인은 진행도 %/% 를 본다', v_vocab->>'passed_count', v_vocab->>'collection_count';

    -- ③ 친구에게는 진행도가 **아예 내려가지 않는다** (A안의 핵심)
    IF v_friend.id IS NOT NULL THEN
        PERFORM set_config('request.jwt.claim.sub', v_friend.auth_id::text, true);
        PERFORM set_config('request.jwt.claims',
            jsonb_build_object('sub', v_friend.auth_id, 'role', 'authenticated')::text, true);

        v_res := public.get_classmate_learning_mastery_v1(v_me.id);
        SELECT c INTO v_vocab FROM jsonb_array_elements(v_res->'contents') c WHERE c->>'content_type' = 'vocab';
        IF v_vocab ? 'passed_count' THEN
            RAISE EXCEPTION '③ 친구에게 진행도가 노출됩니다: %', v_vocab;
        END IF;
        IF (v_vocab->>'summit_reached')::boolean OR (v_vocab->>'all_collections_cleared')::boolean THEN
            RAISE EXCEPTION '③ 완성하지 않았는데 친구에게 완성으로 보입니다';
        END IF;
        RAISE NOTICE '③ 친구에게는 진행도가 보이지 않음';
    ELSE
        RAISE NOTICE '③ 같은 반 친구가 없어 건너뜀';
    END IF;

    -- ④ 10개를 다 채우면 휘장이 나온다
    PERFORM set_config('request.jwt.claim.sub', v_me.auth_id::text, true);
    PERFORM set_config('request.jwt.claims',
        jsonb_build_object('sub', v_me.auth_id, 'role', 'authenticated')::text, true);
    FOR i IN 8..10 LOOP
        v_key := 'g3:d' || i;
        v_attempt := public.learning_engine_open_challenge_v1(
            v_me.id, v_me.class_id, 'vocab', v_key, 12::SMALLINT, 4::SMALLINT);
        PERFORM public.learning_engine_close_challenge_v1(
            v_attempt, 12::SMALLINT, 11::SMALLINT, 4::SMALLINT, TRUE);
    END LOOP;

    v_granted := public.learning_engine_grant_summit_v1(v_me.id, v_me.class_id, 'vocab');
    IF NOT v_granted THEN RAISE EXCEPTION '④ 10개를 채웠는데 휘장이 나오지 않았습니다'; END IF;
    -- 두 번 불러도 중복으로 주지 않는다.
    IF public.learning_engine_grant_summit_v1(v_me.id, v_me.class_id, 'vocab') THEN
        RAISE EXCEPTION '④ 휘장이 중복 지급되었습니다';
    END IF;

    v_res := public.get_my_learning_mastery_v1();
    SELECT c INTO v_vocab FROM jsonb_array_elements(v_res->'contents') c WHERE c->>'content_type' = 'vocab';
    IF NOT (v_vocab->>'summit_reached')::boolean OR v_vocab->>'master_title' <> '어휘 마스터' THEN
        RAISE EXCEPTION '④ 휘장·칭호가 반영되지 않았습니다: %', v_vocab;
    END IF;
    RAISE NOTICE '④ 어휘 마스터 휘장 지급 (칭호 %)', v_vocab->>'master_title';

    -- ⑤ 완성된 성취는 친구에게 보인다
    IF v_friend.id IS NOT NULL THEN
        PERFORM set_config('request.jwt.claim.sub', v_friend.auth_id::text, true);
        PERFORM set_config('request.jwt.claims',
            jsonb_build_object('sub', v_friend.auth_id, 'role', 'authenticated')::text, true);
        v_res := public.get_classmate_learning_mastery_v1(v_me.id);
        SELECT c INTO v_vocab FROM jsonb_array_elements(v_res->'contents') c WHERE c->>'content_type' = 'vocab';
        IF NOT (v_vocab->>'summit_reached')::boolean OR NOT (v_vocab->>'all_collections_cleared')::boolean THEN
            RAISE EXCEPTION '⑤ 완성했는데 친구에게 안 보입니다: %', v_vocab;
        END IF;
        IF v_vocab ? 'passed_count' THEN
            RAISE EXCEPTION '⑤ 완성 뒤에도 진행도는 감춰야 합니다';
        END IF;
        RAISE NOTICE '⑤ 완성된 휘장은 친구에게 보임';
    END IF;

    -- ⑥ 교사는 진행도까지 본다
    PERFORM set_config('request.jwt.claim.sub', v_teacher::text, true);
    PERFORM set_config('request.jwt.claims',
        jsonb_build_object('sub', v_teacher, 'role', 'authenticated')::text, true);
    v_res := public.get_student_learning_mastery_v1(v_me.id);
    SELECT c INTO v_vocab FROM jsonb_array_elements(v_res->'contents') c WHERE c->>'content_type' = 'vocab';
    IF (v_vocab->>'passed_count')::int <> 10 THEN
        RAISE EXCEPTION '⑥ 교사가 진행도를 못 봅니다: %', v_vocab;
    END IF;
    RAISE NOTICE '⑥ 교사는 진행도 %/% 확인', v_vocab->>'passed_count', v_vocab->>'collection_count';
END; $$;

-- ⑦ 남의 반 학생은 못 본다 / 표는 직접 열려 있지 않다
DO $$
DECLARE v_me public.students%ROWTYPE; v_other UUID;
BEGIN
    SELECT s.* INTO v_me FROM public.students s
    WHERE s.auth_id IS NOT NULL AND s.deleted_at IS NULL LIMIT 1;
    SELECT s.id INTO v_other FROM public.students s
    WHERE s.class_id <> v_me.class_id AND s.deleted_at IS NULL LIMIT 1;

    IF v_other IS NOT NULL THEN
        PERFORM set_config('request.jwt.claim.sub', v_me.auth_id::text, true);
        PERFORM set_config('request.jwt.claims',
            jsonb_build_object('sub', v_me.auth_id, 'role', 'authenticated')::text, true);
        BEGIN
            PERFORM public.get_classmate_learning_mastery_v1(v_other);
            RAISE EXCEPTION '⑦ 다른 반 학생의 성취를 볼 수 있습니다';
        EXCEPTION WHEN sqlstate 'P0002' THEN NULL;
        END;
    END IF;

    IF has_table_privilege('authenticated', 'public.learning_summit_awards', 'SELECT')
       OR has_table_privilege('authenticated', 'public.learning_content_types', 'SELECT') THEN
        RAISE EXCEPTION '⑦ 성취 표가 직접 조회 가능합니다';
    END IF;
    RAISE NOTICE '⑦ 학급 경계·표 잠금 확인';
END; $$;
