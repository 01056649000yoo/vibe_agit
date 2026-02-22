-- ====================================================================
-- [보안 패치] 관리자 권한 탈취(Privilege Escalation) 취약점 수정
-- 작성일: 2026-02-22
--
-- 문제점:
--   profiles 테이블의 "Manage_Own_Profile" 정책이 FOR ALL로 설정되어 있어
--   인증된 사용자가 자신의 role을 'ADMIN'으로 변경하여 관리자 권한 탈취 가능
--   is_approved도 직접 true로 변경하여 승인 절차 우회 가능
--
-- 수정 항목:
--   1. profiles 테이블 RLS 정책 세분화 (FOR ALL → SELECT/INSERT/UPDATE 분리)
--   2. role/is_approved 컬럼 보호 트리거 추가 (DB 레벨 방어)
--   3. 교사 프로필 초기 설정 보안 RPC 추가 (서버 사이드 역할 할당)
-- ====================================================================


-- ──────────────────────────────────────────────────────────────────
-- [수정 1] profiles 테이블 RLS 정책 세분화
--
-- 기존: "Manage_Own_Profile" FOR ALL USING (auth.uid() = id)
--   → 모든 컬럼(role, is_approved 포함) 수정 가능 (치명적 취약점!)
--
-- 변경: SELECT / INSERT / UPDATE 분리 + DELETE 제거
--   → 트리거로 민감 컬럼(role, is_approved) 추가 보호
-- ──────────────────────────────────────────────────────────────────

-- 기존 과도한 정책 삭제
DROP POLICY IF EXISTS "Manage_Own_Profile" ON public.profiles;

-- 본인 프로필 조회 (안전)
DROP POLICY IF EXISTS "Profile_Select_Own" ON public.profiles;
CREATE POLICY "Profile_Select_Own" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

-- 본인 프로필 생성 (최초 가입 시, 트리거가 role 보호)
DROP POLICY IF EXISTS "Profile_Insert_Own" ON public.profiles;
CREATE POLICY "Profile_Insert_Own" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- 본인 프로필 수정 (트리거가 role/is_approved 보호)
DROP POLICY IF EXISTS "Profile_Update_Own" ON public.profiles;
CREATE POLICY "Profile_Update_Own" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- ※ DELETE 정책 없음 → 사용자가 직접 프로필 삭제 불가
-- ※ "Admin_Full_Access_Profiles" 정책은 기존 그대로 유지


-- ──────────────────────────────────────────────────────────────────
-- [수정 2] 민감 컬럼 보호 트리거
--
-- role, is_approved 컬럼을 비관리자가 변경할 수 없도록 DB 레벨에서 차단
-- 신뢰할 수 있는 서버 측 RPC 함수는 app.bypass_profile_protection
-- 세션 변수로 우회 가능 (클라이언트에서는 설정 불가)
-- ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_columns()
RETURNS TRIGGER AS $$
DECLARE
    v_is_admin BOOLEAN := false;
    v_caller_id UUID;
BEGIN
    -- 신뢰할 수 있는 SECURITY DEFINER RPC에서 설정한 우회 플래그 확인
    -- (클라이언트에서는 PostgreSQL 세션 변수를 설정할 수 없으므로 안전)
    IF COALESCE(current_setting('app.bypass_profile_protection', true), '') = 'true' THEN
        RETURN NEW;
    END IF;

    v_caller_id := auth.uid();

    -- Service role (auth.uid() IS NULL) 호출은 항상 허용
    IF v_caller_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- 현재 요청자가 관리자인지 확인
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = v_caller_id AND role = 'ADMIN'
    ) INTO v_is_admin;

    -- ── UPDATE 보호 ──
    IF TG_OP = 'UPDATE' THEN
        -- role 변경 시도 차단 (ADMIN이 아닌 사용자)
        IF NEW.role IS DISTINCT FROM OLD.role AND NOT v_is_admin THEN
            RAISE EXCEPTION '[보안] role 변경 권한이 없습니다. 관리자만 변경할 수 있습니다.'
                USING ERRCODE = '42501'; -- insufficient_privilege
        END IF;

        -- is_approved 변경 시도 차단
        IF NEW.is_approved IS DISTINCT FROM OLD.is_approved AND NOT v_is_admin THEN
            RAISE EXCEPTION '[보안] 승인 상태 변경 권한이 없습니다. 관리자만 변경할 수 있습니다.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- ── INSERT 보호 ──
    IF TG_OP = 'INSERT' THEN
        -- ADMIN 역할로 자가 생성 시도 차단
        IF NEW.role = 'ADMIN' AND NOT v_is_admin THEN
            RAISE EXCEPTION '[보안] ADMIN 역할은 자체 할당할 수 없습니다.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 트리거 등록 (기존 동명 트리거가 있으면 교체)
