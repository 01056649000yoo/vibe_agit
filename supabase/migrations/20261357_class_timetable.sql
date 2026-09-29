-- 학급 시간표 관리 (2026-09-29 선생님 요청).
--
-- 기초 시간표를 한 번 입력해 두면 우리 반 스크린에서 오늘·내일·이번 주 시간표를 보여 주고,
-- 주간 시간표를 고치면 그 주의 시간표로 따로 저장되어 나중에 다시 볼 수 있다.
--
-- 표 두 개:
--   class_timetable_bases  기초 시간표의 판. (학급, 적용 시작 주 월요일)마다 한 줄.
--                          덮어쓰지 않고 판을 쌓는다 — 2학기에 기초 시간표가 바뀌어도, 따로 저장하지 않은
--                          지난 주는 그때 쓰던 기초 시간표로 보여야 "지난 기록"이 맞기 때문이다.
--   class_timetable_weeks  그 주에만 바꾼 시간표. (학급, 그 주 월요일)마다 한 줄. 기초와 같으면 줄을 두지 않는다.
--
-- 칸(cells): 6일(월~토) × 8교시 배열. 한 칸은 null 또는 {"s": 과목(20자), "m": 메모(30자)}.
-- 교시 시각은 받지 않는다(선생님 결정 — 교시로만). 점심시간은 `lunch_after` 교시 뒤(1~7).
--
-- 보안: 표는 RLS 를 켜고 브라우저 역할의 직접 권한을 모두 닫는다. 읽기·쓰기는 담당 학급 교사(또는 관리자)만
-- SECURITY DEFINER RPC 로. anon 에 열지 않는다. 성능: 스크린 위젯은 열 때 한 번(이번 주·다음 주를 함께),
-- 도구는 열 때 한 번 + 주를 옮길 때 그 주 한 번, 지난 기록은 열 때 20줄. 폴링·실시간 없음.

BEGIN;

CREATE TABLE IF NOT EXISTS public.class_timetable_bases (
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    effective_from DATE NOT NULL CHECK (EXTRACT(ISODOW FROM effective_from) = 1),
    grade SMALLINT NOT NULL CHECK (grade BETWEEN 1 AND 6),
    lunch_after SMALLINT NOT NULL CHECK (lunch_after BETWEEN 1 AND 7),
    include_saturday BOOLEAN NOT NULL DEFAULT FALSE,
    cells JSONB NOT NULL CHECK (pg_column_size(cells) <= 16384),
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (class_id, effective_from)
);

CREATE TABLE IF NOT EXISTS public.class_timetable_weeks (
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    week_start DATE NOT NULL CHECK (EXTRACT(ISODOW FROM week_start) = 1),
    lunch_after SMALLINT NOT NULL CHECK (lunch_after BETWEEN 1 AND 7),
    include_saturday BOOLEAN NOT NULL DEFAULT FALSE,
    cells JSONB NOT NULL CHECK (pg_column_size(cells) <= 16384),
    changed_cells SMALLINT NOT NULL DEFAULT 0 CHECK (changed_cells BETWEEN 0 AND 48),
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (class_id, week_start)
);

ALTER TABLE public.class_timetable_bases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_timetable_weeks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.class_timetable_bases FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.class_timetable_weeks FROM PUBLIC, anon, authenticated;

-- ── 내부 도우미(브라우저에 열지 않는다) ───────────────────────────────────────────

-- 그 날짜가 든 주의 월요일.
CREATE OR REPLACE FUNCTION public.class_timetable_week_of(p_date DATE)
RETURNS DATE
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT (p_date - (EXTRACT(ISODOW FROM p_date)::INTEGER - 1))::DATE;
$$;

