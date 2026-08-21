-- 한 학기 활동량에 맞춰 공방 가격·구매 단계를 조정하고,
-- 작가 10단계 + 독자 7단계 달성자에게 전설 장식 5종을 한 번에 지급한다.
-- 기존 구매자는 실제 결제액과 새 가격의 차액을 event_key 기준으로 한 번만 환급한다.

BEGIN;

ALTER TABLE public.dragon_decor_catalog
    ADD COLUMN IF NOT EXISTS required_reader_level SMALLINT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS acquisition_type TEXT NOT NULL DEFAULT 'shop';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.dragon_decor_catalog'::regclass
          AND conname = 'dragon_decor_catalog_reader_level_check'
    ) THEN
        ALTER TABLE public.dragon_decor_catalog
            ADD CONSTRAINT dragon_decor_catalog_reader_level_check
            CHECK (required_reader_level BETWEEN 1 AND 7);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.dragon_decor_catalog'::regclass
          AND conname = 'dragon_decor_catalog_acquisition_type_check'
    ) THEN
        ALTER TABLE public.dragon_decor_catalog
            ADD CONSTRAINT dragon_decor_catalog_acquisition_type_check
            CHECK (acquisition_type IN ('shop', 'achievement'));
    END IF;
END;
$$;

-- 가격과 구매 단계의 원본은 등급이다.
UPDATE public.dragon_decor_catalog
SET price = CASE rarity
        WHEN 'starter' THEN 300
        WHEN 'common' THEN 700
        WHEN 'rare' THEN 1500
        WHEN 'hero' THEN 3000
        WHEN 'legendary' THEN 0
        ELSE 0
    END,
    required_writer_level = CASE rarity
        WHEN 'starter' THEN 1
        WHEN 'common' THEN 3
        WHEN 'rare' THEN 5
        WHEN 'hero' THEN 7
        WHEN 'legendary' THEN 10
        ELSE 1
    END,
    required_reader_level = CASE WHEN rarity = 'legendary' THEN 7 ELSE 1 END,
    acquisition_type = CASE WHEN rarity = 'legendary' THEN 'achievement' ELSE 'shop' END;

-- 황금 프레임은 최초 도입 때 등급 열이 없어서 rarity가 NULL인 운영 데이터도 있다.
UPDATE public.dragon_decor_catalog
SET price = 0,
    rarity = 'legendary',
    required_writer_level = 10,
    required_reader_level = 7,
    acquisition_type = 'achievement'
WHERE id IN ('legend', 'left-royal-banner', 'right-golden-relic', 'nameplate-legend');

-- 전설 세트에서 비어 있던 받침대 슬롯을 채운다.
INSERT INTO public.dragon_decor_catalog (
    id, slot, name, price, required_writer_level, required_reader_level,
    acquisition_type, is_default, is_active, sort_order, rarity, theme
) VALUES (
    'pedestal-legend', 'pedestal', '황금 수호왕좌', 0, 10, 7,
    'achievement', false, true, 9, 'legendary', 'legend'
)
ON CONFLICT (id) DO UPDATE SET
    slot = EXCLUDED.slot,
    name = EXCLUDED.name,
    price = EXCLUDED.price,
    required_writer_level = EXCLUDED.required_writer_level,
    required_reader_level = EXCLUDED.required_reader_level,
    acquisition_type = EXCLUDED.acquisition_type,
    is_default = EXCLUDED.is_default,
    is_active = EXCLUDED.is_active,
    sort_order = EXCLUDED.sort_order,
    rarity = EXCLUDED.rarity,
    theme = EXCLUDED.theme;

-- 가격 인하 전에 구입한 학생에게 실제 결제액과 새 가격의 차액을 돌려준다.
-- 로그별 event_key를 사용하므로 마이그레이션을 다시 검사하거나 실행해도 중복되지 않는다.
DO $$
DECLARE
    v_purchase RECORD;
    v_new_price INTEGER;
    v_refund INTEGER;
