-- 내 글 소식(친구 반응·친구/선생님 댓글)을 활동 알림과 같은 이벤트 원장으로 옮긴다.
--
-- 왜 바꾸나: 기존 내 글 소식은 읽음 상태를 students.last_feedback_check 시각 하나로만
-- 기억해서 "1번은 읽고 2번은 안 읽음"을 표현할 수 없었다. 학생이 알림별로 확인하려면
-- 행마다 읽음 표시가 필요한데, student_notification_events가 이미 그 모양이라 새 표를
-- 만들지 않고 재사용한다. 조회도 부분 인덱스(read_at IS NULL) 한 번으로 끝나 반응·댓글
-- 이력이 쌓여도 배지 비용이 커지지 않는다(기존 방식은 두 큰 표를 조인해 훑었다).
--
-- 20261023 머리말과 modules/notifications/README.md의 "반응·댓글은 원장에 넣지 않는다"
-- 결정을 여기서 뒤집는다. 이유는 위와 같고, 대신 두 가지 경계를 지킨다.
--   1) 과거 소식은 소급 생성하지 않는다. 학생당 최대 77건이 한꺼번에 미확인으로 쏟아진다.
--      적용 시점에 last_feedback_check를 현재로 밀어 과거를 정리하고 이후 발생분만 원장에 쌓는다.
--   2) module_id로 갈래를 나눈다. 'feedback'은 헤더 `내 글 소식`, 나머지는 홈 `활동 알림`이
--      본다. 승인·반려 같은 할 일이 반응 스무 개에 묻히지 않게 하기 위함이다.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. 친구 반응 → 원장
-- ---------------------------------------------------------------------------
-- 반응은 toggle_my_post_reaction_v1로 껐다 켤 수 있어 DELETE도 함께 다룬다.
-- 반응이 사라졌는데 알림만 남으면 학생이 없는 반응을 보러 가게 된다.
CREATE OR REPLACE FUNCTION public.emit_feedback_reaction_notification_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_owner_id UUID;
    v_post_title TEXT;
    v_actor_name TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM public.student_notification_events
        WHERE module_id = 'feedback'
          AND event_key = format('reaction:%s', OLD.id);
        RETURN OLD;
    END IF;

    SELECT post.student_id, post.title
    INTO v_owner_id, v_post_title
    FROM public.student_posts post
    WHERE post.id = NEW.post_id;

    -- 내가 내 글에 남긴 반응은 알리지 않는다.
    IF v_owner_id IS NULL OR v_owner_id = NEW.student_id THEN
        RETURN NEW;
    END IF;

    -- notification_emit_v1은 비활성 학생·삭제 학급에서 예외를 던진다. 트리거 안에서
    -- 예외가 나면 반응 저장 자체가 막히므로 같은 조건을 미리 걸러 조용히 건너뛴다.
    IF NOT EXISTS (
        SELECT 1
        FROM public.students student
        JOIN public.classes class ON class.id = student.class_id
        WHERE student.id = v_owner_id
          AND student.is_active IS DISTINCT FROM FALSE
          AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
          AND class.deleted_at IS NULL
    ) THEN
        RETURN NEW;
    END IF;

    SELECT student.name INTO v_actor_name
    FROM public.students student
    WHERE student.id = NEW.student_id;

    PERFORM public.notification_emit_v1(
        v_owner_id, 'feedback', 'feedback.reaction_received', 'student_post', NEW.post_id,
        jsonb_build_object(
            'post_id', NEW.post_id,
            'post_title', v_post_title,
            'actor_name', COALESCE(v_actor_name, '친구'),
            'reaction_type', NEW.reaction_type
        ),
        format('reaction:%s', NEW.id)
    );
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.emit_feedback_reaction_notification_v1()
    FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_feedback_reaction_notification_v1 ON public.post_reactions;
CREATE TRIGGER trg_feedback_reaction_notification_v1
AFTER INSERT OR DELETE ON public.post_reactions
FOR EACH ROW EXECUTE FUNCTION public.emit_feedback_reaction_notification_v1();

