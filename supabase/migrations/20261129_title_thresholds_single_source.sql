-- 칭호 기준의 인라인 복사본을 없앤다.
--
-- 2026-08-18에 기준을 `src/constants/writerLevels.js` 하나로 모으고 `dragon_writer_level()` 을
-- 거기서 생성하게 했는데, **함수 두 개가 같은 숫자를 따로 들고 있는 것을 놓쳤다**.
--   · buy_my_dragon_decor         — 작가 레벨로 잠긴 소품을 살 수 있는지 판정
--   · acknowledge_my_dragon_growth — 성장 축하를 띄울 단계 판정
-- 그대로 두면 기준을 바꿔도 이 둘은 옛 기준으로 판정해, 화면에는 `대문호`인데
-- 소품은 안 열리는 어긋남이 생긴다. 둘 다 공용 함수 하나만 부르게 바꾼다.

BEGIN;

CREATE OR REPLACE FUNCTION public.buy_my_dragon_decor(p_item_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        -- 기준을 여기 다시 적지 않는다. 공용 함수 하나만 본다
        -- (기준은 src/constants/writerLevels.js 가 원본이고 그 함수가 생성된다).
        v_writer_level := public.dragon_writer_level(
            v_writer_chars,
            v_writer_posts::BIGINT,
            NULLIF(v_title_status ->> 'writer_level_override', '')::INTEGER
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
$function$;

CREATE OR REPLACE FUNCTION public.acknowledge_my_dragon_growth()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_pet_data JSONB;
    v_title_status JSONB;
    v_writer_chars BIGINT := 0;
    v_writer_posts INTEGER := 0;
    v_writer_level_override INTEGER;
    v_actual_level INTEGER := 1;
    v_effective_level INTEGER := 1;
    v_acknowledgment_key TEXT;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(s.pet_data, '{}'::JSONB)
    INTO v_pet_data
    FROM public.students s
    WHERE s.id = v_student_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION '학생 정보를 찾지 못했습니다.' USING ERRCODE = 'P0002';
    END IF;

    v_title_status := public.get_my_title_status();
    v_writer_chars := COALESCE((v_title_status ->> 'writer_total_chars')::BIGINT, 0);
    v_writer_posts := COALESCE((v_title_status ->> 'writer_completed_posts')::INTEGER, 0);
    v_writer_level_override := NULLIF(v_title_status ->> 'writer_level_override', '')::INTEGER;

    -- 기준을 여기 다시 적지 않는다. 공용 함수 하나만 본다.
    v_actual_level := public.dragon_writer_level(v_writer_chars, v_writer_posts::BIGINT, NULL);

    IF v_writer_level_override BETWEEN 1 AND 10 THEN
        v_effective_level := v_writer_level_override;
        v_acknowledgment_key := 'lastCelebratedTestWriterLevel';
    ELSE
        v_effective_level := v_actual_level;
        v_acknowledgment_key := 'lastCelebratedWriterLevel';
    END IF;

    v_pet_data := jsonb_set(
        v_pet_data,
        ARRAY[v_acknowledgment_key],
        to_jsonb(v_effective_level),
        true
    );

    UPDATE public.students
    SET pet_data = v_pet_data
    WHERE id = v_student_id;

    RETURN jsonb_build_object(
        'success', true,
        'level', v_effective_level,
        'is_test_override', v_writer_level_override IS NOT NULL,
        'pet_data', v_pet_data
    );
END;
$function$;

COMMIT;
