#!/bin/sh
# 모두의 아지트 전체 흐름 시뮬레이션. 가상 교사·학급·학생을 만들어 실제 RPC 를 실제 역할로 부르고,
# 결과를 표로 보여 준 뒤 **모두 되돌린다(ROLLBACK)**. 운영 DB 에 아무것도 남지 않는다.
#   npm run simulate:neighbor-agit
# SQL 오류가 나거나 결과표에 실패가 하나라도 있으면 0 이 아닌 코드로 끝난다(예전에는 파이프 때문에 늘 0 이었다).
set -e
cd "$(dirname "$0")/.."
log=$(mktemp)
trap 'rm -f "$log"' EXIT
status=0
{
  echo "BEGIN;"
  cat tests/sql/neighbor_agit_simulation.sql
  echo "ROLLBACK;"
} | docker exec -i agit-db psql -U "${AGIT_DB_USER:-supabase_admin}" -d postgres -q -v ON_ERROR_STOP=1 >"$log" 2>&1 || status=$?
grep -v '^NOTICE\|^CONTEXT\|^LINE\|^ *\^\|^$' "$log" || true
if [ "$status" -ne 0 ] || grep -q '^ERROR' "$log"; then
  echo "시뮬레이션 SQL 오류로 중단됐습니다(종료 코드 $status)." >&2
  exit 1
fi
if grep -Eq '^ +[0-9]+ \| 실패 ' "$log"; then
  echo "시뮬레이션에 실패한 단계가 있습니다." >&2
  exit 1
fi