-- ---------------------------------------------------------------------------
-- 2. 친구·선생님 댓글 → 원장
-- ---------------------------------------------------------------------------
-- 댓글은 승인(status='approved')된 것만 학생에게 보인다. 그래서 INSERT 시점이 아니라
-- 승인 상태가 될 때 알리고, 승인이 풀리거나 지워지면 알림도 함께 거둔다.
CREATE OR REPLACE FUNCTION public.emit_feedback_comment_notification_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_owner_id UUID;
    v_post_title TEXT;
    v_actor_name TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM public.student_notification_events
        WHERE module_id = 'feedback'
          AND event_key = format('comment:%s', OLD.id);
        RETURN OLD;
    END IF;

    -- 승인이 풀린 댓글(반려·보류)은 학생 화면에서 사라져야 하므로 알림도 회수한다.
    IF NEW.status IS DISTINCT FROM 'approved' THEN
        DELETE FROM public.student_notification_events
        WHERE module_id = 'feedback'
          AND event_key = format('comment:%s', NEW.id);
        RETURN NEW;
    END IF;

    SELECT post.student_id, post.title
    INTO v_owner_id, v_post_title
    FROM public.student_posts post
    WHERE post.id = NEW.post_id;

    -- 내가 내 글에 단 댓글은 알리지 않는다. 선생님 댓글은 항상 알린다.
    IF v_owner_id IS NULL THEN
        RETURN NEW;
    END IF;
    IF NEW.teacher_id IS NULL AND (NEW.student_id IS NULL OR NEW.student_id = v_owner_id) THEN
        RETURN NEW;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.students student
        JOIN public.classes class ON class.id = student.class_id
        WHERE student.id = v_owner_id
          AND student.is_active IS DISTINCT FROM FALSE
          AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
          AND class.deleted_at IS NULL
    ) THEN
        RETURN NEW;
    END IF;

    IF NEW.teacher_id IS NOT NULL THEN
        v_actor_name := '선생님';
    ELSE
        SELECT student.name INTO v_actor_name
        FROM public.students student
        WHERE student.id = NEW.student_id;
        v_actor_name := COALESCE(v_actor_name, '친구');
    END IF;

    -- 같은 댓글이 다시 승인돼도 event_key가 같아 notification_emit_v1이 중복을 막는다.
    -- 이미 확인한 알림이 다시 미확인으로 돌아가지 않는다.
    PERFORM public.notification_emit_v1(
        v_owner_id, 'feedback', 'feedback.comment_received', 'student_post', NEW.post_id,
        jsonb_build_object(
            'post_id', NEW.post_id,
            'post_title', v_post_title,
            'actor_name', v_actor_name,
            'is_teacher', NEW.teacher_id IS NOT NULL,
            'excerpt', left(COALESCE(NEW.content, ''), 120)
        ),
        format('comment:%s', NEW.id)
    );
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.emit_feedback_comment_notification_v1()
    FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_feedback_comment_notification_v1 ON public.post_comments;
CREATE TRIGGER trg_feedback_comment_notification_v1
AFTER INSERT OR DELETE OR UPDATE OF status ON public.post_comments
FOR EACH ROW EXECUTE FUNCTION public.emit_feedback_comment_notification_v1();

-- ---------------------------------------------------------------------------
-- 3. 목록 RPC에 갈래 필터 추가
-- ---------------------------------------------------------------------------
-- 헤더 `내 글 소식`은 'feedback'만, 홈 `활동 알림`은 나머지만 본다. 인자를 늘리면
-- 같은 이름의 함수가 둘이 되어 PostgREST가 어느 쪽인지 못 고르므로 옛 서명을 지운다.
-- 새 인자에 기본값이 있어 배포 직전의 옛 번들이 인자 3개로 불러도 그대로 동작한다.
DROP FUNCTION IF EXISTS public.get_my_activity_notifications_v1(INTEGER, TIMESTAMPTZ, UUID);

