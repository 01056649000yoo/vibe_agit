#!/bin/bash
# 맥미니 안의 서비스 상태를 5분마다 확인해 관리자 `서비스 현황`에 기록한다.
# 외부 메일이나 메시지는 보내지 않는다. 사용자가 보는 장애 안내는 호스트 Caddy가 담당한다.
set -uo pipefail

DOCKER="${DOCKER:-/Applications/Docker.app/Contents/Resources/bin/docker}"
APP_URL="${APP_URL:-http://127.0.0.1:8300/}"
DISK_MIN_GB="${DISK_MIN_GB:-10}"
VM_MEM_CRITICAL_PCT="${VM_MEM_CRITICAL_PCT:-15}"
VM_MEM_WATCH_PCT="${VM_MEM_WATCH_PCT:-30}"
VM_SWAP_NEAR_FULL_PCT="${VM_SWAP_NEAR_FULL_PCT:-90}"
VM_SWAP_OUT_ALERT_MB="${VM_SWAP_OUT_ALERT_MB:-64}"
VM_PSI_SOME_ALERT_PCT="${VM_PSI_SOME_ALERT_PCT:-1.0}"
VM_PSI_FULL_ALERT_PCT="${VM_PSI_FULL_ALERT_PCT:-0.1}"
HOST_MEM_CRITICAL_PCT="${HOST_MEM_CRITICAL_PCT:-15}"
HOST_MEM_WATCH_PCT="${HOST_MEM_WATCH_PCT:-30}"
HOST_SWAP_HIGH_MB="${HOST_SWAP_HIGH_MB:-1024}"
VM_SWAP_STATE_FILE="${VM_SWAP_STATE_FILE:-/tmp/agit-health-vmstat.state}"

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

decimal_ge() {
    awk -v value="${1:-0}" -v threshold="${2:-0}" 'BEGIN { exit !((value + 0) >= (threshold + 0)) }'
}

