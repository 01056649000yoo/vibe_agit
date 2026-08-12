-- 학생 홈 알림을 기능별 폴링이 아닌 하나의 이벤트 원장으로 통합한다.
-- 내 글 소식(반응·댓글)은 기존 last_feedback_check 흐름을 그대로 사용하고,
-- 이 원장은 교사의 업무 처리 결과(다시쓰기·승인·포인트 조정)만 보관한다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.student_notification_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    module_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_version SMALLINT NOT NULL DEFAULT 1,
    entity_type TEXT,
    entity_id UUID,
    payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    event_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ,
    CONSTRAINT student_notification_module_length CHECK (char_length(module_id) BETWEEN 1 AND 60),
    CONSTRAINT student_notification_type_length CHECK (char_length(event_type) BETWEEN 1 AND 100),
    CONSTRAINT student_notification_version_positive CHECK (event_version > 0),
    CONSTRAINT student_notification_entity_type_length CHECK (entity_type IS NULL OR char_length(entity_type) BETWEEN 1 AND 60),
    CONSTRAINT student_notification_payload_object CHECK (jsonb_typeof(payload) = 'object'),
    CONSTRAINT student_notification_event_key_length CHECK (char_length(event_key) BETWEEN 1 AND 200),
    CONSTRAINT student_notification_student_event_unique UNIQUE (student_id, event_key)
);