CREATE OR REPLACE FUNCTION public.get_my_activity_notifications_v1(
    p_limit INTEGER DEFAULT 20,
    p_before_created_at TIMESTAMPTZ DEFAULT NULL,
    p_before_id UUID DEFAULT NULL,
    p_module_ids TEXT[] DEFAULT NULL,
    p_exclude_module_ids TEXT[] DEFAULT NULL
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
    IF COALESCE(cardinality(p_module_ids), 0) > 20 OR COALESCE(cardinality(p_exclude_module_ids), 0) > 20 THEN
        RAISE EXCEPTION '알림 갈래는 한 번에 20개까지 지정할 수 있습니다.' USING ERRCODE = '22023';
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
          AND (p_module_ids IS NULL OR event.module_id = ANY(p_module_ids))
          AND (p_exclude_module_ids IS NULL OR NOT (event.module_id = ANY(p_exclude_module_ids)))
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
              AND (p_module_ids IS NULL OR event.module_id = ANY(p_module_ids))
              AND (p_exclude_module_ids IS NULL OR NOT (event.module_id = ANY(p_exclude_module_ids)))
              AND (
                  p_before_created_at IS NULL
                  OR (event.created_at, event.id) < (p_before_created_at, p_before_id)
              )
            OFFSET v_limit LIMIT 1
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_activity_notifications_v1(INTEGER, TIMESTAMPTZ, UUID, TEXT[], TEXT[])
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_activity_notifications_v1(INTEGER, TIMESTAMPTZ, UUID, TEXT[], TEXT[])
    TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. 갈래 통째로 확인하기
-- ---------------------------------------------------------------------------
-- 학생 1명에게 하루 최대 22건까지 반응·댓글이 온다. 한 건씩만 확인하게 하면 지금보다
-- 나빠지므로 `모두 확인`을 서버에서 한 번에 처리한다. 목록에 보이는 50건만 넘기는
-- 방식은 51번째부터 남아 배지가 안 지워진다.
CREATE OR REPLACE FUNCTION public.mark_my_activity_notifications_read_all_v1(
    p_module_ids TEXT[] DEFAULT NULL,
    p_exclude_module_ids TEXT[] DEFAULT NULL
)
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
    IF COALESCE(cardinality(p_module_ids), 0) > 20 OR COALESCE(cardinality(p_exclude_module_ids), 0) > 20 THEN
        RAISE EXCEPTION '알림 갈래는 한 번에 20개까지 지정할 수 있습니다.' USING ERRCODE = '22023';
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
      AND event.read_at IS NULL
      AND (p_module_ids IS NULL OR event.module_id = ANY(p_module_ids))
      AND (p_exclude_module_ids IS NULL OR NOT (event.module_id = ANY(p_exclude_module_ids)));
    GET DIAGNOSTICS v_marked = ROW_COUNT;

    RETURN jsonb_build_object('version', 1, 'marked_count', v_marked);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_my_activity_notifications_read_all_v1(TEXT[], TEXT[])
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_my_activity_notifications_read_all_v1(TEXT[], TEXT[])
    TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. 읽은 지 오래된 알림 정리
-- ---------------------------------------------------------------------------
-- 원본 반응·댓글은 글에 그대로 남으므로 확인이 끝난 알림을 오래 들고 있을 이유가 없다.
-- 학기 기준 연 2만 8천 건(약 19MB)이 쌓이는데, 이 정리를 주기적으로 돌리면 한 해치
-- 수준에서 평평해진다. pg_cron이 없어 운영 점검 때 수동으로 부른다.
CREATE OR REPLACE FUNCTION public.purge_read_student_notifications_v1(p_days INTEGER DEFAULT 90)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_days INTEGER;
    v_deleted INTEGER := 0;
BEGIN
    IF current_setting('role', true) <> 'service_role' AND public.auth_user_role() IS DISTINCT FROM 'ADMIN' THEN
        RAISE EXCEPTION '알림 정리 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;
    v_days := GREATEST(7, COALESCE(p_days, 90));

    DELETE FROM public.student_notification_events
    WHERE read_at IS NOT NULL
      AND read_at < NOW() - make_interval(days => v_days);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    RETURN jsonb_build_object('version', 1, 'deleted_count', v_deleted, 'older_than_days', v_days);
END;
$$;

REVOKE ALL ON FUNCTION public.purge_read_student_notifications_v1(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_read_student_notifications_v1(INTEGER) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. 홈 부트스트랩을 두 갈래로 나눈다
-- ---------------------------------------------------------------------------
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
    v_feedback_unread_count INTEGER := 0;
    v_feedback_latest JSONB := NULL;
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

    -- 내 글 소식 갈래. 예전에는 반응·댓글 두 표를 조인해 훑어 그 학생 글에 달린 이력이
    -- 늘수록 무거워졌다. 이제 부분 인덱스(read_at IS NULL) 하나로 끝나 안 읽은 개수에만
    -- 비례한다. 확인한 알림은 인덱스에서 빠지므로 몇 해가 쌓여도 비용이 그대로다.
    SELECT count(*)::INTEGER INTO v_feedback_unread_count
    FROM public.student_notification_events event
    WHERE event.class_id = v_student.class_id
      AND event.student_id = v_student.id
      AND event.read_at IS NULL
      AND event.module_id = 'feedback';

    SELECT to_jsonb(event) - 'event_key' INTO v_feedback_latest
    FROM public.student_notification_events event
    WHERE event.class_id = v_student.class_id
      AND event.student_id = v_student.id
      AND event.read_at IS NULL
      AND event.module_id = 'feedback'
    ORDER BY event.created_at DESC, event.id DESC
    LIMIT 1;

    v_has_activity := v_feedback_unread_count > 0;

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

    -- 승인·반려·포인트 같은 할 일만 센다. 반응 스무 개에 묻히지 않게 갈래를 나눈다.
    SELECT count(*)::INTEGER INTO v_activity_unread_count
    FROM public.student_notification_events event
    WHERE event.class_id = v_student.class_id
      AND event.student_id = v_student.id
      AND event.read_at IS NULL
      AND event.module_id <> 'feedback';

    SELECT to_jsonb(event) - 'event_key' INTO v_activity_latest
    FROM public.student_notification_events event
    WHERE event.class_id = v_student.class_id
      AND event.student_id = v_student.id
      AND event.read_at IS NULL
      AND event.module_id <> 'feedback'
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
        'feedback_notifications', jsonb_build_object(
            'version', 1,
            'unread_count', COALESCE(v_feedback_unread_count, 0),
            'latest', v_feedback_latest
        ),
        'title_status', COALESCE(v_title, '{}'::JSONB),
        'reading_daily', COALESCE(v_reading, '{}'::JSONB),
        'diary_daily', COALESCE(v_diary, '{}'::JSONB),
        'reading_marathon', COALESCE(v_marathon, '{}'::JSONB)
    );
END;

$function$;

-- ---------------------------------------------------------------------------
-- 7. 전환 시점에 선 긋기
-- ---------------------------------------------------------------------------
-- 과거 반응·댓글은 원장에 소급 생성하지 않는다(학생당 최대 77건이 한꺼번에 쏟아진다).
-- last_feedback_check를 현재로 밀어 옛 흐름의 미확인도 함께 정리한다. 방학 중이라
-- 8월 발생분이 서비스 전체에서 반응 3건·댓글 4건뿐이라 실질 손실이 없는 시점이다.
-- students 쓰기는 protect_student_sensitive_columns()가 인증된 호출만 허용한다.
-- 마이그레이션은 auth.uid()가 없으므로 기존 기능 RPC와 같은 우회 설정을 쓴다
-- (20260829_dragon_decor_workshop.sql의 set_config 선례). SET LOCAL이라 이 트랜잭션에서만 유효하다.
SET LOCAL app.bypass_student_trigger = 'true';

UPDATE public.students
SET last_feedback_check = NOW()
WHERE last_feedback_check IS NULL
   OR last_feedback_check < NOW();

COMMIT;