DROP TRIGGER IF EXISTS trg_protect_profile ON public.profiles;
CREATE TRIGGER trg_protect_profile
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_profile_sensitive_columns();


-- ──────────────────────────────────────────────────────────────────
-- [수정 3] 교사 프로필 초기 설정 보안 RPC
--
-- 클라이언트의 직접 upsert 대신 서버에서 안전하게 역할/승인 상태를 설정
-- - role은 항상 서버에서 'TEACHER'로 고정 (ADMIN 탈취 불가)
-- - is_approved는 auto_approval 설정에 따라 서버에서 결정
-- - 기존 관리자 역할은 보존
-- ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.setup_teacher_profile(
    p_full_name TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_api_mode TEXT DEFAULT 'PERSONAL'
)
RETURNS JSON AS $$
DECLARE
    v_auth_id UUID;
    v_auto_approve BOOLEAN := false;
    v_existing RECORD;
    v_is_approved BOOLEAN;
    v_final_role TEXT;
BEGIN
    v_auth_id := auth.uid();

    IF v_auth_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', '인증되지 않은 요청입니다.');
    END IF;

    -- 기존 프로필 확인
    SELECT * INTO v_existing FROM public.profiles WHERE id = v_auth_id;

    -- [보안 강화] 이미 학생인 사용자가 교사로 승격되는 것을 차단
    IF v_existing.role = 'STUDENT' THEN
        RAISE EXCEPTION '[보안] 학생 계정은 교사 프로필을 설정할 수 없습니다.'
            USING ERRCODE = '42501';
    END IF;

    -- 이미 관리자인 경우 역할 변경 없이 유지
    IF v_existing.role = 'ADMIN' THEN
        RETURN json_build_object('success', true, 'role', 'ADMIN', 'is_approved', true);
    END IF;

    -- 자동 승인 설정 확인 (system_settings 테이블)
    BEGIN
        SELECT (value = to_jsonb(true)) INTO v_auto_approve
        FROM public.system_settings WHERE key = 'auto_approval';
    EXCEPTION WHEN OTHERS THEN
        v_auto_approve := false;
    END;

    -- 승인 상태 결정 (서버 사이드 로직)
    v_is_approved := COALESCE(v_existing.is_approved, false) OR COALESCE(v_auto_approve, false);
    v_final_role := COALESCE(v_existing.role, 'TEACHER');

    -- 관리자가 아닌 경우 role은 TEACHER로 고정
    IF v_final_role != 'ADMIN' THEN
        v_final_role := 'TEACHER';
    END IF;

    -- 트리거 보호 우회 플래그 설정 (트랜잭션 종료 시 자동 해제)
    PERFORM set_config('app.bypass_profile_protection', 'true', true);

    -- 프로필 upsert (role은 서버에서 결정)
    INSERT INTO public.profiles (id, role, email, full_name, is_approved, api_mode)
    VALUES (
        v_auth_id,
        v_final_role,
        COALESCE(p_email, ''),
        p_full_name,
        v_is_approved,
        COALESCE(p_api_mode, 'PERSONAL')
    )
    ON CONFLICT (id) DO UPDATE SET
        email = COALESCE(EXCLUDED.email, public.profiles.email),
        full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        api_mode = COALESCE(EXCLUDED.api_mode, public.profiles.api_mode),
        -- role: 기존 ADMIN이면 유지, 아니면 TEACHER (절대로 클라이언트가 결정하지 않음)
        role = CASE
            WHEN public.profiles.role = 'ADMIN' THEN 'ADMIN'
            ELSE 'TEACHER'
        END,
        -- is_approved: 이미 승인됐으면 유지, 자동승인이면 true, 아니면 기존 상태 유지
        is_approved = CASE
            WHEN public.profiles.is_approved = true THEN true
            WHEN v_auto_approve THEN true
            ELSE public.profiles.is_approved
        END;

    -- 우회 플래그 해제 (안전을 위해 명시적 해제)
    PERFORM set_config('app.bypass_profile_protection', '', true);

    RETURN json_build_object(
        'success', true,
        'role', v_final_role,
        'is_approved', v_is_approved
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC 실행 권한 부여 (인증된 사용자만, 익명 학생은 불필요)
GRANT EXECUTE ON FUNCTION public.setup_teacher_profile(TEXT, TEXT, TEXT) TO authenticated;


-- ──────────────────────────────────────────────────────────────────
-- 스키마 캐시 새로고침
-- ──────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';


-- ====================================================================
-- 완료! 🛡️
--
-- 적용 후 검증 방법:
--   1. 일반 교사 계정으로 로그인
--   2. 브라우저 콘솔에서 실행:
--      await supabase.from('profiles').update({ role: 'ADMIN' }).eq('id', session.user.id)
--   3. 에러 발생 확인: "[보안] role 변경 권한이 없습니다"
--   4. 마찬가지로 is_approved 변경 시도 시 에러 확인
-- ====================================================================
