-- 20261229는 운영에 CRLF 바이트로 적용됐고 저장소에는 같은 SQL의 LF 바이트가 남아 있다.
-- 적용 당시 CRLF checksum과 현재 LF checksum을 모두 정확히 대조한 뒤 원장 한 줄만 보정한다.
-- 이미 적용된 20261229 본문과 실제 DB 함수는 다시 만들지 않는다.

BEGIN;

DO $$
DECLARE
    v_recorded_checksum TEXT;
BEGIN
    SELECT migration.checksum
    INTO v_recorded_checksum
    FROM public.applied_migrations migration
    WHERE migration.filename = '20261229_class_board_meal_columns.sql';

    IF v_recorded_checksum IS NULL THEN
        RAISE EXCEPTION '20261229 적용 기록이 없어 checksum을 보정할 수 없습니다.';
    END IF;

    IF v_recorded_checksum NOT IN (
        '101bf0524634834e0252051e74a1e9ecc4bef1e91164d99c6d1824657a215d0d',
        '9e13b3421ba6ba365e3569198473c47f4cfe9991ab0c6061e057cb119bef0f9b'
    ) THEN
        RAISE EXCEPTION '예상하지 못한 20261229 checksum입니다: %', v_recorded_checksum;
    END IF;

    UPDATE public.applied_migrations
    SET checksum = '9e13b3421ba6ba365e3569198473c47f4cfe9991ab0c6061e057cb119bef0f9b'
    WHERE filename = '20261229_class_board_meal_columns.sql';
END;
$$;

COMMIT;