-- 칸 모양 검사: 6일 × 8교시, 칸은 null 또는 {s,m} 뿐, 글자 수 상한.
CREATE OR REPLACE FUNCTION public.class_timetable_cells_ok(p_cells JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
    v_day JSONB;
    v_cell JSONB;
BEGIN
    IF p_cells IS NULL OR jsonb_typeof(p_cells) <> 'array' OR jsonb_array_length(p_cells) <> 6
       OR pg_column_size(p_cells) > 16384 THEN
        RETURN FALSE;
    END IF;
    FOR v_day IN SELECT value FROM jsonb_array_elements(p_cells) LOOP
        IF jsonb_typeof(v_day) <> 'array' OR jsonb_array_length(v_day) <> 8 THEN
            RETURN FALSE;
        END IF;
        FOR v_cell IN SELECT value FROM jsonb_array_elements(v_day) LOOP
            IF jsonb_typeof(v_cell) = 'null' THEN
                CONTINUE;
            END IF;
            IF jsonb_typeof(v_cell) <> 'object'
               OR (v_cell - 's' - 'm') <> '{}'::JSONB
               OR (v_cell ? 's' AND jsonb_typeof(v_cell -> 's') <> 'string')
               OR (v_cell ? 'm' AND jsonb_typeof(v_cell -> 'm') <> 'string')
               OR char_length(COALESCE(v_cell ->> 's', '')) > 20
               OR char_length(COALESCE(v_cell ->> 'm', '')) > 30 THEN
                RETURN FALSE;
            END IF;
        END LOOP;
    END LOOP;
    RETURN TRUE;
END;
$$;

-- 두 칸 배열에서 과목이나 메모가 다른 칸 수(기초가 없으면 빈 칸과 견준다).
CREATE OR REPLACE FUNCTION public.class_timetable_changed_cells(p_cells JSONB, p_base JSONB)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT COUNT(*)::INTEGER
    FROM generate_series(0, 5) AS day(i)
    CROSS JOIN generate_series(0, 7) AS period(i)
    WHERE (btrim(COALESCE(p_cells -> day.i -> period.i ->> 's', '')), btrim(COALESCE(p_cells -> day.i -> period.i ->> 'm', '')))
          IS DISTINCT FROM
          (btrim(COALESCE(p_base -> day.i -> period.i ->> 's', '')), btrim(COALESCE(p_base -> day.i -> period.i ->> 'm', '')));
$$;

-- 담당 학급 확인. 아니면 막는다.
CREATE OR REPLACE FUNCTION public.class_timetable_assert_teacher(p_class_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
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
        RAISE EXCEPTION '담당 학급의 시간표만 볼 수 있습니다.' USING ERRCODE = '42501';
    END IF;
END;
$$;

-- 한 주의 시간표: 그 주에 따로 저장한 것이 있으면 그것, 없으면 그 주에 적용되는 기초 시간표.
CREATE OR REPLACE FUNCTION public.class_timetable_resolve_week(p_class_id UUID, p_week DATE)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH base AS (
        SELECT b.* FROM public.class_timetable_bases b
        WHERE b.class_id = p_class_id AND b.effective_from <= p_week
        ORDER BY b.effective_from DESC
        LIMIT 1
    ), week AS (
        SELECT w.* FROM public.class_timetable_weeks w
        WHERE w.class_id = p_class_id AND w.week_start = p_week
    )
    SELECT jsonb_build_object(
        'weekStart', p_week,
        'saved', EXISTS (SELECT 1 FROM week),
        'updatedAt', (SELECT updated_at FROM week),
        'changedCells', COALESCE((SELECT changed_cells FROM week), 0),
        'base', (SELECT jsonb_build_object(
            'effectiveFrom', effective_from, 'grade', grade, 'lunchAfter', lunch_after,
            'includeSaturday', include_saturday, 'cells', cells, 'updatedAt', updated_at
        ) FROM base),
        'cells', COALESCE((SELECT cells FROM week), (SELECT cells FROM base)),
        'lunchAfter', COALESCE((SELECT lunch_after FROM week), (SELECT lunch_after FROM base)),
        'includeSaturday', COALESCE((SELECT include_saturday FROM week), (SELECT include_saturday FROM base), FALSE)
    );
$$;

REVOKE ALL ON FUNCTION public.class_timetable_week_of(DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.class_timetable_cells_ok(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.class_timetable_changed_cells(JSONB, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.class_timetable_assert_teacher(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.class_timetable_resolve_week(UUID, DATE) FROM PUBLIC, anon, authenticated;

-- ── 읽기 ────────────────────────────────────────────────────────────────────

-- p_week_start 가 든 주부터 p_weeks(1~2)주. 스크린 위젯은 이번 주·다음 주를 한 번에 받아 오늘·내일·이번 주를 모두 그린다.
CREATE OR REPLACE FUNCTION public.get_teacher_class_timetable_v1(
    p_class_id UUID,
    p_week_start DATE DEFAULT NULL,
    p_weeks INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
    v_week DATE;
    v_count INTEGER := LEAST(GREATEST(COALESCE(p_weeks, 1), 1), 2);
BEGIN
    PERFORM public.class_timetable_assert_teacher(p_class_id);
    v_week := public.class_timetable_week_of(COALESCE(p_week_start, v_today));
    IF v_week < public.class_timetable_week_of(v_today) - 400 OR v_week > public.class_timetable_week_of(v_today) + 400 THEN
        RAISE EXCEPTION '시간표 날짜가 허용 범위를 벗어났습니다.' USING ERRCODE = '22023';
    END IF;

    RETURN jsonb_build_object(
        'version', 1,
        'today', v_today,
        'thisWeek', public.class_timetable_week_of(v_today),
        'latestBase', (
            SELECT jsonb_build_object(
                'effectiveFrom', b.effective_from, 'grade', b.grade, 'lunchAfter', b.lunch_after,
                'includeSaturday', b.include_saturday, 'cells', b.cells, 'updatedAt', b.updated_at
            )
            FROM public.class_timetable_bases b
            WHERE b.class_id = p_class_id
            ORDER BY b.effective_from DESC
            LIMIT 1
        ),
        'weeks', (
            SELECT jsonb_agg(public.class_timetable_resolve_week(p_class_id, v_week + offset_week.i * 7) ORDER BY offset_week.i)
            FROM generate_series(0, v_count - 1) AS offset_week(i)
        )
    );
END;
$$;

-- 지난 기록: 따로 저장한 주(최신순 20개씩, 주 커서)와 기초 시간표 판(최신 20개).
CREATE OR REPLACE FUNCTION public.get_teacher_class_timetable_log_v1(
    p_class_id UUID,
    p_before DATE DEFAULT NULL,
    p_limit INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 20);
    v_rows JSONB;
BEGIN
    PERFORM public.class_timetable_assert_teacher(p_class_id);

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'weekStart', page.week_start, 'updatedAt', page.updated_at, 'changedCells', page.changed_cells
    ) ORDER BY page.week_start DESC), '[]'::JSONB)
    INTO v_rows
    FROM (
        SELECT w.week_start, w.updated_at, w.changed_cells
        FROM public.class_timetable_weeks w
        WHERE w.class_id = p_class_id
          AND (p_before IS NULL OR w.week_start < p_before)
        ORDER BY w.week_start DESC
        LIMIT v_limit + 1
    ) page;

    RETURN jsonb_build_object(
        'version', 1,
        'weeks', (
            SELECT COALESCE(jsonb_agg(item ORDER BY (item ->> 'weekStart') DESC), '[]'::JSONB)
            FROM (SELECT item FROM jsonb_array_elements(v_rows) AS rows(item) LIMIT v_limit) limited
        ),
        'nextCursor', CASE WHEN jsonb_array_length(v_rows) > v_limit
            THEN (v_rows -> (v_limit - 1)) ->> 'weekStart' ELSE NULL END,
        'bases', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'effectiveFrom', b.effective_from, 'grade', b.grade, 'lunchAfter', b.lunch_after, 'updatedAt', b.updated_at
            ) ORDER BY b.effective_from DESC), '[]'::JSONB)
            FROM (
                SELECT * FROM public.class_timetable_bases
                WHERE class_id = p_class_id
                ORDER BY effective_from DESC
                LIMIT 20
            ) b
        )
    );
