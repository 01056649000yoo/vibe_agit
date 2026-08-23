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

# --- 6) 메모리와 게이트웨이 ---
#
# 하루 한 번 도는 지표 기록은 새벽 04:50 이라 가장 한가한 때다. 정작 알고 싶은 것은 수업 시간의
# 가장 나쁜 순간이라, 5분마다 도는 여기서 재서 그날의 최악값만 남긴다.
# 2026-08-23 에 도커 VM 메모리 여유가 10% 까지 떨어지고 스왑이 100% 찼는데, 그때는 이 값을
# 아무도 보지 않아 사람이 손으로 `free` 를 돌려 보고서야 알았다.
#
# 새 컨테이너를 띄우지 않고 이미 도는 DB 컨테이너에서 읽는다(5분마다이므로 가볍게 간다).
read -r MEM_TOTAL MEM_AVAIL SWAP_USED <<EOF
$("$DOCKER" exec agit-db sh -c "free -m" 2>/dev/null | awk '
NR==2 { total=$2; avail=$7 }
NR==3 { swap=$3 }
END { printf "%d %d %d", total, avail, swap }')
EOF

# 게이트웨이 CPU 는 kong 워커 수를 언제 올릴지 판단하는 근거다.
read -r GW_CPU GW_MEM <<EOF
$("$DOCKER" stats --no-stream --format '{{.CPUPerc}} {{.MemUsage}}' agit-kong 2>/dev/null | awk '
{ cpu=$1; sub(/%/,"",cpu);
  mem=$2; unit=mem; sub(/^[0-9.]+/,"",unit); n=mem; sub(/[A-Za-z]+$/,"",n);
  mb = (unit=="GiB")? n*1024 : (unit=="KiB")? n/1024 : n;
  printf "%.1f %d", cpu, mb }')
EOF

if [ -n "${MEM_TOTAL:-}" ] && [ "${MEM_TOTAL:-0}" -gt 0 ] 2>/dev/null; then
    psql_exec -c "SELECT public.record_system_peak_v1(
        CURRENT_DATE, ${MEM_TOTAL}::int, ${MEM_AVAIL:-0}::int, ${SWAP_USED:-0}::int,
        ${GW_CPU:-0}::numeric, ${GW_MEM:-0}::int
    );" >/dev/null 2>&1 || true

    # 여유가 15% 아래로 떨어지거나 스왑을 쓰기 시작하면 알린다. 둘 다 "메모리가 모자라다" 는 신호다.
    MEM_PCT=$(( MEM_AVAIL * 100 / MEM_TOTAL ))
    if [ "$MEM_PCT" -lt 15 ] || [ "${SWAP_USED:-0}" -gt 100 ]; then
        report memory_low true "여유 ${MEM_AVAIL}MB(${MEM_PCT}%) · 스왑 ${SWAP_USED:-0}MB 사용"
    else
        report memory_low false ""
    fi
fi

echo "상태 기록 완료 $(date '+%H:%M') — 앱 ${CODE} · 디스크 ${FREE_GB:-?}GB · 메모리 여유 ${MEM_AVAIL:-?}MB · 게이트웨이 CPU ${GW_CPU:-?}%"
