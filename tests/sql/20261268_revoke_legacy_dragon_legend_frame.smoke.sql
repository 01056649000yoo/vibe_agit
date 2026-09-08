-- 바깥 마이그레이션 검사 트랜잭션이 마지막에 모두 롤백한다.

DO $$
DECLARE
    v_legacy_count INTEGER;
    v_marked_reward_count INTEGER;
BEGIN
    SELECT count(*) INTO v_legacy_count
    FROM public.students student
    WHERE student.deleted_at IS NULL
      AND NOT (COALESCE(student.pet_data, '{}'::JSONB) ? 'legendaryDecorRewardClaimedAt')
      AND (
          COALESCE(student.pet_data -> 'ownedItems', '[]'::JSONB) ? 'legend'
          OR COALESCE(student.pet_data -> 'ownedDecorItems', '[]'::JSONB) ? 'legend'
          OR student.pet_data #>> '{equippedDecor,wallpaper}' = 'legend'
          OR student.pet_data ->> 'background' = 'legend'
      );

    IF v_legacy_count <> 0 THEN
        RAISE EXCEPTION '옛 전설 프레임이 %명에게 남았습니다.', v_legacy_count;
    END IF;

    SELECT count(*) INTO v_marked_reward_count
    FROM public.students student
    WHERE student.deleted_at IS NULL
      AND student.pet_data ? 'legendaryDecorRewardClaimedAt'
      AND COALESCE(student.pet_data -> 'ownedItems', '[]'::JSONB) ? 'legend';

    -- 현재 운영에는 새 보상 수령자가 없지만, 이후 생긴 정당한 보상은 같은 정리로 회수하면 안 된다.
    IF EXISTS (
        SELECT 1
        FROM public.students student
        WHERE student.deleted_at IS NULL
          AND student.pet_data ? 'legendaryDecorRewardClaimedAt'
          AND NOT (COALESCE(student.pet_data -> 'ownedItems', '[]'::JSONB) ? 'legend')
    ) THEN
        RAISE EXCEPTION '새 전설 보상 수령자의 프레임 소유권이 사라졌습니다.';
    END IF;
END;
$$;