CREATE INDEX IF NOT EXISTS idx_student_notification_events_student_created
    ON public.student_notification_events (class_id, student_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_student_notification_events_student_unread
    ON public.student_notification_events (class_id, student_id, created_at DESC, id DESC)
    WHERE read_at IS NULL;

ALTER TABLE public.student_notification_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.student_notification_events FROM PUBLIC, anon, authenticated;

-- 기능 RPC가 권한과 업무 규칙을 확인한 뒤 같은 트랜잭션 안에서만 호출하는 내부 함수다.
-- 학생·학급 일치는 서버가 다시 확인하고, event_key로 재시도 중복을 막는다.
CREATE OR REPLACE FUNCTION public.notification_emit_v1(
    p_student_id UUID,
    p_module_id TEXT,
    p_event_type TEXT,
    p_entity_type TEXT,
    p_entity_id UUID,
    p_payload JSONB,
    p_event_key TEXT,
    p_event_version SMALLINT DEFAULT 1
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_class_id UUID;
    v_event_id UUID;
BEGIN
    IF p_student_id IS NULL THEN
        RAISE EXCEPTION '알림을 받을 학생이 필요합니다.' USING ERRCODE = '22023';
    END IF;
    IF char_length(btrim(COALESCE(p_module_id, ''))) NOT BETWEEN 1 AND 60
      OR char_length(btrim(COALESCE(p_event_type, ''))) NOT BETWEEN 1 AND 100
      OR char_length(btrim(COALESCE(p_event_key, ''))) NOT BETWEEN 1 AND 200 THEN
        RAISE EXCEPTION '알림 식별자가 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;
    IF p_entity_type IS NOT NULL AND char_length(btrim(p_entity_type)) NOT BETWEEN 1 AND 60 THEN
        RAISE EXCEPTION '알림 대상 종류가 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;
    IF p_event_version IS NULL OR p_event_version < 1 THEN
        RAISE EXCEPTION '알림 이벤트 버전은 1 이상이어야 합니다.' USING ERRCODE = '22023';
    END IF;
    IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR pg_column_size(p_payload) > 8192 THEN
        RAISE EXCEPTION '알림 부가 정보는 8KB 이하 JSON 객체여야 합니다.' USING ERRCODE = '22023';
    END IF;

    SELECT student.class_id
    INTO v_class_id
    FROM public.students student
    JOIN public.classes class ON class.id = student.class_id
    WHERE student.id = p_student_id
      AND student.is_active IS DISTINCT FROM FALSE
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
      AND class.deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION '활성 학생과 학급을 찾을 수 없습니다.' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.student_notification_events (
        class_id, student_id, module_id, event_type, event_version,
        entity_type, entity_id, payload, event_key
    ) VALUES (
        v_class_id, p_student_id, btrim(p_module_id), btrim(p_event_type), p_event_version,
        NULLIF(btrim(COALESCE(p_entity_type, '')), ''), p_entity_id, p_payload, btrim(p_event_key)
    )
    ON CONFLICT (student_id, event_key) DO NOTHING
    RETURNING id INTO v_event_id;

    IF v_event_id IS NULL THEN
        SELECT event.id INTO v_event_id
        FROM public.student_notification_events event
        WHERE event.student_id = p_student_id
          AND event.event_key = btrim(p_event_key);
    END IF;
    RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.notification_emit_v1(UUID, TEXT, TEXT, TEXT, UUID, JSONB, TEXT, SMALLINT)
    FROM PUBLIC, anon, authenticated, service_role;

-- 기존 글 상태 변경을 이벤트 원장으로 투영한다. 신규 기능은 이 트리거에 유형을
-- 하드코딩하지 않고 자기 업무 RPC에서 notification_emit_v1을 직접 호출한다.
CREATE OR REPLACE FUNCTION public.emit_assignment_status_notification_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_mission public.writing_missions%ROWTYPE;
    v_cycle INTEGER;
    v_points INTEGER := 0;
BEGIN
    IF NEW.writing_context <> 'assignment' OR NEW.mission_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT mission.* INTO v_mission
    FROM public.writing_missions mission
    WHERE mission.id = NEW.mission_id
      AND mission.class_id = NEW.class_id;
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    IF NEW.is_returned IS TRUE
      AND NEW.is_submitted IS FALSE
      AND NEW.is_confirmed IS FALSE
      AND NEW.recalled_at IS NULL
      AND OLD.recalled_at IS NULL
      AND NOT (
          OLD.is_returned IS TRUE
          AND OLD.is_submitted IS FALSE
          AND OLD.is_confirmed IS FALSE
          AND OLD.recalled_at IS NULL
      ) THEN
        SELECT count(*)::INTEGER + 1 INTO v_cycle
        FROM public.student_notification_events event
        WHERE event.student_id = NEW.student_id
          AND event.entity_id = NEW.id
          AND event.event_type = 'writing.rewrite_requested';
        PERFORM public.notification_emit_v1(
            NEW.student_id, 'writing', 'writing.rewrite_requested', 'student_post', NEW.id,
            jsonb_build_object(
                'post_id', NEW.id, 'mission_id', NEW.mission_id,
                'post_title', NEW.title, 'mission_title', v_mission.title,
                'feedback', NEW.ai_feedback
            ),
            format('writing:%s:rewrite:%s', NEW.id, v_cycle)
        );
    END IF;

    IF NEW.is_confirmed IS TRUE AND OLD.is_confirmed IS DISTINCT FROM TRUE THEN
        v_points := GREATEST(0, COALESCE(NEW.awarded_base_reward, v_mission.base_reward, 0))
            + CASE
                WHEN GREATEST(0, COALESCE(NEW.awarded_bonus_threshold, v_mission.bonus_threshold, 0)) > 0
                 AND GREATEST(0, COALESCE(NEW.awarded_bonus_reward, v_mission.bonus_reward, 0)) > 0
                 AND COALESCE(NEW.char_count, 0) >= GREATEST(0, COALESCE(v_mission.min_chars, 0))
                    + GREATEST(0, COALESCE(NEW.awarded_bonus_threshold, v_mission.bonus_threshold, 0))
                THEN GREATEST(0, COALESCE(NEW.awarded_bonus_reward, v_mission.bonus_reward, 0))
                ELSE 0
              END;
        SELECT count(*)::INTEGER + 1 INTO v_cycle
        FROM public.point_logs log
        WHERE log.student_id = NEW.student_id
          AND log.post_id = NEW.id
          AND log.amount > 0
          AND log.reason ILIKE '%승인%';
        PERFORM public.notification_emit_v1(
            NEW.student_id, 'writing', 'writing.approved', 'student_post', NEW.id,
            jsonb_build_object(
                'post_id', NEW.id, 'mission_id', NEW.mission_id,
                'post_title', NEW.title, 'mission_title', v_mission.title,
                'point_delta', v_points
            ),
            format('writing:%s:approved:%s', NEW.id, v_cycle)
        );
    END IF;

    IF NEW.is_confirmed IS FALSE AND OLD.is_confirmed IS TRUE THEN
        SELECT GREATEST(0, COALESCE(sum(log.amount), 0))::INTEGER
        INTO v_points
        FROM public.point_logs log
        WHERE log.student_id = NEW.student_id
          AND log.post_id = NEW.id
          AND log.mission_id = NEW.mission_id
          AND log.activity_type = 'writing_reward'
          AND log.reason ILIKE '%승인%';
        -- 회수할 포인트가 있으면 뒤이어 삽입되는 point_logs 트리거가 실제 금액으로
        -- 복합 알림 한 건을 만든다. 0점 승인만 여기서 바로 알린다.
        IF v_points = 0 THEN
            SELECT count(*)::INTEGER + 1 INTO v_cycle
            FROM public.student_notification_events event
            WHERE event.student_id = NEW.student_id
              AND event.entity_id = NEW.id
              AND event.event_type = 'writing.approval_recovered';
            PERFORM public.notification_emit_v1(
                NEW.student_id, 'writing', 'writing.approval_recovered', 'student_post', NEW.id,
                jsonb_build_object(
                    'post_id', NEW.id, 'mission_id', NEW.mission_id,
                    'post_title', NEW.title, 'mission_title', v_mission.title,
                    'point_delta', 0
                ),
                format('writing:%s:recovered:%s', NEW.id, v_cycle)
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.emit_assignment_status_notification_v1()
    FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_assignment_status_notification_v1 ON public.student_posts;
CREATE TRIGGER trg_assignment_status_notification_v1
AFTER UPDATE OF is_returned, is_submitted, is_confirmed ON public.student_posts
FOR EACH ROW EXECUTE FUNCTION public.emit_assignment_status_notification_v1();

-- 승인 회수는 실제 회수 원장과 복합 알림 한 건으로 묶고, 교사가 직접 지급·회수한
-- private_adjustment도 알린다. 게임 소비·보상은 각각 자기 화면이 맡는다.
CREATE OR REPLACE FUNCTION public.emit_point_notification_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_post public.student_posts%ROWTYPE;
    v_mission_title TEXT;
    v_cycle INTEGER;
BEGIN
    IF NEW.activity_type = 'writing_reward'
      AND NEW.metadata->>'source' = 'assignment_recovery'
      AND NEW.post_id IS NOT NULL THEN
        SELECT post.* INTO v_post
        FROM public.student_posts post
        WHERE post.id = NEW.post_id
          AND post.student_id = NEW.student_id;
        IF FOUND THEN
            SELECT mission.title INTO v_mission_title
            FROM public.writing_missions mission
            WHERE mission.id = v_post.mission_id
              AND mission.class_id = v_post.class_id;
            v_cycle := GREATEST(1, COALESCE((NEW.metadata->>'cycle')::INTEGER, 1));
            PERFORM public.notification_emit_v1(
                NEW.student_id, 'writing', 'writing.approval_recovered', 'student_post', v_post.id,
                jsonb_build_object(
                    'post_id', v_post.id, 'mission_id', v_post.mission_id,
                    'post_title', v_post.title, 'mission_title', v_mission_title,
                    'point_delta', NEW.amount
                ),
                format('writing:%s:recovered:%s', v_post.id, v_cycle)
            );
        END IF;
    ELSIF NEW.activity_type = 'private_adjustment'
      AND NEW.metadata->>'source' = 'teacher_adjustment' THEN
        PERFORM public.notification_emit_v1(
            NEW.student_id, 'points', 'points.adjusted', 'point_log', NEW.id,
            jsonb_build_object(
                'point_log_id', NEW.id, 'point_delta', NEW.amount, 'reason', NEW.reason
            ),
            COALESCE(NEW.event_key, format('point-log:%s', NEW.id))
        );
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.emit_point_notification_v1()
    FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_teacher_point_notification_v1 ON public.point_logs;
CREATE TRIGGER trg_teacher_point_notification_v1
AFTER INSERT ON public.point_logs
FOR EACH ROW EXECUTE FUNCTION public.emit_point_notification_v1();

-- 다시쓰기는 더 이상 브라우저가 student_posts를 여러 번 직접 수정하지 않는다.
CREATE OR REPLACE FUNCTION public.request_assignment_rewrite_v1(
    p_post_id UUID,
    p_feedback TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_post public.student_posts%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    IF p_feedback IS NOT NULL AND char_length(p_feedback) > 4000 THEN
        RAISE EXCEPTION '다시쓰기 안내는 4,000자 이하여야 합니다.' USING ERRCODE = '22023';
    END IF;

    SELECT post.* INTO v_post
    FROM public.student_posts post
    WHERE post.id = p_post_id
    FOR UPDATE;
    IF NOT FOUND OR v_post.writing_context <> 'assignment' OR v_post.mission_id IS NULL THEN
        RAISE EXCEPTION '다시쓰기를 요청할 과제 글을 찾을 수 없습니다.' USING ERRCODE = 'P0002';
    END IF;
    IF public.auth_user_role() <> 'ADMIN'
      AND NOT EXISTS (
          SELECT 1 FROM public.classes class
          WHERE class.id = v_post.class_id
            AND class.teacher_id = auth.uid()
            AND class.deleted_at IS NULL
      ) THEN
        RAISE EXCEPTION '이 글에 다시쓰기를 요청할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;
    IF v_post.is_confirmed IS TRUE THEN
        RAISE EXCEPTION '승인한 글은 먼저 승인을 취소한 뒤 다시쓰기를 요청해주세요.' USING ERRCODE = '22023';
    END IF;
    IF v_post.is_submitted IS NOT TRUE OR v_post.is_returned IS TRUE THEN
        RETURN jsonb_build_object('status', 'already_requested', 'post_id', v_post.id);
    END IF;

    UPDATE public.student_posts
    SET is_submitted = FALSE,
        is_returned = TRUE,
        is_confirmed = FALSE,
        ai_feedback = COALESCE(p_feedback, ai_feedback)
    WHERE id = v_post.id;

    RETURN jsonb_build_object('status', 'requested', 'post_id', v_post.id);
END;
$$;

REVOKE ALL ON FUNCTION public.request_assignment_rewrite_v1(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_assignment_rewrite_v1(UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bulk_request_assignment_rewrite_v1(
    p_post_ids UUID[],
    p_feedback TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_post_id UUID;
    v_result JSONB;
    v_requested INTEGER := 0;
    v_already INTEGER := 0;
BEGIN
    IF COALESCE(cardinality(p_post_ids), 0) NOT BETWEEN 1 AND 100 THEN
        RAISE EXCEPTION '다시쓰기 요청은 한 번에 1~100건이어야 합니다.' USING ERRCODE = '22023';
    END IF;
    IF (SELECT count(*) FROM (SELECT DISTINCT unnest(p_post_ids)) ids) <> cardinality(p_post_ids) THEN
        RAISE EXCEPTION '글 목록에 중복된 값이 있습니다.' USING ERRCODE = '22023';
    END IF;

    FOR v_post_id IN SELECT value FROM unnest(p_post_ids) AS value ORDER BY value
    LOOP
        v_result := public.request_assignment_rewrite_v1(v_post_id, p_feedback);
        IF v_result->>'status' = 'requested' THEN
            v_requested := v_requested + 1;
        ELSE
            v_already := v_already + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'status', 'completed', 'requested_count', v_requested, 'already_requested_count', v_already
    );
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_request_assignment_rewrite_v1(UUID[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_request_assignment_rewrite_v1(UUID[], TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_activity_notifications_v1(
    p_limit INTEGER DEFAULT 20,
    p_before_created_at TIMESTAMPTZ DEFAULT NULL,
    p_before_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student public.students%ROWTYPE;
    v_items JSONB;
    v_limit INTEGER;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'STUDENT' THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    v_limit := LEAST(50, GREATEST(1, COALESCE(p_limit, 20)));
    IF (p_before_created_at IS NULL) <> (p_before_id IS NULL) THEN
        RAISE EXCEPTION '페이지 기준 시각과 ID를 함께 입력해주세요.' USING ERRCODE = '22023';
    END IF;

    SELECT student.* INTO v_student
    FROM public.students student
    WHERE student.auth_id = auth.uid()
      AND student.is_active IS DISTINCT FROM FALSE
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
    LIMIT 1;
    IF v_student.id IS NULL THEN
        RAISE EXCEPTION '현재 로그인과 연결된 학생을 찾을 수 없습니다.' USING ERRCODE = '42501';
    END IF;

    WITH page AS (
        SELECT event.*
        FROM public.student_notification_events event
        WHERE event.class_id = v_student.class_id
          AND event.student_id = v_student.id
          AND event.read_at IS NULL
          AND (
              p_before_created_at IS NULL
              OR (event.created_at, event.id) < (p_before_created_at, p_before_id)
          )
        ORDER BY event.created_at DESC, event.id DESC
        LIMIT v_limit + 1
    )
    SELECT COALESCE(jsonb_agg(to_jsonb(item) - 'event_key' ORDER BY item.created_at DESC, item.id DESC), '[]'::JSONB)
    INTO v_items
    FROM (SELECT * FROM page LIMIT v_limit) item;

    RETURN jsonb_build_object(
        'version', 1,
        'items', v_items,
        'has_more', EXISTS (
            SELECT 1
            FROM public.student_notification_events event
            WHERE event.class_id = v_student.class_id
              AND event.student_id = v_student.id
              AND event.read_at IS NULL
              AND (
                  p_before_created_at IS NULL
                  OR (event.created_at, event.id) < (p_before_created_at, p_before_id)
              )
            OFFSET v_limit LIMIT 1
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_activity_notifications_v1(INTEGER, TIMESTAMPTZ, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_activity_notifications_v1(INTEGER, TIMESTAMPTZ, UUID)
    TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mark_my_activity_notifications_read_v1(p_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student public.students%ROWTYPE;
    v_marked INTEGER := 0;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'STUDENT' THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    IF COALESCE(cardinality(p_ids), 0) NOT BETWEEN 1 AND 50 THEN
        RAISE EXCEPTION '읽음 처리는 한 번에 1~50건이어야 합니다.' USING ERRCODE = '22023';
    END IF;
    IF (SELECT count(*) FROM (SELECT DISTINCT unnest(p_ids)) ids) <> cardinality(p_ids) THEN
        RAISE EXCEPTION '알림 목록에 중복된 값이 있습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT student.* INTO v_student
    FROM public.students student
    WHERE student.auth_id = auth.uid()
      AND student.is_active IS DISTINCT FROM FALSE
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
    LIMIT 1;
    IF v_student.id IS NULL THEN
        RAISE EXCEPTION '현재 로그인과 연결된 학생을 찾을 수 없습니다.' USING ERRCODE = '42501';
    END IF;

    UPDATE public.student_notification_events event
    SET read_at = NOW()
    WHERE event.class_id = v_student.class_id
      AND event.student_id = v_student.id
      AND event.id = ANY(p_ids)
      AND event.read_at IS NULL;
    GET DIAGNOSTICS v_marked = ROW_COUNT;

    RETURN jsonb_build_object('version', 1, 'marked_count', v_marked);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_my_activity_notifications_read_v1(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_my_activity_notifications_read_v1(UUID[])
    TO authenticated, service_role;

-- 홈은 로그인·새로고침에서 단 한 번 호출된다. 할 일 세 종류와 최신 미확인
-- 활동 알림을 같은 bootstrap에 실어 별도 홈 폴링을 만들지 않는다.
CREATE OR REPLACE FUNCTION public.get_student_home_bootstrap_v1()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_student public.students%ROWTYPE;
    v_class public.classes%ROWTYPE;
    v_title JSONB;
    v_reading JSONB;
    v_diary JSONB;
    v_unstarted_missions INTEGER := 0;
    v_draft_missions INTEGER := 0;
    v_returned_count INTEGER := 0;
    v_has_activity BOOLEAN := false;
    v_has_new_mission BOOLEAN := false;
    v_activity_unread_count INTEGER := 0;
    v_activity_latest JSONB := NULL;
    v_campaign public.reading_marathon_campaigns%ROWTYPE;
    v_marathon JSONB;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'STUDENT' THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT student.* INTO v_student
    FROM public.students student
    WHERE student.auth_id = auth.uid()
      AND student.is_active IS DISTINCT FROM false
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
    LIMIT 1;
    IF v_student.id IS NULL THEN
        RAISE EXCEPTION '현재 로그인과 연결된 학생을 찾을 수 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT class.* INTO STRICT v_class
    FROM public.classes class
    WHERE class.id = v_student.class_id AND class.deleted_at IS NULL;

    v_title := public.get_my_title_status();
    v_reading := public.get_my_reading_log_daily_status();
    v_diary := public.get_my_diary_daily_status();

    SELECT count(*)::INTEGER INTO v_unstarted_missions
    FROM public.writing_missions mission
    WHERE mission.class_id = v_student.class_id
      AND mission.is_archived IS FALSE
      AND NOT EXISTS (
          SELECT 1 FROM public.student_posts post
          WHERE post.class_id = v_student.class_id
            AND post.student_id = v_student.id
            AND post.mission_id = mission.id
      );

    SELECT count(*)::INTEGER INTO v_draft_missions
    FROM public.writing_missions mission
    WHERE mission.class_id = v_student.class_id
      AND mission.is_archived IS FALSE
      AND EXISTS (
          SELECT 1 FROM public.student_posts post
          WHERE post.class_id = v_student.class_id
            AND post.student_id = v_student.id
            AND post.mission_id = mission.id
            AND post.is_submitted IS FALSE
            AND post.is_confirmed IS FALSE
            AND post.is_returned IS FALSE
            AND post.recalled_at IS NULL
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.student_posts post
          WHERE post.class_id = v_student.class_id
            AND post.student_id = v_student.id
            AND post.mission_id = mission.id
            AND (post.is_submitted IS TRUE OR post.is_confirmed IS TRUE)
      );

    SELECT count(*)::INTEGER INTO v_returned_count
    FROM public.student_posts post
    JOIN public.writing_missions mission
      ON mission.id = post.mission_id AND mission.class_id = post.class_id
    WHERE post.class_id = v_student.class_id
      AND post.student_id = v_student.id
      AND mission.is_archived IS FALSE
      AND post.is_returned IS TRUE
      AND post.is_submitted IS FALSE
      AND post.is_confirmed IS FALSE
      AND post.recalled_at IS NULL;

    SELECT (
        EXISTS (
            SELECT 1 FROM public.post_reactions reaction
            JOIN public.student_posts post ON post.id = reaction.post_id AND post.class_id = reaction.class_id
            WHERE reaction.class_id = v_student.class_id
              AND post.student_id = v_student.id
              AND reaction.student_id <> v_student.id
              AND reaction.created_at > COALESCE(v_student.last_feedback_check, '-infinity'::TIMESTAMPTZ)
            LIMIT 1
        ) OR EXISTS (
            SELECT 1 FROM public.post_comments comment
            JOIN public.student_posts post ON post.id = comment.post_id AND post.class_id = comment.class_id
            WHERE comment.class_id = v_student.class_id
              AND post.student_id = v_student.id
              AND (comment.teacher_id IS NOT NULL OR comment.student_id <> v_student.id)
              AND comment.status = 'approved'
              AND comment.created_at > COALESCE(v_student.last_feedback_check, '-infinity'::TIMESTAMPTZ)
            LIMIT 1
        )
    ) INTO v_has_activity;

    SELECT EXISTS (
        SELECT 1 FROM public.writing_missions mission
        WHERE mission.class_id = v_student.class_id
          AND mission.is_archived IS FALSE
          AND mission.created_at >= NOW() - INTERVAL '24 hours'
          AND NOT EXISTS (
              SELECT 1 FROM public.student_posts post
              WHERE post.class_id = v_student.class_id
                AND post.student_id = v_student.id
                AND post.mission_id = mission.id
                AND post.is_submitted IS TRUE
          )
        LIMIT 1
    ) INTO v_has_new_mission;

    SELECT count(*)::INTEGER INTO v_activity_unread_count
    FROM public.student_notification_events event
    WHERE event.class_id = v_student.class_id
      AND event.student_id = v_student.id
      AND event.read_at IS NULL;

    SELECT to_jsonb(event) - 'event_key' INTO v_activity_latest
    FROM public.student_notification_events event
    WHERE event.class_id = v_student.class_id
      AND event.student_id = v_student.id
      AND event.read_at IS NULL
    ORDER BY event.created_at DESC, event.id DESC
    LIMIT 1;

    SELECT campaign.* INTO v_campaign
    FROM public.reading_marathon_campaigns campaign
    WHERE campaign.class_id = v_student.class_id AND campaign.archived_at IS NULL
    ORDER BY campaign.created_at DESC LIMIT 1;

    IF v_campaign.id IS NULL THEN
        v_marathon := jsonb_build_object(
            'campaign', NULL,
            'summary', jsonb_build_object(
                'total_pages', 0, 'total_distance_m', 0, 'contributors', 0,
                'book_count', 0, 'target_distance_m', 0, 'progress_percent', 0
            ),
            'my', NULL
        );
    ELSE
        WITH summary AS (
            SELECT COALESCE(SUM(contribution.page_count), 0)::BIGINT AS total_pages,
                COALESCE(SUM(contribution.distance_m), 0)::BIGINT AS total_distance_m,
                COUNT(DISTINCT contribution.student_id)::INTEGER AS contributors,
                COUNT(contribution.id)::INTEGER AS book_count
            FROM public.reading_marathon_contributions contribution
            WHERE contribution.class_id = v_student.class_id
              AND contribution.campaign_id = v_campaign.id
        ), mine AS (
            SELECT COALESCE(SUM(contribution.page_count), 0)::BIGINT AS total_pages,
                COALESCE(SUM(contribution.distance_m), 0)::BIGINT AS distance_m,
                COUNT(contribution.id)::INTEGER AS book_count
            FROM public.reading_marathon_contributions contribution
            WHERE contribution.class_id = v_student.class_id
              AND contribution.campaign_id = v_campaign.id
              AND contribution.student_id = v_student.id
        )
        SELECT jsonb_build_object(
            'campaign', jsonb_build_object(
                'id', v_campaign.id, 'title', v_campaign.title,
                'target_distance_m', v_campaign.target_distance_m,
                'meters_per_page', v_campaign.meters_per_page,
                'status', v_campaign.status,
                'is_enabled', v_campaign.status IN ('active', 'completed'),
                'started_at', v_campaign.started_at, 'ends_on', v_campaign.ends_on,
                'completed_at', v_campaign.completed_at
            ),
            'summary', jsonb_build_object(
                'total_pages', summary.total_pages,
                'total_distance_m', summary.total_distance_m,
                'contributors', summary.contributors, 'book_count', summary.book_count,
                'target_distance_m', v_campaign.target_distance_m,
                'progress_percent', CASE
                    WHEN v_campaign.target_distance_m > 0
                    THEN LEAST(100, ROUND(summary.total_distance_m * 100.0 / v_campaign.target_distance_m, 1))
                    ELSE 0 END
            ),
            'my', jsonb_build_object(
                'student_id', v_student.id, 'name', v_student.name,
                'total_pages', mine.total_pages, 'distance_m', mine.distance_m,
                'book_count', mine.book_count, 'rank', NULL
            )
        ) INTO v_marathon FROM summary CROSS JOIN mine;
    END IF;

    RETURN jsonb_build_object(
        'version', 1,
        'generated_at', NOW(),
        'student', jsonb_build_object(
            'id', v_student.id, 'name', v_student.name, 'class_id', v_student.class_id,
            'total_points', COALESCE(v_student.total_points, 0),
            'pet_data', COALESCE(v_student.pet_data, '{}'::JSONB),
            'last_feedback_check', v_student.last_feedback_check
        ),
        'class_config', jsonb_build_object(
            'enabled_modules', v_class.enabled_modules,
            'vocab_tower_enabled', v_class.vocab_tower_enabled,
            'writing_editor_settings', COALESCE(v_class.writing_editor_settings, '{}'::JSONB)
        ),
        'home', jsonb_build_object(
            'unstarted_missions', COALESCE(v_unstarted_missions, 0),
            'draft_missions', COALESCE(v_draft_missions, 0),
            'pending_missions', COALESCE(v_unstarted_missions, 0) + COALESCE(v_draft_missions, 0),
            'returned_count', COALESCE(v_returned_count, 0),
            'has_activity', COALESCE(v_has_activity, false),
            'has_new_mission', COALESCE(v_has_new_mission, false)
        ),
        'activity_notifications', jsonb_build_object(
            'version', 1,
            'unread_count', COALESCE(v_activity_unread_count, 0),
            'latest', v_activity_latest
        ),
        'title_status', COALESCE(v_title, '{}'::JSONB),
        'reading_daily', COALESCE(v_reading, '{}'::JSONB),
        'diary_daily', COALESCE(v_diary, '{}'::JSONB),
        'reading_marathon', COALESCE(v_marathon, '{}'::JSONB)
    );
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
