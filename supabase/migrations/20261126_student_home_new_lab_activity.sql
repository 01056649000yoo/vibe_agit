-- 학생 홈에 연구소 새 활동 표시를 더한다 (2026-08-19)
--
-- 배경: 선생님이 글쓰기 연구소에 활동을 열어도 학생은 메뉴에 들어가 봐야 알 수 있었다.
-- 과제 글쓰기에는 이미 같은 뜻의 `has_new_mission`이 있어 홈 카드에 NEW 가 붙는다.
--
-- 결정: 홈 RPC 하나에 값을 더한다. 화면에서 따로 조회하면 홈이 호출 하나를 더 하게 되고,
-- 연구소 모듈의 성능 계약(`home: 'none'`)이 깨진다. 판정은 목록 RPC와 같은 조건을 쓴다.
-- 인덱스는 이미 있다(rooms_active_agit_class_created_id_idx, student_sessions_room_agit_student_uidx).

BEGIN;

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
    v_has_new_lab_activity BOOLEAN := false;
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

    -- 연구소 새 활동: 우리 반에 열려 있는 활동 중 내가 아직 시작하지 않은 것이 하나라도 있는가.
    -- 활동은 수업 시간에 열고 닫으므로 '몇 시간 안'이 아니라 '아직 참여하지 않음'이 학생에게 정확하다.
    -- 목록 RPC(get_my_lab_activities_v1)와 같은 조건을 쓴다 — 배지를 눌러 들어갔는데 없으면 안 된다.
    SELECT EXISTS (
        SELECT 1
        FROM writing_helper.rooms room
        WHERE room.agit_class_id = v_student.class_id
          AND room.teacher_id = v_class.teacher_id
          AND room.is_active IS TRUE
          AND (room.expires_at IS NULL OR room.expires_at > NOW())
          AND COALESCE(NULLIF(room.activity_type, ''), 'outline_builder') = ANY(ARRAY[
              'outline_builder',
              'question_generator',
              'question_voting',
              'one_line_share',
              'hanja_writing'
          ]::TEXT[])
          AND NOT EXISTS (
              SELECT 1 FROM writing_helper.student_sessions session
              WHERE session.room_id = room.id
                AND session.agit_student_id = v_student.id
          )
        LIMIT 1
    ) INTO v_has_new_lab_activity;

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
            'has_new_mission', COALESCE(v_has_new_mission, false),
            'has_new_lab_activity', COALESCE(v_has_new_lab_activity, false)
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

NOTIFY pgrst, 'reload schema';

COMMIT;
