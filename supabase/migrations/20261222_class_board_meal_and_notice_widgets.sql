-- 우리 반 스크린에 기존 급식 설정을 읽는 식단표와 저장형 알림장 위젯을 추가한다.
-- 기존 검증기는 이름을 바꿔 그대로 보존하고, 새 위젯만 별도 검증한 뒤 기존 위젯 검증을 위임한다.

BEGIN;

ALTER FUNCTION public.validate_class_board_payload_v1(UUID, JSONB, JSONB)
    RENAME TO validate_class_board_legacy_widgets;

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

    SELECT COALESCE(JSONB_AGG(value), '[]'::JSONB)
      INTO v_legacy_widgets
    FROM JSONB_ARRAY_ELEMENTS(COALESCE(p_widgets, '[]'::JSONB))
    WHERE value ->> 'widgetId' NOT IN ('meal-board', 'notice-board');

    PERFORM public.validate_class_board_legacy_widgets(p_class_id, p_layout, v_legacy_widgets);
END;
$$;

REVOKE ALL ON FUNCTION public.validate_class_board_payload_v1(UUID, JSONB, JSONB)
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_class_board_legacy_widgets(UUID, JSONB, JSONB)
    FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.validate_class_board_payload_v1(UUID, JSONB, JSONB) IS
    '우리 반 스크린 전체 payload와 식단표·알림장 위젯을 검증한 뒤 기존 위젯 검증에 위임한다.';
COMMENT ON FUNCTION public.validate_class_board_legacy_widgets(UUID, JSONB, JSONB) IS
    'validate_class_board_payload_v1이 호출하는 기존 스크린 위젯 검증 도우미.';

COMMIT;
