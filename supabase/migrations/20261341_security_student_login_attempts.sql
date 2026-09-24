-- 보안 점검(2026-09-24, docs/security-audits/2026-09-24.md) 고침 — DB 쪽.
--
--   ① 학생 로그인 코드 반복 대입 제한(KISA 보안기능: 반복된 인증 시도 제한 기능 부재).
--      bind_student_auth 는 틀린 코드를 몇 번 넣어도 막지 않았다. 익명 세션마다 10분에 10번 틀리면 잠근다.
--      아이 화면에 그대로 나가던 영어 오류 문구도 한국어로 바꾼다.
--   ② SECURITY DEFINER 트리거 함수 셋의 search_path 고정(검색 경로 조작 방지).

BEGIN;

CREATE TABLE IF NOT EXISTS public.student_login_failures (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    auth_id UUID NOT NULL,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS student_login_failures_auth_idx
    ON public.student_login_failures (auth_id, attempted_at DESC);
ALTER TABLE public.student_login_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.student_login_failures FROM PUBLIC, anon, authenticated;

-- ① 운영 정의 + 실패 횟수.
CREATE OR REPLACE FUNCTION public.bind_student_auth(p_student_code text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_auth_id UUID := auth.uid();
    v_student RECORD;
    v_previous_auth_id UUID;
    v_recent_failures INTEGER;
BEGIN
    IF v_auth_id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', '로그인 준비가 끝나지 않았어요. 새로고침한 뒤 다시 해 주세요.'
        );
    END IF;

    -- 틀린 코드를 계속 넣어 남의 코드를 찾는 것을 막는다(KISA: 반복된 인증 시도 제한, 2026-09-24).
    -- 익명 세션마다 10분에 10번. 익명 세션 만들기는 인증 서버가 IP당 시간 300개로 따로 막는다.
    SELECT count(*)::INTEGER INTO v_recent_failures
    FROM public.student_login_failures failure
    WHERE failure.auth_id = v_auth_id AND failure.attempted_at > NOW() - INTERVAL '10 minutes';
    IF v_recent_failures >= 10 THEN
        RETURN json_build_object(
            'success', false,
            'error', '코드를 여러 번 틀렸어요. 10분 뒤에 다시 해 보거나 선생님께 코드를 확인해 주세요.'
        );
    END IF;

    IF COALESCE(BTRIM(p_student_code), '') = '' THEN
        RETURN json_build_object(
            'success', false,
            'error', '학생 코드를 입력해 주세요.'
        );
    END IF;

    SELECT
        s.id,
        s.name,
        s.student_code,
        s.class_id,
        s.auth_id,
        c.name AS class_name
    INTO v_student
    FROM public.students s
    LEFT JOIN public.classes c
      ON c.id = s.class_id
    WHERE s.student_code = UPPER(BTRIM(p_student_code))
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
    LIMIT 1;

    IF NOT FOUND THEN
        -- 함수가 예외 없이 끝나므로 이 기록은 남는다.
        DELETE FROM public.student_login_failures
        WHERE auth_id = v_auth_id AND attempted_at < NOW() - INTERVAL '1 day';
        INSERT INTO public.student_login_failures (auth_id) VALUES (v_auth_id);
        RETURN json_build_object(
            'success', false,
            'error', '코드가 일치하는 학생을 찾을 수 없어요. 다시 확인해 볼까요? 🔍'
        );
    END IF;

    v_previous_auth_id := v_student.auth_id;
    PERFORM set_config('app.bypass_student_trigger', 'true', true);

    UPDATE public.students
       SET auth_id = NULL
     WHERE auth_id = v_auth_id
       AND id <> v_student.id;

    UPDATE public.students
       SET auth_id = v_auth_id,
           last_login = NOW()
     WHERE id = v_student.id;

    PERFORM set_config('app.bypass_student_trigger', 'false', true);

    RETURN json_build_object(
        'success', true,
        'replacedExistingSession', (v_previous_auth_id IS NOT NULL AND v_previous_auth_id <> v_auth_id),
        'student', json_build_object(
            'id', v_student.id,
            'name', v_student.name,
            'code', v_student.student_code,
            'classId', v_student.class_id,
            'className', COALESCE(v_student.class_name, 'Class')
        )
    );
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.bypass_student_trigger', 'false', true);
    RAISE;
END;
$function$;

-- ② 트리거 전용이라 RPC 로는 못 부르지만, 정의자 권한 함수는 모두 검색 경로를 고정한다.
ALTER FUNCTION public.protect_sensitive_data() SET search_path = public;
ALTER FUNCTION public.sync_student_class_id() SET search_path = public;
ALTER FUNCTION public.sync_teacher_class_id() SET search_path = public;

NOTIFY pgrst, 'reload schema';

COMMIT;
