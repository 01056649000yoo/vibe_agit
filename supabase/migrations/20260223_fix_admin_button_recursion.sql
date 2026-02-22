-- ====================================================================
-- 🛡️ [긴급 수리] 관리자 모드 버튼 활성화 및 RLS 재귀 오류 해결
-- ====================================================================

-- [1단계] RLS 재귀 방지를 위한 역할 확인 함수 개선
-- SECURITY DEFINER와 명시적 search_path 설정을 통해 RLS를 우회하도록 보장합니다.
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
DECLARE
    v_role TEXT;
BEGIN
    -- SECURITY DEFINER로 실행되므로 profiles의 RLS를 우위에서 조회합니다.
    SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
    RETURN v_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'auth';

-- [2단계] 기존 is_admin() 함수 고도화 (재귀 방지)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN public.get_my_role() = 'ADMIN';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'auth';

-- [3단계] 프로필 보호 트리거 함수 최적화
-- 트리거 내부에서 잦은 SELECT를 피하고 get_my_role()을 활용합니다.
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_columns()
RETURNS TRIGGER AS $$
DECLARE
    v_role TEXT;
BEGIN
    -- 1. 우회 플래그 확인 (RPC 등에서 설정)
    IF COALESCE(current_setting('app.bypass_profile_protection', true), '') = 'true' THEN
        RETURN NEW;
    END IF;

    -- 2. 호출자 권한 확인
    -- Service role(auth.uid가 null)은 항상 허용
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    v_role := public.get_my_role();

    -- ── UPDATE 보호 ──
    IF TG_OP = 'UPDATE' THEN
        -- role 또는 is_approved 변경은 오직 관리자만 가능
        IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.is_approved IS DISTINCT FROM OLD.is_approved) THEN
            IF v_role != 'ADMIN' THEN
                RAISE EXCEPTION '[보안] 민감한 설정(role, 승인상태)을 변경할 권한이 없습니다.'
                    USING ERRCODE = '42501';
            END IF;
        END IF;
    END IF;

    -- ── INSERT 보호 ──
    IF TG_OP = 'INSERT' THEN
        -- ADMIN 역할로 자가 생성 시도 차단 (관리자가 아닌 경우)
        IF NEW.role = 'ADMIN' THEN
            IF v_role IS NULL OR v_role != 'ADMIN' THEN
                RAISE EXCEPTION '[보안] ADMIN 역할을 자체 할당할 수 없습니다.'
                    USING ERRCODE = '42501';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 트리거 재등록
DROP TRIGGER IF EXISTS trg_protect_profile ON public.profiles;
CREATE TRIGGER trg_protect_profile
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_profile_sensitive_columns();

-- [4단계] 사용자 계정 권한 강제 복구 (예상되는 모든 관리자 이메일)
UPDATE public.profiles SET role = 'ADMIN', is_approved = true WHERE email = '01056649000yoo@gmail.com';
UPDATE public.profiles SET role = 'ADMIN', is_approved = true WHERE email = 'yshgg@naver.com';

-- [5단계] RLS 정책 재정의 (재귀 방지 로직 적용)
-- 기존 "Admin_Full_Access_Profiles" 정책이 is_admin()을 호출할 때 
-- is_admin()이 SECURITY DEFINER이므로 무한 재귀에 빠지지 않아야 합니다.
-- 하지만 더 확실하게 하기 위해 정책을 다시 설정합니다.
DROP POLICY IF EXISTS "Admin_Full_Access_Profiles" ON public.profiles;
CREATE POLICY "Admin_Full_Access_Profiles" ON public.profiles
    FOR ALL USING ( public.get_my_role() = 'ADMIN' );

-- 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
