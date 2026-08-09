#!/usr/bin/env bash
# Codex SessionStart hook: AGENTS.md 전체와 WORKLOG.md 최신 항목 1개를
# developer context에 다시 주입한다. Codex는 AGENTS.md를 원래 자동으로
# 읽지만, 명시적 재주입으로 resume/clear/compact 뒤에도 핵심 지침을 복원한다.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
AGENTS_FILE="$REPO_ROOT/AGENTS.md"
WORKLOG_FILE="$REPO_ROOT/WORKLOG.md"

if [[ ! -r "$AGENTS_FILE" || ! -r "$WORKLOG_FILE" ]]; then
  exit 0
fi

printf '%s\n' '=== AGENTS.md (이 저장소의 작업 지침, 항상 준수) ==='
sed -n '1,$p' "$AGENTS_FILE"
printf '\n%s\n' '=== WORKLOG.md 최신 항목 (직전 세션 요약) ==='
awk '
  /^## / {
    if (found) exit
    found = 1
  }
  found { print }
' "$WORKLOG_FILE"
printf '\n%s\n' '(ROADMAP.md·WORKLOG.md·ARCHITECTURE.md 전체 내용은 작업 범위에 맞춰 직접 확인할 것)'
