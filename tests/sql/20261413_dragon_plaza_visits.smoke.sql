-- 우리반 수호룡 광장 방문 기록 스모크(전부 롤백): 친구가 열면 기록·같은 친구 10분 안 재방문은 한 번·내 방문자만 보임·
-- 나 자신/다른 학급은 기록 없음·주 시작은 월요일·권한(표는 막혀 있고 함수만 열려 있음).
DO $$
DECLARE
    v_class UUID; v_a UUID; v_a_auth UUID; v_b UUID; v_b_auth UUID; v_other UUID; v_res JSONB; v_n INTEGER;
BEGIN
    SELECT class.id INTO v_class FROM public.classes class
    WHERE class.deleted_at IS NULL
      AND (SELECT COUNT(*) FROM public.students s WHERE s.class_id = class.id AND s.auth_id IS NOT NULL
           AND s.is_active IS DISTINCT FROM false AND s.deleted_at IS NULL) >= 2
    ORDER BY class.created_at DESC LIMIT 1;
    IF v_class IS NULL THEN RAISE EXCEPTION '검증할 학급(학생 2명 이상)이 없습니다.'; END IF;
    SELECT id, auth_id INTO v_a, v_a_auth FROM public.students WHERE class_id = v_class AND auth_id IS NOT NULL AND is_active IS DISTINCT FROM false AND deleted_at IS NULL ORDER BY id LIMIT 1;
    SELECT id, auth_id INTO v_b, v_b_auth FROM public.students WHERE class_id = v_class AND auth_id IS NOT NULL AND is_active IS DISTINCT FROM false AND deleted_at IS NULL ORDER BY id OFFSET 1 LIMIT 1;
    SELECT id INTO v_other FROM public.students WHERE class_id <> v_class AND is_active IS DISTINCT FROM false AND deleted_at IS NULL LIMIT 1;
    DELETE FROM public.hideout_visits WHERE owner_student_id IN (v_a, v_b) OR visitor_student_id IN (v_a, v_b);

    IF has_table_privilege('authenticated', 'public.hideout_visits', 'SELECT') THEN RAISE EXCEPTION '방문 기록 표가 브라우저 역할에 열려 있습니다'; END IF;
    IF EXTRACT(ISODOW FROM public.hideout_week_start_v1()) <> 1 THEN RAISE EXCEPTION '주 시작이 월요일이 아닙니다'; END IF;

    -- A 가 B 의 아지트를 연다
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_a_auth, 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('request.jwt.claim.sub', v_a_auth::TEXT, true);
    v_res := public.record_hideout_visit_v1(v_b);
    IF (v_res ->> 'recorded')::BOOLEAN IS NOT TRUE THEN RAISE EXCEPTION '방문이 기록되지 않았습니다: %', v_res; END IF;
    PERFORM public.record_hideout_visit_v1(v_b);
    SELECT COUNT(*), MAX(visit_count) INTO v_n, v_n FROM public.hideout_visits WHERE owner_student_id = v_b AND visitor_student_id = v_a;
    IF (SELECT COUNT(*) FROM public.hideout_visits WHERE owner_student_id = v_b AND visitor_student_id = v_a) <> 1
       OR (SELECT visit_count FROM public.hideout_visits WHERE owner_student_id = v_b AND visitor_student_id = v_a) <> 1 THEN
        RAISE EXCEPTION '10분 안 재방문이 한 번으로 세어지지 않습니다';
    END IF;
    -- 나 자신·다른 학급·없는 학생은 남기지 않는다
    IF (public.record_hideout_visit_v1(v_a) ->> 'recorded')::BOOLEAN IS NOT FALSE THEN RAISE EXCEPTION '내 아지트 방문이 기록됩니다'; END IF;
    IF v_other IS NOT NULL AND (public.record_hideout_visit_v1(v_other) ->> 'recorded')::BOOLEAN IS NOT FALSE THEN RAISE EXCEPTION '다른 학급 학생 방문이 기록됩니다'; END IF;
    IF (public.record_hideout_visit_v1(NULL) ->> 'recorded')::BOOLEAN IS NOT FALSE THEN RAISE EXCEPTION '빈 방문이 기록됩니다'; END IF;
    -- A 는 방문자가 없다
    IF jsonb_array_length(public.get_my_hideout_visitors_v1() -> 'visitors') <> 0 THEN RAISE EXCEPTION 'A 에게 방문자가 보입니다'; END IF;

    -- B 는 A 가 왔다고 본다(이름만, 횟수·순위 없음)
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_b_auth, 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('request.jwt.claim.sub', v_b_auth::TEXT, true);
    v_res := public.get_my_hideout_visitors_v1();
    IF jsonb_array_length(v_res -> 'visitors') <> 1 OR (v_res -> 'visitors' -> 0 ->> 'visitor_id')::UUID <> v_a THEN RAISE EXCEPTION 'B 의 방문자 목록이 틀립니다: %', v_res; END IF;
    IF (v_res -> 'visitors' -> 0) ? 'visit_count' THEN RAISE EXCEPTION '방문 횟수가 노출됩니다'; END IF;

    -- 지난 주 기록은 이번 주 목록에 나오지 않는다
    UPDATE public.hideout_visits SET week_start = week_start - 7 WHERE owner_student_id = v_b AND visitor_student_id = v_a;
    IF jsonb_array_length(public.get_my_hideout_visitors_v1() -> 'visitors') <> 0 THEN RAISE EXCEPTION '지난 주 방문자가 이번 주에 보입니다'; END IF;
END $$;
