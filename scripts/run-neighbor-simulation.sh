#!/bin/sh
# 모두의 아지트 전체 흐름 시뮬레이션. 가상 교사·학급·학생을 만들어 실제 RPC 를 실제 역할로 부르고,
# 결과를 표로 보여 준 뒤 **모두 되돌린다(ROLLBACK)**. 운영 DB 에 아무것도 남지 않는다.
#   npm run simulate:neighbor-agit
set -e
cd "$(dirname "$0")/.."
{
  echo "BEGIN;"
  cat tests/sql/neighbor_agit_simulation.sql
  echo "ROLLBACK;"
} | docker exec -i agit-db psql -U "${AGIT_DB_USER:-supabase_admin}" -d postgres -q -v ON_ERROR_STOP=0 2>&1 \
  | grep -v '^NOTICE\|^CONTEXT\|^LINE\|^ *\^\|^$'
