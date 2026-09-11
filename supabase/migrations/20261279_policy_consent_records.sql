-- ============================================================================
-- 📜 약관 동의 기록과 학생 개인정보 동의서 확인
-- 작성일: 2026-09-11
--
-- 왜:
--   교사 가입 화면에 약관·처리방침 동의 체크가 있지만 **기록이 어디에도 남지 않았다.**
--   "이 선생님이 언제 어느 판에 동의했나"에 답할 수 없었다. 초등학생 데이터를 다루는
--   교사 568명이 쓰는 서비스라 동의 사실은 증명할 수 있어야 한다.
--
--   또 처리방침은 "학생 가명 사용이 원칙"이라 적혀 있는데 실제로는 학생 4,229명 중
--   3,658명(86%)이 실명이다. 실명을 쓰려면 학교가 학기초에 법정대리인 동의서를 받아야
--   하고, 이 서비스는 **그 동의를 받았는지 교사에게 확인**받아야 한다. 학급 단위로 기록한다 —
--   동의서도 학년·학기마다 새로 받기 때문이다.
--
-- 무엇을:
--   1) profiles 에 동의 시각·판 세 열. 기존 교사는 사용자 결정대로 **가입일로 소급** 기록한다.
--      실제로 어느 판을 봤는지는 알 수 없으므로 판은 'backfill' 로 적어 소급 기록임을 남긴다.
--   2) classes 에 학생 동의서 확인 시각·확인자. 기존 학급 591개는 비워 두고,
--      교사가 다음 로그인 때 확인하면 채워진다(사용자 결정: 모두 다시 받는다).
--   3) 두 RPC. 시각은 **서버가** 찍는다 — 동의 기록에 클라이언트 시계를 믿지 않는다.
-- ============================================================================

BEGIN;

-- ── 1) 교사의 약관 동의 기록 ──────────────────────────────────────────────
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS terms_agreed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS privacy_agreed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS agreed_policy_version TEXT;

COMMENT ON COLUMN public.profiles.terms_agreed_at IS '이용약관 동의 시각(서버 시계). 2026-09-11 이전 가입자는 가입일로 소급.';
COMMENT ON COLUMN public.profiles.privacy_agreed_at IS '개인정보 처리방침 동의 시각(서버 시계). 2026-09-11 이전 가입자는 가입일로 소급.';
COMMENT ON COLUMN public.profiles.agreed_policy_version IS '동의한 판(시행일 YYYY-MM-DD). 소급 기록은 backfill. 원본은 src/constants/policyVersion.js.';

-- 기존 교사: 가입일로 소급. 이미 값이 있으면 건드리지 않는다(재실행 안전).
UPDATE public.profiles
SET terms_agreed_at = created_at,
    privacy_agreed_at = created_at,
    agreed_policy_version = 'backfill'
WHERE role = 'TEACHER'
  AND terms_agreed_at IS NULL
  AND privacy_agreed_at IS NULL;

-- ── 2) 학급의 학생 개인정보 동의서 확인 ───────────────────────────────────
ALTER TABLE public.classes
    ADD COLUMN IF NOT EXISTS student_consent_confirmed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS student_consent_confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.classes.student_consent_confirmed_at IS
    '담당 교사가 "학교에서 법정대리인 동의서를 받았고 이 서비스 이용이 그 범위에 든다"고 확인한 시각(서버 시계). 비어 있으면 로그인 때 확인을 받는다.';

-- ── 3) RPC ───────────────────────────────────────────────────────────────────

-- 교사 본인의 약관 동의를 기록한다. 시각은 서버가 찍는다.
CREATE OR REPLACE FUNCTION public.record_policy_consent_v1(p_version TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_version TEXT := btrim(COALESCE(p_version, ''));
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    -- 판은 시행일 모양(YYYY-MM-DD)이어야 한다. 아무 문자열이나 기록되면 나중에 대조할 수 없다.
    IF v_version !~ '^\d{4}-\d{2}-\d{2}$' THEN
        RAISE EXCEPTION '약관 판 형식이 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.profiles
    SET terms_agreed_at = NOW(),
        privacy_agreed_at = NOW(),
        agreed_policy_version = v_version
    WHERE id = auth.uid();
    IF NOT FOUND THEN
        RAISE EXCEPTION '프로필이 없습니다.' USING ERRCODE = 'P0002';
    END IF;

    RETURN jsonb_build_object('version', 1, 'agreed_policy_version', v_version, 'agreed_at', NOW());
END;
$$;

-- 담당 학급의 학생 개인정보 동의서 확인을 기록한다. 여러 학급을 한 번에 받는다(로그인 때).
CREATE OR REPLACE FUNCTION public.confirm_class_student_consent_v1(p_class_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    IF p_class_ids IS NULL OR cardinality(p_class_ids) NOT BETWEEN 1 AND 50 THEN
        RAISE EXCEPTION '확인할 학급은 1~50개여야 합니다.' USING ERRCODE = '22023';
    END IF;

    -- **본인 학급만** 확인할 수 있다. 남의 학급 id 를 섞어 보내도 건너뛴다.
    UPDATE public.classes
    SET student_consent_confirmed_at = NOW(),
        student_consent_confirmed_by = auth.uid()
    WHERE id = ANY (p_class_ids)
      AND teacher_id = auth.uid()
      AND deleted_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN jsonb_build_object('version', 1, 'confirmed', v_count);
END;
$$;

-- 두 RPC 는 로그인한 교사만 부른다. 비로그인에게 열지 않는다(2026-09-09 보안 점검 원칙).
REVOKE ALL ON FUNCTION public.record_policy_consent_v1(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_class_student_consent_v1(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_policy_consent_v1(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_class_student_consent_v1(UUID[]) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
