-- 포인트는 충분하지만 작가 단계가 낮은 학생도 고를 수 있도록
-- 슬롯별 3종의 자유 구매 장식을 완성 세트 3개로 추가한다.

BEGIN;

INSERT INTO public.dragon_decor_catalog (
    id, slot, name, price, required_writer_level, required_reader_level,
    acquisition_type, is_default, is_active, sort_order, rarity, theme
) VALUES
    ('sunny-garden', 'wallpaper', '햇살 정원 프레임', 800, 1, 1, 'shop', false, true, 10, NULL, 'sunny-garden'),
    ('pedestal-sunny-garden', 'pedestal', '햇살 잎새 단상', 800, 1, 1, 'shop', false, true, 10, NULL, 'sunny-garden'),
    ('left-sunny-garden-journal', 'leftProp', '이야기 씨앗 기록대', 800, 1, 1, 'shop', false, true, 10, NULL, 'sunny-garden'),
    ('right-sunny-garden-nest', 'rightProp', '이슬잎 독서 둥지', 800, 1, 1, 'shop', false, true, 10, NULL, 'sunny-garden'),
    ('nameplate-sunny-garden', 'nameplate', '햇살 정원 문패', 800, 1, 1, 'shop', false, true, 10, NULL, 'sunny-garden'),

    ('wave-harbor', 'wallpaper', '푸른 파도 항구 프레임', 1000, 1, 1, 'shop', false, true, 11, NULL, 'wave-harbor'),
    ('pedestal-wave-harbor', 'pedestal', '파도 유리 받침', 1000, 1, 1, 'shop', false, true, 11, NULL, 'wave-harbor'),
    ('left-wave-harbor-map', 'leftProp', '파도 항해 지도대', 1000, 1, 1, 'shop', false, true, 11, NULL, 'wave-harbor'),
    ('right-wave-harbor-observatory', 'rightProp', '진주 조개 관측대', 1000, 1, 1, 'shop', false, true, 11, NULL, 'wave-harbor'),
    ('nameplate-wave-harbor', 'nameplate', '푸른 파도 항구 문패', 1000, 1, 1, 'shop', false, true, 11, NULL, 'wave-harbor'),

    ('dreamlight-library', 'wallpaper', '꿈빛 서재 프레임', 1200, 1, 1, 'shop', false, true, 12, NULL, 'dreamlight-library'),
    ('pedestal-dreamlight-library', 'pedestal', '꿈구름 책방석', 1200, 1, 1, 'shop', false, true, 12, NULL, 'dreamlight-library'),
    ('left-dreamlight-books', 'leftProp', '꿈빛 이야기 등불', 1200, 1, 1, 'shop', false, true, 12, NULL, 'dreamlight-library'),
    ('right-dreamlight-cushion', 'rightProp', '초승달 독서 의자', 1200, 1, 1, 'shop', false, true, 12, NULL, 'dreamlight-library'),
    ('nameplate-dreamlight-library', 'nameplate', '꿈빛 서재 문패', 1200, 1, 1, 'shop', false, true, 12, NULL, 'dreamlight-library')
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

COMMIT;
