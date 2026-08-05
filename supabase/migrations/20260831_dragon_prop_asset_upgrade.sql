-- 기존 좌우 소품의 구매·장착 ID는 유지하고 표시 이름만 새 수호룡 아지트 에셋에 맞춘다.

BEGIN;

UPDATE public.dragon_decor_catalog catalog
SET name = renamed.name
FROM (VALUES
    ('left-bookshelf', '용의 연대기 기록대'),
    ('left-plant', '용심장 수정 군락'),
    ('left-lantern', '수호불꽃 화로'),
    ('left-runestone', '선조의 룬석'),
    ('right-desk', '교감의 날개석'),
    ('right-telescope', '별자리 천구의'),
    ('right-chest', '수호룡 보물고'),
    ('right-nest', '해츨링 꿈둥지')
) AS renamed(id, name)
WHERE catalog.id = renamed.id;

NOTIFY pgrst, 'reload schema';

COMMIT;
