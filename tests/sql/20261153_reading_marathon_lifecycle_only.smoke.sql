DO $$
DECLARE
    v_status TEXT;
BEGIN
    IF to_regprocedure('public.set_teacher_reading_marathon_enabled_v1(uuid,boolean)') IS NOT NULL THEN
        RAISE EXCEPTION '사용 여부 전환 RPC가 남아 있습니다.';
    END IF;

    CREATE TEMP TABLE reading_marathon_lifecycle_smoke (
        archived_at TIMESTAMPTZ,
        started_at TIMESTAMPTZ,
        status TEXT
    ) ON COMMIT DROP;
    CREATE TRIGGER reading_marathon_lifecycle_smoke_trigger
    BEFORE UPDATE OF status ON reading_marathon_lifecycle_smoke
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_reading_marathon_lifecycle_v1();

    INSERT INTO reading_marathon_lifecycle_smoke (archived_at, started_at, status)
    VALUES (NULL, clock_timestamp(), 'active');

    UPDATE reading_marathon_lifecycle_smoke
    SET status = 'paused'
    RETURNING status INTO v_status;

    IF v_status <> 'active' THEN
        RAISE EXCEPTION '시작된 마라톤이 paused 상태로 바뀌었습니다: %', v_status;
    END IF;
END;
$$;
