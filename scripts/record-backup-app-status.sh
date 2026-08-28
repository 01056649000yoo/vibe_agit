#!/bin/bash
# 호스트 백업·복구 스크립트가 실행별 앱 상태만 기록한다.
# 원문 로그·파일 경로·시크릿은 받거나 저장하지 않는다.
set -uo pipefail

DOCKER=/Applications/Docker.app/Contents/Resources/bin/docker

if [ "$#" -ne 7 ]; then
  echo "usage: $0 RUN_KEY APP STATUS DB_OK FILES_OK OBJECT_COUNT DETAIL" >&2
  exit 2
fi

RUN_KEY="$1"
APP_KEY="$2"
STATUS="$3"
DB_OK="$4"
FILES_OK="$5"
OBJECT_COUNT="$6"
DETAIL_CODE="${7:-}"

case "$RUN_KEY" in *[!a-zA-Z0-9_-]*|'') exit 2 ;; esac
case "$APP_KEY" in agit|samlink|jarvis) ;; *) exit 2 ;; esac
case "$STATUS" in PASS|FAIL) ;; *) exit 2 ;; esac
for FLAG in "$DB_OK" "$FILES_OK"; do
  case "$FLAG" in true|false|null) ;; *) exit 2 ;; esac
done
case "$OBJECT_COUNT" in null) ;; ''|*[!0-9]*) exit 2 ;; esac
case "$DETAIL_CODE" in *[!a-z0-9_,:-]*) exit 2 ;; esac
[ "${#DETAIL_CODE}" -le 120 ] || exit 2

$DOCKER exec -i agit-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  -v run_key="$RUN_KEY" \
  -v app_key="$APP_KEY" \
  -v status="$STATUS" \
  -v db_ok="$DB_OK" \
  -v files_ok="$FILES_OK" \
  -v object_count="$OBJECT_COUNT" \
  -v detail_code="$DETAIL_CODE" >/dev/null <<'SQL'
INSERT INTO public.system_backup_app_results (
  run_key, app_key, status, db_ok, files_ok, object_count, detail_code, checked_at
)
VALUES (
  :'run_key', :'app_key', :'status',
  NULLIF(:'db_ok', 'null')::boolean,
  NULLIF(:'files_ok', 'null')::boolean,
  NULLIF(:'object_count', 'null')::integer,
  :'detail_code', NOW()
)
ON CONFLICT (run_key, app_key) DO UPDATE SET
  status = EXCLUDED.status,
  db_ok = EXCLUDED.db_ok,
  files_ok = EXCLUDED.files_ok,
  object_count = EXCLUDED.object_count,
  detail_code = EXCLUDED.detail_code,
  checked_at = NOW();
SQL
