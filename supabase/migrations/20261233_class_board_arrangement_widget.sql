-- 우리 반 스크린: 자리·역할 배치 결과 위젯 (2026-09-03)
--
-- 왜: 교사가 "자리·역할 배치 결과를 스크린에서 불러와 볼 수 있으면 좋겠다"고 요청했다.
-- 배치 도구(`classroom_arrangement_history`)에 이미 결과가 쌓여 있으므로 새로 만들 자료는 없다.
--
-- ⚠️ 새 위젯 ID 는 **서버가 먼저 알아야 한다.** 위젯 검증은 아는 ID 만 통과시키고 나머지는
--    `지원하지 않는 스크린 위젯 설정입니다` 로 막는다. 2026-09-02 에 이 순서를 놓쳐
--    화면만 배포했다가 교사가 저장할 때마다 경고를 봤다. **DB 를 먼저 적용한다.**
--
-- ⚠️ 스크린은 교실 프로젝터에 띄운 채로 오래 열려 있다. 기존
--    `get_teacher_classroom_arrangement_v1` 은 설정·명단·지난 기록 50건을 한꺼번에 준다 —
--    화면 하나 그리자고 읽기에는 너무 크다. 그래서 **가장 최근 한 건만** 주는 함수를 따로 둔다.

BEGIN;

/*
 * 스크린에 띄울 배치 결과 한 건만 읽는다.
 * 교사 자신의 학급만 볼 수 있다(스크린은 교사 계정으로 띄운다).
 */
CREATE OR REPLACE FUNCTION public.get_class_board_arrangement_result_v1(
    p_class_id UUID,
    p_kind TEXT DEFAULT 'seat'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    IF p_kind NOT IN ('seat', 'role') THEN
        RAISE EXCEPTION '배치 종류는 자리 또는 역할만 볼 수 있습니다.' USING ERRCODE = '22023';
    END IF;
    PERFORM 1 FROM public.classes class
    WHERE class.id = p_class_id AND class.teacher_id = auth.uid();
    IF NOT FOUND THEN
        RAISE EXCEPTION '이 학급의 배치 결과를 볼 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    -- (class_id, created_at DESC, id DESC) 색인이 있어 한 줄만 짚어 온다.
    SELECT JSONB_BUILD_OBJECT(
               'id', item.id,
               'kind', item.kind,
               'title', item.title,
               'payload', item.payload,
               'createdAt', item.created_at
           )
      INTO v_result
      FROM public.classroom_arrangement_history item
     WHERE item.class_id = p_class_id AND item.kind = p_kind
     ORDER BY item.created_at DESC, item.id DESC
     LIMIT 1;

    RETURN COALESCE(v_result, JSONB_BUILD_OBJECT('kind', p_kind));
END;
$$;

REVOKE ALL ON FUNCTION public.get_class_board_arrangement_result_v1(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_class_board_arrangement_result_v1(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.get_class_board_arrangement_result_v1(UUID, TEXT) IS
    '우리 반 스크린 자리·역할 배치 위젯이 쓰는, 가장 최근 결과 한 건만 주는 읽기 함수.';

-- 아래는 20261229 의 검증 함수를 그대로 두고 자리·역할 위젯만 더한 것이다(손으로 옮겨 적지 않았다).
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
    v_arrangement_count INTEGER := 0;
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
        WHERE value ->> 'widgetId' IN ('meal-board', 'notice-board', 'arrangement-board')
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
               OR JSONB_TYPEOF(v_config -> 'showAllergens') IS DISTINCT FROM 'boolean'
               OR COALESCE(v_config ->> 'columns', '2') NOT IN ('2', '3') THEN
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
        ELSIF v_widget_id = 'arrangement-board' THEN
            v_arrangement_count := v_arrangement_count + 1;
            IF v_arrangement_count > 1
               OR CHAR_LENGTH(COALESCE(v_config ->> 'heading', '')) > 80
               OR COALESCE(v_config ->> 'kind', '') NOT IN ('seat', 'role') THEN
                RAISE EXCEPTION '자리·역할 배치 위젯 설정이 올바르지 않습니다.' USING ERRCODE = '22023';
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


    -- 날씨 위젯이 보여 줄 날도 화면에서 고른 값만 저장한다.
    FOR v_widget IN
        SELECT value
        FROM JSONB_ARRAY_ELEMENTS(COALESCE(p_widgets, '[]'::JSONB))
        WHERE value ->> 'widgetId' = 'weather'
    LOOP
        v_config := COALESCE(v_widget -> 'config', '{}'::JSONB);
        IF v_config ? 'days' THEN
            IF JSONB_TYPEOF(v_config -> 'days') <> 'array'
               OR JSONB_ARRAY_LENGTH(v_config -> 'days') NOT BETWEEN 1 AND 2
               OR EXISTS (
                   SELECT 1 FROM JSONB_ARRAY_ELEMENTS_TEXT(v_config -> 'days') item
                   WHERE item NOT IN ('today', 'tomorrow')
               )
               OR (SELECT COUNT(*) <> COUNT(DISTINCT item)
                   FROM JSONB_ARRAY_ELEMENTS_TEXT(v_config -> 'days') item) THEN
                RAISE EXCEPTION '날씨 위젯이 보여 줄 날이 올바르지 않습니다.' USING ERRCODE = '22023';
            END IF;
        END IF;
    END LOOP;

    SELECT COALESCE(JSONB_AGG(value), '[]'::JSONB)
      INTO v_legacy_widgets
    FROM JSONB_ARRAY_ELEMENTS(COALESCE(p_widgets, '[]'::JSONB))
    WHERE value ->> 'widgetId' NOT IN ('meal-board', 'notice-board', 'arrangement-board');

    PERFORM public.validate_class_board_legacy_widgets(p_class_id, p_layout, v_legacy_widgets);
END;
$$;
REVOKE ALL ON FUNCTION public.validate_class_board_payload_v1(UUID, JSONB, JSONB)
    FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
