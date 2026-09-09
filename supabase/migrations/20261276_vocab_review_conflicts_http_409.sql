-- 어휘 V2 관리자 검수의 업무용 버전 충돌은 PostgREST가 무한 재시도하는 40001을 쓰지 않는다.
-- 세 함수의 현재 정의에서 오류 코드만 바꿔 인수·반환형·권한·검증 로직·OID를 그대로 유지한다.

BEGIN;

DO $$
DECLARE
    v_signature REGPROCEDURE;
    v_definition TEXT;
    v_changed INTEGER := 0;
BEGIN
    FOREACH v_signature IN ARRAY ARRAY[
        'public.admin_seed_vocab_tower_v2_review_deck_v1(smallint,smallint,text,text,jsonb,text)'::REGPROCEDURE,
        'public.admin_save_vocab_tower_v2_review_item_v1(text,integer,text,smallint,smallint,text,text,text[],jsonb,text)'::REGPROCEDURE,
        'public.admin_set_vocab_tower_v2_review_status_v1(text,integer,text)'::REGPROCEDURE
    ]
    LOOP
        SELECT pg_get_functiondef(v_signature) INTO v_definition;

        IF v_definition LIKE '%40001%' THEN
            IF length(v_definition) - length(replace(v_definition, '40001', '')) <> 5 THEN
                RAISE EXCEPTION 'expected exactly one 40001 in %', v_signature;
            END IF;
            EXECUTE replace(v_definition, '40001', 'PT409');
            v_changed := v_changed + 1;
        ELSIF v_definition NOT LIKE '%PT409%' THEN
            RAISE EXCEPTION 'expected 40001 or PT409 in %', v_signature;
        END IF;
    END LOOP;

    IF v_changed NOT IN (0, 3) THEN
        RAISE EXCEPTION 'partial vocabulary conflict migration: % of 3 functions changed', v_changed;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM unnest(ARRAY[
            'public.admin_seed_vocab_tower_v2_review_deck_v1(smallint,smallint,text,text,jsonb,text)'::REGPROCEDURE,
            'public.admin_save_vocab_tower_v2_review_item_v1(text,integer,text,smallint,smallint,text,text,text[],jsonb,text)'::REGPROCEDURE,
            'public.admin_set_vocab_tower_v2_review_status_v1(text,integer,text)'::REGPROCEDURE
        ]) signature
        JOIN pg_proc function ON function.oid = signature
        WHERE function.prosrc LIKE '%40001%' OR function.prosrc NOT LIKE '%PT409%'
    ) THEN
        RAISE EXCEPTION 'vocabulary review conflict codes were not replaced completely';
    END IF;
END;
$$;

COMMIT;
