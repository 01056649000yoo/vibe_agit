#!/bin/bash
# 맥미니 OpenClaw에 낮 시간 2시간 간격의 간단한 상태 보고를 선언한다.
set -euo pipefail

OPENCLAW="${OPENCLAW:-/opt/homebrew/bin/openclaw}"
REPO_ROOT="${REPO_ROOT:-/Users/seunghyeonmaegmini/vibe_agit}"
REPORT_SCRIPT="${REPO_ROOT}/scripts/report-service-health.sh"
SQLITE3="${SQLITE3:-/usr/bin/sqlite3}"
OPENCLAW_STATE_DB="${OPENCLAW_STATE_DB:-/Users/seunghyeonmaegmini/.openclaw/state/openclaw.sqlite}"
TELEGRAM_TARGET="${TELEGRAM_TARGET:-}"

if [ ! -x "$OPENCLAW" ]; then
    echo "OpenClaw 실행 파일을 찾지 못했습니다: $OPENCLAW" >&2
    exit 1
fi
if [ ! -x "$REPORT_SCRIPT" ]; then
    echo "상태 보고 스크립트를 실행할 수 없습니다: $REPORT_SCRIPT" >&2
    exit 1
fi

# 수신자 ID는 저장소에 넣지 않는다. 명시하지 않았으면 OpenClaw가 이미 승인한
# Telegram DM 대상이 정확히 하나일 때만 그 값을 재사용한다.
if [ -z "$TELEGRAM_TARGET" ]; then
    if [ ! -x "$SQLITE3" ] || [ ! -r "$OPENCLAW_STATE_DB" ]; then
        echo "TELEGRAM_TARGET을 지정하거나 OpenClaw 상태 DB를 확인해 주세요." >&2
        exit 1
    fi
    telegram_targets="$($SQLITE3 "$OPENCLAW_STATE_DB" \
        "SELECT entry FROM channel_pairing_allow_entries WHERE channel_key = 'telegram' ORDER BY sort_order, entry;")"
    target_count="$(printf '%s\n' "$telegram_targets" | awk 'NF { count += 1 } END { print count + 0 }')"
    if [ "$target_count" -ne 1 ]; then
        echo "승인된 Telegram DM 대상이 ${target_count}개입니다. TELEGRAM_TARGET을 명시해 주세요." >&2
        exit 1
    fi
    TELEGRAM_TARGET="$(printf '%s\n' "$telegram_targets" | awk 'NF { print; exit }')"
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
    --channel telegram \
    --to "$TELEGRAM_TARGET" \
    --output-max-bytes 512 \
    --no-output-timeout-seconds 90 \
    --timeout-seconds 120 \
    --json
