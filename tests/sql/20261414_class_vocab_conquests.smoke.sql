-- 같은 반 친구의 어휘의 탑 정복 덱 스모크(전부 롤백): 정복한 덱 번호만 나오고(정답률·점수 등은 없음)·같은 반 학생만·학생이 아니면 막힘.
DO $$
DECLARE
    v_class UUID; v_a UUID; v_a_auth UUID; v_res JSONB; v_grade SMALLINT; v_other UUID; v_row JSONB;
BEGIN
    SELECT class.id INTO v_class FROM public.classes class
    WHERE class.deleted_at IS NULL
      AND (SELECT COUNT(*) FROM public.students s WHERE s.class_id = class.id AND s.auth_id IS NOT NULL
           AND s.is_active IS DISTINCT FROM false AND s.deleted_at IS NULL) >= 1
    ORDER BY class.created_at DESC LIMIT 1;
    IF v_class IS NULL THEN RAISE EXCEPTION '검증할 학급이 없습니다.'; END IF;
    SELECT id, auth_id INTO v_a, v_a_auth FROM public.students WHERE class_id = v_class AND auth_id IS NOT NULL AND is_active IS DISTINCT FROM false AND deleted_at IS NULL ORDER BY id LIMIT 1;
    SELECT id INTO v_other FROM public.students WHERE class_id <> v_class AND is_active IS DISTINCT FROM false AND deleted_at IS NULL LIMIT 1;
    SELECT LEAST(6, GREATEST(3, COALESCE(vocab_tower_grade, 3)))::SMALLINT INTO v_grade FROM public.classes WHERE id = v_class;

    -- 학생 인증이 없으면 막힌다
    BEGIN
        PERFORM public.get_class_vocab_conquests_v1();
        RAISE EXCEPTION '인증 없이 호출이 통과했습니다';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;

    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_a_auth, 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('request.jwt.claim.sub', v_a_auth::TEXT, true);

    -- 정복 조건을 가진 학생이 없으면 빈 목록이 정상. 덱마스터 합격 기록을 하나 만들어 본다.
    INSERT INTO public.learning_challenge_attempts (student_id, class_id, content_type, challenge_kind, collection_key, status, passed)
    SELECT v_a, v_class, 'vocab', 'collection', public.vocab_tower_v2_collection_key(v_grade, 1::SMALLINT), 'completed', TRUE
    WHERE NOT EXISTS (SELECT 1 FROM public.learning_challenge_attempts WHERE student_id = v_a AND collection_key = public.vocab_tower_v2_collection_key(v_grade, 1::SMALLINT) AND passed IS TRUE);

    v_res := public.get_class_vocab_conquests_v1();
    SELECT item INTO v_row FROM jsonb_array_elements(v_res -> 'students') item WHERE (item ->> 'student_id')::UUID = v_a;
    IF v_row IS NULL OR NOT (v_row -> 'decks') @> '[1]'::JSONB THEN RAISE EXCEPTION '합격한 1덱이 정복으로 나오지 않습니다: %', v_res; END IF;
    IF v_row ?| ARRAY['accuracy', 'best_accuracy', 'points', 'wrong_items'] THEN RAISE EXCEPTION '정복 덱 번호 말고 다른 값이 노출됩니다'; END IF;
    IF v_other IS NOT NULL AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_res -> 'students') item WHERE (item ->> 'student_id')::UUID = v_other) THEN
        RAISE EXCEPTION '다른 학급 학생이 보입니다';
    END IF;
END $$;
