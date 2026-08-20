#!/bin/bash
# 호스트 백업 스크립트가 관리자 대시보드용 안전한 상태만 기록한다.
# 원문 로그·파일 경로·시크릿은 받거나 저장하지 않는다.
set -uo pipefail

DOCKER=/Applications/Docker.app/Contents/Resources/bin/docker

if [ "$#" -ne 14 ]; then
  echo "usage: $0 JOB STATUS RUN_KEY DAY STARTED FINISHED LOCAL DRIVE EXTERNAL ARTIFACTS AGIT_TABLES LAB_TABLES STORAGE_FILES DETAIL" >&2
  exit 2
fi

JOB_TYPE="$1"
STATUS="$2"
RUN_KEY="$3"
BACKUP_DAY="$4"
STARTED_AT="$5"
FINISHED_AT="$6"
LOCAL_OK="$7"
DRIVE_OK="$8"
EXTERNAL_OK="$9"
ARTIFACT_COUNT="${10}"
AGIT_TABLE_COUNT="${11}"
LAB_TABLE_COUNT="${12}"
STORAGE_FILE_COUNT="${13}"
DETAIL_CODE="${14:-}"

case "$JOB_TYPE" in daily|restore) ;; *) exit 2 ;; esac
case "$STATUS" in RUNNING|PASS|FAIL) ;; *) exit 2 ;; esac
case "$RUN_KEY" in *[!a-zA-Z0-9_-]*|'') exit 2 ;; esac
case "$BACKUP_DAY" in ????-??-??) ;; *) exit 2 ;; esac
for FLAG in "$LOCAL_OK" "$DRIVE_OK" "$EXTERNAL_OK"; do
  case "$FLAG" in true|false|null) ;; *) exit 2 ;; esac
done
for COUNT_VALUE in "$ARTIFACT_COUNT" "$AGIT_TABLE_COUNT" "$LAB_TABLE_COUNT" "$STORAGE_FILE_COUNT"; do
  case "$COUNT_VALUE" in null|''|*[!0-9]*) [ "$COUNT_VALUE" = "null" ] || exit 2 ;; esac
done
case "$DETAIL_CODE" in *[!a-z0-9_,:-]*) exit 2 ;; esac
[ "${#DETAIL_CODE}" -le 120 ] || exit 2

$DOCKER exec -i agit-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  -v run_key="$RUN_KEY" \
  -v job_type="$JOB_TYPE" \
  -v status="$STATUS" \
  -v backup_day="$BACKUP_DAY" \
  -v started_at="$STARTED_AT" \
  -v finished_at="$FINISHED_AT" \
  -v local_ok="$LOCAL_OK" \
  -v drive_ok="$DRIVE_OK" \
  -v external_ok="$EXTERNAL_OK" \
  -v artifact_count="$ARTIFACT_COUNT" \
  -v agit_table_count="$AGIT_TABLE_COUNT" \
  -v lab_table_count="$LAB_TABLE_COUNT" \
  -v storage_file_count="$STORAGE_FILE_COUNT" \
  -v detail_code="$DETAIL_CODE" >/dev/null <<'SQL'
INSERT INTO public.system_backup_runs (
  run_key, job_type, status, backup_day, started_at, finished_at,
  local_ok, drive_ok, external_ok, artifact_count,
  agit_table_count, lab_table_count, storage_file_count, detail_code, updated_at
)
VALUES (
  :'run_key', :'job_type', :'status', :'backup_day'::date, :'started_at'::timestamptz,
  NULLIF(:'finished_at', '')::timestamptz,
  NULLIF(:'local_ok', 'null')::boolean,
  NULLIF(:'drive_ok', 'null')::boolean,
  NULLIF(:'external_ok', 'null')::boolean,
  NULLIF(:'artifact_count', 'null')::smallint,
  NULLIF(:'agit_table_count', 'null')::integer,
  NULLIF(:'lab_table_count', 'null')::integer,
  NULLIF(:'storage_file_count', 'null')::integer,
  :'detail_code', NOW()
)
ON CONFLICT (run_key) DO UPDATE SET
  status = EXCLUDED.status,
  finished_at = EXCLUDED.finished_at,
  local_ok = EXCLUDED.local_ok,
  drive_ok = EXCLUDED.drive_ok,
  external_ok = EXCLUDED.external_ok,
  artifact_count = EXCLUDED.artifact_count,
  agit_table_count = EXCLUDED.agit_table_count,
  lab_table_count = EXCLUDED.lab_table_count,
  storage_file_count = EXCLUDED.storage_file_count,
  detail_code = EXCLUDED.detail_code,
  updated_at = NOW();
SQL
