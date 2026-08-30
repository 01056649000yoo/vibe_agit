#!/bin/bash
# One-shot guarded production update for 2026-08-30 05:30 KST.
set -Eeuo pipefail
umask 077

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
DOCKER="/Applications/Docker.app/Contents/Resources/bin/docker"
USER_HOME="/Users/seunghyeonmaegmini"
REPO_ROOT="$USER_HOME/vibe_agit"
STACK_ROOT="$USER_HOME/agit-supabase"
STAGE_ROOT="$STACK_ROOT/upgrade-staging/20260830-self-hosted-v0.8.0"
STATUS="$USER_HOME/backups/auto/supabase-upgrade-status.txt"
LOG="$USER_HOME/Library/Logs/agit-supabase-upgrade-v080.log"
REHEARSAL_STATUS="$USER_HOME/backups/auto/supabase-v080-rehearsal-status.txt"
LOCK_DIR="$USER_HOME/backups/auto/.supabase-upgrade-v080.lock"
EXPECTED_DAY="2026-08-30"
MODE="${1:---apply}"
# 기동 직후 스모크 전에 기다릴 시간과, 세 앱 확인에 줄 여유.
SETTLE_SECONDS="${SETTLE_SECONDS:-20}"
CONFIG_APPLIED=false
BACKUP_ROOT=""

log() { printf '%s %s\n' "$(date '+%F %T')" "$*" | tee -a "$LOG"; }
write_status() { printf '%s %s %s\n' "$1" "$(date '+%F %T')" "$2" > "$STATUS"; }
fail() { write_status BLOCKED "$*"; log "BLOCKED $*"; exit 1; }

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  fail "another upgrade process or completed one-shot lock exists"
fi
trap 'code=$?; if [ "$code" -ne 0 ] && [ "$CONFIG_APPLIED" = true ]; then rollback_config || true; fi; if [ "$MODE" = "--preflight-only" ]; then rmdir "$LOCK_DIR" 2>/dev/null || true; fi; exit "$code"' EXIT

[ "$MODE" = "--apply" ] || [ "$MODE" = "--preflight-only" ] || fail "unsupported mode"
if [ "$MODE" = "--apply" ]; then
  [ "$(date +%F)" = "$EXPECTED_DAY" ] || fail "date guard expected $EXPECTED_DAY"
fi
[ -d "$STAGE_ROOT" ] || fail "staged target missing"
(cd "$STAGE_ROOT" && shasum -a 256 -c SHA256SUMS >/dev/null) || fail "staged target checksum mismatch"
grep -q '^PASS 2026-08-29 ' "$REHEARSAL_STATUS" 2>/dev/null || fail "isolated rehearsal did not pass"

FREE_GB=$(df -g / | awk 'NR==2 {print $4}')
[ "${FREE_GB:-0}" -ge 10 ] || fail "less than 10GB free disk"
"$DOCKER" info >/dev/null 2>&1 || fail "Docker unavailable"

if [ "$MODE" = "--apply" ]; then
  grep -q '^PASS .*2026-08-30' "$USER_HOME/backups/auto/backup-status.txt" 2>/dev/null \
    || fail "04:00 integrated backup is not PASS"
  tail -n 8 "$USER_HOME/Library/Logs/agit-backup-monitor.stdout.log" 2>/dev/null \
    | grep -q 'date=2026-08-30 result=PASS ' \
    || fail "05:00 backup monitor is not PASS"
fi

EXPECTED_IMAGES=(
  'supabase/studio:2026.08.03-sha-022b374'
  'kong/kong:3.9.3'
  'supabase/gotrue:v2.189.0'
  'postgrest/postgrest:v14.12'
  'supabase/realtime:v2.102.3'
  'supabase/storage-api:v1.60.4'
  'darthsim/imgproxy:v3.30.1'
  'supabase/postgres-meta:v0.96.6'
  'supabase/edge-runtime:v1.74.0'
  'supabase/logflare:1.43.1'
  'supabase/postgres:17.6.1.136'
  'supabase/supavisor:2.9.5'
)
for image in "${EXPECTED_IMAGES[@]}"; do
  "$DOCKER" image inspect "$image" >/dev/null 2>&1 || fail "pre-pulled image missing: $image"
