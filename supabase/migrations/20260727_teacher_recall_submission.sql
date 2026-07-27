-- 교사 강제 회수(다시쓰기 미제출 글 걷기)
--
-- 다시쓰기를 보낸 뒤 학생이 제출하지 않으면 교사가 글을 되돌려받을 방법이 없어
-- 학생 계정으로 로그인해야 했다. 교사가 직접 걷을 수 있게 하되,
-- 학생이 스스로 낸 글과 구분되도록 회수 표시를 남긴다.
ALTER TABLE public.student_posts
  ADD COLUMN IF NOT EXISTS recalled_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS recalled_by uuid DEFAULT NULL REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.student_posts.recalled_at IS
  '교사가 강제 회수한 시각. NULL이면 학생이 직접 제출한 글.';
COMMENT ON COLUMN public.student_posts.recalled_by IS
  '회수를 실행한 교사 계정.';

CREATE INDEX IF NOT EXISTS idx_student_posts_recalled
  ON public.student_posts (recalled_at) WHERE recalled_at IS NOT NULL;
