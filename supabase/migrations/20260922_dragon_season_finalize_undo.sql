-- `시즌 종료`를 잘못 눌렀을 때 되돌린다.
--
-- 종료(finalize)는 `closing → closed` 로 상태를 바꿀 뿐, `start_teacher_dragon_season` 이
-- 하는 pet_data 초기화(종·교감·성장 확인 키 제거)는 하지 않는다. 그래서 **새 학기를 아직 시작하지
-- 않았다면** 되돌려도 학생 데이터에 아무 영향이 없다 — 시즌 표의 상태만 `closing` 으로 되짚는다.
--
-- 안전장치: 이 시즌보다 번호가 큰 시즌이 이미 있으면(=이미 새 학기를 시작했으면) 되돌리지 않는다.
-- 그 뒤로는 pet_data 가 이미 초기화됐을 수 있어 시즌 상태만 되돌리는 것으로는 앞뒤가 안 맞는다.

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

    UPDATE public.dragon_growth_seasons
    SET status = 'closing',
        ended_at = NULL,
        closed_at = NULL,
        -- finalize 가 병합해 둔 완료 인원 집계만 걷어낸다. 작별 편지 스냅샷(students/totals)은 그대로 둔다.
        snapshot = (snapshot - 'farewell_completed' - 'farewell_total')
    WHERE id = v_season.id;

    RETURN jsonb_build_object(
        'season_id', v_season.id,
        'season_number', v_season.season_number,
        'season_name', v_season.name,
        'status', 'closing'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_teacher_dragon_season_finalize(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_teacher_dragon_season_finalize(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
