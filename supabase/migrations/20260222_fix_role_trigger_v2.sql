-- ====================================================================
-- 🛡️ [긴급 보안 패치] role 변경 트리거 강화 (2026-02-22)
--
-- 문제: 
--   기존 트리거가 ADMIN 사용자의 직접 role 변경을 허용함
--   → ADMIN 계정이 해킹(XSS 등)되면 role 변경으로 자기 자신을 잠글 수 있음
--   → 또한 세션 탈취 시 role 변조 가능
--
-- 수정:
--   role/is_approved 변경은 오직 SECURITY DEFINER RPC 등 서버 측 함수에서만 가능
--   ADMIN이든 아니든 클라이언트 직접 UPDATE로는 role 변경 불가
--   (RPC에서 app.bypass_profile_protection = 'true' 설정 시에만 우회 가능)
-- ====================================================================

-- [1단계] 계정 복구 (테스트로 인해 ADMIN → TEACHER가 된 경우)
UPDATE public.profiles 
SET role = 'ADMIN' 
WHERE email = '01056649000yoo@gmail.com';

-- [2단계] 트리거 함수 재정의 (강화 버전)
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_columns()
RETURNS TRIGGER AS $$
DECLARE
    v_caller_id UUID;
BEGIN
    -- 신뢰할 수 있는 SECURITY DEFINER RPC에서 설정한 우회 플래그 확인
    -- (클라이언트에서는 PostgreSQL 세션 변수를 설정할 수 없으므로 안전)
    IF COALESCE(current_setting('app.bypass_profile_protection', true), '') = 'true' THEN
        RETURN NEW;
    END IF;

    v_caller_id := auth.uid();

    -- Service role (auth.uid() IS NULL) 호출은 항상 허용
    -- (Supabase Admin API, 서버 마이그레이션 등)
    IF v_caller_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- ── UPDATE 보호 ──
    IF TG_OP = 'UPDATE' THEN
        -- 🛡️ [강화] role 변경: ADMIN이든 아니든, 클라이언트 직접 변경 차단
        -- 변경은 오직 bypass 플래그가 설정된 SECURITY DEFINER RPC를 통해서만 가능
        IF NEW.role IS DISTINCT FROM OLD.role THEN
            RAISE EXCEPTION '[보안] role은 클라이언트에서 직접 변경할 수 없습니다. 관리자 대시보드를 통해 변경하세요.'
                USING ERRCODE = '42501'; -- insufficient_privilege
        END IF;

        -- 🛡️ [강화] is_approved 변경: 마찬가지로 직접 변경 차단
        IF NEW.is_approved IS DISTINCT FROM OLD.is_approved THEN
            RAISE EXCEPTION '[보안] 승인 상태는 클라이언트에서 직접 변경할 수 없습니다.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- ── INSERT 보호 ──
    IF TG_OP = 'INSERT' THEN
        -- ADMIN 역할로 자가 생성 시도 차단
        IF NEW.role = 'ADMIN' THEN
            RAISE EXCEPTION '[보안] ADMIN 역할은 자체 할당할 수 없습니다.'
                USING ERRCODE = '42501';
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

-- 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
