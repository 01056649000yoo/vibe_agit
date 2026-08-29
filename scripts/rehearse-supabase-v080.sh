#!/bin/bash
# Restore the newest integrated backup into an isolated v0.8.0 stack and smoke-test it.
set -Eeuo pipefail
umask 077

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
DOCKER="/Applications/Docker.app/Contents/Resources/bin/docker"
USER_HOME="/Users/seunghyeonmaegmini"
LIVE_ROOT="$USER_HOME/agit-supabase"
STAGE_ROOT="$LIVE_ROOT/upgrade-staging/20260830-self-hosted-v0.8.0"
REPO_ROOT="$USER_HOME/vibe_agit"
OVERRIDE="$REPO_ROOT/ops/supabase-v080/docker-compose.rehearsal.yml"
OWNER_SQL="$REPO_ROOT/scripts/normalize-supabase-restore-owners.sql"
STATUS="$USER_HOME/backups/auto/supabase-v080-rehearsal-status.txt"
LOG="$USER_HOME/backups/auto/supabase-v080-rehearsal-20260829.log"
TMP_ROOT=""

log() { printf '%s %s\n' "$(date '+%F %T')" "$*" | tee -a "$LOG"; }
fail() { printf 'FAIL %s %s\n' "$(date '+%F %T')" "$*" > "$STATUS"; log "FAIL $*"; exit 1; }

cleanup() {
  local code=$?
  if [ -n "$TMP_ROOT" ] && [[ "$TMP_ROOT" == /private/tmp/agit-supabase-v080-rehearsal.* ]]; then
    if [ "$code" -ne 0 ] && [ "${KEEP_REHEARSAL_ON_FAIL:-0}" = "1" ]; then
      log "diagnostic workspace retained at $TMP_ROOT"
      exit "$code"
    fi
    "$DOCKER" compose \
      --env-file "$TMP_ROOT/.env" \
      -f "$TMP_ROOT/docker-compose.yml" \
      -f "$TMP_ROOT/docker-compose.pg17.yml" \
      -f "$TMP_ROOT/docker-compose.agit.yml" \
      -f "$OVERRIDE" down -v --remove-orphans >/dev/null 2>&1 || true
    rm -rf "$TMP_ROOT"
  fi
  exit "$code"
}
trap cleanup EXIT

[ -d "$STAGE_ROOT" ] || fail "staged target missing"
(cd "$STAGE_ROOT" && shasum -a 256 -c SHA256SUMS >/dev/null) || fail "staged target checksum mismatch"

BACKUP_DAY=$(find "$USER_HOME/backups/auto" -maxdepth 1 -type d -name '20??????' -print 2>/dev/null \
  | awk -F/ '{print $NF}' | sort | tail -1)
[ -n "$BACKUP_DAY" ] || fail "backup directory missing"
BACKUP_ROOT="$USER_HOME/backups/auto/$BACKUP_DAY"
for file in "아지트DB.dump" "리얼타임설정.dump" "아지트Storage.tar.gz"; do
  [ -s "$BACKUP_ROOT/$file" ] || fail "required backup artifact missing"
done

TMP_ROOT=$(mktemp -d /private/tmp/agit-supabase-v080-rehearsal.XXXXXX)
log "isolated workspace created"
rsync -a \
  --exclude '.DS_Store' --exclude '*.bak-*' --exclude 'compose-backups' \
  --exclude 'retired-functions-*' --exclude 'upgrade-staging' \
  --exclude 'volumes/db/data' --exclude 'volumes/db/rehearsal-data' \
  "$LIVE_ROOT/" "$TMP_ROOT/"
rsync -a "$STAGE_ROOT/" "$TMP_ROOT/"
mkdir -p "$TMP_ROOT/volumes/db/rehearsal-data"
chmod 600 "$TMP_ROOT/.env" "$TMP_ROOT/secrets.agit.env"

ENV_TMP="$TMP_ROOT/.env.next"
awk '
  /^API_EXTERNAL_URL=/ {
    value=substr($0, index($0, "=") + 1)
    sub(/\/$/, "", value)
    if (value !~ /\/auth\/v1$/) value=value "/auth/v1"
    print "API_EXTERNAL_URL=" value
    seen_api=1
    next
  }
  /^API_GW_HTTP_PORT=/ { print "API_GW_HTTP_PORT=18100"; seen_gw=1; next }
  /^REALTIME_DB_ENC_KEY=/ { print; seen_rt=1; next }
  { print }
  END {
    if (!seen_api) exit 3
    if (!seen_gw) print "API_GW_HTTP_PORT=18100"
    if (!seen_rt) print "REALTIME_DB_ENC_KEY=supabaserealtime"
  }
' "$TMP_ROOT/.env" > "$ENV_TMP" || fail "rehearsal env preparation failed"
mv "$ENV_TMP" "$TMP_ROOT/.env"
chmod 600 "$TMP_ROOT/.env"

