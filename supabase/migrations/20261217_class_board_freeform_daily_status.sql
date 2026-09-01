BEGIN;

-- 오늘의 일기·독서록 완료 현황은 보상 원장에 남은 완료 기록만 좁혀 읽는다.
CREATE INDEX IF NOT EXISTS idx_writing_reward_claims_class_daily_writing
    ON public.writing_reward_claims (class_id, writing_type, created_at DESC, student_id)
    WHERE reward_kind = 'completion'
      AND writing_type IN ('diary', 'reading_log');

-- 자유 배치 화면은 좌표와 핀 상태까지 저장한다. 이미 저장된 1세대 보드도 계속 열고 저장할 수 있다.
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
    v_status_count INTEGER := 0;
    v_image_path TEXT;
    v_mission_id UUID;
    v_x NUMERIC;
    v_y NUMERIC;
    v_width NUMERIC;
    v_height NUMERIC;
BEGIN
    v_layout_version := COALESCE((p_layout ->> 'version')::INTEGER, 0);
    IF JSONB_TYPEOF(COALESCE(p_layout, '{}'::JSONB)) <> 'object'
       OR NOT (
           (v_layout_version = 1 AND p_layout ->> 'preset' = 'split-8-4')
           OR (v_layout_version = 2 AND p_layout ->> 'preset' = 'freeform-7-3')
       )
       OR OCTET_LENGTH(COALESCE(p_layout, '{}'::JSONB)::TEXT) > 4096 THEN
        RAISE EXCEPTION '스크린 배치 형식이 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;

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

    FOR v_widget IN SELECT value FROM JSONB_ARRAY_ELEMENTS(COALESCE(p_widgets, '[]'::JSONB))
    LOOP
        v_widget_id := COALESCE(v_widget ->> 'widgetId', '');
        v_config := COALESCE(v_widget -> 'config', '{}'::JSONB);
        v_placement := COALESCE(v_widget -> 'placement', '{}'::JSONB);
        IF JSONB_TYPEOF(v_widget) <> 'object'
           OR COALESCE(v_widget ->> 'instanceId', '') !~ '^[A-Za-z0-9_-]{1,80}$'
           OR v_widget_id NOT IN ('text', 'image', 'writing-status')
           OR COALESCE((v_widget ->> 'version')::INTEGER, 0) <> 1
           OR COALESCE(v_widget ->> 'zone', '') NOT IN ('content', 'sidebar')
           OR COALESCE(v_widget ->> 'size', '') NOT IN ('small', 'medium', 'large')
           OR COALESCE((v_widget ->> 'order')::INTEGER, 0) NOT BETWEEN 1 AND 1000
           OR JSONB_TYPEOF(v_config) <> 'object' THEN
            RAISE EXCEPTION '지원하지 않는 스크린 위젯 설정입니다.' USING ERRCODE = '22023';
        END IF;

        IF v_widget_id IN ('text', 'image') THEN
            IF v_widget ->> 'zone' IS DISTINCT FROM 'content' THEN
                RAISE EXCEPTION '텍스트와 이미지는 왼쪽 자유 배치 영역에만 둘 수 있습니다.' USING ERRCODE = '22023';
            END IF;
            IF v_layout_version = 2 THEN
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
                IF v_x < 0 OR v_y < 0
                   OR v_width < 16 OR v_height < 16
                   OR v_x + v_width > 100 OR v_y + v_height > 100 THEN
                    RAISE EXCEPTION '자유 배치 위젯이 화면 경계를 벗어났습니다.' USING ERRCODE = '22023';
                END IF;
            END IF;
        END IF;

        IF v_widget_id = 'text' THEN
            IF CHAR_LENGTH(COALESCE(v_config ->> 'heading', '')) > 120
               OR CHAR_LENGTH(COALESCE(v_config ->> 'body', '')) > 2000
               OR COALESCE(v_config ->> 'tone', 'paper') NOT IN ('paper', 'sky', 'sun', 'mint') THEN
                RAISE EXCEPTION '텍스트 위젯 내용이 허용 범위를 벗어났습니다.' USING ERRCODE = '22023';
            END IF;
        ELSIF v_widget_id = 'image' THEN
            v_image_path := NULLIF(v_config ->> 'path', '');
            IF CHAR_LENGTH(COALESCE(v_config ->> 'caption', '')) > 240
               OR v_config ? 'url'
               OR v_config ? 'signedUrl'
               OR (v_image_path IS NOT NULL AND (
                    v_image_path !~ ('^' || p_class_id::TEXT || '/[0-9a-f-]{36}/[A-Za-z0-9_-]{1,100}[.](webp|jpg)$')
                    OR NOT (
                        (v_image_path ~ '[.]webp$' AND v_config ->> 'mimeType' = 'image/webp')
                        OR (v_image_path ~ '[.]jpg$' AND v_config ->> 'mimeType' = 'image/jpeg')
                    )
                    OR COALESCE((v_config ->> 'bytes')::INTEGER, 0) NOT BETWEEN 1 AND 2097152
                    OR COALESCE((v_config ->> 'width')::INTEGER, 0) NOT BETWEEN 1 AND 1920
                    OR COALESCE((v_config ->> 'height')::INTEGER, 0) NOT BETWEEN 1 AND 1920
               )) THEN
                RAISE EXCEPTION '이미지 위젯 정보가 올바르지 않습니다.' USING ERRCODE = '22023';
            END IF;
        ELSE
            v_status_count := v_status_count + 1;
            IF v_status_count > 1 OR v_widget ->> 'zone' IS DISTINCT FROM 'sidebar' THEN
                RAISE EXCEPTION '글쓰기 현황 위젯은 오른쪽에 하나만 둘 수 있습니다.' USING ERRCODE = '22023';
            END IF;
            IF NULLIF(v_config ->> 'missionId', '') IS NOT NULL THEN
                BEGIN
                    v_mission_id := (v_config ->> 'missionId')::UUID;
                EXCEPTION WHEN invalid_text_representation THEN
                    RAISE EXCEPTION '글쓰기 현황의 과제 식별자가 올바르지 않습니다.' USING ERRCODE = '22023';
                END;
                IF NOT EXISTS (
                    SELECT 1
                    FROM (
                        SELECT mission.id
                        FROM public.writing_missions mission
                        WHERE mission.class_id = p_class_id
                          AND mission.is_archived IS FALSE
                          AND mission.mission_type IS DISTINCT FROM 'meeting'
                        ORDER BY mission.created_at DESC, mission.id DESC
                        LIMIT 20
                    ) available_mission
                    WHERE available_mission.id = v_mission_id
                ) THEN
                    RAISE EXCEPTION '선택한 활성 글 과제를 찾을 수 없습니다.' USING ERRCODE = '22023';
                END IF;
            END IF;
        END IF;
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_class_board_payload_v1(UUID, JSONB, JSONB)
FROM PUBLIC, anon, authenticated, service_role;