END;
$$;

-- ── 쓰기 ────────────────────────────────────────────────────────────────────

-- 기초 시간표 저장. 적용 시작 주(월요일)마다 한 판. 같은 주에 다시 저장하면 그 판을 고친다.
CREATE OR REPLACE FUNCTION public.save_teacher_class_timetable_base_v1(
    p_class_id UUID,
    p_effective_from DATE,
    p_grade SMALLINT,
    p_lunch_after SMALLINT,
    p_include_saturday BOOLEAN,
    p_cells JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
    v_from DATE;
BEGIN
    PERFORM public.class_timetable_assert_teacher(p_class_id);
    v_from := public.class_timetable_week_of(COALESCE(p_effective_from, v_today));
    IF v_from < public.class_timetable_week_of(v_today) - 400 OR v_from > public.class_timetable_week_of(v_today) + 400 THEN
        RAISE EXCEPTION '적용 시작 날짜가 허용 범위를 벗어났습니다.' USING ERRCODE = '22023';
    END IF;
    IF p_grade IS NULL OR p_grade NOT BETWEEN 1 AND 6 THEN
        RAISE EXCEPTION '학년은 1~6학년 중에서 골라 주세요.' USING ERRCODE = '22023';
    END IF;
    IF p_lunch_after IS NULL OR p_lunch_after NOT BETWEEN 1 AND 7 THEN
        RAISE EXCEPTION '점심시간은 1~7교시 뒤 중에서 골라 주세요.' USING ERRCODE = '22023';
    END IF;
    IF NOT public.class_timetable_cells_ok(p_cells) THEN
        RAISE EXCEPTION '시간표 칸 모양이 올바르지 않습니다(과목 20자·메모 30자까지).' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.class_timetable_bases AS base (
        class_id, effective_from, grade, lunch_after, include_saturday, cells, updated_by
    ) VALUES (
        p_class_id, v_from, p_grade, p_lunch_after, COALESCE(p_include_saturday, FALSE), p_cells, auth.uid()
    )
    ON CONFLICT (class_id, effective_from) DO UPDATE SET
            grade = EXCLUDED.grade,
            lunch_after = EXCLUDED.lunch_after,
            include_saturday = EXCLUDED.include_saturday,
            cells = EXCLUDED.cells,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW();

    RETURN jsonb_build_object(
        'version', 1,
        'base', (
            SELECT jsonb_build_object(
                'effectiveFrom', b.effective_from, 'grade', b.grade, 'lunchAfter', b.lunch_after,
                'includeSaturday', b.include_saturday, 'cells', b.cells, 'updatedAt', b.updated_at
            )
            FROM public.class_timetable_bases b
            WHERE b.class_id = p_class_id AND b.effective_from = v_from
        )
    );
END;
$$;

-- 그 주의 시간표 저장. p_cells 가 NULL 이면 그 주 기록을 지워 기초 시간표로 되돌린다.
-- 기초 시간표와 같아지면(바꾼 칸 0·점심·토요일 같음) 줄을 두지 않는다 — 기록에는 실제로 바꾼 주만 남는다.
CREATE OR REPLACE FUNCTION public.save_teacher_class_timetable_week_v1(
    p_class_id UUID,
    p_week_start DATE,
    p_cells JSONB,
    p_lunch_after SMALLINT DEFAULT NULL,
    p_include_saturday BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
    v_week DATE;
    v_base public.class_timetable_bases%ROWTYPE;
    v_lunch SMALLINT;
    v_saturday BOOLEAN;
    v_changed INTEGER;
BEGIN
    PERFORM public.class_timetable_assert_teacher(p_class_id);
    IF p_week_start IS NULL THEN
        RAISE EXCEPTION '어느 주의 시간표인지 알려 주세요.' USING ERRCODE = '22023';
    END IF;
    v_week := public.class_timetable_week_of(p_week_start);
    IF v_week < public.class_timetable_week_of(v_today) - 400 OR v_week > public.class_timetable_week_of(v_today) + 400 THEN
        RAISE EXCEPTION '시간표 날짜가 허용 범위를 벗어났습니다.' USING ERRCODE = '22023';
    END IF;

    IF p_cells IS NULL THEN
        DELETE FROM public.class_timetable_weeks w WHERE w.class_id = p_class_id AND w.week_start = v_week;
        RETURN jsonb_build_object('version', 1, 'week', public.class_timetable_resolve_week(p_class_id, v_week));
    END IF;

    IF NOT public.class_timetable_cells_ok(p_cells) THEN
        RAISE EXCEPTION '시간표 칸 모양이 올바르지 않습니다(과목 20자·메모 30자까지).' USING ERRCODE = '22023';
    END IF;

    SELECT b.* INTO v_base FROM public.class_timetable_bases b
    WHERE b.class_id = p_class_id AND b.effective_from <= v_week
    ORDER BY b.effective_from DESC
    LIMIT 1;

    v_lunch := COALESCE(p_lunch_after, v_base.lunch_after, 4);
    IF v_lunch NOT BETWEEN 1 AND 7 THEN
        RAISE EXCEPTION '점심시간은 1~7교시 뒤 중에서 골라 주세요.' USING ERRCODE = '22023';
    END IF;
    v_saturday := COALESCE(p_include_saturday, v_base.include_saturday, FALSE);
    v_changed := public.class_timetable_changed_cells(p_cells, v_base.cells);

    IF v_base.class_id IS NOT NULL AND v_changed = 0
       AND v_lunch = v_base.lunch_after AND v_saturday = v_base.include_saturday THEN
        DELETE FROM public.class_timetable_weeks w WHERE w.class_id = p_class_id AND w.week_start = v_week;
    ELSE
        INSERT INTO public.class_timetable_weeks AS week (
            class_id, week_start, lunch_after, include_saturday, cells, changed_cells, updated_by
        ) VALUES (
            p_class_id, v_week, v_lunch, v_saturday, p_cells, v_changed, auth.uid()
        )
        ON CONFLICT (class_id, week_start) DO UPDATE SET
                lunch_after = EXCLUDED.lunch_after,
                include_saturday = EXCLUDED.include_saturday,
                cells = EXCLUDED.cells,
                changed_cells = EXCLUDED.changed_cells,
                updated_by = EXCLUDED.updated_by,
                updated_at = NOW();
    END IF;

    RETURN jsonb_build_object('version', 1, 'week', public.class_timetable_resolve_week(p_class_id, v_week));
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_class_timetable_v1(UUID, DATE, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_teacher_class_timetable_log_v1(UUID, DATE, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_teacher_class_timetable_base_v1(UUID, DATE, SMALLINT, SMALLINT, BOOLEAN, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_teacher_class_timetable_week_v1(UUID, DATE, JSONB, SMALLINT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_class_timetable_v1(UUID, DATE, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_teacher_class_timetable_log_v1(UUID, DATE, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_teacher_class_timetable_base_v1(UUID, DATE, SMALLINT, SMALLINT, BOOLEAN, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_teacher_class_timetable_week_v1(UUID, DATE, JSONB, SMALLINT, BOOLEAN) TO authenticated, service_role;

COMMENT ON TABLE public.class_timetable_bases IS
    '학급 기초 시간표의 판(적용 시작 주마다 한 줄). 브라우저 직접 접근 없이 전용 RPC로만 읽고 쓴다.';
COMMENT ON TABLE public.class_timetable_weeks IS
    '그 주에만 바꾼 학급 시간표(주 월요일마다 한 줄, 기초와 같으면 두지 않음). 전용 RPC로만 읽고 쓴다.';

-- ── 우리 반 스크린 저장 검사: 시간표 위젯과 글상자 글씨 크기 ────────────────────────────
-- 20261234 의 validate_class_board_payload_v1 을 그대로 두고 두 가지만 더했다(손으로 옮겨 적지 않고 도구로 옮김).
--   1) 시간표 위젯(`timetable`): 둘까지, 보기(auto·today·tomorrow·week)·넘길 시각(11~17시)·색은 고른 값만.
--   2) 글상자 `sizeMode`·`sizeStep`(v1.16 에서 새로 생긴 칸): 고른 값만. 옛 검사기는 모르는 칸을 그냥 통과시켰다.
-- ⚠️ 화면(`widgets/timetable/manifest.js` 의 maxInstances, `textScale.js` 의 계단)과 여기 값이 같아야 한다.

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
    v_timetable_count INTEGER := 0;
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
        WHERE value ->> 'widgetId' IN ('meal-board', 'notice-board', 'arrangement-board', 'timetable')
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
            -- 자리표와 역할표를 나란히 띄울 수 있게 둘까지 받는다(2026-09-03). 종류가 둘뿐이다.
            IF v_arrangement_count > 2
               OR CHAR_LENGTH(COALESCE(v_config ->> 'heading', '')) > 80
               OR COALESCE(v_config ->> 'kind', '') NOT IN ('seat', 'role') THEN
                RAISE EXCEPTION '자리·역할 배치 위젯 설정이 올바르지 않습니다.' USING ERRCODE = '22023';
            END IF;
        ELSIF v_widget_id = 'timetable' THEN
            v_timetable_count := v_timetable_count + 1;
            -- 시간표 위젯(2026-09-29): 오늘·내일·이번 주를 나란히 띄울 수 있게 둘까지. 화면 manifest 의 maxInstances 와 같다.
            IF v_timetable_count > 2
               OR CHAR_LENGTH(COALESCE(v_config ->> 'heading', '')) > 80
               OR COALESCE(v_config ->> 'view', 'auto') NOT IN ('auto', 'today', 'tomorrow', 'week')
               OR (v_config ? 'switchHour' AND NOT (CASE
                    WHEN JSONB_TYPEOF(v_config -> 'switchHour') = 'number'
                    THEN (v_config ->> 'switchHour')::NUMERIC IN (11, 12, 13, 14, 15, 16, 17)
                    ELSE FALSE
               END))
               OR COALESCE(v_config ->> 'tone', 'sky') NOT IN ('sky', 'mint', 'yellow', 'paper') THEN
                RAISE EXCEPTION '시간표 위젯 설정이 올바르지 않습니다.' USING ERRCODE = '22023';
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


    -- 글상자 글씨 크기 방식·계단도 화면에서 고른 값만 저장한다(2026-09-29, textScale.js 의 CLASS_BOARD_TEXT_SIZE_STEPS 와 같게).
    FOR v_widget IN
        SELECT value
        FROM JSONB_ARRAY_ELEMENTS(COALESCE(p_widgets, '[]'::JSONB))
        WHERE value ->> 'widgetId' = 'text'
    LOOP
        v_config := COALESCE(v_widget -> 'config', '{}'::JSONB);
        IF (v_config ? 'sizeMode' AND COALESCE(v_config ->> 'sizeMode', '') NOT IN ('step', 'fill'))
           OR (v_config ? 'sizeStep' AND COALESCE(v_config ->> 'sizeStep', '') NOT IN ('small', 'medium', 'large', 'xlarge')) THEN
            RAISE EXCEPTION '텍스트 글씨 크기 설정이 올바르지 않습니다.' USING ERRCODE = '22023';
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
    WHERE value ->> 'widgetId' NOT IN ('meal-board', 'notice-board', 'arrangement-board', 'timetable');

    PERFORM public.validate_class_board_legacy_widgets(p_class_id, p_layout, v_legacy_widgets);
END;
$$;
REVOKE ALL ON FUNCTION public.validate_class_board_payload_v1(UUID, JSONB, JSONB)
    FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
