-- 다했니 자동 정산 시계 (2026-09-16)
--
-- 계획: DAHANDIN_COOKIE_SYNC_PLAN.md (4-(c) 자동 정산)
-- 교사가 반 설정에서 "매일/매주"로 두면, 이 시계가 정한 시각(KST) 뒤에 하루 한 번 정산한다.
--
-- 왜 pg_cron + pg_net 인가:
--   정산은 다했니(외부 HTTPS)를 불러야 해서 SQL 만으로는 못 한다. pg_cron(이미 설치)이 주기적으로
--   깨우고, pg_net(이미 설치)으로 엣지 함수 dahandin-cookie-sync 를 부른다. 실제 일(키 복호화·
--   호출·지급)은 엣지 함수가 한다. 예약 미션 시계(20261293)와 같은 계열이되, 그건 SQL 함수를
--   부르고 이건 HTTP 를 부른다는 점만 다르다.
--
-- 비밀 값은 git 에 넣지 않는다:
--   cron 이 함수를 부를 때 쓰는 `x-cron-secret` 값과 내부 호출 주소는 아래 config 테이블에
--   **배포 후 손으로** 한 줄 넣는다. 이 마이그레이션은 빈 테이블만 만들고, 값이 없으면
--   시계는 아무 일도 하지 않는다(안전).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 한 줄짜리 런타임 설정(비밀). 클라이언트는 접근 못 한다.
CREATE TABLE IF NOT EXISTS public.dahandin_runtime_config (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),   -- 항상 한 줄만
    function_base_url TEXT,   -- 내부 호출 주소 (예: http://kong:8000)
    cron_secret TEXT,         -- 엣지 함수 DAHANDIN_CRON_SECRET 과 같은 값
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.dahandin_runtime_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dahandin_runtime_config FROM PUBLIC, anon, authenticated;
-- 정책 없음 → authenticated/anon 은 못 읽는다. SECURITY DEFINER 함수(소유자)만 읽는다.

-- 시계가 부르는 함수. 정산할 학급이 있을 때만, 학급마다 짧게 엣지 함수를 부른다.
CREATE OR REPLACE FUNCTION public.dahandin_trigger_auto_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_url TEXT;
    v_secret TEXT;
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
    v_hour INTEGER := EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'Asia/Seoul'))::INTEGER;
    v_dow INTEGER := EXTRACT(DOW FROM (NOW() AT TIME ZONE 'Asia/Seoul'))::INTEGER;
    v_class UUID;
BEGIN
    SELECT function_base_url, cron_secret INTO v_url, v_secret
    FROM public.dahandin_runtime_config WHERE id;
    IF v_url IS NULL OR v_secret IS NULL THEN
        RETURN; -- 배포 후 설정 전이면 조용히 아무 일도 안 한다.
    END IF;

    FOR v_class IN
        SELECT s.class_id
        FROM public.dahandin_class_settings s
        WHERE s.enabled
          AND s.auto_schedule <> 'off'
          AND (s.last_run_on IS DISTINCT FROM v_today)
          AND v_hour >= s.schedule_hour
          AND (s.auto_schedule = 'daily'
               OR (s.auto_schedule = 'weekly' AND s.schedule_weekday = v_dow))
    LOOP
        PERFORM net.http_post(
            url := v_url || '/functions/v1/dahandin-cookie-sync',
            body := jsonb_build_object('classId', v_class::text),
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'x-cron-secret', v_secret
            ),
            timeout_milliseconds := 300000
        );
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.dahandin_trigger_auto_sync() FROM PUBLIC, anon, authenticated;

-- 10분마다 깨운다. 정산은 "정한 시각 지났고 오늘 아직 안 함" 인 학급만 대상이라,
-- 시계가 자주 돌아도 하루 한 번만 실제로 정산한다. cron.timezone 이 GMT 여도
-- 위 함수가 KST 로 판정하므로 상관없다.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'dahandin-auto-sync';
SELECT cron.schedule('dahandin-auto-sync', '*/10 * * * *', $job$SELECT public.dahandin_trigger_auto_sync()$job$);

COMMIT;
