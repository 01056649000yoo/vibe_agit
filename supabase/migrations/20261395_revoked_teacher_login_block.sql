-- 승인을 취소한 교사는 로그인 자체를 막는다(2026-10-11 보안 점검, 선생님 결정).
--  · 취소 시각(approval_revoked_at)이 생기면 로그인 계정을 영구 정지(banned_until = infinity)하고 이미 열린 로그인도 끊는다.
--  · 다시 승인해 취소 시각이 지워지면 정지를 푼다(우리가 건 영구 정지만 푼다).
--  · 관리자(ADMIN)와 승인 대기 중인 새 교사(취소 이력 없음)는 건드리지 않는다.
-- 승인 변경 함수가 여러 개(개별·일괄·가입 보정)라 프로필 표의 변화 한 곳에서 처리한다.
CREATE OR REPLACE FUNCTION public.sync_revoked_teacher_login_block_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF NEW.role IS DISTINCT FROM 'TEACHER' THEN
        RETURN NEW;
    END IF;

    IF NEW.approval_revoked_at IS NOT NULL AND COALESCE(NEW.is_approved, FALSE) = FALSE THEN
        UPDATE auth.users SET banned_until = 'infinity'::timestamptz WHERE id = NEW.id;
        DELETE FROM auth.refresh_tokens WHERE session_id IN (SELECT id FROM auth.sessions WHERE user_id = NEW.id);
        DELETE FROM auth.sessions WHERE user_id = NEW.id;
    ELSIF NEW.approval_revoked_at IS NULL OR COALESCE(NEW.is_approved, FALSE) = TRUE THEN
        UPDATE auth.users SET banned_until = NULL
        WHERE id = NEW.id AND banned_until = 'infinity'::timestamptz;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_revoked_teacher_login_block_v1() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_revoked_teacher_login_block ON public.profiles;
CREATE TRIGGER trg_sync_revoked_teacher_login_block
AFTER INSERT OR UPDATE OF approval_revoked_at, is_approved, role ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_revoked_teacher_login_block_v1();

-- 이미 취소된 교사도 지금 막는다.
UPDATE auth.users u SET banned_until = 'infinity'::timestamptz
FROM public.profiles p
WHERE p.id = u.id AND p.role = 'TEACHER' AND p.approval_revoked_at IS NOT NULL AND COALESCE(p.is_approved, FALSE) = FALSE;
DELETE FROM auth.refresh_tokens WHERE session_id IN (
    SELECT s.id FROM auth.sessions s JOIN public.profiles p ON p.id = s.user_id
    WHERE p.role = 'TEACHER' AND p.approval_revoked_at IS NOT NULL AND COALESCE(p.is_approved, FALSE) = FALSE);
DELETE FROM auth.sessions WHERE user_id IN (
    SELECT id FROM public.profiles WHERE role = 'TEACHER' AND approval_revoked_at IS NOT NULL AND COALESCE(is_approved, FALSE) = FALSE);
