#!/bin/bash
# 7일 모니터링의 하루 판정을 같은 읽기 기준으로 반복한다.
# 파일명·로그 본문·원격 경로·시크릿은 출력하지 않고 안전한 개수와 상태만 낸다.
set -uo pipefail

MONITOR_HOME="${AGIT_MONITOR_HOME:-/Users/seunghyeonmaegmini}"
DOCKER="${DOCKER:-/Applications/Docker.app/Contents/Resources/bin/docker}"
RCLONE="${RCLONE:-/opt/homebrew/bin/rclone}"
CURL="${CURL:-/usr/bin/curl}"
EXTERNAL_CRYPT="${EXTERNAL_CRYPT:-$MONITOR_HOME/vibe_agit/scripts/external-backup-crypt.sh}"
MONITOR_DAY="${1:-$(date +%F)}"

if [[ ! "$MONITOR_DAY" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "usage: $0 YYYY-MM-DD" >&2
  exit 2
fi
DAY_KEY="${MONITOR_DAY//-/}"

psql_value() {
  "$DOCKER" exec -i agit-db psql -U supabase_admin -d postgres \
    -v ON_ERROR_STOP=1 -t -A -F '|' -c "$1" 2>/dev/null
}

RUN_LINE=$(psql_value "
SELECT r.status, COALESCE(r.artifact_count, -1),
       COALESCE(r.local_ok::text, 'null'), COALESCE(r.drive_ok::text, 'null'),
       COALESCE(r.external_ok::text, 'null'),
       count(a.app_key), count(*) FILTER (WHERE a.status = 'PASS')
FROM (
  SELECT * FROM public.system_backup_runs
  WHERE job_type = 'daily' AND backup_day = DATE '${MONITOR_DAY}'
  ORDER BY started_at DESC LIMIT 1
) r
LEFT JOIN public.system_backup_app_results a USING (run_key)
GROUP BY r.run_key, r.status, r.artifact_count, r.local_ok, r.drive_ok, r.external_ok;" || true)

BACKUP_STATUS="missing"
ARTIFACT_COUNT=-1
LOCAL_OK="null"
DRIVE_OK="null"
EXTERNAL_OK="null"
APP_RECORDED=0
APP_PASSED=0
if [ -n "$RUN_LINE" ]; then
  IFS='|' read -r BACKUP_STATUS ARTIFACT_COUNT LOCAL_OK DRIVE_OK EXTERNAL_OK APP_RECORDED APP_PASSED <<< "$RUN_LINE"
fi

RESTORE_LINE=$(psql_value "
SELECT r.status,
       CASE WHEN COALESCE(r.finished_at, r.started_at) >= NOW() - INTERVAL '40 days' THEN 1 ELSE 0 END,
       count(a.app_key), count(*) FILTER (WHERE a.status = 'PASS')
FROM (
  SELECT * FROM public.system_backup_runs
  WHERE job_type = 'restore'
  ORDER BY started_at DESC LIMIT 1
) r
LEFT JOIN public.system_backup_app_results a USING (run_key)
GROUP BY r.run_key, r.status, r.finished_at, r.started_at;" || true)
RESTORE_STATUS="missing"
RESTORE_FRESH=0
RESTORE_RECORDED=0
RESTORE_PASSED=0
if [ -n "$RESTORE_LINE" ]; then
  IFS='|' read -r RESTORE_STATUS RESTORE_FRESH RESTORE_RECORDED RESTORE_PASSED <<< "$RESTORE_LINE"
fi

count_files() {
  local target="$1"
  if [ ! -d "$target" ]; then
    printf '%s' -1
    return
  fi
  find "$target" -maxdepth 1 -type f 2>/dev/null | wc -l | tr -d ' '
}

LOCAL_COUNT=$(count_files "$MONITOR_HOME/backups/auto/$DAY_KEY")
EXTERNAL_COUNT=-1
if [ -x "$EXTERNAL_CRYPT" ]; then
  EXTERNAL_COUNT=$("$EXTERNAL_CRYPT" count "$DAY_KEY" 2>/dev/null || printf '%s' -1)
fi
DRIVE_COUNT=-1
if "$RCLONE" lsf --files-only "agitcrypt:$DAY_KEY" >/dev/null 2>&1; then
  DRIVE_COUNT=$("$RCLONE" lsf --files-only "agitcrypt:$DAY_KEY" 2>/dev/null | grep -c . | tr -d ' ')
fi

SAMLINK_DUMP="$MONITOR_HOME/Backups/supabase/postgres-$DAY_KEY.sql.gz"
SAMLINK_RAW=0
if [ -s "$SAMLINK_DUMP" ]; then
  SAMLINK_RAW=$(gzip -dc "$SAMLINK_DUMP" 2>/dev/null | wc -c | tr -d ' ')
fi
SAMLINK_OK=false
if [ "${SAMLINK_RAW:-0}" -ge 100000 ] 2>/dev/null; then
  SAMLINK_OK=true
fi

OPEN_ALERTS=$(psql_value "
SELECT count(*) FROM public.system_alert_events
WHERE alert_key = 'backup_failed' AND status = 'open';" || printf '%s' -1)
OPEN_ALERTS="${OPEN_ALERTS:-1}"

http_code() {
  local code
  code=$("$CURL" -s -o /dev/null -w '%{http_code}' --max-time 10 "$@" 2>/dev/null || true)
  printf '%s' "${code:-000}"
}
# 아지트 apex는 맥미니에서 NAT 루프백이 안 되므로 같은 공개 Host/TLS를 호스트 Caddy로 직접 보낸다.
# 샘링크·자비스는 공개 주소를 그대로 확인한다.
AGIT_CODE=$(http_code --resolve xn--vz0ba242ncqcba79xhwx.site:443:127.0.0.1 \
  "https://xn--vz0ba242ncqcba79xhwx.site/")
SAMLINK_CODE=$(http_code "https://xn--9y2br3k43n.kr/")
JARVIS_CODE=$(http_code "https://app.xn--9y2br3k43n.kr/")

RESTORE_OK=false
if [ "$RESTORE_STATUS" = "PASS" ] && [ "$RESTORE_FRESH" = "1" ]; then
  if [ "$RESTORE_RECORDED" = "0" ] \
     || { [ "$RESTORE_RECORDED" = "3" ] && [ "$RESTORE_PASSED" = "3" ]; }; then
    RESTORE_OK=true
  fi
fi

RESULT=FAIL
if [ "$BACKUP_STATUS" = "PASS" ] \
   && [ "$ARTIFACT_COUNT" = "7" ] \
   && [ "$LOCAL_OK" = "true" ] && [ "$DRIVE_OK" = "true" ] && [ "$EXTERNAL_OK" = "true" ] \
   && [ "$APP_RECORDED" = "3" ] && [ "$APP_PASSED" = "3" ] \
   && [ "$LOCAL_COUNT" = "7" ] && [ "$DRIVE_COUNT" = "7" ] && [ "$EXTERNAL_COUNT" = "7" ] \
   && [ "$SAMLINK_OK" = "true" ] && [ "$OPEN_ALERTS" = "0" ] \
   && [ "$AGIT_CODE" = "200" ] && [ "$SAMLINK_CODE" = "200" ] \
   && [[ "$JARVIS_CODE" =~ ^(200|30[1278])$ ]] \
   && [ "$RESTORE_OK" = "true" ]; then
  RESULT=PASS
fi

printf 'date=%s result=%s backup=%s apps=%s/%s artifacts=%s copies=%s/%s/%s samlink=%s restore=%s/%s/%s alerts=%s services=%s/%s/%s\n' \
  "$MONITOR_DAY" "$RESULT" "$BACKUP_STATUS" "$APP_PASSED" "$APP_RECORDED" "$ARTIFACT_COUNT" \
  "$LOCAL_COUNT" "$DRIVE_COUNT" "$EXTERNAL_COUNT" "$SAMLINK_OK" \
  "$RESTORE_STATUS" "$RESTORE_PASSED" "$RESTORE_RECORDED" "$OPEN_ALERTS" \
  "$AGIT_CODE" "$SAMLINK_CODE" "$JARVIS_CODE"

[ "$RESULT" = "PASS" ]
