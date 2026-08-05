-- 아지트 공방 5개 고정 슬롯과 서버 검증 구매·장착 RPC.
-- 기존 pet_data.ownedItems/background은 벽지 소유·장착 값으로 계속 인정한다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.dragon_decor_catalog (
    id TEXT PRIMARY KEY,
    slot TEXT NOT NULL CHECK (slot IN ('wallpaper', 'pedestal', 'leftProp', 'rightProp', 'nameplate')),
    name TEXT NOT NULL,
    price INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),
    required_writer_level SMALLINT NOT NULL DEFAULT 1 CHECK (required_writer_level BETWEEN 1 AND 10),
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.dragon_decor_catalog ENABLE ROW LEVEL SECURITY;

INSERT INTO public.dragon_decor_catalog (
    id, slot, name, price, required_writer_level, is_default, sort_order
) VALUES
    ('default', 'wallpaper', '기본 초원', 0, 1, true, 0),
    ('volcano', 'wallpaper', '화산 동굴', 300, 1, false, 1),
    ('sky', 'wallpaper', '천상 전당', 500, 1, false, 2),
    ('crystal', 'wallpaper', '수정 궁전', 1000, 1, false, 3),
    ('storm', 'wallpaper', '번개 폭풍', 700, 1, false, 4),
    ('galaxy', 'wallpaper', '달빛 은하수', 500, 1, false, 5),
    ('legend', 'wallpaper', '천상의 황금성소', 0, 10, false, 6),
    ('pedestal-stone', 'pedestal', '다듬은 돌', 0, 1, true, 0),
    ('pedestal-oak', 'pedestal', '참나무 단상', 180, 1, false, 1),
    ('pedestal-cloud', 'pedestal', '구름 받침', 320, 1, false, 2),
    ('pedestal-crystal', 'pedestal', '수정 받침', 480, 1, false, 3),
    ('left-none', 'leftProp', '비워 두기', 0, 1, true, 0),
    ('left-bookshelf', 'leftProp', '작은 책장', 220, 1, false, 1),
    ('left-plant', 'leftProp', '초록 화분', 160, 1, false, 2),
    ('left-lantern', 'leftProp', '이야기 등불', 260, 1, false, 3),
    ('right-none', 'rightProp', '비워 두기', 0, 1, true, 0),
    ('right-desk', 'rightProp', '작가의 책상', 260, 1, false, 1),
    ('right-telescope', 'rightProp', '별빛 망원경', 360, 1, false, 2),
    ('right-chest', 'rightProp', '보물 상자', 420, 1, false, 3),
    ('nameplate-simple', 'nameplate', '기본 문패', 0, 1, true, 0),
    ('nameplate-oak', 'nameplate', '참나무 문패', 120, 1, false, 1),
    ('nameplate-brass', 'nameplate', '황동 문패', 220, 1, false, 2),
    ('nameplate-crystal', 'nameplate', '수정 문패', 360, 1, false, 3)
ON CONFLICT (id) DO UPDATE SET
    slot = EXCLUDED.slot,
    name = EXCLUDED.name,
    price = EXCLUDED.price,
    required_writer_level = EXCLUDED.required_writer_level,
    is_default = EXCLUDED.is_default,
    is_active = true,
    sort_order = EXCLUDED.sort_order;

