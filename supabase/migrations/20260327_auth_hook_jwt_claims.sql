-- ============================================================================
-- 🛡️ [RLS 최적화 1단계] JWT Custom Claims (Auth Hook) 설정
-- 작성일: 2026-03-27
-- 설명: 로그인 시 JWT 토큰의 app_metadata에 role, class_id, student_id를 삽입하여
--       RLS 정책 평가 속도를 획기적으로 개선합니다.
-- ============================================================================

-- [1] Custom Access Token Hook 함수 생성
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_role text;
  v_class_id uuid;
  v_claims jsonb;
  v_student_record record;
BEGIN
  -- 1. 이벤트 데이터에서 유저 ID와 현재 클레임(claims) 추출
  v_user_id := (event->>'user_id')::uuid;
  v_claims := event->'claims';

  -- 2. profiles 테이블에서 유저 역할(role) 및 기본 반(primary_class_id) 조회
  SELECT role, primary_class_id INTO v_role, v_class_id FROM public.profiles WHERE id = v_user_id;

  -- 3. 학생(STUDENT)인 경우 추가 정보(student_id, class_id) 조회
  IF v_role = 'STUDENT' THEN
    SELECT id, class_id INTO v_student_record 
    FROM public.students 
    WHERE auth_id = v_user_id AND deleted_at IS NULL;
    
    IF v_student_record.id IS NOT NULL THEN
      v_claims := jsonb_set(v_claims, '{app_metadata, student_id}', to_jsonb(v_student_record.id));
      v_class_id := v_student_record.class_id; -- 학생은 소속 반 ID 사용
    END IF;
  END IF;

  -- 4. 역할(role) 및 반 ID(class_id) 정보를 app_metadata에 삽입
  IF v_role IS NOT NULL THEN
    v_claims := jsonb_set(v_claims, '{app_metadata, role}', to_jsonb(v_role));
  END IF;
  
  IF v_class_id IS NOT NULL THEN
    v_claims := jsonb_set(v_claims, '{app_metadata, class_id}', to_jsonb(v_class_id));
  END IF;

  -- 5. 수정된 클레임을 반환 객체에 담아 리턴
  RETURN jsonb_build_object('claims', v_claims);
END;
$$;

-- [2] 권한 설정
-- Supabase Auth 서비스가 이 함수를 실행할 수 있도록 권한 부여
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;

-- 일반 사용자의 접근은 차단하고 관리자/서비스만 실행 가능하도록 제한
REVOKE ALL ON FUNCTION public.custom_access_token_hook FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO service_role;

-- [3] 안내사항
-- 이 SQL을 실행한 후, Supabase 대시보드에서 다음과 같이 설정해야 합니다:
-- 1. Authentication -> Auth Hooks 메뉴로 이동
-- 2. "Custom Access Token" 훅 선택
-- 3. "PostgreSQL Function" 방식 선택
-- 4. 위에서 생성한 'public.custom_access_token_hook' 함수를 선택하고 저장