BEGIN
    FOR v_purchase IN
        SELECT point_log.id, point_log.student_id, point_log.amount, catalog.id AS item_id, catalog.name AS item_name
        FROM public.point_logs point_log
        JOIN public.dragon_decor_catalog catalog
          ON point_log.reason = '아지트 공방 구매: ' || catalog.name
        JOIN public.students student ON student.id = point_log.student_id
        WHERE point_log.activity_type = 'hideout_purchase'
          AND point_log.amount < 0
          AND student.deleted_at IS NULL
    LOOP
        SELECT price INTO v_new_price
        FROM public.dragon_decor_catalog
        WHERE id = v_purchase.item_id;
        v_refund := GREATEST(0, -v_purchase.amount - COALESCE(v_new_price, 0));

        IF v_refund > 0 THEN
            PERFORM public.point_engine_apply(
                v_purchase.student_id,
                v_refund,
                '아지트 공방 가격 조정 환급: ' || v_purchase.item_name,
                'hideout_purchase',
                'hideout-economy-refund-20261154:' || v_purchase.id::TEXT,
                NULL,
                NULL,
                jsonb_build_object(
                    'source', 'dragon_workshop_economy_refund',
                    'item_id', v_purchase.item_id,
                    'purchase_log_id', v_purchase.id,
                    'previous_paid', -v_purchase.amount,
                    'new_price', v_new_price
                )
            );
        END IF;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.buy_my_dragon_decor(p_item_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_pet_data JSONB;
    v_item public.dragon_decor_catalog%ROWTYPE;
    v_owned_decor JSONB;
    v_owned_wallpapers JSONB;
    v_title_status JSONB;
    v_writer_level INTEGER := 1;
    v_reader_level INTEGER := 1;
    v_point_result JSONB;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_item
    FROM public.dragon_decor_catalog
    WHERE id = p_item_id AND is_active = true;
    IF NOT FOUND OR v_item.acquisition_type <> 'shop' OR v_item.is_default THEN
        RAISE EXCEPTION '공방에서 구입할 수 없는 장식입니다.' USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(student.pet_data, '{}'::JSONB)
    INTO v_pet_data
    FROM public.students student
    WHERE student.id = v_student_id
      AND student.is_active IS DISTINCT FROM false
      AND student.deleted_at IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION '학생 정보를 찾지 못했습니다.' USING ERRCODE = 'P0002';
    END IF;

    v_owned_decor := CASE
        WHEN jsonb_typeof(v_pet_data -> 'ownedDecorItems') = 'array' THEN v_pet_data -> 'ownedDecorItems'
        ELSE '[]'::JSONB
    END;
    v_owned_wallpapers := CASE
        WHEN jsonb_typeof(v_pet_data -> 'ownedItems') = 'array' THEN v_pet_data -> 'ownedItems'
        ELSE '[]'::JSONB
    END;
    IF v_owned_decor ? p_item_id OR (v_item.slot = 'wallpaper' AND v_owned_wallpapers ? p_item_id) THEN
        RETURN jsonb_build_object(
            'success', true, 'purchased', false,
            'new_points', (SELECT COALESCE(total_points, 0) FROM public.students WHERE id = v_student_id),
            'pet_data', v_pet_data
        );
    END IF;

    v_title_status := public.get_my_title_status();
    v_writer_level := public.dragon_writer_level(
        COALESCE((v_title_status ->> 'writer_total_chars')::BIGINT, 0),
        COALESCE((v_title_status ->> 'writer_completed_posts')::BIGINT, 0),
        NULLIF(v_title_status ->> 'writer_level_override', '')::INTEGER
    );
    v_reader_level := public.dragon_reader_level(
        COALESCE((v_title_status ->> 'reader_score')::BIGINT, 0),
        NULLIF(v_title_status ->> 'reader_level_override', '')::INTEGER
    );
    IF v_writer_level < v_item.required_writer_level THEN
        RAISE EXCEPTION '작가 %단계부터 살 수 있는 장식입니다.', v_item.required_writer_level USING ERRCODE = 'P0001';
    END IF;
    IF v_reader_level < v_item.required_reader_level THEN
        RAISE EXCEPTION '독자 %단계부터 살 수 있는 장식입니다.', v_item.required_reader_level USING ERRCODE = 'P0001';
    END IF;

    v_point_result := public.point_engine_apply(
        v_student_id,
        -v_item.price,
        '아지트 공방 구매: ' || v_item.name,
        'hideout_purchase',
        'hideout-purchase:' || v_item.id,
        NULL,
        NULL,
        jsonb_build_object('source', 'dragon_workshop', 'item_id', v_item.id)
    );

    v_owned_decor := v_owned_decor || to_jsonb(p_item_id);
    v_pet_data := jsonb_set(v_pet_data, '{ownedDecorItems}', v_owned_decor, true);
    IF v_item.slot = 'wallpaper' THEN
        v_owned_wallpapers := v_owned_wallpapers || to_jsonb(p_item_id);
        v_pet_data := jsonb_set(v_pet_data, '{ownedItems}', v_owned_wallpapers, true);
    END IF;

    PERFORM set_config('app.bypass_student_trigger', 'true', true);
    UPDATE public.students SET pet_data = v_pet_data WHERE id = v_student_id;
    PERFORM set_config('app.bypass_student_trigger', 'false', true);

    RETURN jsonb_build_object(
        'success', true, 'purchased', true,
        'new_points', (v_point_result ->> 'total_points')::INTEGER,
        'pet_data', v_pet_data
    );
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.bypass_student_trigger', 'false', true);
    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_my_dragon_legendary_decor_reward()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_pet_data JSONB;
    v_owned_decor JSONB;
    v_owned_wallpapers JSONB;
    v_equipped JSONB;
    v_title_status JSONB;
    v_writer_level INTEGER := 1;
    v_reader_level INTEGER := 1;
    v_item_id TEXT;
    v_already_claimed BOOLEAN := false;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(student.pet_data, '{}'::JSONB)
    INTO v_pet_data
    FROM public.students student
    WHERE student.id = v_student_id
      AND student.is_active IS DISTINCT FROM false
      AND student.deleted_at IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION '학생 정보를 찾지 못했습니다.' USING ERRCODE = 'P0002';
    END IF;
    v_already_claimed := v_pet_data ? 'legendaryDecorRewardClaimedAt';

    v_title_status := public.get_my_title_status();
    v_writer_level := public.dragon_writer_level(
        COALESCE((v_title_status ->> 'writer_total_chars')::BIGINT, 0),
        COALESCE((v_title_status ->> 'writer_completed_posts')::BIGINT, 0),
        NULLIF(v_title_status ->> 'writer_level_override', '')::INTEGER
    );
    v_reader_level := public.dragon_reader_level(
        COALESCE((v_title_status ->> 'reader_score')::BIGINT, 0),
        NULLIF(v_title_status ->> 'reader_level_override', '')::INTEGER
    );
    IF v_writer_level < 10 OR v_reader_level < 7 THEN
        RAISE EXCEPTION '작가 10단계와 독자 7단계를 모두 달성하면 열 수 있어요.' USING ERRCODE = 'P0001';
    END IF;

    v_owned_decor := CASE
        WHEN jsonb_typeof(v_pet_data -> 'ownedDecorItems') = 'array' THEN v_pet_data -> 'ownedDecorItems'
        ELSE '[]'::JSONB
    END;
    v_owned_wallpapers := CASE
        WHEN jsonb_typeof(v_pet_data -> 'ownedItems') = 'array' THEN v_pet_data -> 'ownedItems'
        ELSE '[]'::JSONB
    END;
    v_equipped := CASE
        WHEN jsonb_typeof(v_pet_data -> 'equippedDecor') = 'object' THEN v_pet_data -> 'equippedDecor'
        ELSE '{}'::JSONB
    END;

    FOREACH v_item_id IN ARRAY ARRAY[
        'legend', 'pedestal-legend', 'left-royal-banner', 'right-golden-relic', 'nameplate-legend'
    ]
    LOOP
        IF NOT v_owned_decor ? v_item_id THEN
            v_owned_decor := v_owned_decor || to_jsonb(v_item_id);
        END IF;
    END LOOP;
    IF NOT v_owned_wallpapers ? 'legend' THEN
        v_owned_wallpapers := v_owned_wallpapers || to_jsonb('legend'::TEXT);
    END IF;

    v_equipped := v_equipped || jsonb_build_object(
        'wallpaper', 'legend',
        'pedestal', 'pedestal-legend',
        'leftProp', 'left-royal-banner',
        'rightProp', 'right-golden-relic',
        'nameplate', 'nameplate-legend'
    );
    v_pet_data := jsonb_set(v_pet_data, '{ownedDecorItems}', v_owned_decor, true);
    v_pet_data := jsonb_set(v_pet_data, '{ownedItems}', v_owned_wallpapers, true);
    v_pet_data := jsonb_set(v_pet_data, '{equippedDecor}', v_equipped, true);
    v_pet_data := jsonb_set(v_pet_data, '{background}', to_jsonb('legend'::TEXT), true);
    IF NOT (v_pet_data ? 'legendaryDecorRewardClaimedAt') THEN
        v_pet_data := jsonb_set(v_pet_data, '{legendaryDecorRewardClaimedAt}', to_jsonb(clock_timestamp()), true);
    END IF;

    PERFORM set_config('app.bypass_student_trigger', 'true', true);
    UPDATE public.students SET pet_data = v_pet_data WHERE id = v_student_id;
    PERFORM set_config('app.bypass_student_trigger', 'false', true);

    RETURN jsonb_build_object(
        'success', true,
        'already_claimed', v_already_claimed,
        'writer_level', v_writer_level,
        'reader_level', v_reader_level,
        'pet_data', v_pet_data
    );
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.bypass_student_trigger', 'false', true);
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_my_dragon_legendary_decor_reward() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_my_dragon_legendary_decor_reward() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
