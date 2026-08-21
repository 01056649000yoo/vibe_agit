#!/bin/bash
# 맥미니 안의 서비스 상태를 5분마다 확인해 관리자 `서비스 현황`에 기록한다.
# 외부 메일이나 메시지는 보내지 않는다. 사용자가 보는 장애 안내는 호스트 Caddy가 담당한다.
set -uo pipefail

DOCKER="${DOCKER:-/Applications/Docker.app/Contents/Resources/bin/docker}"
APP_URL="${APP_URL:-http://127.0.0.1:8300/}"
DISK_MIN_GB="${DISK_MIN_GB:-10}"

psql_exec() {
    "$DOCKER" exec -i agit-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -t -A "$@"
}

# 문제 여부를 DB에 적는다. 메일 발송 판단이나 외부 전송은 하지 않는다.
report() {
    local key="$1" is_problem="$2" detail="$3"
    if ! psql_exec -c "SELECT public.record_system_alert_v1('${key}', ${is_problem}, \$detail\$${detail}\$detail\$);" \
        >/dev/null 2>&1; then
        echo "상태 기록 실패: ${key}" >&2
        return 1
    fi
}

# --- 1) 앱이 응답하는가 ---
CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$APP_URL" 2>/dev/null)"
if [ "$CODE" = "200" ]; then
    report app_down false ""
else
    report app_down true "HTTP ${CODE:-무응답}"
fi

# --- 2) DB 가 응답하는가 ---
if psql_exec -c "SELECT 1;" >/dev/null 2>&1; then
    report db_down false ""
else
    # DB가 죽으면 상태를 DB에 적을 수도 없다. launchd 오류 로그에만 남긴다.
    echo "DB 무응답 — 상태를 기록하지 못했습니다" >&2
    exit 1
fi

# --- 3) 디스크 여유 ---
FREE_GB="$(df -g / 2>/dev/null | awk 'NR==2 {print $4}')"
if [ -n "${FREE_GB:-}" ] && [ "$FREE_GB" -lt "$DISK_MIN_GB" ] 2>/dev/null; then
    report disk_low true "여유 ${FREE_GB}GB (기준 ${DISK_MIN_GB}GB)"
else
    report disk_low false ""
fi

# --- 4) 컨테이너가 꺼져 있지 않은가 ---
BAD="$("$DOCKER" ps --format '{{.Names}} {{.Status}}' 2>/dev/null | grep -c 'unhealthy\|Restarting' | tr -d ' ')"
if [ "${BAD:-0}" -gt 0 ] 2>/dev/null; then
    NAMES="$("$DOCKER" ps --format '{{.Names}} {{.Status}}' 2>/dev/null | grep 'unhealthy\|Restarting' | awk '{print $1}' | paste -sd, - )"
    report container_down true "$NAMES"
else
    report container_down false ""
fi

# --- 5) 백업이 어제 안 돌았는가 ---
STALE="$(psql_exec -c "SELECT CASE WHEN max(started_at) < now() - interval '26 hours' OR max(started_at) IS NULL THEN 1 ELSE 0 END FROM public.system_backup_runs WHERE job_type = 'daily';" 2>/dev/null | tr -d ' ')"
if [ "${STALE:-0}" = "1" ]; then
    report backup_failed true "26시간 넘게 새 백업 기록이 없습니다"
else
    report backup_failed false ""
fi

echo "상태 기록 완료 $(date '+%H:%M') — 앱 ${CODE} · 디스크 ${FREE_GB:-?}GB"