done

for container in agit-db agit-auth agit-rest agit-realtime agit-storage agit-imgproxy agit-edge-functions agit-kong; do
  state=$("$DOCKER" inspect -f '{{.State.Status}}' "$container" 2>/dev/null || true)
  [ "$state" = running ] || fail "required container is not running: $container"
done

log "preflight PASS"
if [ "$MODE" = "--preflight-only" ]; then
  write_status READY "preflight-only target=self-hosted/v0.8.0"
  rmdir "$LOCK_DIR"
  trap - EXIT
  exit 0
fi

BACKUP_ROOT="$STACK_ROOT/upgrade-backups/$(date +%Y%m%d-%H%M%S)-pre-v080"
mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"
FILES=(docker-compose.yml docker-compose.pg17.yml docker-compose.agit.yml .env volumes/api/kong.yml volumes/api/kong-entrypoint.sh volumes/functions/main/index.ts)
NEW_FILES=()
for file in .supabase-version update.sh upgrades.json; do
  if [ -e "$STACK_ROOT/$file" ]; then FILES+=("$file"); else NEW_FILES+=("$file"); fi
done
(cd "$STACK_ROOT" && tar czf "$BACKUP_ROOT/config.tar.gz" "${FILES[@]}")
printf '%s\n' "${NEW_FILES[@]}" > "$BACKUP_ROOT/remove-on-rollback.txt"
"$DOCKER" inspect --format '{{.Name}} {{.Config.Image}} {{.Image}}' \
  agit-db agit-auth agit-rest agit-realtime agit-storage agit-imgproxy agit-edge-functions agit-kong \
  > "$BACKUP_ROOT/container-images.txt"
"$DOCKER" exec agit-db pg_dump -U supabase_admin -d postgres -Fc \
  -n public -n auth -n storage -n writing_helper -n writing_helper_internal -n app -n samlink \
  --no-owner -f /tmp/pre-v080.dump
