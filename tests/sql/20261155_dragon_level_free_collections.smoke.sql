DO $$
DECLARE
    v_free_count INTEGER;
    v_free_total INTEGER;
    v_paid_count INTEGER;
    v_paid_total INTEGER;
BEGIN
    SELECT COUNT(*), COALESCE(SUM(price), 0)
    INTO v_free_count, v_free_total
    FROM public.dragon_decor_catalog
    WHERE theme IN ('sunny-garden', 'wave-harbor', 'dreamlight-library');

    IF v_free_count <> 15 OR v_free_total <> 15000 THEN
        RAISE EXCEPTION '자유 구매 장식 수/가격 합계 불일치: %종, %P', v_free_count, v_free_total;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.dragon_decor_catalog
        WHERE theme IN ('sunny-garden', 'wave-harbor', 'dreamlight-library')
          AND (
              required_writer_level <> 1
              OR required_reader_level <> 1
              OR acquisition_type <> 'shop'
              OR rarity IS NOT NULL
              OR is_default
              OR NOT is_active
          )
    ) THEN
        RAISE EXCEPTION '자유 구매 장식의 구매 조건이 잘못되었습니다.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM (VALUES
            ('sunny-garden', 5, 800),
            ('wave-harbor', 5, 1000),
            ('dreamlight-library', 5, 1200)
        ) expected(theme, item_count, unit_price)
        LEFT JOIN LATERAL (
            SELECT COUNT(*)::INTEGER AS item_count, MIN(price) AS minimum_price, MAX(price) AS maximum_price
            FROM public.dragon_decor_catalog catalog
            WHERE catalog.theme = expected.theme
        ) actual ON true
        WHERE actual.item_count <> expected.item_count
           OR actual.minimum_price <> expected.unit_price
           OR actual.maximum_price <> expected.unit_price
    ) THEN
        RAISE EXCEPTION '자유 구매 세트별 5종·단일 가격 계약이 맞지 않습니다.';
    END IF;

    SELECT COUNT(*), COALESCE(SUM(price), 0)
    INTO v_paid_count, v_paid_total
    FROM public.dragon_decor_catalog
    WHERE price > 0;

    IF v_paid_count <> 52 OR v_paid_total <> 61800 THEN
        RAISE EXCEPTION '공방 유료 상품 전체 계약 불일치: %종, %P', v_paid_count, v_paid_total;
    END IF;
END;
$$;
