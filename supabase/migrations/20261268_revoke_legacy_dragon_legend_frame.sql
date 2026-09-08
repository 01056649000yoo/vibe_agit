-- 예전 5단계 수호룡에서 무료로 받은 전설 프레임은 새 10단계 전설 세트의
-- 보상 조건과 맞지 않는다. 새 보상 수령 표식이 없는 옛 프레임만 회수한다.
-- 다른 구매 장식·포인트는 보존하고, 장착 중인 프레임만 기본값으로 돌린다.

BEGIN;

SELECT set_config('app.bypass_student_trigger', 'true', true);

UPDATE public.students
SET pet_data = jsonb_set(
        jsonb_set(
            jsonb_set(
                jsonb_set(
                    COALESCE(pet_data, '{}'::JSONB),
                    '{ownedItems}',
                    CASE
                        WHEN jsonb_typeof(pet_data -> 'ownedItems') = 'array'
                            THEN (pet_data -> 'ownedItems') - 'legend'
                        ELSE '[]'::JSONB
                    END,
                    true
                ),
                '{ownedDecorItems}',
                CASE
                    WHEN jsonb_typeof(pet_data -> 'ownedDecorItems') = 'array'
                        THEN (pet_data -> 'ownedDecorItems') - 'legend'
                    ELSE '[]'::JSONB
                END,
                true
            ),
            '{equippedDecor,wallpaper}',
            to_jsonb(CASE
                WHEN pet_data #>> '{equippedDecor,wallpaper}' = 'legend' THEN 'default'
                ELSE COALESCE(NULLIF(pet_data #>> '{equippedDecor,wallpaper}', ''), 'default')
            END),
            true
        ),
        '{background}',
        to_jsonb(CASE
            WHEN pet_data ->> 'background' = 'legend' THEN 'default'
            ELSE COALESCE(NULLIF(pet_data ->> 'background', ''), 'default')
        END),
        true
    )
WHERE deleted_at IS NULL
  AND NOT (COALESCE(pet_data, '{}'::JSONB) ? 'legendaryDecorRewardClaimedAt')
  AND (
      COALESCE(pet_data -> 'ownedItems', '[]'::JSONB) ? 'legend'
      OR COALESCE(pet_data -> 'ownedDecorItems', '[]'::JSONB) ? 'legend'
      OR pet_data #>> '{equippedDecor,wallpaper}' = 'legend'
      OR pet_data ->> 'background' = 'legend'
  );

SELECT set_config('app.bypass_student_trigger', 'false', true);

COMMIT;