"$DOCKER" cp agit-db:/tmp/pre-v080.dump "$BACKUP_ROOT/pre-v080.dump" >/dev/null
"$DOCKER" exec agit-db rm -f /tmp/pre-v080.dump
chmod 600 "$BACKUP_ROOT"/*
log "pre-update config and database rollback assets created"

rollback_config() {
  [ -n "$BACKUP_ROOT" ] && [ -s "$BACKUP_ROOT/config.tar.gz" ] || return 1
  log "automatic config/image rollback started"
  tar xzf "$BACKUP_ROOT/config.tar.gz" -C "$STACK_ROOT"
  while IFS= read -r file; do
    [ -n "$file" ] && rm -f "$STACK_ROOT/$file"
  done < "$BACKUP_ROOT/remove-on-rollback.txt"
  (cd "$STACK_ROOT" && "$DOCKER" compose up -d --remove-orphans --wait --wait-timeout 420) >>"$LOG" 2>&1
  write_status ROLLED_BACK "target=self-hosted/v0.8.0 check-log=$LOG"
  CONFIG_APPLIED=false
  log "automatic config/image rollback completed"
}

CONFIG_APPLIED=true
for file in docker-compose.yml docker-compose.pg17.yml docker-compose.agit.yml .supabase-version update.sh upgrades.json; do
  mode=600; [[ "$file" == *.sh ]] && mode=755
  install -m "$mode" "$STAGE_ROOT/$file" "$STACK_ROOT/$file"
done
install -m 600 "$STAGE_ROOT/volumes/api/kong.yml" "$STACK_ROOT/volumes/api/kong.yml"
install -m 755 "$STAGE_ROOT/volumes/api/kong-entrypoint.sh" "$STACK_ROOT/volumes/api/kong-entrypoint.sh"
install -m 600 "$STAGE_ROOT/volumes/functions/main/index.ts" "$STACK_ROOT/volumes/functions/main/index.ts"

ENV_TMP="$STACK_ROOT/.env.upgrade-v080.$$"
awk '
  /^API_EXTERNAL_URL=/ {
    value=substr($0, index($0, "=") + 1)
    sub(/\/$/, "", value)
    if (value !~ /\/auth\/v1$/) value=value "/auth/v1"
    print "API_EXTERNAL_URL=" value
    seen_api=1
    next
  }
  /^API_GW_HTTP_PORT=/ { print "API_GW_HTTP_PORT=8100"; seen_gw=1; next }
  /^REALTIME_DB_ENC_KEY=/ { print; seen_rt=1; next }
  { print }
  END {
    if (!seen_api) exit 3
    if (!seen_gw) print "API_GW_HTTP_PORT=8100"
    if (!seen_rt) print "REALTIME_DB_ENC_KEY=supabaserealtime"
  }
' "$STACK_ROOT/.env" > "$ENV_TMP"
chmod 600 "$ENV_TMP"
mv "$ENV_TMP" "$STACK_ROOT/.env"

(cd "$STACK_ROOT" && "$DOCKER" compose config -q) || fail "production compose config invalid after staging"
log "target config installed"
(cd "$STACK_ROOT" && "$DOCKER" compose up -d --remove-orphans --wait --wait-timeout 420) >>"$LOG" 2>&1 \
  || fail "updated containers did not become ready"

# 컨테이너가 healthy 여도 Kong 뒤의 첫 요청은 늦다. 2026-08-30 에 이 때문에
# 세 앱 확인이 10초를 넘겨 잘못 롤백됐다. 잠깐 자리를 잡게 둔다.
log "waiting ${SETTLE_SECONDS}s for the stack to settle before smoke tests"
sleep "$SETTLE_SECONDS"

ANON_KEY=$(awk -F= '$1=="ANON_KEY" {print substr($0,index($0,"=")+1); exit}' "$STACK_ROOT/.env")
SERVICE_KEY=$(awk -F= '$1=="SERVICE_ROLE_KEY" {print substr($0,index($0,"=")+1); exit}' "$STACK_ROOT/.env")
expect_code() {
  local label="$1" expected="$2"; shift 2
  local actual
  actual=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 25 "$@" || true)
  [ "$actual" = "$expected" ] || fail "$label HTTP smoke expected $expected, received ${actual:-000}"
}
expect_code auth 200 -H "apikey: $ANON_KEY" http://127.0.0.1:8100/auth/v1/health
expect_code rest 200 -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" http://127.0.0.1:8100/rest/v1/
expect_code storage 200 -H "apikey: $ANON_KEY" http://127.0.0.1:8100/storage/v1/status
expect_code realtime-openapi 403 -H "apikey: $ANON_KEY" http://127.0.0.1:8100/realtime/v1/api/openapi
expect_code realtime-tenants 403 -H "apikey: $ANON_KEY" http://127.0.0.1:8100/realtime/v1/api/tenants

WS_CODE=$(curl --http1.1 -sS -o /dev/null -w '%{http_code}' --max-time 10 \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: c3VwYWJhc2UtdjA4MC1zbW9rZQ==' \
  -H "apikey: $ANON_KEY" \
  "http://127.0.0.1:8100/realtime/v1/websocket?apikey=$ANON_KEY&vsn=1.0.0" || true)
[ "$WS_CODE" = 101 ] || fail "Realtime WebSocket smoke failed (${WS_CODE:-000})"

APP_TRIES=5 APP_TIMEOUT=20 APP_RETRY_WAIT=6 DB_TRIES=6 DB_RETRY_WAIT=5 \
  "$REPO_ROOT/scripts/check-service-health.sh" >>"$LOG" 2>&1 \
  || fail "three-app service health smoke failed"
"$DOCKER" exec agit-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -Atc \
  "SELECT 1 WHERE EXISTS (SELECT 1 FROM auth.users) AND EXISTS (SELECT 1 FROM public.applied_migrations);" \
  | grep -q '^1$' || fail "database content smoke failed"

write_status PASS "target=self-hosted/v0.8.0 kong=3.9.3 backup=$BACKUP_ROOT"
log "PASS self-hosted/v0.8.0 component bundle with Kong compatibility layout"
CONFIG_APPLIED=false
trap - EXIT
