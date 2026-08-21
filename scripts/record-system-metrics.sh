#!/bin/bash
# 서버 지표를 하루 한 줄로 기록한다. 관리자 `서비스 현황` 화면이 이 값을 읽는다.
#
# 왜 하루 한 줄인가:
#   접근 로그를 켜면 정확하지만 디스크를 먹는다. 이 서버는 2026-08-18 에 디스크가 100% 차서
#   도커 데몬이 물리고 앱이 내려간 적이 있다. 알고 싶은 것은 "얼마나 쓰이고 있나" 라는 경향이라
#   하루 한 줄이면 충분하다(1년에 365줄).
#
# 트래픽은 컨테이너가 주고받은 **누적** 바이트의 하루치 증가분이다. 정확한 회선 사용량은 아니다.
#
# 거는 법(맥미니, launchd): 하루 한 번 04:50 쯤. 백업(04:00)·복구 리허설(04:40) 뒤가 좋다.
#   자세한 설치 순서는 docs 또는 WORKLOG 참고.
set -uo pipefail

DOCKER="${DOCKER:-/Applications/Docker.app/Contents/Resources/bin/docker}"
STATE_FILE="${HOME}/.agit-metrics-state"
DAY="$(date +%F)"

psql_exec() {
    "$DOCKER" exec -i agit-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -t -A "$@"
}

# --- 디스크 여유(GB) ---
DISK_FREE_GB="$(df -g / 2>/dev/null | awk 'NR==2 {print $4}')"
[ -n "${DISK_FREE_GB:-}" ] || DISK_FREE_GB="NULL"

# --- DB 크기(MB) ---
DB_SIZE_MB="$(psql_exec -c "SELECT round(pg_database_size('postgres')/1024.0/1024.0, 1);" 2>/dev/null | tr -d ' ')"
[ -n "${DB_SIZE_MB:-}" ] || DB_SIZE_MB="NULL"

# --- 컨테이너 수 ---
CONTAINER_TOTAL="$("$DOCKER" ps -q 2>/dev/null | wc -l | tr -d ' ')"
# 건강검진이 없는 컨테이너는 상태가 비어 있다. 그런 것은 "돌고 있으면 정상" 으로 센다.
CONTAINER_HEALTHY="$("$DOCKER" ps --format '{{.Status}}' 2>/dev/null | grep -cv 'unhealthy\|Restarting\|Exited' | tr -d ' ')"
[ -n "${CONTAINER_TOTAL:-}" ] || CONTAINER_TOTAL="NULL"
[ -n "${CONTAINER_HEALTHY:-}" ] || CONTAINER_HEALTHY="NULL"

# --- 트래픽: 누적값을 읽고, 지난번과의 차이를 하루치로 본다 ---
# docker stats 는 컨테이너별 누적 NET I/O 를 준다. 재시작하면 0으로 돌아가므로
# 차이가 음수면 그날은 재시작이 있었다고 보고 건너뛴다(엉뚱한 큰 값이 들어가지 않게).
read -r RX_NOW TX_NOW <<EOF
$("$DOCKER" stats --no-stream --format '{{.NetIO}}' 2>/dev/null | awk '
function to_bytes(v) {
    unit = v; sub(/^[0-9.]+/, "", unit); num = v; sub(/[A-Za-z]+$/, "", num) + 0;
    if (unit == "kB" || unit == "KB") return num * 1000;
    if (unit == "MB") return num * 1000000;
    if (unit == "GB") return num * 1000000000;
    if (unit == "TB") return num * 1000000000000;
    return num;
}
{ split($0, parts, " / "); rx += to_bytes(parts[1]); tx += to_bytes(parts[2]); }
END { printf "%d %d", rx, tx }
')
EOF
RX_NOW="${RX_NOW:-0}"
TX_NOW="${TX_NOW:-0}"

RX_DAY="NULL"
TX_DAY="NULL"
if [ -f "$STATE_FILE" ]; then
    read -r PREV_RX PREV_TX < "$STATE_FILE" 2>/dev/null || true
    if [ -n "${PREV_RX:-}" ] && [ "$RX_NOW" -ge "${PREV_RX:-0}" ] 2>/dev/null; then
        RX_DAY=$(( RX_NOW - PREV_RX ))
        TX_DAY=$(( TX_NOW - PREV_TX ))
    fi
fi
printf '%s %s\n' "$RX_NOW" "$TX_NOW" > "$STATE_FILE"

# --- 기록 ---
psql_exec -c "SELECT public.record_system_daily_metric_v1(
    '${DAY}'::date,
    ${RX_DAY}::bigint,
    ${TX_DAY}::bigint,
    ${DISK_FREE_GB}::numeric,
    ${DB_SIZE_MB}::numeric,
    ${CONTAINER_TOTAL}::integer,
    ${CONTAINER_HEALTHY}::integer
);" >/dev/null || {
    echo "지표 기록 실패 ($DAY)" >&2
    exit 1
}

echo "지표 기록 완료 $DAY — 디스크 ${DISK_FREE_GB}GB · DB ${DB_SIZE_MB}MB · 컨테이너 ${CONTAINER_HEALTHY}/${CONTAINER_TOTAL}"
