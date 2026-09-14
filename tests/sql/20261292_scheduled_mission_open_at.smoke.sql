-- 바깥 실행기가 전체 트랜잭션을 롤백하므로 운영 과제는 실제로 만들어지지 않는다.
-- 예약 공개가 지켜야 할 네 가지를 실제 스키마에서 확인한다.

-- 시험에 쓸 실제 학급 하나를 고른다(교사가 있는 살아 있는 학급).
SELECT set_config('test.class_id', candidate.id::TEXT, true),
       set_config('test.teacher_id', candidate.teacher_id::TEXT, true)
FROM (
    SELECT class.id, class.teacher_id
    FROM public.classes class
    WHERE class.deleted_at IS NULL AND class.teacher_id IS NOT NULL
    ORDER BY class.created_at DESC
    LIMIT 1
) candidate;

DO $$
DECLARE
    v_class UUID := NULLIF(current_setting('test.class_id', true), '')::UUID;
    v_teacher UUID := NULLIF(current_setting('test.teacher_id', true), '')::UUID;
    v_future UUID;
    v_past UUID;
    v_opened INTEGER;
    v_blocked BOOLEAN := FALSE;
BEGIN
    IF v_class IS NULL THEN
        RAISE EXCEPTION '예약 공개 스모크에 쓸 학급이 없습니다.';
    END IF;

    -- [1] 예약 과제 두 개를 만든다: 아직 멀었던 것과 이미 때가 된 것.
    INSERT INTO public.writing_missions (title, class_id, teacher_id, is_archived, archived_at, open_at)
    VALUES ('스모크-미래예약', v_class, v_teacher, TRUE, NULL, NOW() + INTERVAL '1 day')
    RETURNING id INTO v_future;

    INSERT INTO public.writing_missions (title, class_id, teacher_id, is_archived, archived_at, open_at)
    VALUES ('스모크-지난예약', v_class, v_teacher, TRUE, NULL, NOW() - INTERVAL '1 minute')
    RETURNING id INTO v_past;

    -- [2] 학생 쪽 목록이 쓰는 조건(is_archived IS FALSE)에 둘 다 걸리지 않아야 한다.
    --     이게 깨지면 아직 열지 않은 과제가 학생에게 보인다.
    IF EXISTS (
        SELECT 1 FROM public.writing_missions
        WHERE id IN (v_future, v_past) AND is_archived IS FALSE
    ) THEN
        RAISE EXCEPTION '예약 과제가 학생에게 보이는 상태로 만들어졌습니다.';
    END IF;

    -- [3] "예약됐는데 보이는" 상태는 DB 가 아예 막아야 한다.
    BEGIN
        UPDATE public.writing_missions SET is_archived = FALSE WHERE id = v_future;
    EXCEPTION WHEN check_violation THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION '예약 상태인데 학생에게 보이게 바꿀 수 있습니다(제약이 없습니다).';
    END IF;

    -- [4] 때가 된 것만 열린다. 아직 멀었던 것은 그대로 예약으로 남는다.
    v_opened := public.open_due_scheduled_missions_v1();
    IF v_opened < 1 THEN
        RAISE EXCEPTION '때가 된 예약 과제가 열리지 않았습니다.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.writing_missions
        WHERE id = v_past AND is_archived IS FALSE AND open_at IS NULL
    ) THEN
        RAISE EXCEPTION '열린 과제가 진행 중 상태(보임·예약해제)가 아닙니다.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.writing_missions
        WHERE id = v_future AND is_archived IS TRUE AND open_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION '아직 때가 안 된 예약 과제까지 열렸습니다.';
    END IF;

    -- [5] 예약과 보관은 archived_at 으로 구분된다. 교사 화면이 이 값으로 나눈다.
    IF EXISTS (
        SELECT 1 FROM public.writing_missions
        WHERE open_at IS NOT NULL AND archived_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION '예약과 보관이 한 과제에 섞여 있습니다.';
    END IF;
END;
$$;

-- [6] 교사 목록은 예약 과제를 함께 실어야 한다(학생 목록은 그대로 숨긴다).
DO $$
DECLARE
    v_def TEXT := pg_get_functiondef('public.get_teacher_mission_overview_v1(uuid,integer)'::regprocedure);
BEGIN
    IF v_def NOT LIKE '%is_archived IS FALSE OR mission.open_at IS NOT NULL%' THEN
        RAISE EXCEPTION '교사 과제 목록이 예약 과제를 싣지 않습니다.';
    END IF;
    IF v_def NOT LIKE '%mission.open_at%' THEN
        RAISE EXCEPTION '교사 과제 목록이 예약 시각을 돌려주지 않습니다.';
    END IF;
END;
$$;

-- [7] 학생이 표를 직접 읽어도 예약 과제는 걸러져야 한다.
DO $$
DECLARE
    v_using TEXT;
BEGIN
    SELECT qual INTO v_using
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'writing_missions' AND cmd = 'SELECT';
    IF v_using IS NULL OR v_using NOT LIKE '%open_at IS NULL%' THEN
        RAISE EXCEPTION '학생 직접 조회에서 예약 과제가 걸러지지 않습니다.';
    END IF;
END;
$$;