-- 발표 화면에는 가장 최근 진행 미션의 이름별 제출 상태와 오늘의 자율 글 완료 숫자만 싣는다.
-- 글 ID·본문·학생 ID는 반환하지 않는다.
CREATE OR REPLACE FUNCTION public.get_teacher_class_board_status_v1(
    p_class_id UUID,
    p_mission_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_selected_mission_id UUID;
    v_selected_mission_title TEXT;
    v_snapshot JSONB := '{}'::JSONB;
    v_summary JSONB := '{}'::JSONB;
    v_student_statuses JSONB := '[]'::JSONB;
    v_total_students INTEGER;
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
    v_today_start TIMESTAMPTZ;
    v_tomorrow_start TIMESTAMPTZ;
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.classes class
        WHERE class.id = p_class_id
          AND class.deleted_at IS NULL
          AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN')
    ) THEN
        RAISE EXCEPTION '해당 학급의 글쓰기 현황만 확인할 수 있습니다.' USING ERRCODE = '42501';
    END IF;

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

    IF v_selected_mission_id IS NOT NULL THEN
        v_snapshot := public.teacher_assignment_submission_board_snapshot_v2(
            p_class_id, v_selected_mission_id, 20, 1
        );
        v_summary := COALESCE(v_snapshot -> 'scope_summary', '{}'::JSONB);
        v_student_statuses := COALESCE(v_snapshot -> 'student_statuses', '[]'::JSONB);
    END IF;

    v_today_start := v_today::TIMESTAMP AT TIME ZONE 'Asia/Seoul';
    v_tomorrow_start := (v_today + 1)::TIMESTAMP AT TIME ZONE 'Asia/Seoul';

    RETURN JSONB_BUILD_OBJECT(
        'version', 1,
        'scope', CASE WHEN v_selected_mission_id IS NULL THEN 'none' ELSE 'mission' END,
        'selectedMissionId', v_selected_mission_id,
        'selectedMissionTitle', v_selected_mission_title,
        'generatedAt', NOW(),
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
        ), '[]'::JSONB),
        'dailyWriting', JSONB_BUILD_OBJECT(
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
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_class_board_status_v1(UUID, UUID)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_class_board_status_v1(UUID, UUID)
TO authenticated, service_role;

UPDATE storage.buckets
SET public = FALSE,
    file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/webp', 'image/jpeg']::TEXT[]
WHERE id = 'class-board-assets';

NOTIFY pgrst, 'reload schema';

COMMIT;
