-- 아지트 공방 세트 구입 스모크(전부 롤백): 한 번에 사기·이미 가진 것은 건너뛰고(돈 안 냄)·하나라도 못 사면 전부 취소.
DO $$
DECLARE
    v_student UUID; v_auth UUID; v_res JSONB; v_points INTEGER; v_bad BOOLEAN := false; v_locked TEXT;
BEGIN
    SELECT id, auth_id INTO v_student, v_auth FROM public.students
    WHERE auth_id IS NOT NULL AND is_active IS DISTINCT FROM false AND deleted_at IS NULL ORDER BY id LIMIT 1;
    IF v_student IS NULL THEN RAISE EXCEPTION '검증할 학생이 없습니다.'; END IF;
    SELECT id INTO v_locked FROM public.dragon_decor_catalog
    WHERE acquisition_type = 'shop' AND NOT is_default AND is_active AND required_writer_level >= 7 ORDER BY required_writer_level DESC, price LIMIT 1;
    PERFORM set_config('app.bypass_student_trigger', 'true', true);
    UPDATE public.students
       SET total_points = 5000,
           pet_data = COALESCE(pet_data, '{}'::JSONB) - 'ownedDecorItems' - 'ownedItems'
     WHERE id = v_student;
    PERFORM set_config('app.bypass_student_trigger', 'false', true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth, 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('request.jwt.claim.sub', v_auth::TEXT, true);

    -- 1) 하나 먼저 사 두고, 세트(3개)를 사면 가진 것은 건너뛰고 나머지 둘만 값을 낸다
    v_res := public.buy_my_dragon_decor('pedestal-oak');
    IF (v_res ->> 'purchased')::BOOLEAN IS NOT TRUE THEN RAISE EXCEPTION '먼저 사기가 안 됩니다: %', v_res; END IF;
    v_res := public.buy_my_dragon_decor_set_v1(ARRAY['pedestal-oak', 'pedestal-cloud', 'left-plant']);
    IF (v_res ->> 'purchased_count')::INTEGER <> 2 OR (v_res ->> 'already_owned_count')::INTEGER <> 1 OR (v_res ->> 'spent_points')::INTEGER <> 600 THEN
        RAISE EXCEPTION '나머지만 사기가 틀립니다: %', v_res - 'pet_data';
    END IF;
    IF (v_res ->> 'new_points')::INTEGER <> 5000 - 300 - 600 THEN RAISE EXCEPTION '남은 포인트가 틀립니다: %', v_res - 'pet_data'; END IF;

    -- 2) 다시 사도 돈이 나가지 않는다
    v_res := public.buy_my_dragon_decor_set_v1(ARRAY['pedestal-oak', 'pedestal-cloud', 'left-plant']);
    IF (v_res ->> 'purchased_count')::INTEGER <> 0 OR (v_res ->> 'spent_points')::INTEGER <> 0 THEN RAISE EXCEPTION '이미 가진 세트에서 돈이 나갔습니다: %', v_res - 'pet_data'; END IF;

    -- 3) 레벨이 모자란 상품이 끼면 전부 취소(새로 사려던 'sky' 도 안 사진다)
    -- 검증 학생의 작가 단계가 이미 7 이상이면 이 부분은 건너뛴다(레벨이 모자란 상품을 만들 수 없다)
    IF v_locked IS NOT NULL AND public.dragon_writer_level(
            COALESCE((public.get_my_title_status() ->> 'writer_total_chars')::BIGINT, 0),
            COALESCE((public.get_my_title_status() ->> 'writer_completed_posts')::BIGINT, 0),
            NULLIF(public.get_my_title_status() ->> 'writer_level_override', '')::INTEGER) < 7 THEN
        SELECT COALESCE(total_points, 0) INTO v_points FROM public.students WHERE id = v_student;
        BEGIN PERFORM public.buy_my_dragon_decor_set_v1(ARRAY['sky', v_locked]);
        EXCEPTION WHEN OTHERS THEN v_bad := true; END;
        IF NOT v_bad THEN RAISE EXCEPTION '레벨이 모자란 세트가 사졌습니다'; END IF;
    END IF;
    -- (예외 뒤에도 같은 트랜잭션이라 위 PERFORM 의 부분 구입은 서브 트랜잭션처럼 취소된다)
    IF EXISTS (SELECT 1 FROM public.students WHERE id = v_student AND COALESCE(pet_data -> 'ownedDecorItems', '[]'::JSONB) ? 'sky') THEN
        RAISE EXCEPTION '취소돼야 할 상품(sky)이 남았습니다';
    END IF;
    IF (SELECT COALESCE(total_points, 0) FROM public.students WHERE id = v_student) <> COALESCE(v_points, 4100) THEN
        RAISE EXCEPTION '취소됐는데 포인트가 바뀌었습니다';
    END IF;

    -- 4) 범위 밖 개수
    v_bad := false;
    BEGIN PERFORM public.buy_my_dragon_decor_set_v1(ARRAY[]::TEXT[]);
    EXCEPTION WHEN invalid_parameter_value THEN v_bad := true; END;
    IF NOT v_bad THEN RAISE EXCEPTION '빈 목록이 받아들여집니다'; END IF;
END $$;
