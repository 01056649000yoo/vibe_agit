-- student_posts.updated_at 컬럼과 자동 갱신 트리거 추가
-- 로컬 임시본과 DB 본문 중 어느 쪽이 더 최신인지 비교하기 위해 필요.

ALTER TABLE public.student_posts
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 기존 행 backfill (created_at이 있는 경우 우선 사용)
UPDATE public.student_posts
SET updated_at = COALESCE(created_at, NOW())
WHERE updated_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_student_posts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS student_posts_set_updated_at ON public.student_posts;
CREATE TRIGGER student_posts_set_updated_at
    BEFORE UPDATE ON public.student_posts
    FOR EACH ROW
    EXECUTE FUNCTION public.set_student_posts_updated_at();

NOTIFY pgrst, 'reload schema';
