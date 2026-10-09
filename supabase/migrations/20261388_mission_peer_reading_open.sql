-- ============================================================================
-- 🔓 "선생님만 읽기" 과제를 친구들에게 일제히 열기(2026-10-09, 선생님 결정)
--
--   · 열기는 언제든, 한 번만. **닫기는 없다** — 열고 닫기를 오가면 전시관·문집·이웃 공유가 거둬지고
--     되돌아오지 않는 등 경우의 수가 너무 많다(선생님 판단). 서버가 막는다(guard_mission_peer_reading_v1).
--     예외: 아직 아무도 내지 않은 과제는 과제 수정에서 '선생님만'으로 바꿀 수 있다(보인 글이 없다).
--   · 연 과제는 **선생님이 승인한 글만** 친구에게 보인다. 다시 쓰는 중인 글은 승인하는 순간 보인다.
--   · 열 때 친구 댓글도 함께 열지 고르고, 그 반 학생에게 알림을 한 번 보낸다(같은 과제는 다시 보내지 않는다).
-- ============================================================================

BEGIN;

ALTER TABLE public.writing_missions
    ADD COLUMN IF NOT EXISTS peer_reading_opened_at TIMESTAMPTZ;
COMMENT ON COLUMN public.writing_missions.peer_reading_opened_at IS
    '선생님만 읽던 과제를 친구들에게 연 시각. 값이 있으면 승인한 글만 친구에게 보이고, 다시 닫을 수 없다.';

-- 과제 글 공개 범위: 선생님만 → private / 연 과제 → 승인한 글만 class / 그 밖 → class
CREATE OR REPLACE FUNCTION public.normalize_student_post_visibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_enabled BOOLEAN;
    v_opened_at TIMESTAMPTZ;
BEGIN
    IF NEW.writing_context = 'assignment' THEN
        -- 주인 권한으로 도는 까닭: 학생 권한으로 과제 표를 못 읽으면 늘 'class' 가 되어 비공개가 새어 나간다.
        SELECT m.peer_reading_enabled, m.peer_reading_opened_at INTO v_enabled, v_opened_at
        FROM public.writing_missions m WHERE m.id = NEW.mission_id;
        NEW.visibility := CASE
            WHEN v_enabled IS FALSE THEN 'private'
            WHEN v_opened_at IS NOT NULL AND NEW.is_confirmed IS NOT TRUE THEN 'private'
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

-- 승인 여부가 바뀌어도 공개 범위를 다시 정한다(연 과제의 '승인한 글만').
DROP TRIGGER IF EXISTS trg_normalize_student_post_visibility ON public.student_posts;
CREATE TRIGGER trg_normalize_student_post_visibility
    BEFORE INSERT OR UPDATE OF visibility, is_submitted, writing_context, is_confirmed ON public.student_posts
    FOR EACH ROW EXECUTE FUNCTION public.normalize_student_post_visibility();

-- 과제 설정이 바뀌면 이미 있는 글을 맞춘다 — 값은 normalize 가 다시 정하므로 visibility 를 건드리기만 한다.
CREATE OR REPLACE FUNCTION public.sync_mission_peer_reading_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.peer_reading_enabled IS DISTINCT FROM OLD.peer_reading_enabled
       OR NEW.peer_reading_opened_at IS DISTINCT FROM OLD.peer_reading_opened_at THEN
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
    AFTER UPDATE OF peer_reading_enabled, peer_reading_opened_at ON public.writing_missions
    FOR EACH ROW EXECUTE FUNCTION public.sync_mission_peer_reading_v1();

