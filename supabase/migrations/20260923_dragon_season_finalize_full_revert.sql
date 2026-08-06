-- `되돌리기`가 `작별 편지 기간(closing)`이 아니라 **`시즌 종료를 누르기 전(active, 학기 성장 중)`**
-- 으로 완전히 돌아가도록 바꾼다(사용자 결정).
--
-- 이전 버전(`20260922`)은 `closed → closing` 한 단계만 되돌렸다. 그런데 사용자는 `시즌 종료`를 잘못
-- 눌렀을 때 `작별 편지를 다시 여는 상태`가 아니라 **아예 작별 기간을 열기 전, 평소처럼 성장하던 상태**로
-- 돌아가길 원한다. 그래서 이 함수는 이제 `closed → active` 로 한 번에 되돌린다.
--
-- 학생이 이미 쓴 작별 편지(`dragon_season_students.farewell_content`)는 지우지 않는다. 나중에 교사가
-- 다시 작별 기간을 열면 `open_teacher_dragon_season_closing` 이 스냅샷만 새로 찍고 편지 내용은 그대로
-- 이어 쓸 수 있게 둔다(그 함수는 `snapshot` 만 갱신하고 `farewell_content`/`farewell_status` 는 건드리지 않는다).
--
-- 안전장치는 그대로다: 이 시즌보다 번호가 큰 시즌이 이미 있으면(=새 학기를 이미 시작했으면) 거절한다.

BEGIN;

CREATE OR REPLACE FUNCTION public.cancel_teacher_dragon_season_finalize(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_season public.dragon_growth_seasons%ROWTYPE;
BEGIN
    PERFORM 1 FROM public.classes c
    WHERE c.id = p_class_id AND auth.uid() IS NOT NULL
      AND (public.auth_user_role() = 'ADMIN' OR c.teacher_id = auth.uid())
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION '이 학급의 시즌을 관리할 권한이 없습니다.' USING ERRCODE = '42501'; END IF;

    SELECT season.* INTO v_season FROM public.dragon_growth_seasons season
    WHERE season.class_id = p_class_id AND season.status = 'closed'
    ORDER BY season.season_number DESC LIMIT 1 FOR UPDATE;
    IF v_season.id IS NULL THEN
        RAISE EXCEPTION '되돌릴 종료된 시즌이 없습니다.' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.dragon_growth_seasons other
        WHERE other.class_id = p_class_id AND other.season_number > v_season.season_number
    ) THEN
        RAISE EXCEPTION '이미 새 학기를 시작해서 되돌릴 수 없습니다.' USING ERRCODE = '22023';
    END IF;

    -- 작별 기간을 연 적 없던 `학기 성장 중` 상태로 완전히 되돌린다.
    -- 대시보드는 status='active' 면 동결 스냅샷이 아니라 실시간 값을 다시 사용한다.
    UPDATE public.dragon_growth_seasons
    SET status = 'active',
        closing_started_at = NULL,
        ended_at = NULL,
        closed_at = NULL,
        farewell_deadline = NULL,
        snapshot = '{}'::JSONB
    WHERE id = v_season.id;

    RETURN jsonb_build_object(
        'season_id', v_season.id,
        'season_number', v_season.season_number,
        'season_name', v_season.name,
        'status', 'active'
    );
END;
$$;

COMMENT ON FUNCTION public.cancel_teacher_dragon_season_finalize(UUID) IS
    '`시즌 종료`를 잘못 눌렀을 때 되돌린다. 작별 편지 기간이 아니라 종료 이전 `학기 성장 중` 상태로
    완전히 돌아간다. 새 학기를 이미 시작했으면(더 큰 season_number 존재) 거절한다.';

NOTIFY pgrst, 'reload schema';

COMMIT;
