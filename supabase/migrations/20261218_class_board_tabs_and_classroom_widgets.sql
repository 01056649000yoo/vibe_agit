BEGIN;

-- 기존 2MB 이미지는 화면 수정 시 계속 저장할 수 있게 payload 호환을 유지한다.
-- 새 업로드는 Storage와 클라이언트 양쪽에서 1MB로 제한한다.
UPDATE storage.buckets
SET public = FALSE,
    file_size_limit = 1048576,
    allowed_mime_types = ARRAY['image/webp', 'image/jpeg']::TEXT[]
WHERE id = 'class-board-assets';

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
    v_picker_count INTEGER := 0;
    v_weather_count INTEGER := 0;
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
           OR v_widget_id NOT IN ('text', 'image', 'writing-status', 'weather', 'timer', 'stopwatch', 'student-picker')
           OR COALESCE((v_widget ->> 'version')::INTEGER, 0) <> 1
           OR COALESCE(v_widget ->> 'zone', '') NOT IN ('content', 'sidebar')
           OR COALESCE(v_widget ->> 'size', '') NOT IN ('small', 'medium', 'large')
           OR COALESCE((v_widget ->> 'order')::INTEGER, 0) NOT BETWEEN 1 AND 1000
           OR JSONB_TYPEOF(v_config) <> 'object' THEN
            RAISE EXCEPTION '지원하지 않는 스크린 위젯 설정입니다.' USING ERRCODE = '22023';
        END IF;

        IF v_widget_id <> 'writing-status' THEN
            IF v_widget ->> 'zone' IS DISTINCT FROM 'content' THEN
                RAISE EXCEPTION '수업 자료 위젯은 왼쪽 자유 배치 영역에만 둘 수 있습니다.' USING ERRCODE = '22023';
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
                IF v_x < 0 OR v_y < 0 OR v_width < 16 OR v_height < 16
                   OR v_x + v_width > 100 OR v_y + v_height > 100 THEN
                    RAISE EXCEPTION '자유 배치 위젯이 화면 경계를 벗어났습니다.' USING ERRCODE = '22023';
                END IF;
            END IF;
        END IF;

        CASE v_widget_id
        WHEN 'text' THEN
            IF CHAR_LENGTH(COALESCE(v_config ->> 'heading', '')) > 120
               OR CHAR_LENGTH(COALESCE(v_config ->> 'body', '')) > 2000
               OR COALESCE(v_config ->> 'tone', 'paper') NOT IN ('paper', 'sky', 'sun', 'mint') THEN
                RAISE EXCEPTION '텍스트 위젯 내용이 허용 범위를 벗어났습니다.' USING ERRCODE = '22023';
            END IF;
        WHEN 'image' THEN
            v_image_path := NULLIF(v_config ->> 'path', '');
            IF CHAR_LENGTH(COALESCE(v_config ->> 'caption', '')) > 240
               OR v_config ? 'url' OR v_config ? 'signedUrl'
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
        WHEN 'weather' THEN
            v_weather_count := v_weather_count + 1;
            IF v_weather_count > 1
               OR COALESCE(v_config ->> 'condition', '') NOT IN ('sunny', 'partly-cloudy', 'cloudy', 'rain', 'snow', 'wind')
               OR JSONB_TYPEOF(v_config -> 'temperature') IS DISTINCT FROM 'number'
               OR (v_config ->> 'temperature')::NUMERIC NOT BETWEEN -40 AND 50
               OR CHAR_LENGTH(COALESCE(v_config ->> 'message', '')) > 80 THEN
                RAISE EXCEPTION '날씨 위젯 설정이 올바르지 않습니다.' USING ERRCODE = '22023';
            END IF;
        WHEN 'timer' THEN
            IF JSONB_TYPEOF(v_config -> 'durationSeconds') IS DISTINCT FROM 'number'
               OR (v_config ->> 'durationSeconds')::INTEGER NOT BETWEEN 10 AND 7200
               OR CHAR_LENGTH(COALESCE(v_config ->> 'label', '')) > 80 THEN
                RAISE EXCEPTION '타이머 위젯 설정이 올바르지 않습니다.' USING ERRCODE = '22023';
            END IF;
        WHEN 'stopwatch' THEN
            IF CHAR_LENGTH(COALESCE(v_config ->> 'label', '')) > 80 THEN
                RAISE EXCEPTION '스톱워치 위젯 설정이 올바르지 않습니다.' USING ERRCODE = '22023';
            END IF;
        WHEN 'student-picker' THEN
            v_picker_count := v_picker_count + 1;
            IF v_picker_count > 1
               OR CHAR_LENGTH(COALESCE(v_config ->> 'title', '')) > 80
               OR JSONB_TYPEOF(v_config -> 'allowRepeats') IS DISTINCT FROM 'boolean' THEN
                RAISE EXCEPTION '학생 무작위 뽑기 설정이 올바르지 않습니다.' USING ERRCODE = '22023';
            END IF;
        WHEN 'writing-status' THEN
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
                    SELECT 1 FROM (
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
        ELSE
            RAISE EXCEPTION '지원하지 않는 스크린 위젯입니다.' USING ERRCODE = '22023';
        END CASE;
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_class_board_payload_v1(UUID, JSONB, JSONB)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_teacher_archived_class_boards_v1(
    p_class_id UUID,
    p_limit INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 20);
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.classes class
        WHERE class.id = p_class_id
          AND class.deleted_at IS NULL
          AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN')
    ) THEN
        RAISE EXCEPTION '담당 학급의 숨긴 스크린만 확인할 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    RETURN JSONB_BUILD_OBJECT(
        'version', 1,
        'boards', COALESCE((
            SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
                'id', board.id,
                'title', board.title,
                'archivedAt', board.archived_at
            ) ORDER BY board.archived_at DESC, board.id DESC)
            FROM (
                SELECT item.id, item.title, item.archived_at
                FROM public.class_boards item
                WHERE item.class_id = p_class_id
                  AND item.archived_at IS NOT NULL
                ORDER BY item.archived_at DESC, item.id DESC
                LIMIT v_limit
            ) board
        ), '[]'::JSONB)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_teacher_class_board_v1(p_board_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_board public.class_boards%ROWTYPE;
BEGIN
    SELECT board.* INTO v_board
    FROM public.class_boards board
    JOIN public.classes class ON class.id = board.class_id
    WHERE board.id = p_board_id
      AND board.archived_at IS NOT NULL
      AND class.deleted_at IS NULL
      AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN')
    FOR UPDATE OF board;
    IF NOT FOUND OR auth.uid() IS NULL THEN
        RAISE EXCEPTION '복구할 수 있는 숨긴 스크린이 아닙니다.' USING ERRCODE = '42501';
    END IF;

    UPDATE public.class_boards
    SET is_active = FALSE
    WHERE class_id = v_board.class_id
      AND is_active IS TRUE
      AND archived_at IS NULL;

    UPDATE public.class_boards board
    SET archived_at = NULL,
        is_active = TRUE,
        revision = board.revision + 1,
        updated_at = NOW()
    WHERE board.id = v_board.id
    RETURNING * INTO v_board;

    RETURN JSONB_BUILD_OBJECT(
        'id', v_board.id, 'title', v_board.title, 'layout', v_board.layout,
        'widgets', v_board.widgets, 'isActive', TRUE, 'revision', v_board.revision,
        'createdAt', v_board.created_at, 'updatedAt', v_board.updated_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_archived_class_boards_v1(UUID, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_teacher_class_board_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_archived_class_boards_v1(UUID, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_teacher_class_board_v1(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_teacher_class_board_roster_v1(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.classes class
        WHERE class.id = p_class_id
          AND class.deleted_at IS NULL
          AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN')
    ) THEN
        RAISE EXCEPTION '해당 학급의 학생 뽑기 명단만 확인할 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    RETURN JSONB_BUILD_OBJECT(
        'version', 1,
        'names', COALESCE((
            SELECT JSONB_AGG(roster.name ORDER BY roster.name, roster.id)
            FROM (
                SELECT student.id, student.name
                FROM public.students student
                WHERE student.class_id = p_class_id
                  AND student.is_active IS DISTINCT FROM FALSE
                  AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
                ORDER BY student.name, student.id
                LIMIT 100
            ) roster
        ), '[]'::JSONB)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_class_board_roster_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_class_board_roster_v1(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
