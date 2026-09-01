#!/bin/bash
# 오픈클로가 텔레그램으로 전달할 간단한 아지트 상태다.
# 첫 줄은 서비스 지속 가능성만 판정하고, 핵심 수치와 관리자 상세 화면 위치를 함께 보낸다.
set -u

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
HEALTH_CHECK_SCRIPT="${HEALTH_CHECK_SCRIPT:-${SCRIPT_DIR}/check-service-health.sh}"
DOCKER="${DOCKER:-/Applications/Docker.app/Contents/Resources/bin/docker}"
CURL="${CURL:-/usr/bin/curl}"
DF="${DF:-/bin/df}"
APP_URL="${APP_URL:-http://127.0.0.1:8300/}"
DETAIL_URL="${DETAIL_URL:-https://끄적끄적아지트.site}"
DISK_MIN_GB="${DISK_MIN_GB:-10}"
CORE_CONTAINERS="${CORE_CONTAINERS:-agit-app agit-db agit-kong agit-auth agit-rest agit-realtime agit-storage agit-imgproxy agit-edge-functions}"

NORMAL_MESSAGE='🟢 끄적끄적 아지트 정상'
PROBLEM_MESSAGE='🔴 끄적끄적 아지트 문제 있음'
has_problem=false
notice_count=0

# 기존 5분 건강검진을 그대로 실행해 판정 원본을 둘로 만들지 않는다.
# 이 스크립트의 stdout/stderr는 텔레그램으로 전달될 수 있으므로 모두 숨긴다.
if ! "$HEALTH_CHECK_SCRIPT" >/dev/null 2>&1; then
    # 기록기 자체 실패는 서비스 중단과 구분한다. 아래 직접 확인이 실제 앱 지속 가능성을 판정한다.
    notice_count=$((notice_count + 1))
fi

# DB가 죽으면 건강검진이 경고 행을 기록하지 못하므로 앱과 DB는 한 번 더 직접 확인한다.
app_code="$($CURL -s -o /dev/null -w '%{http_code}' --max-time 15 "$APP_URL" 2>/dev/null || true)"
if [ "$app_code" != "200" ]; then
    has_problem=true
    if [ -z "$app_code" ] || [ "$app_code" = "000" ]; then
        app_status='앱 무응답'
    else
        app_status="앱 HTTP ${app_code}"
    fi
else
    app_status='앱 정상'
fi

db_ok="$($DOCKER exec -i agit-db psql -U supabase_admin -d postgres -t -A \
    -c 'SELECT 1;' 2>/dev/null | tr -d '[:space:]' || true)"
if [ "$db_ok" != "1" ]; then
    has_problem=true
    db_status='DB 무응답'
else
    db_status='DB 정상'
fi

# 정적 페이지와 DB가 살아 있어도 인증·API·파일 기능을 맡는 핵심 컨테이너가 꺼지면 장애로 본다.
core_total=0
core_healthy=0
for container_name in $CORE_CONTAINERS; do
    core_total=$((core_total + 1))
    container_state="$($DOCKER inspect -f '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}' \
        "$container_name" 2>/dev/null || true)"
    case "$container_state" in
        'running|'|'running|healthy') core_healthy=$((core_healthy + 1)) ;;
    esac
done
if [ "$core_healthy" -ne "$core_total" ]; then
    has_problem=true
fi

# 디스크 10GB 미만은 아직 응답 중이어도 곧 쓰기·배포가 멈출 수 있어 중단 위험으로 올린다.
disk_free_gb="$($DF -g / 2>/dev/null | awk 'NR == 2 { print $4 }' | tr -d '[:space:]' || true)"
case "$disk_free_gb" in
    ''|*[!0-9]*) disk_status='디스크 확인 불가'; notice_count=$((notice_count + 1)) ;;
    *)
        disk_status="디스크 ${disk_free_gb}GB"
        [ "$disk_free_gb" -lt "$DISK_MIN_GB" ] && has_problem=true
        ;;
esac

# 메모리 압박은 기존 건강검진의 지속 조건을 재사용한다. 백업 실패와 비핵심 컨테이너 경고는
# 운영 참고로만 표시하고 첫 줄을 빨간색으로 바꾸지 않는다.
resource_risk_count=0
if [ "$db_ok" = "1" ]; then
    alert_counts="$($DOCKER exec -i agit-db psql -U supabase_admin -d postgres -t -A -c "
SELECT
  count(*) FILTER (
    WHERE status = 'open'
      AND alert_key IN ('docker_memory_pressure', 'host_memory_pressure')
  )::text || '|' ||
  count(*) FILTER (
    WHERE status = 'open'
      AND alert_key IN ('backup_failed', 'container_down')
  )::text
FROM public.system_alert_events;" 2>/dev/null | tr -d '[:space:]' || true)"
    case "$alert_counts" in
        *'|'*)
            resource_risk_count="${alert_counts%%|*}"
            operational_notice_count="${alert_counts#*|}"
            case "$resource_risk_count" in ''|*[!0-9]*) resource_risk_count=0; notice_count=$((notice_count + 1)) ;; esac
            case "$operational_notice_count" in ''|*[!0-9]*) notice_count=$((notice_count + 1)) ;; *) notice_count=$((notice_count + operational_notice_count)) ;; esac
            ;;
        *) notice_count=$((notice_count + 1)) ;;
    esac
fi
[ "$resource_risk_count" -gt 0 ] 2>/dev/null && has_problem=true

detail_line="${app_status} · ${db_status} · 핵심 ${core_healthy}/${core_total} · ${disk_status}"
[ "$resource_risk_count" -gt 0 ] 2>/dev/null && detail_line="${detail_line} · 중단 위험 ${resource_risk_count}건"
[ "$notice_count" -gt 0 ] && detail_line="${detail_line} · 운영 참고 ${notice_count}건"

if [ "$has_problem" = true ]; then
    summary_message="$PROBLEM_MESSAGE"
else
    summary_message="$NORMAL_MESSAGE"
fi

# 원문 로그나 비밀 값 대신 관리자 화면에서 인증 후 상세 원인을 확인하게 한다.
printf '%s\n%s\n세부 보기: %s (관리자 → 서버 상태)\n' \
    "$summary_message" "$detail_line" "$DETAIL_URL"

# command cron이 상세 실행 오류를 덧붙이지 않고 위 요약만 전달하게 한다.
exit 0
