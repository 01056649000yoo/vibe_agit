-- 기존 문패 상품은 구매·장착 ID를 유지한 채 3D 에셋 이름으로 갱신하고 신규 문패 4종을 추가한다.

BEGIN;

UPDATE public.dragon_decor_catalog catalog
SET name = renamed.name
FROM (VALUES
    ('nameplate-simple', '어린 수호자의 문패'),
    ('nameplate-oak', '숲의 뿌리 문패'),
    ('nameplate-brass', '황동 용날개 문패'),
    ('nameplate-crystal', '월광 수정 문패')
) AS renamed(id, name)
WHERE catalog.id = renamed.id;

INSERT INTO public.dragon_decor_catalog (
    id, slot, name, price, required_writer_level, is_default, is_active, sort_order
) VALUES
    ('nameplate-rune', 'nameplate', '고대 룬 문패', 420, 1, false, true, 4),
    ('nameplate-celestial', 'nameplate', '별자리 천구 문패', 480, 1, false, true, 5),
    ('nameplate-ember', 'nameplate', '용암 심장 문패', 540, 1, false, true, 6),
    ('nameplate-legend', 'nameplate', '전설의 황금 문패', 800, 10, false, true, 7)
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
