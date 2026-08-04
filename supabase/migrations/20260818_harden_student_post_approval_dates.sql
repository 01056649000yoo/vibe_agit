-- approved_at은 승인 상태 전환으로만 정해지는 DB 생성 값이다.
-- 승인 상태를 유지한 채 클라이언트가 이 시각만 바꾸는 것도 막는다.

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_student_post_approved_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF COALESCE(NEW.is_confirmed, false) THEN
            NEW.approved_at := clock_timestamp();
        ELSE
            NEW.approved_at := NULL;
        END IF;
        RETURN NEW;
    END IF;

    IF NOT COALESCE(NEW.is_confirmed, false) THEN
        NEW.approved_at := NULL;
    ELSIF NOT COALESCE(OLD.is_confirmed, false) THEN
        NEW.approved_at := clock_timestamp();
    ELSE
        NEW.approved_at := OLD.approved_at;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_student_posts_approved_at_update
    ON public.student_posts;
CREATE TRIGGER trg_student_posts_approved_at_update
BEFORE UPDATE OF is_confirmed, approved_at ON public.student_posts
FOR EACH ROW
EXECUTE FUNCTION public.sync_student_post_approved_at();

COMMIT;
