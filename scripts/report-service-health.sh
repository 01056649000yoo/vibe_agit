#!/bin/bash
# 오픈클로가 텔레그램으로 전달할 한 줄짜리 아지트 상태다.
# 상세 상태와 비밀 값은 보내지 않고 정상/문제 있음만 출력한다.
set -u

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
HEALTH_CHECK_SCRIPT="${HEALTH_CHECK_SCRIPT:-${SCRIPT_DIR}/check-service-health.sh}"
DOCKER="${DOCKER:-/Applications/Docker.app/Contents/Resources/bin/docker}"
CURL="${CURL:-/usr/bin/curl}"
APP_URL="${APP_URL:-http://127.0.0.1:8300/}"

NORMAL_MESSAGE='🟢 끄적끄적 아지트 정상'
PROBLEM_MESSAGE='🔴 끄적끄적 아지트 문제 있음'
has_problem=false

# 기존 5분 건강검진을 그대로 실행해 판정 원본을 둘로 만들지 않는다.
# 이 스크립트의 stdout/stderr는 텔레그램으로 전달될 수 있으므로 모두 숨긴다.
if ! "$HEALTH_CHECK_SCRIPT" >/dev/null 2>&1; then
    has_problem=true
fi

# DB가 죽으면 건강검진이 경고 행을 기록하지 못하므로 앱과 DB는 한 번 더 직접 확인한다.
app_code="$($CURL -s -o /dev/null -w '%{http_code}' --max-time 15 "$APP_URL" 2>/dev/null || true)"
if [ "$app_code" != "200" ]; then
    has_problem=true
fi

db_ok="$($DOCKER exec -i agit-db psql -U supabase_admin -d postgres -t -A \
    -c 'SELECT 1;' 2>/dev/null | tr -d '[:space:]' || true)"
if [ "$db_ok" != "1" ]; then
    has_problem=true
fi

# 앱·DB·디스크·컨테이너·백업·메모리 중 열린 운영 경고가 하나라도 있으면 문제로만 알린다.
open_alerts="$($DOCKER exec -i agit-db psql -U supabase_admin -d postgres -t -A -c "
SELECT count(*)
FROM public.system_alert_events
WHERE status = 'open'
  AND alert_key IN (
    'app_down', 'db_down', 'disk_low', 'container_down', 'backup_failed',
    'docker_memory_pressure', 'host_memory_pressure'
  );" 2>/dev/null | tr -d '[:space:]' || true)"
case "$open_alerts" in
    ''|*[!0-9]*) has_problem=true ;;
    *) [ "$open_alerts" -gt 0 ] && has_problem=true ;;
esac

if [ "$has_problem" = true ]; then
    printf '%s\n' "$PROBLEM_MESSAGE"
else
    printf '%s\n' "$NORMAL_MESSAGE"
fi

# command cron이 상세 실행 오류를 덧붙이지 않고 위 한 줄만 전달하게 한다.
exit 0
