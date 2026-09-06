-- 트래픽 지표의 뜻이 바뀌었다. 지금까지 쌓인 값은 비운다.
--
-- 2026-09-06 이전에는 `docker stats` 의 **모든 컨테이너** NET I/O 를 더했다. 그런데 그 값은 도커
-- 내부 네트워크까지 포함해서, PostgREST(`agit-rest`)와 DB(`agit-db`)가 서로 주고받는 대화가
-- 반나절에 1.39TB 씩 잡혔다. 실제 바깥 트래픽(`jarvis-caddy` 4.4MB)의 약 30만 배라
-- 관리자 그래프에서 사람이 쓴 양은 한 픽셀도 보이지 않았고, 컨테이너를 다시 만든 날은 2.5TB 로 튀었다.
-- 이제 스크립트는 인터넷과 맞닿은 리버스 프록시만 잰다.
--
-- 옛 값과 새 값은 단위가 아니라 **뜻이** 다르므로 한 그래프에 두면 거짓 경향을 그린다. 그래서 비운다.
-- 디스크·DB 크기·컨테이너 수·자원 표본은 뜻이 그대로라 건드리지 않는다.
BEGIN;
UPDATE public.system_daily_metrics
   SET rx_bytes = NULL,
       tx_bytes = NULL,
       traffic_period_started_at = NULL,
       traffic_measured_at = NULL,
       traffic_complete = NULL
 WHERE rx_bytes IS NOT NULL OR tx_bytes IS NOT NULL OR traffic_measured_at IS NOT NULL;
COMMIT;
