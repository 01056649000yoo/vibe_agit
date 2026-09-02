-- 우리 반 스크린 `오늘 현황`을 교사가 골라 구성하고 배경색을 고를 수 있게 한다.
--
-- 이 위젯은 20초마다 다시 물어보므로, 켠 항목만 서버가 계산한다. 항목을 다 켜도
-- 지금보다 무거워지지 않게 하려는 것이다. 비싼 것은 과제 제출 스냅샷 하나뿐이라
-- `mission`을 끄면 그 계산을 아예 하지 않는다.
--
-- 인수를 하나 더 받아야 하므로 기존 2인수 함수를 지우고 같은 이름의 3인수 함수를 만든다.
-- 새 인수에 기본값이 있어 배포 중 옛 화면이 두 인수로 불러도 그대로 동작한다(기본 구성으로 응답).

BEGIN;

DROP FUNCTION IF EXISTS public.get_teacher_class_board_status_v1(UUID, UUID);

CREATE OR REPLACE FUNCTION public.get_teacher_class_board_status_v1(
    p_class_id UUID,
    p_mission_id UUID DEFAULT NULL,
    p_sections TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_allowed TEXT[] := ARRAY['mission', 'daily', 'dailyNames', 'titles', 'reactions'];
    v_sections TEXT[];
    v_selected_mission_id UUID;
    v_selected_mission_title TEXT;
    v_snapshot JSONB := '{}'::JSONB;
    v_summary JSONB := '{}'::JSONB;
    v_student_statuses JSONB := '[]'::JSONB;
    v_total_students INTEGER;
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
    v_today_start TIMESTAMPTZ;
    v_tomorrow_start TIMESTAMPTZ;
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.classes class
        WHERE class.id = p_class_id
          AND class.deleted_at IS NULL
          AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN')
    ) THEN
        RAISE EXCEPTION '해당 학급의 글쓰기 현황만 확인할 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    -- 모르는 이름은 버리고, 아무것도 안 주면 기존 구성 그대로 본다.
    SELECT COALESCE(ARRAY_AGG(item), ARRAY[]::TEXT[]) INTO v_sections
    FROM UNNEST(COALESCE(p_sections, ARRAY['mission', 'daily'])) item
    WHERE item = ANY(v_allowed);

    SELECT mission.id, mission.title
    INTO v_selected_mission_id, v_selected_mission_title
    FROM public.writing_missions mission
    WHERE mission.class_id = p_class_id
      AND mission.is_archived IS FALSE
      AND mission.mission_type IS DISTINCT FROM 'meeting'
      AND (p_mission_id IS NULL OR mission.id = p_mission_id)
    ORDER BY mission.created_at DESC, mission.id DESC
    LIMIT 1;

    IF p_mission_id IS NOT NULL AND v_selected_mission_id IS NULL THEN
        RAISE EXCEPTION '선택한 활성 글 과제를 찾을 수 없습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT COUNT(*)::INTEGER INTO v_total_students
    FROM public.students student
    WHERE student.class_id = p_class_id
      AND student.is_active IS DISTINCT FROM FALSE
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW());

    -- 가장 비싼 계산. 과제 현황을 끄면 아예 돌리지 않는다.
    IF v_selected_mission_id IS NOT NULL AND 'mission' = ANY(v_sections) THEN
        v_snapshot := public.teacher_assignment_submission_board_snapshot_v2(
            p_class_id, v_selected_mission_id, 20, 1
        );
        v_summary := COALESCE(v_snapshot -> 'scope_summary', '{}'::JSONB);
        v_student_statuses := COALESCE(v_snapshot -> 'student_statuses', '[]'::JSONB);
    END IF;

    v_today_start := v_today::TIMESTAMP AT TIME ZONE 'Asia/Seoul';
    v_tomorrow_start := (v_today + 1)::TIMESTAMP AT TIME ZONE 'Asia/Seoul';

    -- 화면 머리말과 설정창이 늘 필요로 하는 값은 항목과 무관하게 싸게 함께 준다.
    v_result := JSONB_BUILD_OBJECT(
        'version', 1,
        'sections', TO_JSONB(v_sections),
        'scope', CASE WHEN v_selected_mission_id IS NULL THEN 'none' ELSE 'mission' END,
        'selectedMissionId', v_selected_mission_id,
        'selectedMissionTitle', v_selected_mission_title,
        'generatedAt', NOW(),
        'today', v_today,
        'totalStudents', COALESCE(v_total_students, 0),
        'submittedCount', COALESCE((v_summary ->> 'confirmed_count')::INTEGER, 0)
            + COALESCE((v_summary ->> 'pending_count')::INTEGER, 0),
        'confirmedCount', COALESCE((v_summary ->> 'confirmed_count')::INTEGER, 0),
        'pendingCount', COALESCE((v_summary ->> 'pending_count')::INTEGER, 0),
        'rewritingCount', COALESCE((v_summary ->> 'rewriting_count')::INTEGER, 0),
        'notSubmittedCount', COALESCE((v_summary ->> 'not_submitted_count')::INTEGER, 0),
        'submitterNames', COALESCE((
            SELECT JSONB_AGG(status.item ->> 'student_name' ORDER BY status.item ->> 'student_name')
            FROM JSONB_ARRAY_ELEMENTS(v_student_statuses) status(item)
            WHERE status.item ->> 'status' IN ('confirmed', 'pending')
        ), '[]'::JSONB),
        'nonSubmitterNames', COALESCE((
            SELECT JSONB_AGG(status.item ->> 'student_name' ORDER BY status.item ->> 'student_name')
            FROM JSONB_ARRAY_ELEMENTS(v_student_statuses) status(item)
            WHERE status.item ->> 'status' IN ('rewriting', 'not_submitted')
        ), '[]'::JSONB),
        'rewritingNames', COALESCE((
            SELECT JSONB_AGG(status.item ->> 'student_name' ORDER BY status.item ->> 'student_name')
            FROM JSONB_ARRAY_ELEMENTS(v_student_statuses) status(item)
            WHERE status.item ->> 'status' = 'rewriting'
        ), '[]'::JSONB),
        'activeMissionCount', (
            SELECT COUNT(*)::INTEGER FROM (
                SELECT mission.id
                FROM public.writing_missions mission
                WHERE mission.class_id = p_class_id
                  AND mission.is_archived IS FALSE
                  AND mission.mission_type IS DISTINCT FROM 'meeting'
                ORDER BY mission.created_at DESC, mission.id DESC
                LIMIT 20
            ) active_mission
        ),
        'missionOptions', COALESCE((
            SELECT JSONB_AGG(JSONB_BUILD_OBJECT('id', mission.id, 'title', mission.title)
                ORDER BY mission.created_at DESC, mission.id DESC)
            FROM (
                SELECT item.id, item.title, item.created_at
                FROM public.writing_missions item
                WHERE item.class_id = p_class_id
                  AND item.is_archived IS FALSE
                  AND item.mission_type IS DISTINCT FROM 'meeting'
                ORDER BY item.created_at DESC, item.id DESC
                LIMIT 20
            ) mission
        ), '[]'::JSONB)
    );

    IF 'daily' = ANY(v_sections) THEN
        v_result := v_result || JSONB_BUILD_OBJECT('dailyWriting', JSONB_BUILD_OBJECT(
            'date', v_today,
            'diary', JSONB_BUILD_OBJECT(
                'completedStudentCount', (
                    SELECT COUNT(DISTINCT claim.student_id)::INTEGER
                    FROM public.writing_reward_claims claim
                    JOIN public.students student
                      ON student.id = claim.student_id
                     AND student.class_id = p_class_id
                     AND student.is_active IS DISTINCT FROM FALSE
                     AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
                    WHERE claim.class_id = p_class_id
                      AND claim.writing_type = 'diary'
                      AND claim.reward_kind = 'completion'
                      AND claim.created_at >= v_today_start
                      AND claim.created_at < v_tomorrow_start
                ),
                'submissionCount', (
                    SELECT COUNT(*)::INTEGER
                    FROM public.writing_reward_claims claim
                    JOIN public.students student ON student.id = claim.student_id
                    WHERE claim.class_id = p_class_id
                      AND student.class_id = p_class_id
                      AND student.is_active IS DISTINCT FROM FALSE
                      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
                      AND claim.writing_type = 'diary'
                      AND claim.reward_kind = 'completion'
                      AND claim.created_at >= v_today_start
                      AND claim.created_at < v_tomorrow_start
                ),
                'totalStudents', COALESCE(v_total_students, 0)
            ),
            'readingLog', JSONB_BUILD_OBJECT(
                'completedStudentCount', (
                    SELECT COUNT(DISTINCT claim.student_id)::INTEGER
                    FROM public.writing_reward_claims claim
                    JOIN public.students student
                      ON student.id = claim.student_id
                     AND student.class_id = p_class_id
                     AND student.is_active IS DISTINCT FROM FALSE
                     AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
                    WHERE claim.class_id = p_class_id
                      AND claim.writing_type = 'reading_log'
                      AND claim.reward_kind = 'completion'
                      AND claim.created_at >= v_today_start
                      AND claim.created_at < v_tomorrow_start
                ),
                'submissionCount', (
                    SELECT COUNT(*)::INTEGER
                    FROM public.writing_reward_claims claim
                    JOIN public.students student ON student.id = claim.student_id
                    WHERE claim.class_id = p_class_id
                      AND student.class_id = p_class_id
                      AND student.is_active IS DISTINCT FROM FALSE
                      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
                      AND claim.writing_type = 'reading_log'
                      AND claim.reward_kind = 'completion'
                      AND claim.created_at >= v_today_start
                      AND claim.created_at < v_tomorrow_start
                ),
                'totalStudents', COALESCE(v_total_students, 0)
            )
        ));
    END IF;

    -- 오늘 자율 글을 쓴 친구와 아직 안 쓴 친구. 이름만 주고 무엇을 썼는지는 주지 않는다.
    IF 'dailyNames' = ANY(v_sections) THEN
        v_result := v_result || JSONB_BUILD_OBJECT('dailyNames', JSONB_BUILD_OBJECT(
            'date', v_today,
            'writerNames', COALESCE((
                SELECT JSONB_AGG(roster.name ORDER BY roster.name, roster.id)
                FROM (
                    SELECT student.id, student.name
                    FROM public.students student
                    WHERE student.class_id = p_class_id
                      AND student.is_active IS DISTINCT FROM FALSE
                      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
                      AND EXISTS (
                          SELECT 1 FROM public.writing_reward_claims claim
                          WHERE claim.student_id = student.id
                            AND claim.class_id = p_class_id
                            AND claim.writing_type IN ('diary', 'reading_log')
                            AND claim.reward_kind = 'completion'
                            AND claim.created_at >= v_today_start
                            AND claim.created_at < v_tomorrow_start
                      )
                    ORDER BY student.name, student.id
                    LIMIT 100
                ) roster
            ), '[]'::JSONB),
            'restingNames', COALESCE((
                SELECT JSONB_AGG(roster.name ORDER BY roster.name, roster.id)
                FROM (
                    SELECT student.id, student.name
                    FROM public.students student
                    WHERE student.class_id = p_class_id
                      AND student.is_active IS DISTINCT FROM FALSE
                      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
                      AND NOT EXISTS (
                          SELECT 1 FROM public.writing_reward_claims claim
                          WHERE claim.student_id = student.id
                            AND claim.class_id = p_class_id
                            AND claim.writing_type IN ('diary', 'reading_log')
                            AND claim.reward_kind = 'completion'
                            AND claim.created_at >= v_today_start
                            AND claim.created_at < v_tomorrow_start
                      )
                    ORDER BY student.name, student.id
                    LIMIT 100
                ) roster
            ), '[]'::JSONB)
        ));
    END IF;

    -- 오늘 새 칭호를 받은 친구. 이름·칭호 종류·단계만 주고 포인트는 주지 않는다.
    IF 'titles' = ANY(v_sections) THEN
        v_result := v_result || JSONB_BUILD_OBJECT('todayTitles', COALESCE((
            SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
                'name', earned.name,
                'track', earned.track_id,
                'level', earned.level
            ) ORDER BY earned.created_at DESC)
            FROM (
                SELECT student.name, claim.track_id, claim.level, claim.created_at
                FROM public.student_title_reward_claims claim
                JOIN public.students student
                  ON student.id = claim.student_id
                 AND student.class_id = p_class_id
                 AND student.is_active IS DISTINCT FROM FALSE
                 AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
                WHERE claim.class_id = p_class_id
                  AND claim.created_at >= v_today_start
                  AND claim.created_at < v_tomorrow_start
                ORDER BY claim.created_at DESC
                LIMIT 30
            ) earned
        ), '[]'::JSONB));
    END IF;

    -- 서로 읽어 준 정도. 숫자만 세고 누가 무엇에 남겼는지는 주지 않는다.
    IF 'reactions' = ANY(v_sections) THEN
        v_result := v_result || JSONB_BUILD_OBJECT('todayReading', JSONB_BUILD_OBJECT(
            'date', v_today,
            'commentCount', (
                SELECT COUNT(*)::INTEGER
                FROM public.post_comments comment
                WHERE comment.class_id = p_class_id
                  AND comment.status = 'approved'
                  AND comment.created_at >= v_today_start
                  AND comment.created_at < v_tomorrow_start
            ),
            'reactionCount', (
                SELECT COUNT(*)::INTEGER
                FROM public.post_reactions reaction
                WHERE reaction.class_id = p_class_id
                  AND reaction.created_at >= v_today_start
                  AND reaction.created_at < v_tomorrow_start
            )
        ));
    END IF;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_class_board_status_v1(UUID, UUID, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_class_board_status_v1(UUID, UUID, TEXT[]) TO authenticated, service_role;

-- 오늘 현황 위젯 설정에 배경색과 구성 항목이 생겼으므로 저장 payload에서도 검증한다.
-- 기존 위젯 검증은 그대로 위임하고 여기서는 새 두 값만 본다.
CREATE OR REPLACE FUNCTION public.validate_class_board_payload_v1(
    p_class_id UUID,
    p_layout JSONB,
    p_widgets JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_widget JSONB;
    v_config JSONB;
    v_placement JSONB;
    v_widget_id TEXT;
    v_layout_version INTEGER;
    v_instance_count INTEGER;
    v_unique_instance_count INTEGER;
    v_meal_count INTEGER := 0;
    v_notice_count INTEGER := 0;
    v_x NUMERIC;
    v_y NUMERIC;
    v_width NUMERIC;
    v_height NUMERIC;
    v_min_width NUMERIC;
    v_legacy_widgets JSONB;
BEGIN
    IF JSONB_TYPEOF(COALESCE(p_widgets, '[]'::JSONB)) <> 'array'
       OR JSONB_ARRAY_LENGTH(COALESCE(p_widgets, '[]'::JSONB)) > 24
       OR OCTET_LENGTH(COALESCE(p_widgets, '[]'::JSONB)::TEXT) > 131072 THEN
        RAISE EXCEPTION '스크린 위젯 형식이나 크기가 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT COUNT(*), COUNT(DISTINCT item ->> 'instanceId')
      INTO v_instance_count, v_unique_instance_count
    FROM JSONB_ARRAY_ELEMENTS(COALESCE(p_widgets, '[]'::JSONB)) item;
    IF v_instance_count <> v_unique_instance_count THEN
        RAISE EXCEPTION '스크린 위젯 식별자가 겹칩니다.' USING ERRCODE = '22023';
    END IF;

    v_layout_version := COALESCE((p_layout ->> 'version')::INTEGER, 0);
    FOR v_widget IN
        SELECT value
        FROM JSONB_ARRAY_ELEMENTS(COALESCE(p_widgets, '[]'::JSONB))
        WHERE value ->> 'widgetId' IN ('meal-board', 'notice-board')
    LOOP
        v_widget_id := COALESCE(v_widget ->> 'widgetId', '');
        v_config := COALESCE(v_widget -> 'config', '{}'::JSONB);
        v_placement := COALESCE(v_widget -> 'placement', '{}'::JSONB);

        IF JSONB_TYPEOF(v_widget) <> 'object'
           OR COALESCE(v_widget ->> 'instanceId', '') !~ '^[A-Za-z0-9_-]{1,80}$'
           OR COALESCE((v_widget ->> 'version')::INTEGER, 0) <> 1
           OR v_widget ->> 'zone' IS DISTINCT FROM 'content'
           OR COALESCE(v_widget ->> 'size', '') NOT IN ('small', 'medium', 'large')
           OR COALESCE((v_widget ->> 'order')::INTEGER, 0) NOT BETWEEN 1 AND 1000
           OR JSONB_TYPEOF(v_config) <> 'object' THEN
            RAISE EXCEPTION '지원하지 않는 스크린 위젯 설정입니다.' USING ERRCODE = '22023';
        END IF;

        IF v_layout_version IN (2, 3) THEN
            IF JSONB_TYPEOF(v_placement) <> 'object'
               OR JSONB_TYPEOF(v_placement -> 'x') <> 'number'
               OR JSONB_TYPEOF(v_placement -> 'y') <> 'number'
               OR JSONB_TYPEOF(v_placement -> 'width') <> 'number'
               OR JSONB_TYPEOF(v_placement -> 'height') <> 'number'
               OR JSONB_TYPEOF(v_placement -> 'pinned') <> 'boolean' THEN
                RAISE EXCEPTION '자유 배치 위젯의 위치·크기·핀 정보가 올바르지 않습니다.' USING ERRCODE = '22023';
            END IF;
            v_x := (v_placement ->> 'x')::NUMERIC;
            v_y := (v_placement ->> 'y')::NUMERIC;
            v_width := (v_placement ->> 'width')::NUMERIC;
            v_height := (v_placement ->> 'height')::NUMERIC;
            v_min_width := CASE WHEN v_layout_version = 3 THEN 11.2 ELSE 16 END;
            IF v_x < 0 OR v_y < 0
               OR v_width < v_min_width
               OR v_height < 16 OR v_x + v_width > 100 OR v_y + v_height > 100 THEN
                RAISE EXCEPTION '자유 배치 위젯이 화면 경계를 벗어났습니다.' USING ERRCODE = '22023';
            END IF;
        END IF;

        IF v_widget_id = 'meal-board' THEN
            v_meal_count := v_meal_count + 1;
            IF v_meal_count > 1
               OR CHAR_LENGTH(COALESCE(v_config ->> 'heading', '')) > 80
               OR JSONB_TYPEOF(v_config -> 'showAllergens') IS DISTINCT FROM 'boolean' THEN
                RAISE EXCEPTION '식단표 위젯 설정이 올바르지 않습니다.' USING ERRCODE = '22023';
            END IF;
        ELSIF v_widget_id = 'notice-board' THEN
            v_notice_count := v_notice_count + 1;
            IF v_notice_count > 1
               OR CHAR_LENGTH(COALESCE(v_config ->> 'heading', '')) > 80
               OR CHAR_LENGTH(COALESCE(v_config ->> 'body', '')) > 2000
               OR COALESCE(v_config ->> 'tone', 'yellow') NOT IN ('yellow', 'sky', 'mint', 'rose') THEN
                RAISE EXCEPTION '알림장 위젯 설정이 올바르지 않습니다.' USING ERRCODE = '22023';
            END IF;
        END IF;
    END LOOP;

    -- 오늘 현황의 배경색과 구성 항목은 화면에서 고른 값만 저장한다.
    FOR v_widget IN
        SELECT value
        FROM JSONB_ARRAY_ELEMENTS(COALESCE(p_widgets, '[]'::JSONB))
        WHERE value ->> 'widgetId' = 'writing-status'
    LOOP
        v_config := COALESCE(v_widget -> 'config', '{}'::JSONB);
        IF COALESCE(v_config ->> 'tone', 'navy') NOT IN ('navy', 'forest', 'plum', 'graphite', 'paper') THEN
            RAISE EXCEPTION '오늘 현황 배경색이 올바르지 않습니다.' USING ERRCODE = '22023';
        END IF;
        IF v_config ? 'sections' THEN
            IF JSONB_TYPEOF(v_config -> 'sections') <> 'array'
               OR JSONB_ARRAY_LENGTH(v_config -> 'sections') > 5
               OR EXISTS (
                   SELECT 1 FROM JSONB_ARRAY_ELEMENTS_TEXT(v_config -> 'sections') item
                   WHERE item NOT IN ('mission', 'daily', 'dailyNames', 'titles', 'reactions')
               )
               OR (SELECT COUNT(*) <> COUNT(DISTINCT item)
                   FROM JSONB_ARRAY_ELEMENTS_TEXT(v_config -> 'sections') item) THEN
                RAISE EXCEPTION '오늘 현황 구성 항목이 올바르지 않습니다.' USING ERRCODE = '22023';
            END IF;
        END IF;
    END LOOP;

    SELECT COALESCE(JSONB_AGG(value), '[]'::JSONB)
      INTO v_legacy_widgets
    FROM JSONB_ARRAY_ELEMENTS(COALESCE(p_widgets, '[]'::JSONB))
    WHERE value ->> 'widgetId' NOT IN ('meal-board', 'notice-board');

    PERFORM public.validate_class_board_legacy_widgets(p_class_id, p_layout, v_legacy_widgets);
END;
$$;

REVOKE ALL ON FUNCTION public.validate_class_board_payload_v1(UUID, JSONB, JSONB)
    FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
