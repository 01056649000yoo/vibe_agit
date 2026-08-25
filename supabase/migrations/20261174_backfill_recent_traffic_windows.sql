-- 측정 시각 칸을 만들기 전에 04:50 수집기로 기록한 최근 트래픽 두 구간의 시각만 보강한다.
-- 값 자체는 바꾸지 않는다. 완전성은 당시 따로 기록하지 않았으므로 추측해 true/false를 넣지 않는다.

BEGIN;

UPDATE public.system_daily_metrics
SET traffic_period_started_at = ((metric_day - 1)::TIMESTAMP + TIME '04:50') AT TIME ZONE 'Asia/Seoul',
    traffic_measured_at = (metric_day::TIMESTAMP + TIME '04:50') AT TIME ZONE 'Asia/Seoul'
WHERE metric_day BETWEEN DATE '2026-08-24' AND DATE '2026-08-25'
  AND rx_bytes IS NOT NULL
  AND tx_bytes IS NOT NULL
  AND traffic_measured_at IS NULL;

COMMIT;
