-- 기존 배경 상품을 모서리 프레임으로 재해석하고 수호룡 세계관의 받침대·소품을 확장한다.
-- 저장 ID와 wallpaper 슬롯 키는 기존 구매·장착 데이터 호환을 위해 유지한다.

BEGIN;

UPDATE public.dragon_decor_catalog catalog
SET name = renamed.name
FROM (VALUES
    ('default', '기본 나무 프레임'),
    ('volcano', '용암 프레임'),
    ('sky', '구름 프레임'),
    ('crystal', '수정 프레임'),
    ('storm', '번개 프레임'),
    ('galaxy', '별자리 프레임'),
    ('legend', '전설의 황금 프레임'),
    ('left-bookshelf', '고대 용의 서가'),
    ('left-plant', '용숨결 새싹'),
    ('left-lantern', '수호불꽃 등불'),
    ('right-desk', '이야기 제단'),
    ('right-telescope', '별길 관측구'),
    ('right-chest', '수호룡 보물함')
) AS renamed(id, name)
WHERE catalog.id = renamed.id;

INSERT INTO public.dragon_decor_catalog (
    id, slot, name, price, required_writer_level, is_default, is_active, sort_order
) VALUES
    ('pedestal-rune', 'pedestal', '고대 룬 단상', 520, 1, false, true, 4),
    ('pedestal-moonstone', 'pedestal', '달빛 월석', 560, 1, false, true, 5),
    ('pedestal-ember', 'pedestal', '불씨 대장간', 600, 1, false, true, 6),
    ('pedestal-root', 'pedestal', '고목 뿌리 둥지', 540, 1, false, true, 7),
    ('left-runestone', 'leftProp', '기억의 룬석', 340, 1, false, true, 4),
    ('right-nest', 'rightProp', '해츨링 둥지', 300, 1, false, true, 4)
ON CONFLICT (id) DO UPDATE SET
    slot = EXCLUDED.slot,
    name = EXCLUDED.name,
    price = EXCLUDED.price,
    required_writer_level = EXCLUDED.required_writer_level,
    is_default = EXCLUDED.is_default,
    is_active = EXCLUDED.is_active,
    sort_order = EXCLUDED.sort_order;

NOTIFY pgrst, 'reload schema';

COMMIT;
