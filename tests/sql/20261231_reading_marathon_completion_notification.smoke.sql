-- 완주 알림이 실제 함수 안에 살아 있는지 본다.
-- check-migrations.mjs 가 바깥을 BEGIN/ROLLBACK 으로 감싼다.

DO $$
DECLARE
    v_def TEXT;
BEGIN
    SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'refresh_reading_marathon_campaign_v1';

    IF v_def IS NULL THEN
        RAISE EXCEPTION '마라톤 갱신 함수를 찾지 못했습니다.';
    END IF;
    IF v_def NOT LIKE '%notification_emit_v1%' THEN
        RAISE EXCEPTION '완주 알림을 남기는 부분이 사라졌습니다.';
    END IF;
    IF v_def NOT LIKE '%reading-log.marathon_completed%' THEN
        RAISE EXCEPTION '완주 알림의 사건 종류가 바뀌었습니다 — 학생 화면 문구와 어긋납니다.';
    END IF;
    -- 메달·거리 계산은 그대로 남아 있어야 한다(알림을 넣다가 지우면 안 된다)
    IF v_def NOT LIKE '%reading_marathon_medals%' THEN
        RAISE EXCEPTION '메달 지급 부분이 사라졌습니다.';
    END IF;
END;
$$;

SELECT '완주 알림 검증 통과' AS smoke_result;