CREATE OR REPLACE FUNCTION public.buy_my_dragon_decor(p_item_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID;
    v_points INTEGER;
    v_pet_data JSONB;
    v_item public.dragon_decor_catalog%ROWTYPE;
    v_owned_decor JSONB;
    v_owned_wallpapers JSONB;
    v_is_owned BOOLEAN := false;
    v_title_status JSONB;
    v_writer_chars BIGINT := 0;
    v_writer_posts INTEGER := 0;
    v_writer_level INTEGER := 1;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_item
    FROM public.dragon_decor_catalog
    WHERE id = p_item_id
      AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION '구입할 수 없는 아지트 장식입니다.' USING ERRCODE = '22023';
    END IF;

    SELECT s.class_id, COALESCE(s.total_points, 0), COALESCE(s.pet_data, '{}'::JSONB)
    INTO v_class_id, v_points, v_pet_data
    FROM public.students s
    WHERE s.id = v_student_id
      AND s.is_active IS DISTINCT FROM false
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
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
    v_is_owned := v_item.is_default
        OR v_owned_decor ? p_item_id
        OR (v_item.slot = 'wallpaper' AND v_owned_wallpapers ? p_item_id);

    IF v_is_owned THEN
        RETURN jsonb_build_object(
            'success', true,
            'purchased', false,
            'new_points', v_points,
            'pet_data', v_pet_data
        );
    END IF;

    IF v_item.required_writer_level > 1 THEN
        v_title_status := public.get_my_title_status();
        v_writer_chars := COALESCE((v_title_status ->> 'writer_total_chars')::BIGINT, 0);
        v_writer_posts := COALESCE((v_title_status ->> 'writer_completed_posts')::INTEGER, 0);
        v_writer_level := COALESCE(
            NULLIF(v_title_status ->> 'writer_level_override', '')::INTEGER,
            CASE
                WHEN v_writer_chars >= 26000 THEN 10
                WHEN v_writer_chars >= 15600 THEN 9
                WHEN v_writer_chars >= 10920 THEN 8
                WHEN v_writer_chars >= 5460 THEN 7
                WHEN v_writer_chars >= 3250 THEN 6
                WHEN v_writer_chars >= 1820 THEN 5
                WHEN v_writer_chars >= 910 THEN 4
                WHEN v_writer_chars >= 390 THEN 3
                WHEN v_writer_posts >= 1 THEN 2
                ELSE 1
            END
        );
        IF v_writer_level < v_item.required_writer_level THEN
            RAISE EXCEPTION '작가 %단계부터 받을 수 있는 장식입니다.', v_item.required_writer_level USING ERRCODE = 'P0001';
        END IF;
    END IF;

    IF v_points < v_item.price THEN
        RAISE EXCEPTION '포인트가 부족합니다.' USING ERRCODE = 'P0001';
    END IF;

    v_owned_decor := v_owned_decor || to_jsonb(p_item_id);
    v_pet_data := jsonb_set(v_pet_data, '{ownedDecorItems}', v_owned_decor, true);
    IF v_item.slot = 'wallpaper' THEN
        v_owned_wallpapers := v_owned_wallpapers || to_jsonb(p_item_id);
        v_pet_data := jsonb_set(v_pet_data, '{ownedItems}', v_owned_wallpapers, true);
    END IF;

    PERFORM set_config('app.bypass_student_trigger', 'true', true);
    UPDATE public.students
    SET total_points = v_points - v_item.price,
        pet_data = v_pet_data
    WHERE id = v_student_id;

    IF v_item.price > 0 THEN
        INSERT INTO public.point_logs (
            student_id, class_id, amount, reason, activity_type
        ) VALUES (
            v_student_id, v_class_id, -v_item.price,
            '아지트 공방 구매: ' || v_item.name, 'hideout_purchase'
        );
    END IF;
    PERFORM set_config('app.bypass_student_trigger', 'false', true);

    RETURN jsonb_build_object(
        'success', true,
        'purchased', true,
        'new_points', v_points - v_item.price,
        'pet_data', v_pet_data
    );
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.bypass_student_trigger', 'false', true);
    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.equip_my_dragon_decor(p_slot TEXT, p_item_id TEXT)
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
    v_is_owned BOOLEAN := false;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    IF p_slot NOT IN ('wallpaper', 'pedestal', 'leftProp', 'rightProp', 'nameplate') THEN
        RAISE EXCEPTION '올바르지 않은 꾸미기 슬롯입니다.' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_item
    FROM public.dragon_decor_catalog
    WHERE id = p_item_id
      AND slot = p_slot
      AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION '이 슬롯에 장착할 수 없는 장식입니다.' USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(s.pet_data, '{}'::JSONB)
    INTO v_pet_data
    FROM public.students s
    WHERE s.id = v_student_id
      AND s.is_active IS DISTINCT FROM false
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
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
    v_is_owned := v_item.is_default
        OR v_owned_decor ? p_item_id
        OR (v_item.slot = 'wallpaper' AND v_owned_wallpapers ? p_item_id);

    IF NOT v_is_owned THEN
        RAISE EXCEPTION '먼저 장식을 구입해야 합니다.' USING ERRCODE = 'P0001';
    END IF;

    v_pet_data := jsonb_set(
        v_pet_data,
        '{equippedDecor}',
        CASE
            WHEN jsonb_typeof(v_pet_data -> 'equippedDecor') = 'object' THEN v_pet_data -> 'equippedDecor'
            ELSE '{}'::JSONB
        END,
        true
    );
    v_pet_data := jsonb_set(v_pet_data, ARRAY['equippedDecor', p_slot], to_jsonb(p_item_id), true);
    IF p_slot = 'wallpaper' THEN
        v_pet_data := jsonb_set(v_pet_data, '{background}', to_jsonb(p_item_id), true);
    END IF;

    PERFORM set_config('app.bypass_student_trigger', 'true', true);
    UPDATE public.students
    SET pet_data = v_pet_data
    WHERE id = v_student_id;
    PERFORM set_config('app.bypass_student_trigger', 'false', true);

    RETURN jsonb_build_object('success', true, 'pet_data', v_pet_data);
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.bypass_student_trigger', 'false', true);
    RAISE;
END;
$$;

REVOKE ALL ON TABLE public.dragon_decor_catalog FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.dragon_decor_catalog TO service_role;

REVOKE ALL ON FUNCTION public.buy_my_dragon_decor(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.equip_my_dragon_decor(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buy_my_dragon_decor(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.equip_my_dragon_decor(TEXT, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

