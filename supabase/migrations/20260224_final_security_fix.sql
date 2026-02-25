-- ====================================================================
-- 🛡️ [최종 보안 패치] RLS 재귀 해결 및 권한 탈취 원천 차단
-- ====================================================================

-- [1단계] 기존 정책 및 함수 완전 초기화 (충돌 방지)
DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('profiles', 'teachers')) LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(pol.policyname) || ' ON ' || quote_ident(pol.tablename);
    END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.is_admin() CASCADE;
DROP FUNCTION IF EXISTS public.check_is_admin() CASCADE;
DROP FUNCTION IF EXISTS public.is_admin_safe() CASCADE;

-- [2단계] 재귀 없는 관리자 확인 함수 (SECURITY DEFINER)
-- postgres 권한으로 실행되어 RLS를 우회하므로 500 에러를 방지합니다.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'ADMIN'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'auth';

-- [3단계] profiles 테이블 RLS 정책 (엄격한 기준 적용)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- (A) SELECT: 본인 데이터 또는 관리자가 전체 조회 가능
CREATE POLICY "profiles_select_policy" ON public.profiles
    FOR SELECT USING (
        auth.uid() = id -- 본인
        OR (SELECT (role = 'ADMIN') FROM public.profiles WHERE id = auth.uid()) -- 관리자 (재귀 주의 - 여기서는 simple check)
    );
-- ※ 위 정책에서 재귀가 우려된다면 아래처럼 분리합니다.
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;

CREATE POLICY "profiles_select_self" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_select_admin" ON public.profiles FOR SELECT USING (public.is_admin());

-- (B) UPDATE: 본인 데이터 수정 가능 (트리거가 컬럼 보호) 또는 관리자 수정 가능
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_update_admin" ON public.profiles FOR UPDATE USING (public.is_admin());

-- (C) DELETE: 오직 관리자만 삭제 가능 (본인 삭제 불가 - 관리 대시보드 사고 방지)
CREATE POLICY "profiles_delete_admin" ON public.profiles FOR DELETE USING (public.is_admin());

-- [4단계] teachers 테이블 RLS 정책
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teachers_select_self" ON public.teachers FOR SELECT USING (auth.uid() = id);
CREATE POLICY "teachers_select_admin" ON public.teachers FOR SELECT USING (public.is_admin());

CREATE POLICY "teachers_update_self" ON public.teachers FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "teachers_update_admin" ON public.teachers FOR UPDATE USING (public.is_admin());

CREATE POLICY "teachers_delete_admin" ON public.teachers FOR DELETE USING (public.is_admin());

-- [5단계] 민감 컬럼 보호 트리거 (보안의 핵심)
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_columns()
RETURNS TRIGGER AS $$
BEGIN
    -- 1. 시스템 내부 RPC (setup_teacher_profile 등)는 허용
    IF COALESCE(current_setting('app.bypass_profile_protection', true), '') = 'true' THEN
        RETURN NEW;
    END IF;

    -- 2. UPDATE 시 보호
    IF TG_OP = 'UPDATE' THEN
        -- role이나 is_approved 변경 시도 시
        IF NEW.role IS DISTINCT FROM OLD.role OR NEW.is_approved IS DISTINCT FROM OLD.is_approved THEN
            -- 호출자가 관리자가 아닐 경우 차단
            IF NOT public.is_admin() THEN
                RAISE EXCEPTION '[보안] 권한 및 승인 상태는 직접 변경할 수 없습니다.' 
                    USING ERRCODE = '42501';
            END IF;
        END IF;
    END IF;

    -- 3. INSERT 시 보호 (자가 ADMIN 할당 차단)
    IF TG_OP = 'INSERT' THEN
        IF NEW.role = 'ADMIN' AND NOT public.is_admin() THEN
            RAISE EXCEPTION '[보안] ADMIN 역할은 자체 할당할 수 없습니다.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_protect_profile ON public.profiles;
CREATE TRIGGER trg_protect_profile
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_profile_sensitive_columns();

-- [6단계] 관리자 계정 권한 설정
-- ⚠️ 보안상 이메일을 코드 파일에 기록하지 않습니다.
-- 최초 배포 시 Supabase SQL Editor에서 직접 실행하세요 (Git에 저장하지 말 것):
--
--   UPDATE public.profiles SET role = 'ADMIN', is_approved = true
--   WHERE email = '관리자이메일@도메인.com';
--

NOTIFY pgrst, 'reload schema';
