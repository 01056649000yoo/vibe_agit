-- 예약 과제를 여는 시계 (2026-09-14).
--
-- 20261292 와 일부러 나눠 두었다. 스키마·정책은 시계와 상관없이 옳고, 만약 pg_cron 이
-- 이 컨테이너에서 돌지 않으면 **이 파일만** 맥미니 launchd 로 바꾸면 되기 때문이다.
--
-- 확인한 것 (2026-09-14, 운영 agit-db):
--   · pg_cron 은 이미 shared_preload_libraries 에 올라가 있다 → 컨테이너 재시작이 필요 없다.
--   · cron.database_name = postgres — 우리가 쓰는 DB 와 같다.
--   · cron.launch_active_jobs = on, supabase_admin 은 슈퍼유저다.
--
-- 1분마다 도는 이유: 교사가 "1교시 시작에 열기" 로 잡는 기능이라 분 단위면 충분하다.
-- 매분 도는 덕분에 cron.timezone 이 GMT 인 것도 상관없다(특정 시각에 거는 일정이 아니다).
-- 여는 함수가 `<= NOW()` 로 훑으므로, 한두 번 걸러도 다음 차례에 저절로 따라잡는다.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 같은 이름으로 다시 걸면 겹치므로 먼저 지운다(다시 적용해도 안전하게).
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'open-scheduled-missions';

SELECT cron.schedule(
    'open-scheduled-missions',
    '* * * * *',
    $job$SELECT public.open_due_scheduled_missions_v1()$job$
);

COMMIT;
