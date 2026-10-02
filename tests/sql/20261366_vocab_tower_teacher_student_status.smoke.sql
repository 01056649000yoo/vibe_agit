-- 어휘의 탑 교사 학생 현황 스모크 (읽기만, 롤백된다).
-- ① 학급 학생 수만큼(최대 100) 행, 층 10개씩 ② 한 학생의 익힌 낱말 수가 원장과 같다 ③ 다른 사람·로그인 안 한 사용자는 막힌다

DO $$
DECLARE
    v_class UUID;
    v_teacher UUID;
    v_result JSONB;
    v_row JSONB;
    v_expected INTEGER;
    v_got INTEGER;
    v_started TIMESTAMPTZ;
BEGIN
    SELECT progress.class_id, class.teacher_id INTO v_class, v_teacher
    FROM public.learning_item_progress progress
    JOIN public.classes class ON class.id = progress.class_id AND class.deleted_at IS NULL
    JOIN public.profiles profile ON profile.id = class.teacher_id AND profile.role IN ('TEACHER', 'ADMIN')
    WHERE progress.content_type = 'vocab'
    GROUP BY progress.class_id, class.teacher_id
    ORDER BY COUNT(*) DESC LIMIT 1;
    IF v_class IS NULL THEN
        RAISE EXCEPTION '어휘 기록이 있는 학급이 없습니다.';
    END IF;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_teacher, 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('role', 'authenticated', true);
    v_started := clock_timestamp();
    v_result := public.get_teacher_vocab_tower_student_status_v1(v_class);
    RAISE NOTICE '학생 현황 % 명, %ms', jsonb_array_length(v_result -> 'students'),
        round(extract(epoch FROM clock_timestamp() - v_started) * 1000);
    RESET ROLE;

    IF jsonb_array_length(v_result -> 'students') <> LEAST(100, (SELECT COUNT(*) FROM public.students
        WHERE class_id = v_class AND deleted_at IS NULL AND is_active IS DISTINCT FROM false)) THEN
        RAISE EXCEPTION '학생 수가 맞지 않습니다.';
    END IF;
    SELECT value INTO v_row FROM jsonb_array_elements(v_result -> 'students')
    ORDER BY (SELECT SUM((deck ->> 'mastered_count')::INTEGER) FROM jsonb_array_elements(value -> 'decks') deck) DESC LIMIT 1;
    IF jsonb_array_length(v_row -> 'decks') <> 10 THEN
        RAISE EXCEPTION '층이 10개가 아닙니다.';
    END IF;
    SELECT SUM((deck ->> 'mastered_count')::INTEGER) INTO v_got FROM jsonb_array_elements(v_row -> 'decks') deck;
    SELECT COUNT(*) INTO v_expected FROM public.learning_item_progress progress
    WHERE progress.student_id = (v_row ->> 'student_id')::UUID AND progress.class_id = v_class
      AND progress.content_type = 'vocab' AND progress.learning_state = 'mastered'
      AND progress.collection_key IN (SELECT public.vocab_tower_v2_collection_key((v_result ->> 'grade')::SMALLINT, n::SMALLINT) FROM generate_series(1, 10) n);
    IF v_got IS DISTINCT FROM v_expected THEN
        RAISE EXCEPTION '익힌 낱말 수가 원장과 다릅니다: % ≠ %', v_got, v_expected;
    END IF;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('role', 'authenticated', true);
    BEGIN
        PERFORM public.get_teacher_vocab_tower_student_status_v1(v_class);
        RAISE EXCEPTION '다른 사람이 학생 현황을 읽었습니다.';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RESET ROLE;
    IF has_function_privilege('anon', 'public.get_teacher_vocab_tower_student_status_v1(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION '로그인하지 않은 사용자가 학생 현황을 부를 수 있습니다.';
    END IF;
END;
$$;
