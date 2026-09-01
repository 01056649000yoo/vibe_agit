BEGIN;

-- 스크린 전체를 고정 16:9 좌표계로 사용한다. 오늘 현황은 그 안의 오른쪽 30%를
-- 덮는 패널이므로 접어도 본문 위젯의 좌표와 크기는 달라지지 않는다.
-- 날씨는 교사가 고른 공개 지역 좌표만 저장하며, 소리는 브라우저에서 합성한다.
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
    v_min_width NUMERIC;
    v_weather_source TEXT;
BEGIN
    v_layout_version := COALESCE((p_layout ->> 'version')::INTEGER, 0);
    IF JSONB_TYPEOF(COALESCE(p_layout, '{}'::JSONB)) <> 'object'
       OR NOT (
           (v_layout_version = 1 AND p_layout ->> 'preset' = 'split-8-4')
           OR (v_layout_version = 2 AND p_layout ->> 'preset' = 'freeform-7-3')
           OR (v_layout_version = 3 AND p_layout ->> 'preset' = 'freeform-stage-7-3')
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
                RAISE EXCEPTION '수업 자료 위젯은 자유 배치 영역에만 둘 수 있습니다.' USING ERRCODE = '22023';
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
                IF v_x < 0 OR v_y < 0 OR v_width < v_min_width OR v_height < 16
                   OR v_x + v_width > 100 OR v_y + v_height > 100 THEN
                    RAISE EXCEPTION '자유 배치 위젯이 화면 경계를 벗어났습니다.' USING ERRCODE = '22023';
                END IF;
            END IF;
        END IF;

        CASE v_widget_id
        WHEN 'text' THEN
            IF CHAR_LENGTH(COALESCE(v_config ->> 'heading', '')) > 120
               OR CHAR_LENGTH(COALESCE(v_config ->> 'body', '')) > 2000
               OR COALESCE(v_config ->> 'tone', 'paper') NOT IN ('paper', 'sky', 'sun', 'mint')
               OR (v_config ? 'fontScale' AND NOT (CASE
                    WHEN JSONB_TYPEOF(v_config -> 'fontScale') = 'number'
                    THEN (v_config ->> 'fontScale')::NUMERIC BETWEEN 0.8 AND 1.5
                    ELSE FALSE
               END)) THEN
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
            v_weather_source := COALESCE(v_config ->> 'weatherSource', 'manual');
            IF v_weather_count > 1
               OR v_weather_source NOT IN ('manual', 'live')
               OR CHAR_LENGTH(COALESCE(v_config ->> 'message', '')) > 80
               OR CHAR_LENGTH(COALESCE(v_config ->> 'locationName', '')) > 80
               OR NOT (
                    (NOT (v_config ? 'latitude') AND NOT (v_config ? 'longitude'))
                    OR (JSONB_TYPEOF(v_config -> 'latitude') = 'null' AND JSONB_TYPEOF(v_config -> 'longitude') = 'null')
                    OR CASE
                        WHEN JSONB_TYPEOF(v_config -> 'latitude') = 'number'
                             AND JSONB_TYPEOF(v_config -> 'longitude') = 'number'
                        THEN (v_config ->> 'latitude')::NUMERIC BETWEEN -90 AND 90
                             AND (v_config ->> 'longitude')::NUMERIC BETWEEN -180 AND 180
                        ELSE FALSE
                    END
               )
               OR (v_weather_source = 'manual' AND (
                    COALESCE(v_config ->> 'condition', '') NOT IN ('sunny', 'partly-cloudy', 'cloudy', 'rain', 'snow', 'wind')
                    OR NOT (CASE
                        WHEN JSONB_TYPEOF(v_config -> 'temperature') = 'number'
                        THEN (v_config ->> 'temperature')::NUMERIC BETWEEN -40 AND 50
                        ELSE FALSE
                    END)
               )) THEN
                RAISE EXCEPTION '날씨 위젯 설정이 올바르지 않습니다.' USING ERRCODE = '22023';
            END IF;
        WHEN 'timer' THEN
            IF NOT (CASE
                    WHEN JSONB_TYPEOF(v_config -> 'durationSeconds') = 'number'
                    THEN (v_config ->> 'durationSeconds')::INTEGER BETWEEN 10 AND 7200
                    ELSE FALSE
               END)
               OR CHAR_LENGTH(COALESCE(v_config ->> 'label', '')) > 80
               OR (v_config ? 'soundEnabled' AND JSONB_TYPEOF(v_config -> 'soundEnabled') <> 'boolean')
               OR COALESCE(v_config ->> 'alarmSound', 'chime') NOT IN ('chime', 'bell', 'digital')
               OR (v_config ? 'alarmVolume' AND NOT (CASE
                    WHEN JSONB_TYPEOF(v_config -> 'alarmVolume') = 'number'
                    THEN (v_config ->> 'alarmVolume')::NUMERIC BETWEEN 0 AND 1
                    ELSE FALSE
               END)) THEN
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
               OR JSONB_TYPEOF(v_config -> 'allowRepeats') IS DISTINCT FROM 'boolean'
               OR (v_config ? 'soundEnabled' AND JSONB_TYPEOF(v_config -> 'soundEnabled') <> 'boolean')
               OR (v_config ? 'soundVolume' AND NOT (CASE
                    WHEN JSONB_TYPEOF(v_config -> 'soundVolume') = 'number'
                    THEN (v_config ->> 'soundVolume')::NUMERIC BETWEEN 0 AND 1
                    ELSE FALSE
               END)) THEN
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

COMMIT;
