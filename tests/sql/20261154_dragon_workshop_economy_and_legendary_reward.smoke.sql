-- 바깥 마이그레이션 검사 트랜잭션이 마지막에 모두 롤백한다.

DO $$
DECLARE
    v_paid_count INTEGER;
    v_paid_total INTEGER;
    v_reward_count INTEGER;
BEGIN
    SELECT count(*), COALESCE(sum(price), 0)
    INTO v_paid_count, v_paid_total
    FROM public.dragon_decor_catalog
    WHERE is_active = true AND price > 0;
    IF v_paid_count <> 37 OR v_paid_total <> 46800 THEN
        RAISE EXCEPTION '공방 유료 카탈로그가 기대값과 다릅니다: %종, %P', v_paid_count, v_paid_total;
    END IF;

    SELECT count(*) INTO v_reward_count
    FROM public.dragon_decor_catalog
    WHERE id IN ('legend', 'pedestal-legend', 'left-royal-banner', 'right-golden-relic', 'nameplate-legend')
      AND acquisition_type = 'achievement'
      AND price = 0
      AND required_writer_level = 10
      AND required_reader_level = 7;
    IF v_reward_count <> 5 THEN
        RAISE EXCEPTION '전설 달성 선물 5종의 조건이 일치하지 않습니다: %종', v_reward_count;
    END IF;

    IF has_function_privilege('anon', 'public.claim_my_dragon_legendary_decor_reward()', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.claim_my_dragon_legendary_decor_reward()', 'EXECUTE') THEN
        RAISE EXCEPTION '전설 달성 선물 RPC 권한이 안전하지 않습니다.';
    END IF;
END;
$$;

SELECT set_config('test.reward_student_id', candidate.id::TEXT, true),
       set_config('test.reward_student_auth_id', candidate.auth_id::TEXT, true),
       set_config('test.reward_class_id', candidate.class_id::TEXT, true)
FROM (
    SELECT student.id, student.auth_id, student.class_id
    FROM public.students student
    WHERE student.auth_id IS NOT NULL
      AND student.deleted_at IS NULL
      AND student.is_active IS DISTINCT FROM false
      AND NOT EXISTS (
          SELECT 1 FROM public.dragon_growth_seasons season
          WHERE season.class_id = student.class_id
            AND season.status IN ('closing', 'closed')
      )
    LIMIT 1
) candidate;

DO $$
BEGIN
    IF current_setting('test.reward_student_id', true) IS NULL THEN
        RAISE EXCEPTION '전설 선물 스모크에 사용할 활성 학생이 없습니다.';
    END IF;

    PERFORM set_config('app.bypass_student_trigger', 'true', true);
    UPDATE public.students
    SET pet_data = jsonb_set(
        jsonb_set(
            jsonb_set(
                jsonb_set(COALESCE(pet_data, '{}'::JSONB) - 'legendaryDecorRewardClaimedAt', '{ownedDecorItems}', '[]'::JSONB, true),
                '{ownedItems}', '[]'::JSONB, true
            ),
            '{equippedDecor}', '{}'::JSONB, true
        ),
        '{background}', to_jsonb('default'::TEXT), true
    )
    WHERE id = current_setting('test.reward_student_id')::UUID;
    PERFORM set_config('app.bypass_student_trigger', 'false', true);
END;
$$;

-- 개봉 동작 자체를 실제 학생 연결로 검증하되, 운영 글·댓글을 대량 생성하지 않도록
-- 이 롤백 트랜잭션 안에서만 칭호 집계 결과를 최고 단계로 고정한다.
CREATE OR REPLACE FUNCTION public.get_my_title_status()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'writer_total_chars', 26000,
        'writer_completed_posts', 1,
        'writer_level_override', NULL,
        'reader_score', 300,
        'reader_post_count', 75,
        'reader_level_override', NULL
    );
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.reward_student_auth_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.reward_student_auth_id'), 'role', 'authenticated'
)::TEXT, true);

DO $$
DECLARE
    v_first JSONB;
    v_second JSONB;
    v_owned JSONB;
BEGIN
    v_first := public.claim_my_dragon_legendary_decor_reward();
    v_owned := v_first #> '{pet_data,ownedDecorItems}';
    IF COALESCE((v_first ->> 'success')::BOOLEAN, false) IS NOT TRUE
       OR COALESCE((v_first ->> 'already_claimed')::BOOLEAN, true) IS NOT FALSE
       OR NOT v_owned ?& ARRAY['legend', 'pedestal-legend', 'left-royal-banner', 'right-golden-relic', 'nameplate-legend']
       OR v_first #>> '{pet_data,equippedDecor,pedestal}' <> 'pedestal-legend' THEN
        RAISE EXCEPTION '전설 선물 첫 개봉 결과가 올바르지 않습니다: %', v_first;
    END IF;

    v_second := public.claim_my_dragon_legendary_decor_reward();
    IF COALESCE((v_second ->> 'already_claimed')::BOOLEAN, false) IS NOT TRUE THEN
        RAISE EXCEPTION '전설 선물 재시도가 중복 안전하지 않습니다: %', v_second;
    END IF;
END;
$$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', gen_random_uuid()::TEXT, true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('request.jwt.claim.sub'), 'role', 'authenticated'
)::TEXT, true);
DO $$
BEGIN
    BEGIN
        PERFORM public.claim_my_dragon_legendary_decor_reward();
        RAISE EXCEPTION 'DB 연결이 없는 사용자가 전설 선물을 받았습니다.';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;
END;
$$;
RESET ROLE;
