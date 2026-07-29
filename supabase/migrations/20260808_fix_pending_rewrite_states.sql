-- 학생 홈의 "다시 쓸 글"은 아래 한 가지 상태만 뜻한다.
--   is_returned=true, is_submitted=false, is_confirmed=false
-- 과거 코드에서 모순 플래그가 남은 완료 글을 먼저 정리하고 재발을 막는다.

UPDATE public.student_posts
SET is_returned = false
WHERE is_returned IS TRUE
  AND (is_submitted IS TRUE OR is_confirmed IS TRUE);

UPDATE public.student_posts
SET is_submitted = true,
    is_returned = false
WHERE is_confirmed IS TRUE
  AND is_submitted IS DISTINCT FROM true;

ALTER TABLE public.student_posts
  DROP CONSTRAINT IF EXISTS student_posts_returned_state_check,
  DROP CONSTRAINT IF EXISTS student_posts_confirmed_state_check;

ALTER TABLE public.student_posts
  ADD CONSTRAINT student_posts_returned_state_check CHECK (
    NOT COALESCE(is_returned, false)
    OR (
      NOT COALESCE(is_submitted, false)
      AND NOT COALESCE(is_confirmed, false)
    )
  ),
  ADD CONSTRAINT student_posts_confirmed_state_check CHECK (
    NOT COALESCE(is_confirmed, false)
    OR COALESCE(is_submitted, false)
  );

CREATE INDEX IF NOT EXISTS idx_student_posts_class_pending_rewrite
  ON public.student_posts (class_id, student_id, updated_at DESC)
  WHERE is_returned IS TRUE
    AND is_submitted IS FALSE
    AND is_confirmed IS FALSE
    AND recalled_at IS NULL;

-- 학생이 편집 화면을 열어 둔 사이 교사가 미션을 보관해도, 오래된 클라이언트가
-- 글 본문이나 제출 상태를 다시 쓰지 못하게 DB에서도 마지막 방어선을 둔다.
CREATE OR REPLACE FUNCTION public.guard_archived_mission_student_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_student_id uuid;
BEGIN
  v_student_id := public.auth_student_id();

  -- 교사·관리자·service_role 작업은 기존 권한 정책을 그대로 따른다.
  IF v_student_id IS NULL OR NEW.student_id IS DISTINCT FROM v_student_id THEN
    RETURN NEW;
  END IF;

  -- 자율 글쓰기는 미션이 없으므로 이 규칙의 대상이 아니다.
  IF NEW.mission_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.writing_missions m
    WHERE m.id = NEW.mission_id
      AND m.class_id = NEW.class_id
      AND m.is_archived IS TRUE
  ) THEN
    RAISE EXCEPTION 'Archived mission cannot be edited or submitted';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_archived_mission_student_write
  ON public.student_posts;

CREATE TRIGGER trg_guard_archived_mission_student_write
BEFORE INSERT OR UPDATE OF
  title,
  content,
  structured_content,
  student_answers,
  char_count,
  paragraph_count,
  is_submitted,
  is_returned,
  is_confirmed
ON public.student_posts
FOR EACH ROW
EXECUTE FUNCTION public.guard_archived_mission_student_write();

REVOKE ALL ON FUNCTION public.guard_archived_mission_student_write()
  FROM PUBLIC, anon, authenticated;
