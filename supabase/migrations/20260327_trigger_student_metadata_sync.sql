-- ============================================================================
-- 🛡️ [Zero-CLI] V16: 학생 메타데이터 자동 동기화 트리거
-- 작성일: 2026-03-27
-- 설명: Edge Function 배포 없이 SQL만으로 학생 로그인 시 
--       auth.users의 app_metadata를 자동으로 업데이트합니다.
-- ============================================================================

-- 1. 메타데이터 동기화 함수 (SECURITY DEFINER로 auth 권한 우회)
CREATE OR REPLACE FUNCTION public.fn_sync_student_metadata()
RETURNS TRIGGER AS $$
BEGIN
  -- auth_id가 새로 연결되거나 변경된 경우에만 작동
  IF NEW.auth_id IS NOT NULL AND (OLD.auth_id IS NULL OR OLD.auth_id != NEW.auth_id) THEN
    
    -- auth.users 테이블의 raw_app_meta_data를 직접 업데이트
    -- 기존 데이터를 유지하면서 role, class_id, student_id를 주입/덮어씁니다.
    UPDATE auth.users 
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || 
        jsonb_build_object(
            'role', 'STUDENT',
            'class_id', NEW.class_id,
            'student_id', NEW.id
        )
    WHERE id = NEW.auth_id;

    -- 로그 남기기 (디버깅용 - 필요 시 삭제 가능)
    RAISE NOTICE 'Student metadata synced for auth_id: %', NEW.auth_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

-- 2. 트리거 설정
DROP TRIGGER IF EXISTS trg_sync_student_metadata ON public.students;
CREATE TRIGGER trg_sync_student_metadata
  AFTER UPDATE OF auth_id ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_student_metadata();

-- 3. 권한 확인 (필요 시)
GRANT EXECUTE ON FUNCTION public.fn_sync_student_metadata() TO service_role;

-- 스키마 캐시 새로고침
NOTIFY pgrst, 'reload schema';
