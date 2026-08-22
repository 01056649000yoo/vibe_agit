-- migrate:check가 만든 바깥 트랜잭션에서 실행되며 마지막에 전부 롤백된다.
-- 층당 진도 보상 총액에서 위쪽 상한(500P)이 실제로 사라졌는지 확인한다.

-- 1) 보정 원본 함수: NULL은 기본 100P, 음수는 0P, 500P 초과는 그대로 통과한다.
DO $$
DECLARE
    v_value INTEGER;
BEGIN
    SELECT public.vocab_tower_v2_floor_reward_points_v1(NULL) INTO v_value;
    IF v_value <> 100 THEN
        RAISE EXCEPTION '설정이 비었을 때 기본 100P가 아닙니다: %', v_value;
    END IF;

    SELECT public.vocab_tower_v2_floor_reward_points_v1(-50) INTO v_value;
    IF v_value <> 0 THEN
        RAISE EXCEPTION '음수 설정이 0P로 보정되지 않았습니다: %', v_value;
    END IF;

    SELECT public.vocab_tower_v2_floor_reward_points_v1(3000) INTO v_value;
    IF v_value <> 3000 THEN
        RAISE EXCEPTION '500P를 넘는 설정이 깎였습니다: %', v_value;
    END IF;
END;
$$;

-- 2) 구간 분배: 500P를 넘겨도 20·20·30·30% 배분과 총액이 정확히 유지된다.
DO $$
DECLARE
    v_sum INTEGER;
    v_first INTEGER;
    v_last INTEGER;
BEGIN
    SELECT SUM(reward_points) INTO v_sum
    FROM public.vocab_tower_v2_progress_milestones_v1(40, 3000);
    IF v_sum <> 3000 THEN
        RAISE EXCEPTION '층 총액 3000P의 구간 합계가 다릅니다: %', v_sum;
    END IF;

    SELECT reward_points INTO v_first
    FROM public.vocab_tower_v2_progress_milestones_v1(40, 3000)
    WHERE milestone_percent = 25;
    SELECT reward_points INTO v_last
    FROM public.vocab_tower_v2_progress_milestones_v1(40, 3000)
    WHERE milestone_percent = 100;
    IF v_first <> 600 OR v_last <> 900 THEN
        RAISE EXCEPTION '구간 배분이 20·20·30·30%%이 아닙니다: 25%%=%, 100%%=%', v_first, v_last;
    END IF;

    -- 0P는 보상을 끄는 값이라 모든 구간이 0P여야 한다.
    SELECT SUM(reward_points) INTO v_sum
    FROM public.vocab_tower_v2_progress_milestones_v1(40, 0);
    IF v_sum <> 0 THEN
        RAISE EXCEPTION '0P 설정에서 보상이 생겼습니다: %', v_sum;
    END IF;
END;
$$;

-- 3) 학급 설정 CHECK: 500P 초과는 저장되고 음수만 거부된다.
DO $$
DECLARE
    v_class_id UUID;
    v_saved INTEGER;
    v_rejected BOOLEAN := FALSE;
BEGIN
    SELECT id INTO v_class_id
    FROM public.classes
    WHERE deleted_at IS NULL
    ORDER BY created_at
    LIMIT 1;
    IF v_class_id IS NULL THEN
        RAISE EXCEPTION '검증에 쓸 학급이 없습니다.';
    END IF;

    UPDATE public.classes
       SET vocab_tower_v2_perfect_reward_points = 2500
     WHERE id = v_class_id;
    SELECT vocab_tower_v2_perfect_reward_points INTO v_saved
    FROM public.classes WHERE id = v_class_id;
    IF v_saved <> 2500 THEN
        RAISE EXCEPTION '2500P 설정이 저장되지 않았습니다: %', v_saved;
    END IF;

    BEGIN
        UPDATE public.classes
           SET vocab_tower_v2_perfect_reward_points = -1
         WHERE id = v_class_id;
    EXCEPTION WHEN check_violation THEN
        v_rejected := TRUE;
    END;
    IF NOT v_rejected THEN
        RAISE EXCEPTION '음수 설정이 거부되지 않았습니다.';
    END IF;
END;
$$;

-- 4) 남은 제약 확인: 두 CHECK 모두 위쪽 상한 없이 음수만 막는다.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.vocab_tower_runs'::regclass
          AND conname = 'vocab_tower_runs_reward_points_check'
          AND pg_get_constraintdef(oid) LIKE '%500%'
    ) THEN
        RAISE EXCEPTION '실행 기록에 500P 상한이 남아 있습니다.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.classes'::regclass
          AND conname = 'classes_vocab_tower_v2_perfect_reward_points_check'
          AND pg_get_constraintdef(oid) LIKE '%>= 0%'
          AND pg_get_constraintdef(oid) NOT LIKE '%500%'
    ) THEN
        RAISE EXCEPTION '학급 설정 CHECK가 0 이상 조건 하나가 아닙니다.';
    END IF;
END;
$$;