compose() {
  "$DOCKER" compose --env-file "$TMP_ROOT/.env" \
    -f "$TMP_ROOT/docker-compose.yml" \
    -f "$TMP_ROOT/docker-compose.pg17.yml" \
    -f "$TMP_ROOT/docker-compose.agit.yml" \
    -f "$OVERRIDE" "$@"
}

compose config -q || fail "rehearsal compose config invalid"
log "compose structure validated"
compose up -d --wait --wait-timeout 300 db || fail "v0.8.0 Postgres did not become healthy"
log "v0.8.0 Postgres initialized"

"$DOCKER" cp "$BACKUP_ROOT/아지트DB.dump" agit-rehearsal-db:/tmp/agit.dump >/dev/null
"$DOCKER" exec -i agit-rehearsal-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
DROP SCHEMA IF EXISTS auth CASCADE;
DROP SCHEMA IF EXISTS storage CASCADE;
DROP SCHEMA IF EXISTS writing_helper CASCADE;
DROP SCHEMA IF EXISTS writing_helper_internal CASCADE;
DROP SCHEMA IF EXISTS app CASCADE;
DROP SCHEMA IF EXISTS samlink CASCADE;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;
SQL
"$DOCKER" exec agit-rehearsal-db pg_restore -U supabase_admin -d postgres --no-owner --exit-on-error /tmp/agit.dump >/dev/null \
  || fail "integrated database restore failed on v0.8.0 Postgres"
"$DOCKER" exec -i agit-rehearsal-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  < "$OWNER_SQL" >/dev/null || fail "Auth/Storage restore ownership normalization failed"

"$DOCKER" cp "$BACKUP_ROOT/리얼타임설정.dump" agit-rehearsal-db:/tmp/realtime.dump >/dev/null
"$DOCKER" exec -i agit-rehearsal-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  -c 'DROP SCHEMA IF EXISTS _realtime CASCADE;' >/dev/null
"$DOCKER" exec agit-rehearsal-db pg_restore -U supabase_admin -d postgres --no-owner --exit-on-error /tmp/realtime.dump >/dev/null \
  || fail "Realtime settings restore failed"

"$DOCKER" run --rm --user 0 \
  -v agit-rehearsal_rehearsal-storage:/restore \
  -v "$BACKUP_ROOT:/backup:ro" \
  supabase/storage-api:v1.60.4 \
  sh -c 'tar xzf /backup/아지트Storage.tar.gz -C /restore' >/dev/null \
  || fail "Storage archive restore failed"
log "database and Storage backup restored"

compose up -d --wait --wait-timeout 420 || fail "isolated v0.8.0 services did not become ready"

ANON_KEY=$(awk -F= '$1=="ANON_KEY" {print substr($0,index($0,"=")+1); exit}' "$TMP_ROOT/.env")
SERVICE_KEY=$(awk -F= '$1=="SERVICE_ROLE_KEY" {print substr($0,index($0,"=")+1); exit}' "$TMP_ROOT/.env")
[ -n "$ANON_KEY" ] && [ -n "$SERVICE_KEY" ] || fail "API keys unavailable"

expect_code() {
  local label="$1" expected="$2"; shift 2
  local actual
  actual=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$@" || true)
  [ "$actual" = "$expected" ] || fail "$label HTTP smoke expected $expected, received ${actual:-000}"
}

expect_code auth 200 -H "apikey: $ANON_KEY" http://127.0.0.1:18100/auth/v1/health
expect_code rest 200 -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" http://127.0.0.1:18100/rest/v1/
expect_code storage 200 -H "apikey: $ANON_KEY" http://127.0.0.1:18100/storage/v1/status
expect_code realtime-openapi 403 -H "apikey: $ANON_KEY" http://127.0.0.1:18100/realtime/v1/api/openapi
expect_code realtime-tenants 403 -H "apikey: $ANON_KEY" http://127.0.0.1:18100/realtime/v1/api/tenants

WS_CODE=$(curl --http1.1 -sS -o /dev/null -w '%{http_code}' --max-time 10 \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: c3VwYWJhc2UtdjA4MC1zbW9rZQ==' \
  -H "apikey: $ANON_KEY" \
  "http://127.0.0.1:18100/realtime/v1/websocket?apikey=$ANON_KEY&vsn=1.0.0" || true)
[ "$WS_CODE" = "101" ] || fail "Realtime WebSocket smoke failed (${WS_CODE:-000})"

COUNTS=$("$DOCKER" exec agit-rehearsal-db psql -U supabase_admin -d postgres -Atc \
  "SELECT count(*) FILTER (WHERE table_schema='public'), count(*) FILTER (WHERE table_schema='app'), count(*) FILTER (WHERE table_schema='samlink') FROM information_schema.tables WHERE table_type='BASE TABLE';")
[ -n "$COUNTS" ] || fail "restored schema count unavailable"

printf 'PASS %s target=self-hosted/v0.8.0 backup=%s schemas=%s\n' "$(date '+%F %T')" "$BACKUP_DAY" "$COUNTS" > "$STATUS"
log "PASS target=self-hosted/v0.8.0 backup=$BACKUP_DAY schemas=$COUNTS"
