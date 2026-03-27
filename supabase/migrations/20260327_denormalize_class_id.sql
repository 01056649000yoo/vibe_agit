-- ============================================================================
-- 🛡️ [RLS 최적화 2단계] 데이터 테이블 '반 번호(class_id)' 비정규화 추가
-- 작성일: 2026-03-27
-- 설명: 댓글 및 반응 테이블에 class_id를 직접 추가하여 RLS 정책에서 무거운 Join을 제거합니다.
-- ============================================================================

-- [1] 컬럼 추가
ALTER TABLE public.post_comments ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE;
ALTER TABLE public.post_reactions ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE;
ALTER TABLE public.student_posts ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE;
ALTER TABLE public.point_logs ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE;

-- 성능 향상을 위한 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_post_comments_class_id ON public.post_comments(class_id);
CREATE INDEX IF NOT EXISTS idx_post_reactions_class_id ON public.post_reactions(class_id);
CREATE INDEX IF NOT EXISTS idx_student_posts_class_id ON public.student_posts(class_id);
CREATE INDEX IF NOT EXISTS idx_point_logs_class_id ON public.point_logs(class_id);

-- [2] class_id 자동 할당 트리거 함수 생성
-- 게시글(post_id)을 통해 소속된 학급(class_id)을 찾아 자동으로 채워줍니다.
CREATE OR REPLACE FUNCTION public.fn_fill_class_id_from_post()
RETURNS TRIGGER AS $$
BEGIN
  -- NEW.post_id를 기반으로 student_posts -> writing_missions -> classes 경로로 class_id 조회
  SELECT m.class_id INTO NEW.class_id
  FROM public.student_posts p
  JOIN public.writing_missions m ON p.mission_id = m.id
  WHERE p.id = NEW.post_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- [3] 트리거 설정 (INSERT 전 실행)
DROP TRIGGER IF EXISTS trg_fill_comment_class_id ON public.post_comments;
CREATE TRIGGER trg_fill_comment_class_id
  BEFORE INSERT ON public.post_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_fill_class_id_from_post();

DROP TRIGGER IF EXISTS trg_fill_reaction_class_id ON public.post_reactions;
CREATE TRIGGER trg_fill_reaction_class_id
  BEFORE INSERT ON public.post_reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_fill_class_id_from_post();

DROP TRIGGER IF EXISTS trg_fill_post_class_id ON public.student_posts;
CREATE TRIGGER trg_fill_post_class_id
  BEFORE INSERT ON public.student_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_fill_class_id_from_post();

-- [3-1] point_logs용 별도 트리거 함수 및 설정 (student_id 기반)
CREATE OR REPLACE FUNCTION public.fn_fill_class_id_from_student()
RETURNS TRIGGER AS $$
BEGIN
  SELECT class_id INTO NEW.class_id
  FROM public.students
  WHERE id = NEW.student_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_fill_point_logs_class_id ON public.point_logs;
CREATE TRIGGER trg_fill_point_logs_class_id
  BEFORE INSERT ON public.point_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_fill_class_id_from_student();

-- [4] 기존 데이터 보강 (Backfill)
-- 이미 존재하는 댓글과 반응에 대해 class_id를 업데이트합니다.
DO $$
BEGIN
  -- 기존 댓글 업데이트
  UPDATE public.post_comments AS c
  SET class_id = m.class_id
  FROM public.student_posts p
  JOIN public.writing_missions m ON p.mission_id = m.id
  WHERE c.post_id = p.id AND c.class_id IS NULL;

  -- 기존 반응 업데이트
  UPDATE public.post_reactions AS r
  SET class_id = m.class_id
  FROM public.student_posts p
  JOIN public.writing_missions m ON p.mission_id = m.id
  WHERE r.post_id = p.id AND r.class_id IS NULL;

  -- 기존 게시글 업데이트
  UPDATE public.student_posts AS p
  SET class_id = m.class_id
  FROM public.writing_missions m
  WHERE p.mission_id = m.id AND p.class_id IS NULL;

  -- 기존 포인트 로그 업데이트
  UPDATE public.point_logs AS pl
  SET class_id = s.class_id
  FROM public.students s
  WHERE pl.student_id = s.id AND pl.class_id IS NULL;
END $$;
