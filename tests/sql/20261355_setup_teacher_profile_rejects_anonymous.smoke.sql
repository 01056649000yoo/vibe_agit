-- 익명 세션·학생 연결 계정은 교사 프로필을 만들 수 없고, 실제 교사는 그대로 준비된다.
DO $$
DECLARE
    v_anon UUID := gen_random_uuid();
    v_student_auth UUID;
    v_teacher UUID;
    v_result JSON;
BEGIN
    -- ① 새 익명 사용자(학생 코드 로그인 전 상태)
    INSERT INTO auth.users (id, instance_id, aud, role, is_anonymous, created_at, updated_at)
    VALUES (v_anon, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', TRUE, now(), now());
    PERFORM set_config('request.jwt.claim.sub', v_anon::TEXT, true);
    v_result := public.setup_teacher_profile('가짜 교사', NULL, 'PERSONAL');
    IF (v_result->>'success')::BOOLEAN IS NOT FALSE
       OR EXISTS (SELECT 1 FROM public.profiles WHERE id = v_anon) THEN
        RAISE EXCEPTION '익명 세션이 교사 프로필을 만들었습니다: %', v_result;
    END IF;

    -- ② 학생에 연결된 실제 계정
    SELECT s.auth_id INTO v_student_auth FROM public.students s
    WHERE s.auth_id IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = s.auth_id)
    LIMIT 1;
    IF v_student_auth IS NOT NULL THEN
        PERFORM set_config('request.jwt.claim.sub', v_student_auth::TEXT, true);
        v_result := public.setup_teacher_profile('가짜 교사', NULL, 'PERSONAL');
        IF (v_result->>'success')::BOOLEAN IS NOT FALSE
           OR EXISTS (SELECT 1 FROM public.profiles WHERE id = v_student_auth) THEN
            RAISE EXCEPTION '학생 계정이 교사 프로필을 만들었습니다: %', v_result;
        END IF;
    END IF;

    -- ③ 실제 교사는 그대로
    SELECT p.id INTO v_teacher FROM public.profiles p
    WHERE p.role = 'TEACHER' AND p.is_approved AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id AND u.is_anonymous IS NOT TRUE)
    LIMIT 1;
    IF v_teacher IS NULL THEN RAISE EXCEPTION '교사 fixture 가 없습니다.'; END IF;
    PERFORM set_config('request.jwt.claim.sub', v_teacher::TEXT, true);
    v_result := public.setup_teacher_profile(NULL, NULL, NULL);
    IF (v_result->>'success')::BOOLEAN IS NOT TRUE OR v_result->>'role' <> 'TEACHER' OR (v_result->>'is_approved')::BOOLEAN IS NOT TRUE THEN
        RAISE EXCEPTION '승인 교사의 프로필 준비가 깨졌습니다: %', v_result;
    END IF;
END;
$$;
