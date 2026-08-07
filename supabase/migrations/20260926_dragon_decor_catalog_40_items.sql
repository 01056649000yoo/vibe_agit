-- 주 1,000P 경제 기준에 맞춰 공방을 슬롯별 유료 8종, 전체 40종으로 확장한다.
-- 기존 구매 ID와 pet_data 소유권은 그대로 유지하고 카탈로그 가격·등급만 갱신한다.

BEGIN;

ALTER TABLE public.dragon_decor_catalog
    ADD COLUMN IF NOT EXISTS rarity TEXT,
    ADD COLUMN IF NOT EXISTS theme TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.dragon_decor_catalog'::regclass
          AND conname = 'dragon_decor_catalog_rarity_check'
    ) THEN
        ALTER TABLE public.dragon_decor_catalog
            ADD CONSTRAINT dragon_decor_catalog_rarity_check
            CHECK (rarity IS NULL OR rarity IN ('starter', 'common', 'rare', 'hero', 'legendary'));
    END IF;
END;
$$;

INSERT INTO public.dragon_decor_catalog (
    id, slot, name, price, required_writer_level, is_default, is_active, sort_order, rarity, theme
) VALUES
    ('default', 'wallpaper', '기본 나무 프레임', 0, 1, true, true, 0, NULL, 'forest'),
    ('sky', 'wallpaper', '구름 프레임', 800, 1, false, true, 1, 'starter', 'sky'),
    ('forest', 'wallpaper', '고목 숲 프레임', 1200, 1, false, true, 2, 'common', 'forest'),
    ('volcano', 'wallpaper', '용암 프레임', 1800, 1, false, true, 3, 'common', 'ember'),
    ('moon', 'wallpaper', '달빛 프레임', 3200, 1, false, true, 4, 'rare', 'moon'),
    ('crystal', 'wallpaper', '수정 프레임', 4000, 1, false, true, 5, 'rare', 'crystal'),
    ('rune', 'wallpaper', '고대 룬 프레임', 6500, 5, false, true, 6, 'hero', 'rune'),
    ('storm', 'wallpaper', '번개 프레임', 7500, 5, false, true, 7, 'hero', 'storm'),
    ('galaxy', 'wallpaper', '별자리 프레임', 8000, 5, false, true, 8, 'hero', 'celestial'),
    ('legend', 'wallpaper', '전설의 황금 프레임', 0, 10, false, true, 9, NULL, 'legend'),

    ('pedestal-stone', 'pedestal', '다듬은 돌', 0, 1, true, true, 0, NULL, 'stone'),
    ('pedestal-oak', 'pedestal', '참나무 단상', 500, 1, false, true, 1, 'starter', 'forest'),
    ('pedestal-cloud', 'pedestal', '구름 받침', 700, 1, false, true, 2, 'starter', 'sky'),
    ('pedestal-root', 'pedestal', '고목 뿌리 둥지', 1400, 1, false, true, 3, 'common', 'forest'),
    ('pedestal-ember', 'pedestal', '불씨 대장간', 1800, 1, false, true, 4, 'common', 'ember'),
    ('pedestal-crystal', 'pedestal', '수정 받침', 3200, 1, false, true, 5, 'rare', 'crystal'),
    ('pedestal-moonstone', 'pedestal', '달빛 월석', 3600, 1, false, true, 6, 'rare', 'moon'),
    ('pedestal-rune', 'pedestal', '고대 룬 단상', 6000, 5, false, true, 7, 'hero', 'rune'),
    ('pedestal-celestial', 'pedestal', '천상의 별빛 옥좌', 7000, 5, false, true, 8, 'hero', 'celestial'),

    ('left-none', 'leftProp', '비워 두기', 0, 1, true, true, 0, NULL, 'empty'),
    ('left-plant', 'leftProp', '용심장 수정 군락', 600, 1, false, true, 1, 'starter', 'crystal'),
    ('left-cloud-harp', 'leftProp', '구름 노래 하프', 700, 1, false, true, 2, 'starter', 'sky'),
    ('left-bookshelf', 'leftProp', '용의 연대기 기록대', 1200, 1, false, true, 3, 'common', 'forest'),
    ('left-lantern', 'leftProp', '수호불꽃 화로', 1600, 1, false, true, 4, 'common', 'ember'),
    ('left-runestone', 'leftProp', '선조의 룬석', 3000, 1, false, true, 5, 'rare', 'rune'),
    ('left-moonwell', 'leftProp', '달빛 기억의 샘', 3900, 1, false, true, 6, 'rare', 'moon'),
    ('left-storm-spire', 'leftProp', '폭풍소환 봉화', 7000, 5, false, true, 7, 'hero', 'storm'),
    ('left-royal-banner', 'leftProp', '황금 수호 깃발', 10000, 8, false, true, 8, 'legendary', 'legend'),

    ('right-none', 'rightProp', '비워 두기', 0, 1, true, true, 0, NULL, 'empty'),
    ('right-nest', 'rightProp', '해츨링 꿈둥지', 500, 1, false, true, 1, 'starter', 'sky'),
    ('right-desk', 'rightProp', '교감의 날개석', 800, 1, false, true, 2, 'starter', 'rune'),
    ('right-forest-spring', 'rightProp', '숲 정령의 샘', 1400, 1, false, true, 3, 'common', 'forest'),
    ('right-chest', 'rightProp', '수호룡 보물고', 2000, 1, false, true, 4, 'common', 'ember'),
    ('right-crystal-egg', 'rightProp', '월광 수정알', 3300, 1, false, true, 5, 'rare', 'crystal'),
    ('right-telescope', 'rightProp', '별자리 천구의', 4500, 1, false, true, 6, 'rare', 'celestial'),
    ('right-ember-anvil', 'rightProp', '용불꽃 모루', 6500, 5, false, true, 7, 'hero', 'ember'),
    ('right-golden-relic', 'rightProp', '황금 수호관 유물', 15000, 9, false, true, 8, 'legendary', 'legend'),

    ('nameplate-simple', 'nameplate', '어린 수호자의 문패', 0, 1, true, true, 0, NULL, 'forest'),
    ('nameplate-oak', 'nameplate', '숲의 뿌리 문패', 500, 1, false, true, 1, 'starter', 'forest'),
    ('nameplate-brass', 'nameplate', '황동 용날개 문패', 1200, 1, false, true, 2, 'common', 'sky'),
    ('nameplate-crystal', 'nameplate', '월광 수정 문패', 1400, 1, false, true, 3, 'common', 'crystal'),
    ('nameplate-rune', 'nameplate', '고대 룬 문패', 1600, 1, false, true, 4, 'common', 'rune'),
    ('nameplate-celestial', 'nameplate', '별자리 천구 문패', 2000, 1, false, true, 5, 'common', 'celestial'),
    ('nameplate-ember', 'nameplate', '용암 심장 문패', 3500, 1, false, true, 6, 'rare', 'ember'),
    ('nameplate-storm', 'nameplate', '폭풍 용날개 문패', 4200, 1, false, true, 7, 'rare', 'storm'),
    ('nameplate-legend', 'nameplate', '전설의 황금 문패', 10000, 10, false, true, 8, 'legendary', 'legend')
ON CONFLICT (id) DO UPDATE SET
    slot = EXCLUDED.slot,
    name = EXCLUDED.name,
    price = EXCLUDED.price,
    required_writer_level = EXCLUDED.required_writer_level,
    is_default = EXCLUDED.is_default,
    is_active = EXCLUDED.is_active,
    sort_order = EXCLUDED.sort_order,
    rarity = EXCLUDED.rarity,
    theme = EXCLUDED.theme;

CREATE INDEX IF NOT EXISTS idx_dragon_decor_catalog_slot_active_sort
    ON public.dragon_decor_catalog (slot, is_active, sort_order);

COMMIT;
