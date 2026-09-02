-- 알림장을 위젯 없이도 학급 기록으로 볼 수 있게 날짜 목록 조회를 더한다.
--
-- 기존 `get_teacher_class_board_notices_v1`은 화면을 열 때 쓰는 것이라 한 날짜와 최근 30개만 준다.
-- 한 학기 알림을 되짚으려면 더 뒤로 갈 수 있어야 하므로 날짜 커서로 넘기는 목록 함수를 따로 둔다.
-- 목록은 미리보기 120자까지만 담고, 실제 내용은 날짜를 고를 때 기존 함수로 한 건만 읽는다.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_teacher_class_board_notice_log_v1(
    p_class_id UUID,
    p_before DATE DEFAULT NULL,
    p_limit INTEGER DEFAULT 40
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 40), 1), 40);
    v_rows JSONB;
    v_count INTEGER;
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.classes class
        WHERE class.id = p_class_id
          AND class.deleted_at IS NULL
          AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN')
    ) THEN
        RAISE EXCEPTION '담당 학급의 알림장만 확인할 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    -- 한 줄을 더 읽어 다음 쪽이 있는지 판단하고, 그 한 줄은 결과에서 뺀다.
    SELECT COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT(
               'date', page.notice_date,
               'preview', LEFT(page.body, 120),
               'updatedAt', page.updated_at
           ) ORDER BY page.notice_date DESC), '[]'::JSONB),
           COUNT(*)
      INTO v_rows, v_count
    FROM (
        SELECT notice.notice_date, notice.body, notice.updated_at
        FROM public.class_board_notices notice
        WHERE notice.class_id = p_class_id
          AND (p_before IS NULL OR notice.notice_date < p_before)
        ORDER BY notice.notice_date DESC
        LIMIT v_limit + 1
    ) page;

    IF v_count > v_limit THEN
        v_rows := v_rows - (v_limit);
    END IF;

    RETURN JSONB_BUILD_OBJECT(
        'version', 1,
        'today', v_today,
        'notices', v_rows,
        'nextCursor', CASE
            WHEN v_count > v_limit THEN v_rows -> (v_limit - 1) ->> 'date'
            ELSE NULL
        END
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_class_board_notice_log_v1(UUID, DATE, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_class_board_notice_log_v1(UUID, DATE, INTEGER) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_teacher_class_board_notice_log_v1(UUID, DATE, INTEGER) IS
    '담당 학급 알림장의 날짜 목록을 최신순 40개씩 날짜 커서로 넘겨 준다. 내용은 미리보기 120자까지만 담는다.';

NOTIFY pgrst, 'reload schema';

COMMIT;
