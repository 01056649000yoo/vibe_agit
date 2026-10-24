-- 아지트 공방: 세트를 한 번에(또는 가진 것을 뺀 나머지만) 사기(2026-10-24 선생님 요청).
--
-- 상품 하나를 사는 기존 함수 `buy_my_dragon_decor`(레벨·포인트·중복 검사를 모두 하는 유일한 문)를 그대로 부른다.
-- 이 함수는 여러 개를 **한 번에 하나의 거래**로 묶을 뿐이라 레벨 기준 같은 규칙이 두 곳에 생기지 않는다.
--   · 이미 가진 상품은 건너뛴다(기존 함수가 돈을 받지 않고 돌려보냄) → "나머지만 사기".
--   · 하나라도 못 사면(레벨·포인트 부족 등) 예외가 나 전부 되돌아간다 → 일부만 사고 끝나는 일이 없다.
BEGIN;

CREATE OR REPLACE FUNCTION public.buy_my_dragon_decor_set_v1(p_item_ids TEXT[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_ids TEXT[];
    v_id TEXT;
    v_points_before INTEGER;
    v_result JSONB := '{}'::JSONB;
    v_bought INTEGER := 0;
    v_owned INTEGER := 0;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    SELECT ARRAY(SELECT DISTINCT item FROM unnest(COALESCE(p_item_ids, ARRAY[]::TEXT[])) AS item WHERE item IS NOT NULL AND btrim(item) <> '')
    INTO v_ids;
    IF COALESCE(cardinality(v_ids), 0) NOT BETWEEN 1 AND 8 THEN
        RAISE EXCEPTION '한 번에 살 상품은 1~8개로 골라 주세요.' USING ERRCODE = '22023';
    END IF;
    SELECT COALESCE(total_points, 0) INTO v_points_before FROM public.students WHERE id = v_student_id;

    FOREACH v_id IN ARRAY v_ids LOOP
        v_result := public.buy_my_dragon_decor(v_id);
        IF COALESCE((v_result ->> 'purchased')::BOOLEAN, FALSE) THEN
            v_bought := v_bought + 1;
        ELSE
            v_owned := v_owned + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE,
        'purchased_count', v_bought,
        'already_owned_count', v_owned,
        'spent_points', GREATEST(v_points_before - COALESCE((v_result ->> 'new_points')::INTEGER, v_points_before), 0),
        'new_points', (v_result ->> 'new_points')::INTEGER,
        'pet_data', v_result -> 'pet_data'
    );
END;
$fn$;
REVOKE ALL ON FUNCTION public.buy_my_dragon_decor_set_v1(TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buy_my_dragon_decor_set_v1(TEXT[]) TO authenticated, service_role;

COMMIT;
