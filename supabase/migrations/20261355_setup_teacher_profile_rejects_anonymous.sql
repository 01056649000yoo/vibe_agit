-- 교사 프로필 준비 함수가 익명 세션·학생 연결 계정을 거절한다(2026-09-28 권한 경계 전수 점검).
--
-- 구멍: 학생 코드 로그인을 위해 인증 서버의 익명 가입이 켜져 있다. 공개 anon 키만 있으면 누구나 익명 세션을
-- 만들 수 있고, 그 세션으로 `setup_teacher_profile` 을 부르면 구글 로그인 없이 TEACHER 프로필이 생겼다.
-- `auto_approval` 이 켜져 있으면 곧바로 승인 교사가 된다. 운영 DB 에는 이렇게 만들어진 계정이 0개였다(점검 시).
-- 교사 AI(`vibe-ai`)·의견 보내기(`send-feedback`)는 이미 `is_anonymous` 를 거르고 있었고 이 함수만 빠져 있었다.
--
-- 판정은 JWT 가 아니라 DB 의 실제 상태로 한다(보안 변경 규칙): `auth.users.is_anonymous`, `students.auth_id`.
-- 나머지 본문은 20260727_teacher_withdrawal_and_revoke_fix.sql 의 운영 정의 그대로다. 권한은 바꾸지 않는다.
BEGIN;

CREATE OR REPLACE FUNCTION public.setup_teacher_profile(p_full_name text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_api_mode text DEFAULT 'PERSONAL'::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_auth_id UUID;
    v_auto_approve BOOLEAN := false;
    v_existing RECORD;
    v_is_approved BOOLEAN;
    v_final_role TEXT;
    v_revoked BOOLEAN := false;
BEGIN
    v_auth_id := auth.uid();
    IF v_auth_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', '인증되지 않은 요청입니다.');
    END IF;
    -- 익명 세션(학생 코드 로그인)과 학생에 연결된 계정은 교사가 될 수 없다.
    IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_auth_id AND u.is_anonymous IS NOT TRUE)
       OR EXISTS (SELECT 1 FROM public.students s WHERE s.auth_id = v_auth_id) THEN
        RETURN json_build_object('success', false, 'error', '교사 계정은 구글 로그인으로만 만들 수 있습니다.');
    END IF;
    SELECT * INTO v_existing FROM public.profiles WHERE id = v_auth_id;
    IF v_existing.role = 'ADMIN' THEN
        RETURN json_build_object('success', true, 'role', 'ADMIN', 'is_approved', true);
    END IF;
    BEGIN
        SELECT (value = to_jsonb(true)) INTO v_auto_approve
        FROM public.system_settings WHERE key = 'auto_approval';
    EXCEPTION WHEN OTHERS THEN
        v_auto_approve := false;
    END;
    -- 관리자가 승인을 취소한 계정은 자동승인 대상에서 제외
    v_revoked := (v_existing.approval_revoked_at IS NOT NULL);
    IF v_revoked THEN
        v_auto_approve := false;
    END IF;
    v_is_approved := COALESCE(v_existing.is_approved, false) OR COALESCE(v_auto_approve, false);
    v_final_role := COALESCE(v_existing.role, 'TEACHER');
    IF v_final_role != 'ADMIN' THEN v_final_role := 'TEACHER'; END IF;
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    INSERT INTO public.profiles (id, role, email, full_name, is_approved, api_mode)
    VALUES (v_auth_id, v_final_role, COALESCE(p_email, ''), p_full_name, v_is_approved, COALESCE(p_api_mode, 'PERSONAL'))
    ON CONFLICT (id) DO UPDATE SET
        email = COALESCE(EXCLUDED.email, public.profiles.email),
        full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        api_mode = COALESCE(EXCLUDED.api_mode, public.profiles.api_mode),
        role = CASE WHEN public.profiles.role = 'ADMIN' THEN 'ADMIN' ELSE 'TEACHER' END,
        is_approved = CASE
            WHEN public.profiles.approval_revoked_at IS NOT NULL THEN public.profiles.is_approved
            WHEN public.profiles.is_approved = true THEN true
            WHEN v_auto_approve THEN true
            ELSE public.profiles.is_approved
        END;
    PERFORM set_config('app.bypass_profile_protection', '', true);
    RETURN json_build_object(
        'success', true,
        'role', v_final_role,
        'is_approved', v_is_approved,
        'revoked_by_admin', v_revoked
    );
END;
$function$;

NOTIFY pgrst, 'reload schema';
COMMIT;
