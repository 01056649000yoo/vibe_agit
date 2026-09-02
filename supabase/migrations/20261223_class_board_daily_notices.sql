-- 우리 반 스크린 알림장을 날짜별로 저장한다.
--
-- 지금까지 알림 내용은 보드 JSON의 위젯 config 안에 있었다. 그래서 오늘 알림을 쓰면
-- 어제 알림이 사라졌고, 지난 알림을 다시 볼 방법이 없었다. 내용만 학급+날짜 표로 옮기고
-- 제목·색 같은 꾸밈은 그대로 위젯 config에 남긴다.
--
-- 저장은 보드 revision과 무관한 별도 RPC다. 교사가 알림만 고칠 때 화면 배치를 건드리지 않고,
-- 발표 화면에서도 보드 저장 없이 바로 쓸 수 있게 하기 위해서다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.class_board_notices (
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    notice_date DATE NOT NULL,
    body TEXT NOT NULL CHECK (CHAR_LENGTH(body) BETWEEN 1 AND 2000),
    updated_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (class_id, notice_date)
);

-- 기본 키가 (class_id, notice_date) 이므로 최근 날짜 역순 조회도 같은 인덱스를 거꾸로 읽는다.
-- 별도 인덱스를 만들지 않는다.

ALTER TABLE public.class_board_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.class_board_notices FROM PUBLIC, anon, authenticated;

-- 알림장을 여는 화면은 이 함수 하나만 부른다. 오늘 알림과 최근 날짜 목록을 함께 돌려주어
-- 날짜 목록을 따로 조회하지 않게 한다.
CREATE OR REPLACE FUNCTION public.get_teacher_class_board_notices_v1(
    p_class_id UUID,
    p_date DATE DEFAULT NULL,
    p_limit INTEGER DEFAULT 14
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
    v_date DATE := COALESCE(p_date, v_today);
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 14), 1), 30);
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.classes class
        WHERE class.id = p_class_id
          AND class.deleted_at IS NULL
          AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN')
    ) THEN
        RAISE EXCEPTION '담당 학급의 알림장만 확인할 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    RETURN JSONB_BUILD_OBJECT(
        'version', 1,
        'today', v_today,
        'date', v_date,
        'notice', (
            SELECT JSONB_BUILD_OBJECT(
                'date', notice.notice_date,
                'body', notice.body,
                'updatedAt', notice.updated_at
            )
            FROM public.class_board_notices notice
            WHERE notice.class_id = p_class_id
              AND notice.notice_date = v_date
        ),
        'recent', COALESCE((
            SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
                'date', recent.notice_date,
                'preview', LEFT(recent.body, 40)
            ) ORDER BY recent.notice_date DESC)
            FROM (
                SELECT notice.notice_date, notice.body
                FROM public.class_board_notices notice
                WHERE notice.class_id = p_class_id
                ORDER BY notice.notice_date DESC
                LIMIT v_limit
            ) recent
        ), '[]'::JSONB)
    );
END;
$$;

-- 저장과 지우기를 한 함수로 둔다. 빈 내용으로 저장하면 그 날짜의 알림을 지운다.
CREATE OR REPLACE FUNCTION public.save_teacher_class_board_notice_v1(
    p_class_id UUID,
    p_date DATE,
    p_body TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
    v_date DATE := COALESCE(p_date, v_today);
    v_body TEXT := BTRIM(COALESCE(p_body, ''));
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.classes class
        WHERE class.id = p_class_id
          AND class.deleted_at IS NULL
          AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN')
    ) THEN
        RAISE EXCEPTION '담당 학급의 알림장만 저장할 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    -- 오래된 날짜나 먼 미래로 기록이 새는 것을 막는다. 지난 학기 보정과 다음 주 예고까지는 허용한다.
    IF v_date < v_today - 365 OR v_date > v_today + 365 THEN
        RAISE EXCEPTION '알림장 날짜가 허용 범위를 벗어났습니다.' USING ERRCODE = '22023';
    END IF;

    IF CHAR_LENGTH(v_body) > 2000 THEN
        RAISE EXCEPTION '알림 내용은 2,000자까지 저장할 수 있습니다.' USING ERRCODE = '22023';
    END IF;

    IF v_body = '' THEN
        DELETE FROM public.class_board_notices notice
        WHERE notice.class_id = p_class_id
          AND notice.notice_date = v_date;
        RETURN JSONB_BUILD_OBJECT('version', 1, 'date', v_date, 'notice', NULL);
    END IF;

    INSERT INTO public.class_board_notices AS notice (class_id, notice_date, body, updated_by)
    VALUES (p_class_id, v_date, v_body, auth.uid())
    ON CONFLICT (class_id, notice_date) DO UPDATE
        SET body = EXCLUDED.body,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW();

    RETURN JSONB_BUILD_OBJECT(
        'version', 1,
        'date', v_date,
        'notice', (
            SELECT JSONB_BUILD_OBJECT(
                'date', saved.notice_date,
                'body', saved.body,
                'updatedAt', saved.updated_at
            )
            FROM public.class_board_notices saved
            WHERE saved.class_id = p_class_id
              AND saved.notice_date = v_date
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_class_board_notices_v1(UUID, DATE, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_class_board_notices_v1(UUID, DATE, INTEGER) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_teacher_class_board_notice_v1(UUID, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_teacher_class_board_notice_v1(UUID, DATE, TEXT) TO authenticated, service_role;

COMMENT ON TABLE public.class_board_notices IS
    '우리 반 스크린 알림장의 학급별·날짜별 내용. 브라우저 직접 접근 없이 전용 RPC로만 읽고 쓴다.';

NOTIFY pgrst, 'reload schema';

COMMIT;
