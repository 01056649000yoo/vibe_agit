#!/usr/bin/env bash
# SessionStart hook: AGENTS.md 전체 + WORKLOG.md 최신 항목 1개를 세션 컨텍스트에 강제로 주입한다.
# 목적: 사용자가 매번 "지침 읽어"라고 말 안 해도, 이 저장소의 작업 규칙을 세션 시작 시 항상 확인하게 한다.
set -euo pipefail
cd "$(dirname "$0")/../.."

AGENTS_CONTENT="$(cat AGENTS.md)"
LATEST_WORKLOG_ENTRY="$(awk '/^## /{c++} c==1' WORKLOG.md)"

jq -n \
  --arg agents "$AGENTS_CONTENT" \
  --arg worklog "$LATEST_WORKLOG_ENTRY" \
  '{
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: (
        "=== AGENTS.md (이 저장소의 작업 지침, 항상 준수) ===\n" + $agents +
        "\n\n=== WORKLOG.md 최신 항목 (직전 세션 요약) ===\n" + $worklog +
        "\n\n(전체 ROADMAP.md·WORKLOG.md·ARCHITECTURE.md는 필요할 때 직접 Read할 것)"
      )
    }
  }'
