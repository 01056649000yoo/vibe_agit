-- ============================================================================
-- 🛡️ [보안 고도화] V13: point_logs 세분화된 RLS 및 teacher_id 비정규화
-- 작성일: 2026-03-27
-- 설명: 학생의 포인트 조작을 원천 차단하기 위해 명령별(CRUD)로 정책을 분리합니다.
--       성능 유지를 위해 teacher_id를 비정규화하여 Join 없이 권한을 확인합니다.
-- ============================================================================

-- [1] 데이터 구조 보강 (teacher_id 추가)
-- 주의: public.teachers(id) 대신 auth.users(id)를 참조하도록 하여 정합성 문제를 해결합니다.
ALTER TABLE public.point_logs DROP CONSTRAINT IF EXISTS point_logs_teacher_id_fkey;
ALTER TABLE public.point_logs 
  ADD COLUMN IF NOT EXISTS teacher_id uuid REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_point_logs_teacher_id ON public.point_logs(teacher_id);

-- [2] 자동 할당 트리거 업데이트
-- student_id를 통해 해당 학생의 반(class_id)과 담임(teacher_id)을 모두 가져오도록 수정합니다.
CREATE OR REPLACE FUNCTION public.fn_fill_point_logs_metadata()
RETURNS TRIGGER AS $$
BEGIN
  SELECT s.class_id, c.teacher_id 
  INTO NEW.class_id, NEW.teacher_id
  FROM public.students s
  JOIN public.classes c ON s.class_id = c.id
  WHERE s.id = NEW.student_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 기존 트리거 교체
DROP TRIGGER IF EXISTS trg_fill_point_logs_class_id ON public.point_logs;
CREATE TRIGGER trg_fill_point_logs_metadata
  BEFORE INSERT ON public.point_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_fill_point_logs_metadata();

-- [3] 기존 데이터 보강 (Backfill)
DO $$
BEGIN
  UPDATE public.point_logs AS pl
  SET teacher_id = c.teacher_id,
      class_id = s.class_id
  FROM public.students s
  JOIN public.classes c ON s.class_id = c.id
  WHERE pl.student_id = s.id AND (pl.teacher_id IS NULL OR pl.class_id IS NULL);
END $$;

-- [4] 세분화된 RLS 정책 (Zero-EXISTS)
-- 기존 ALL 정책 삭제 (V11/V12 등)
DROP POLICY IF EXISTS "Point_Logs_V11" ON public.point_logs;
DROP POLICY IF EXISTS "Point_Logs_V12" ON public.point_logs;

-- 1. 조회 (SELECT): 관리자 또는 같은 반 소속 (학생도 포함)
CREATE POLICY "Point_Logs_Select_V13" ON public.point_logs FOR SELECT TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') 
    OR (class_id = public.auth_user_class_id())
);

-- 2. 추가 (INSERT): 관리자 또는 해당 학급의 담당 교사
CREATE POLICY "Point_Logs_Insert_V13" ON public.point_logs FOR INSERT TO authenticated 
WITH CHECK (
    (public.auth_user_role() = 'ADMIN') 
    OR (auth.uid() = teacher_id)
);

-- 3. 수정 (UPDATE): 관리자 또는 해당 학급의 담당 교사
CREATE POLICY "Point_Logs_Update_V13" ON public.point_logs FOR UPDATE TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') 
    OR (auth.uid() = teacher_id)
)
WITH CHECK (
    (public.auth_user_role() = 'ADMIN') 
    OR (auth.uid() = teacher_id)
);

-- 4. 삭제 (DELETE): 관리자만 가능
CREATE POLICY "Point_Logs_Delete_V13" ON public.point_logs FOR DELETE TO authenticated 
USING (public.auth_user_role() = 'ADMIN');

-- 스키마 캐시 새로고침
NOTIFY pgrst, 'reload schema';
