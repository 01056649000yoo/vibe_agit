#!/bin/bash
# 맥미니 OpenClaw에 낮 시간 2시간 간격의 간단한 상태 보고를 선언한다.
set -euo pipefail

OPENCLAW="${OPENCLAW:-/opt/homebrew/bin/openclaw}"
REPO_ROOT="${REPO_ROOT:-/Users/seunghyeonmaegmini/vibe_agit}"
REPORT_SCRIPT="${REPO_ROOT}/scripts/report-service-health.sh"

if [ ! -x "$OPENCLAW" ]; then
    echo "OpenClaw 실행 파일을 찾지 못했습니다: $OPENCLAW" >&2
    exit 1
fi
if [ ! -x "$REPORT_SCRIPT" ]; then
    echo "상태 보고 스크립트를 실행할 수 없습니다: $REPORT_SCRIPT" >&2
    exit 1
fi

"$OPENCLAW" cron add \
    --name "아지트 낮 상태 보고" \
    --display-name "아지트 낮 상태 보고" \
    --description "08~18시 2시간 간격으로 서비스 지속 가능성과 핵심 상태·상세 화면 위치를 텔레그램에 전달" \
    --declaration-key "agit-daytime-health-report-v1" \
    --cron "0 8-18/2 * * *" \
    --tz "Asia/Seoul" \
    --exact \
    --command "$REPORT_SCRIPT" \
    --command-cwd "$REPO_ROOT" \
    --announce \
    --channel last \
    --output-max-bytes 512 \
    --no-output-timeout-seconds 90 \
    --timeout-seconds 120 \
    --json
