#!/bin/bash
# 서비스가 살아 있는지 보고, 문제가 **새로 생기거나 풀릴 때만** 메일을 보낸다.
#
# 왜 "바뀔 때만" 인가:
#   5분마다 도는데 앱이 30분 죽어 있으면 6통이 온다. 그러면 곧 메일을 안 읽게 되고
#   알림이 있으나 마나가 된다. 그래서 보낼지 말지는 **DB 가 판단한다**
#   (`record_system_alert_v1` 이 상태가 바뀔 때만 should_notify=true 를 준다).
#   이 판단을 스크립트에 두면 스크립트가 재시작될 때마다 다시 보낸다.
#
# 거는 법(맥미니, launchd): 5분마다.
set -uo pipefail

DOCKER="${DOCKER:-/Applications/Docker.app/Contents/Resources/bin/docker}"
SECRETS="${SECRETS:-$HOME/agit-supabase/secrets.agit.env}"
APP_URL="${APP_URL:-http://127.0.0.1:8300/}"
DISK_MIN_GB="${DISK_MIN_GB:-10}"
ALERT_TO="${ALERT_TO:-01056649000yoo@gmail.com}"
ALERT_FROM="${ALERT_FROM:-알림 <onboarding@resend.dev>}"

psql_exec() {
    "$DOCKER" exec -i agit-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -t -A "$@"
}

# 메일 열쇠는 파일에서 읽고 로그에 남기지 않는다.
RESEND_API_KEY=""
if [ -f "$SECRETS" ]; then
    RESEND_API_KEY="$(grep -m1 '^RESEND_API_KEY=' "$SECRETS" 2>/dev/null | cut -d= -f2- | tr -d '"'"'"'' )"
fi

send_mail() {
    local subject="$1" body="$2"
    if [ -z "$RESEND_API_KEY" ]; then
        echo "메일 열쇠가 없어 보내지 못했습니다: $subject" >&2
        return 1
    fi
    # 본문에 시크릿이나 원문 로그를 넣지 않는다. 무엇이·언제만 담는다.
    curl -s -o /dev/null -w '' -X POST 'https://api.resend.com/emails' \
        -H "Authorization: Bearer ${RESEND_API_KEY}" \
        -H 'Content-Type: application/json' \
        --max-time 20 \
        -d "$(printf '{"from":"%s","to":["%s"],"subject":"%s","text":"%s"}' \
              "$ALERT_FROM" "$ALERT_TO" "$subject" "$body")"
}

# 문제 여부를 DB 에 적고, 보내야 한다고 하면 그때만 메일을 띄운다.
report() {
    local key="$1" is_problem="$2" detail="$3" label="$4"
    local result event
    result="$(psql_exec -c "SELECT public.record_system_alert_v1('${key}', ${is_problem}, \$detail\$${detail}\$detail\$);" 2>/dev/null)"
    case "$result" in
        *'"should_notify" : true'*|*'"should_notify":true'*) ;;
        *) return 0 ;;
    esac
    case "$result" in
        *resolved*) event="복구" ;;
        *) event="발생" ;;
    esac
    send_mail "[아지트] ${label} ${event}" "${label} ${event}$([ -n "$detail" ] && echo " — ${detail}")\\n\\n시각: $(date '+%Y-%m-%d %H:%M')"
    echo "알림 보냄: ${label} ${event}"
}

# --- 1) 앱이 응답하는가 ---
CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$APP_URL" 2>/dev/null)"
if [ "$CODE" = "200" ]; then
    report app_down false "" "앱 응답"
else
    report app_down true "HTTP ${CODE:-무응답}" "앱 응답"
fi

# --- 2) DB 가 응답하는가 ---
if psql_exec -c "SELECT 1;" >/dev/null 2>&1; then
    report db_down false "" "DB 응답"
else
    # DB 가 죽으면 report 자체를 못 쓴다. 이때만 바로 메일을 보낸다.
    send_mail "[아지트] DB 응답 없음" "agit-db 에 붙지 못했습니다.\\n\\n시각: $(date '+%Y-%m-%d %H:%M')"
    echo "DB 무응답 — 바로 메일 보냄" >&2
    exit 1
fi

# --- 3) 디스크 여유 ---
FREE_GB="$(df -g / 2>/dev/null | awk 'NR==2 {print $4}')"
if [ -n "${FREE_GB:-}" ] && [ "$FREE_GB" -lt "$DISK_MIN_GB" ] 2>/dev/null; then
    report disk_low true "여유 ${FREE_GB}GB (기준 ${DISK_MIN_GB}GB)" "디스크 여유"
else
    report disk_low false "" "디스크 여유"
fi

# --- 4) 컨테이너가 꺼져 있지 않은가 ---
BAD="$("$DOCKER" ps --format '{{.Names}} {{.Status}}' 2>/dev/null | grep -c 'unhealthy\|Restarting' | tr -d ' ')"
if [ "${BAD:-0}" -gt 0 ] 2>/dev/null; then
    NAMES="$("$DOCKER" ps --format '{{.Names}} {{.Status}}' 2>/dev/null | grep 'unhealthy\|Restarting' | awk '{print $1}' | paste -sd, - )"
    report container_down true "$NAMES" "컨테이너 상태"
else
    report container_down false "" "컨테이너 상태"
fi

# --- 5) 백업이 어제 안 돌았는가 ---
STALE="$(psql_exec -c "SELECT CASE WHEN max(started_at) < now() - interval '26 hours' OR max(started_at) IS NULL THEN 1 ELSE 0 END FROM public.system_backup_runs WHERE job_type = 'daily';" 2>/dev/null | tr -d ' ')"
if [ "${STALE:-0}" = "1" ]; then
    report backup_failed true "26시간 넘게 새 백업 기록이 없습니다" "백업"
else
    report backup_failed false "" "백업"
fi

echo "점검 완료 $(date '+%H:%M') — 앱 ${CODE} · 디스크 ${FREE_GB:-?}GB"
