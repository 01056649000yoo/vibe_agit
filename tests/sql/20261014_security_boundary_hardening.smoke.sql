-- 이 파일은 바깥 트랜잭션에서 실행되고 마지막에 전부 롤백된다.

SELECT set_config('test.teacher_id', (
    SELECT c.teacher_id::TEXT FROM public.classes c
    JOIN public.profiles p ON p.id = c.teacher_id
    WHERE p.role = 'TEACHER' AND p.is_approved IS TRUE AND p.approval_revoked_at IS NULL
    GROUP BY c.teacher_id ORDER BY count(*) DESC LIMIT 1
), true);
SELECT set_config('test.teacher_student_count', (
    SELECT count(*)::TEXT FROM public.students s
    JOIN public.classes c ON c.id = s.class_id
    WHERE c.teacher_id = current_setting('test.teacher_id')::UUID
), true);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.teacher_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.teacher_id'), 'role', 'authenticated'
)::TEXT, true);

DO $$
DECLARE
    v_visible BIGINT;
    v_original BOOLEAN;
    v_blocked BOOLEAN := false;
BEGIN
    SELECT count(*) INTO v_visible FROM public.students;
    IF v_visible <> current_setting('test.teacher_student_count')::BIGINT THEN
        RAISE EXCEPTION '교사가 담당 밖 학생을 읽을 수 있습니다: visible %, owned %',
            v_visible, current_setting('test.teacher_student_count');
    END IF;

    SELECT is_approved INTO v_original FROM public.profiles WHERE id = auth.uid();
    BEGIN
        UPDATE public.profiles SET is_approved = NOT v_original WHERE id = auth.uid();
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := true;
    END;
    IF NOT v_blocked THEN RAISE EXCEPTION '본인이 승인 상태를 직접 변경했습니다.'; END IF;
END;
$$;

RESET ROLE;

SELECT set_config('test.student_auth_id', (
    SELECT s.auth_id::TEXT FROM public.students s
    WHERE s.auth_id IS NOT NULL AND s.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM public.students peer WHERE peer.class_id = s.class_id AND peer.id <> s.id)
    LIMIT 1
), true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.student_auth_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.student_auth_id'), 'role', 'authenticated',
    'app_metadata', jsonb_build_object('role', 'ADMIN', 'class_id', gen_random_uuid(), 'student_id', gen_random_uuid())
)::TEXT, true);

DO $$
DECLARE
    v_me UUID := public.auth_student_id();
    v_class UUID := public.auth_user_class_id();
    v_changed BIGINT;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_me IS NULL OR v_class IS NULL THEN
        RAISE EXCEPTION '실제 학생 연결을 인증 근거로 읽지 못했습니다.';
    END IF;
    WITH changed AS (
        UPDATE public.students SET name = name
        WHERE class_id = v_class AND id <> v_me RETURNING id
    ) SELECT count(*) INTO v_changed FROM changed;
    IF v_changed <> 0 THEN RAISE EXCEPTION '학생이 같은 반 친구 행을 수정했습니다.'; END IF;
END;
$$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', gen_random_uuid()::TEXT, true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('request.jwt.claim.sub'), 'role', 'authenticated',
    'app_metadata', jsonb_build_object('role', 'ADMIN', 'class_id', gen_random_uuid(), 'student_id', gen_random_uuid())
)::TEXT, true);
DO $$ BEGIN
    IF public.auth_user_role() <> '' OR public.auth_user_class_id() IS NOT NULL OR public.auth_student_id() IS NOT NULL THEN
        RAISE EXCEPTION 'DB 연결이 없는 JWT 메타데이터가 권한으로 사용됐습니다.';
    END IF;
    IF has_function_privilege('authenticated', 'public.consume_ai_request_v1(uuid,text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.claim_comment_ai_review_v1(uuid,uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION '내부 AI 속도 제한 함수가 클라이언트에 공개됐습니다.';
    END IF;
    IF has_table_privilege('authenticated', 'public.ai_request_events', 'SELECT')
       OR has_table_privilege('authenticated', 'public.ai_request_events', 'INSERT') THEN
        RAISE EXCEPTION 'AI 요청 원장이 클라이언트에 공개됐습니다.';
    END IF;
END $$;
RESET ROLE;