append_reason() {
    local current="$1" next="$2"
    if [ -n "$current" ]; then
        printf '%s, %s' "$current" "$next"
    else
        printf '%s' "$next"
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
CONTAINER_TOTAL="$("$DOCKER" ps -q 2>/dev/null | wc -l | tr -d ' ')"
CONTAINER_HEALTHY="$("$DOCKER" ps --format '{{.Status}}' 2>/dev/null | grep -cv 'unhealthy\|Restarting\|Exited' | tr -d ' ')"
BAD="$("$DOCKER" ps --format '{{.Names}} {{.Status}}' 2>/dev/null | grep -c 'unhealthy\|Restarting' | tr -d ' ')"
if [ "${BAD:-0}" -gt 0 ] 2>/dev/null; then
    NAMES="$("$DOCKER" ps --format '{{.Names}} {{.Status}}' 2>/dev/null | grep 'unhealthy\|Restarting' | awk '{print $1}' | paste -sd, - )"
    report container_down true "$NAMES"
else
    report container_down false ""
fi

# --- 5) 백업·복구 또는 3개 앱 중 하나가 실패했는가 ---
# 앱별 기록을 붙이기 전의 과거 실행(자식 0행)은 실패로 추정하지 않는다.
# 새 실행부터는 기록된 앱 하나라도 실패하거나 3개가 덜 기록되면 같은 운영 경고를 연다.
STALE="$(psql_exec -c "
WITH latest AS (
  SELECT DISTINCT ON (job_type)
         run_key, job_type, status, COALESCE(finished_at, started_at) AS checked_at,
         local_ok, drive_ok, external_ok, artifact_count
  FROM public.system_backup_runs
  ORDER BY job_type, started_at DESC
), app_counts AS (
  SELECT run_key, count(*) AS recorded, count(*) FILTER (WHERE status = 'PASS') AS passed
  FROM public.system_backup_app_results
  GROUP BY run_key
)
SELECT CASE WHEN
  NOT EXISTS (SELECT 1 FROM latest WHERE job_type = 'daily')
  OR NOT EXISTS (SELECT 1 FROM latest WHERE job_type = 'restore')
  OR EXISTS (
    SELECT 1 FROM latest run LEFT JOIN app_counts apps USING (run_key)
    WHERE (run.job_type = 'daily' AND (
             run.status <> 'PASS' OR run.checked_at < now() - interval '26 hours'
             OR (run.artifact_count = 7 AND (
                   COALESCE(apps.recorded, 0) <> 3 OR COALESCE(apps.passed, 0) <> 3
                   OR run.local_ok IS DISTINCT FROM true
                   OR run.drive_ok IS DISTINCT FROM true
                   OR run.external_ok IS DISTINCT FROM true
                ))
          ))
       OR (run.job_type = 'restore' AND (
             run.status <> 'PASS' OR run.checked_at < now() - interval '40 days'
             OR (run.artifact_count = 7 AND (
                   COALESCE(apps.recorded, 0) <> 3 OR COALESCE(apps.passed, 0) <> 3
                   OR run.local_ok IS DISTINCT FROM true
                   OR run.drive_ok IS DISTINCT FROM true
                ))
          ))
  )
THEN 1 ELSE 0 END;" 2>/dev/null | tr -d ' ')"
if [ "${STALE:-0}" = "1" ]; then
    report backup_failed true "백업·복구 시각 또는 3개 앱 결과를 확인하세요"
else
    report backup_failed false ""
fi

# --- 6) 맥 본체·도커 VM 메모리와 게이트웨이 ---
#
# 하루 한 번 도는 지표 기록은 새벽 04:50 이라 가장 한가한 때다. 정작 알고 싶은 것은 수업 시간의
# 가장 나쁜 순간이라, 5분마다 도는 여기서 재서 그날의 최악값만 남긴다.
# 2026-08-23 에 도커 VM 메모리 여유가 10% 까지 떨어지고 스왑이 100% 찼는데, 그때는 이 값을
# 아무도 보지 않아 사람이 손으로 `free` 를 돌려 보고서야 알았다.
#
# 새 컨테이너를 띄우지 않고 이미 도는 DB 컨테이너에서 읽는다(5분마다이므로 가볍게 간다).
read -r MEM_TOTAL MEM_AVAIL SWAP_TOTAL SWAP_USED <<EOF
$("$DOCKER" exec agit-db sh -c "free -m" 2>/dev/null | awk '
NR==2 { total=$2; avail=$7 }
NR==3 { swap_total=$2; swap_used=$3 }
END { printf "%d %d %d %d", total, avail, swap_total, swap_used }')
EOF

# 스왑 사용량에는 과거에 밀려난 차가운 페이지가 오래 남을 수 있다. 그래서 총량만 보지 않고
# 실제 지연(PSI)과 직전 점검 이후 새로 밀려난 양(pswpout)을 함께 본다.
read -r VM_PSI_SOME_AVG60 VM_PSI_FULL_AVG60 <<EOF
$("$DOCKER" exec agit-db awk '
/^some / {
    for (i = 1; i <= NF; i += 1) if ($i ~ /^avg60=/) { sub(/^avg60=/, "", $i); some=$i }
}
/^full / {
    for (i = 1; i <= NF; i += 1) if ($i ~ /^avg60=/) { sub(/^avg60=/, "", $i); full=$i }
}
END { printf "%.2f %.2f", some + 0, full + 0 }
' /proc/pressure/memory 2>/dev/null)
EOF

VM_BOOT_ID="$("$DOCKER" exec agit-db cat /proc/sys/kernel/random/boot_id 2>/dev/null | tr -d '[:space:]')"
VM_PSWPOUT_PAGES="$("$DOCKER" exec agit-db awk '$1 == "pswpout" { print $2 }' /proc/vmstat 2>/dev/null | tr -d '[:space:]')"
VM_PAGE_SIZE="$("$DOCKER" exec agit-db getconf PAGESIZE 2>/dev/null | tr -d '[:space:]')"
[[ "${VM_PAGE_SIZE:-}" =~ ^[0-9]+$ ]] || VM_PAGE_SIZE=4096

SWAP_OUT_DELTA_KNOWN=false
SWAP_OUT_DELTA_MB=0
if [[ "${VM_PSWPOUT_PAGES:-}" =~ ^[0-9]+$ ]] && [ -n "${VM_BOOT_ID:-}" ]; then
    if [ -r "$VM_SWAP_STATE_FILE" ]; then
        read -r PREV_VM_BOOT_ID PREV_VM_PSWPOUT_PAGES < "$VM_SWAP_STATE_FILE" || true
        if [ "$PREV_VM_BOOT_ID" = "$VM_BOOT_ID" ] \
           && [[ "${PREV_VM_PSWPOUT_PAGES:-}" =~ ^[0-9]+$ ]] \
           && [ "$VM_PSWPOUT_PAGES" -ge "$PREV_VM_PSWPOUT_PAGES" ]; then
            SWAP_OUT_DELTA_PAGES=$(( VM_PSWPOUT_PAGES - PREV_VM_PSWPOUT_PAGES ))
            SWAP_OUT_DELTA_MB=$(( SWAP_OUT_DELTA_PAGES * VM_PAGE_SIZE / 1024 / 1024 ))
            SWAP_OUT_DELTA_KNOWN=true
        fi
    fi
    printf '%s %s\n' "$VM_BOOT_ID" "$VM_PSWPOUT_PAGES" > "${VM_SWAP_STATE_FILE}.tmp.$$"
    mv "${VM_SWAP_STATE_FILE}.tmp.$$" "$VM_SWAP_STATE_FILE"
fi

# 도커 VM 값만 보면 맥 본체가 굶어도 정상처럼 보인다. macOS 의 현재 메모리 여유와 스왑을
# 별도로 재서 화면에서 출처를 분명히 표시한다. 둘 다 값만 저장하며 원문 시스템 로그는 남기지 않는다.
HOST_MEM_PCT="$(/usr/bin/memory_pressure -Q 2>/dev/null | awk '/System-wide memory free percentage:/ {gsub(/%/, "", $5); print $5}')"
HOST_SWAP_USED="$(/usr/sbin/sysctl vm.swapusage 2>/dev/null | awk '
{
    for (i = 1; i <= NF; i += 1) {
        if ($i == "used") {
            value = $(i + 2); sub(/M$/, "", value); printf "%.0f", value; exit
        }
    }
}')"

# 게이트웨이 CPU 는 kong 워커 수를 언제 올릴지 판단하는 근거다.
read -r GW_CPU GW_MEM <<EOF
$("$DOCKER" stats --no-stream --format '{{.CPUPerc}} {{.MemUsage}}' agit-kong 2>/dev/null | awk '
{ cpu=$1; sub(/%/,"",cpu);
  mem=$2; unit=mem; sub(/^[0-9.]+/,"",unit); n=mem; sub(/[A-Za-z]+$/,"",n);
  mb = (unit=="GiB")? n*1024 : (unit=="KiB")? n/1024 : n;
  printf "%.1f %d", cpu, mb }')
EOF

if [ -n "${MEM_TOTAL:-}" ] && [ "${MEM_TOTAL:-0}" -gt 0 ] 2>/dev/null; then
    if ! psql_exec -c "SELECT public.record_system_resource_sample_v2(
        CURRENT_DATE, ${MEM_TOTAL}::int, ${MEM_AVAIL:-0}::int, ${SWAP_USED:-0}::int,
        ${GW_CPU:-0}::numeric, ${GW_MEM:-0}::int,
        ${HOST_MEM_PCT:-NULL}::numeric, ${HOST_SWAP_USED:-NULL}::int,
        ${FREE_GB:-NULL}::numeric, ${CONTAINER_TOTAL:-NULL}::int, ${CONTAINER_HEALTHY:-NULL}::int
    );" >/dev/null 2>&1; then
        # 배포는 DB 마이그레이션과 앱 이미지 사이에 짧은 순서 차이가 있다. 새 RPC 적용 전에도
        # 기존 5분 최고치 기록을 끊지 않는다.
        psql_exec -c "SELECT public.record_system_peak_v1(
            CURRENT_DATE, ${MEM_TOTAL}::int, ${MEM_AVAIL:-0}::int, ${SWAP_USED:-0}::int,
            ${GW_CPU:-0}::numeric, ${GW_MEM:-0}::int
        );" >/dev/null 2>&1 || true
    fi

    MEM_PCT=$(( MEM_AVAIL * 100 / MEM_TOTAL ))
    SWAP_PCT=0
    if [ "${SWAP_TOTAL:-0}" -gt 0 ] 2>/dev/null; then
        SWAP_PCT=$(( SWAP_USED * 100 / SWAP_TOTAL ))
    fi

    DOCKER_MEMORY_REASON=""
    if [ "$MEM_PCT" -lt "$VM_MEM_CRITICAL_PCT" ]; then
        DOCKER_MEMORY_REASON="$(append_reason "$DOCKER_MEMORY_REASON" "메모리 여유 ${VM_MEM_CRITICAL_PCT}% 미만")"
    fi
    if decimal_ge "$VM_PSI_SOME_AVG60" "$VM_PSI_SOME_ALERT_PCT" \
       || decimal_ge "$VM_PSI_FULL_AVG60" "$VM_PSI_FULL_ALERT_PCT"; then
        DOCKER_MEMORY_REASON="$(append_reason "$DOCKER_MEMORY_REASON" "메모리 지연 발생")"
    fi
    if [ "$SWAP_PCT" -ge "$VM_SWAP_NEAR_FULL_PCT" ] && [ "$MEM_PCT" -lt "$VM_MEM_WATCH_PCT" ]; then
        DOCKER_MEMORY_REASON="$(append_reason "$DOCKER_MEMORY_REASON" "스왑 ${VM_SWAP_NEAR_FULL_PCT}% 이상과 여유 ${VM_MEM_WATCH_PCT}% 미만")"
    fi
    if [ "$SWAP_OUT_DELTA_KNOWN" = true ] \
       && [ "$SWAP_OUT_DELTA_MB" -ge "$VM_SWAP_OUT_ALERT_MB" ] \
       && [ "$MEM_PCT" -lt "$VM_MEM_WATCH_PCT" ]; then
        DOCKER_MEMORY_REASON="$(append_reason "$DOCKER_MEMORY_REASON" "직전 점검 뒤 ${SWAP_OUT_DELTA_MB}MB 스왑 아웃")"
    fi

    if [ -n "$DOCKER_MEMORY_REASON" ]; then
        report docker_memory_pressure true "${DOCKER_MEMORY_REASON} · 여유 ${MEM_AVAIL}MB(${MEM_PCT}%) · 스왑 ${SWAP_USED:-0}/${SWAP_TOTAL:-0}MB(${SWAP_PCT}%) · PSI ${VM_PSI_SOME_AVG60:-0}/${VM_PSI_FULL_AVG60:-0}%"
    else
        report docker_memory_pressure false ""
    fi

    HOST_MEMORY_REASON=""
    if [ -n "${HOST_MEM_PCT:-}" ] && [ "$HOST_MEM_PCT" -lt "$HOST_MEM_CRITICAL_PCT" ] 2>/dev/null; then
        HOST_MEMORY_REASON="$(append_reason "$HOST_MEMORY_REASON" "맥 메모리 여유 ${HOST_MEM_CRITICAL_PCT}% 미만")"
    fi
    if [ -n "${HOST_MEM_PCT:-}" ] && [ -n "${HOST_SWAP_USED:-}" ] \
       && [ "$HOST_MEM_PCT" -lt "$HOST_MEM_WATCH_PCT" ] 2>/dev/null \
       && [ "$HOST_SWAP_USED" -gt "$HOST_SWAP_HIGH_MB" ] 2>/dev/null; then
        HOST_MEMORY_REASON="$(append_reason "$HOST_MEMORY_REASON" "맥 스왑 ${HOST_SWAP_HIGH_MB}MB 초과와 여유 ${HOST_MEM_WATCH_PCT}% 미만")"
    fi

    if [ -n "$HOST_MEMORY_REASON" ]; then
        report host_memory_pressure true "${HOST_MEMORY_REASON} · 여유 ${HOST_MEM_PCT:-?}% · 스왑 ${HOST_SWAP_USED:-?}MB"
    else
        report host_memory_pressure false ""
    fi

    # 2026-08-26 이전에는 스왑 100MB만으로 도커·맥을 합친 이 경고를 열었다. 새 기준으로 전환하면서
    # 과거에 열려 있던 행을 닫고, 이후에는 위의 출처별 경고만 사용한다.
    report memory_low false ""
fi

echo "상태 기록 완료 $(date '+%H:%M') — 앱 ${CODE} · 디스크 ${FREE_GB:-?}GB · 도커 여유 ${MEM_AVAIL:-?}MB · 맥 여유 ${HOST_MEM_PCT:-?}% · 게이트웨이 CPU ${GW_CPU:-?}%"
