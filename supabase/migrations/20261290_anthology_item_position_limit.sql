-- ============================================================================
-- 📖 문집 작품 자리 번호 제약: 100 → 300
-- 작성일: 2026-09-14
--
-- 왜: 바로 앞 20261289 에서 한도를 300편으로 올렸는데, **표 제약 하나를 놓쳤다.**
--     교사가 200편을 담자 저장이 이 제약에서 막혔다:
--       new row for relation "class_agit_book_items" violates check constraint
--       "class_agit_book_items_position_check"
--
-- 왜 놓쳤나: 앞 마이그레이션에서 함수 안의 `100` 과 `page_breaks` 제약만 훑었다.
--     전시 쪽 표들은 `class_agit_max_works_v1()` 을 불러 쓰는데(한 곳만 고치면 되는 모양),
--     문집 표만 숫자가 그대로 박혀 있어 눈에 띄지 않았다.
--
-- 그래서 여기서는 **문집도 함수를 불러 쓰게** 바꾼다. 다음에 한도를 옮길 때
--     이 표를 다시 잊지 않는다.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.class_agit_max_anthology_works_v1()
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$ SELECT 300; $function$;

REVOKE ALL ON FUNCTION public.class_agit_max_anthology_works_v1() FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public.class_agit_book_items
    DROP CONSTRAINT IF EXISTS class_agit_book_items_position_check;

ALTER TABLE public.class_agit_book_items
    ADD CONSTRAINT class_agit_book_items_position_check
    CHECK (position >= 1 AND position <= public.class_agit_max_anthology_works_v1());

COMMIT;

NOTIFY pgrst, 'reload schema';
