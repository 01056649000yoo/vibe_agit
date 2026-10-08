-- ============================================================================
-- 🔒 과제마다 "학생끼리 서로의 글 보기"를 끌 수 있게 한다(선생님만 읽기)
-- 작성일: 2026-10-08 (선생님 요청 — 지금은 댓글만 끌 수 있고, 글 자체는 늘 반 친구에게 보인다)
--
-- 어떻게: 과제에 peer_reading_enabled(처음 값 TRUE = 지금과 같음)를 두고,
--   FALSE 인 과제의 학생 글은 서버가 visibility 를 'private' 로 둔다.
--   친구에게 글을 보여 주는 길(학급 글 피드·친구 글 직접 읽기 RLS·댓글·공감·반응 보기·전시관/문집 후보·이웃 공유)은
--   모두 이미 visibility = 'class' 만 다루므로 저절로 가려진다. 선생님 화면(제출 현황·검토·교정·내보내기)은
--   visibility 로 거르지 않아 그대로 보인다. 학생 본인은 늘 자기 글을 본다.
--
-- 과제 설정을 나중에 바꾸면 이미 낸 글의 visibility 도 함께 바뀐다(아래 트리거).
-- 비공개가 되면 전시관·이웃 공유는 기존 트리거(class_agit_post_change_revoke·neighbor_shared_posts_source_sync)가 거둔다.
-- ============================================================================

BEGIN;

ALTER TABLE public.writing_missions
    ADD COLUMN IF NOT EXISTS peer_reading_enabled BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.writing_missions.peer_reading_enabled IS
    '학생끼리 서로의 글을 읽을 수 있는지. FALSE 면 이 과제의 학생 글은 visibility=private(선생님·본인만).';

-- 과제 글도 private 를 가질 수 있게 제약을 넓힌다(자율 글쓰기 쪽 조건은 그대로).
ALTER TABLE public.student_posts DROP CONSTRAINT IF EXISTS student_posts_source_shape_check;
ALTER TABLE public.student_posts ADD CONSTRAINT student_posts_source_shape_check CHECK (
    (writing_context = 'assignment' AND mission_id IS NOT NULL AND self_writing_type IS NULL AND visibility IN ('class', 'private'))
    OR (writing_context = 'self' AND mission_id IS NULL AND self_writing_type IS NOT NULL)
);

CREATE OR REPLACE FUNCTION public.normalize_student_post_visibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.writing_context = 'assignment' THEN
        -- 과제 글의 공개 범위는 학생이 정하지 않는다 — 과제 설정이 정한다.
        -- 주인 권한으로 도는 까닭: 학생 권한으로 과제 표를 못 읽으면 늘 'class' 가 되어 비공개가 새어 나간다.
        NEW.visibility := CASE
            WHEN EXISTS (SELECT 1 FROM public.writing_missions m WHERE m.id = NEW.mission_id AND m.peer_reading_enabled = FALSE)
                THEN 'private'
            ELSE 'class'
        END;
    ELSIF NEW.visibility = 'class' AND NEW.is_submitted = true THEN
        NEW.published_at := COALESCE(NEW.published_at, NOW());
    ELSIF NEW.visibility = 'private' THEN
        NEW.published_at := NULL;
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.normalize_student_post_visibility() FROM PUBLIC, anon, authenticated;

-- 과제 설정을 바꾸면 이미 있는 글도 맞춘다(선생님 권한으로 학생 글을 바꾸므로 함수 주인 권한으로 돈다).
CREATE OR REPLACE FUNCTION public.sync_mission_peer_reading_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.peer_reading_enabled IS DISTINCT FROM OLD.peer_reading_enabled THEN
        UPDATE public.student_posts
        SET visibility = CASE WHEN NEW.peer_reading_enabled THEN 'class' ELSE 'private' END
        WHERE mission_id = NEW.id AND writing_context = 'assignment';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_mission_peer_reading_v1() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_mission_peer_reading_v1 ON public.writing_missions;
CREATE TRIGGER trg_sync_mission_peer_reading_v1
    AFTER UPDATE OF peer_reading_enabled ON public.writing_missions
    FOR EACH ROW EXECUTE FUNCTION public.sync_mission_peer_reading_v1();

COMMIT;