-- 닫기 막기: 한 번 연 과제, 또는 이미 낸 글이 있는 열린 과제는 '선생님만'으로 되돌리지 않는다.
CREATE OR REPLACE FUNCTION public.guard_mission_peer_reading_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF OLD.peer_reading_opened_at IS NOT NULL
       AND (NEW.peer_reading_opened_at IS NULL OR NEW.peer_reading_enabled IS NOT TRUE) THEN
        RAISE EXCEPTION 'peer_reading_locked: 친구들에게 연 과제는 다시 닫을 수 없어요.' USING ERRCODE = 'P0001';
    END IF;
    IF OLD.peer_reading_enabled IS TRUE AND NEW.peer_reading_enabled IS FALSE
       AND EXISTS (SELECT 1 FROM public.student_posts p
                   WHERE p.mission_id = NEW.id AND (p.is_submitted OR p.is_confirmed)) THEN
        RAISE EXCEPTION 'peer_reading_locked: 이미 낸 글이 있어 선생님만 읽기로 바꿀 수 없어요.' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.peer_reading_opened_at IS NOT NULL AND OLD.peer_reading_opened_at IS NULL AND OLD.peer_reading_enabled IS NOT FALSE THEN
        NEW.peer_reading_opened_at := NULL;  -- 처음부터 열린 과제에는 '연 시각' 이 없다
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_mission_peer_reading_v1() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_mission_peer_reading_v1 ON public.writing_missions;
CREATE TRIGGER trg_guard_mission_peer_reading_v1
    BEFORE UPDATE OF peer_reading_enabled, peer_reading_opened_at ON public.writing_missions
    FOR EACH ROW EXECUTE FUNCTION public.guard_mission_peer_reading_v1();

-- 열기(미리 세기 겸용). 담당 선생님·관리자만.
CREATE OR REPLACE FUNCTION public.open_mission_peer_reading_v1(
    p_mission_id UUID,
    p_allow_comments BOOLEAN DEFAULT TRUE,
    p_preview BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_mission public.writing_missions%ROWTYPE;
    v_teacher UUID;
    v_students INTEGER;
    v_submitted INTEGER;
    v_approved INTEGER;
    v_student RECORD;
BEGIN
    SELECT m.* INTO v_mission FROM public.writing_missions m WHERE m.id = p_mission_id;
    IF v_mission.id IS NULL THEN
        RAISE EXCEPTION '과제를 찾을 수 없습니다.' USING ERRCODE = 'P0002';
    END IF;
    SELECT c.teacher_id INTO v_teacher FROM public.classes c WHERE c.id = v_mission.class_id;
    IF auth.uid() IS NULL OR (v_teacher IS DISTINCT FROM auth.uid() AND public.auth_user_role() IS DISTINCT FROM 'ADMIN') THEN
        RAISE EXCEPTION '담당 학급의 선생님만 열 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT count(*) INTO v_students FROM public.students s WHERE s.class_id = v_mission.class_id AND s.deleted_at IS NULL;
    SELECT count(*) FILTER (WHERE p.is_submitted OR p.is_confirmed), count(*) FILTER (WHERE p.is_confirmed)
    INTO v_submitted, v_approved
    FROM public.student_posts p WHERE p.mission_id = p_mission_id AND p.writing_context = 'assignment';

    IF p_preview OR v_mission.peer_reading_enabled IS NOT FALSE THEN
        RETURN jsonb_build_object(
            'already_open', v_mission.peer_reading_enabled IS NOT FALSE,
            'opened_at', v_mission.peer_reading_opened_at,
            'students', v_students, 'submitted', v_submitted, 'approved', v_approved
        );
    END IF;

    UPDATE public.writing_missions
    SET peer_reading_enabled = TRUE,
        peer_reading_opened_at = clock_timestamp(),
        allow_comments = COALESCE(p_allow_comments, allow_comments)
    WHERE id = p_mission_id
    RETURNING * INTO v_mission;

    -- 그 반 학생에게 알림 한 번(같은 과제는 event_key 가 같아 다시 쌓이지 않는다)
    FOR v_student IN SELECT s.id FROM public.students s WHERE s.class_id = v_mission.class_id AND s.deleted_at IS NULL LOOP
        PERFORM public.notification_emit_v1(
            v_student.id, 'writing', 'writing.peer_reading_opened', 'writing_mission', v_mission.id,
            jsonb_build_object('mission_id', v_mission.id, 'mission_title', v_mission.title,
                               'comments_open', v_mission.allow_comments),
            format('writing:%s:peer_opened', v_mission.id)
        );
    END LOOP;

    RETURN jsonb_build_object(
        'already_open', FALSE,
        'opened_at', v_mission.peer_reading_opened_at,
        'allow_comments', v_mission.allow_comments,
        'students', v_students, 'submitted', v_submitted, 'approved', v_approved
    );
END;
$$;
REVOKE ALL ON FUNCTION public.open_mission_peer_reading_v1(UUID, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_mission_peer_reading_v1(UUID, BOOLEAN, BOOLEAN) TO authenticated;

COMMIT;
