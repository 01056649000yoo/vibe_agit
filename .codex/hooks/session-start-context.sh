#!/usr/bin/env bash
# Codex SessionStart hook: 짧은 활성 컨텍스트만 developer context에 주입한다.
# 상세 규칙과 이력은 SESSION_CONTEXT.md의 문서 라우팅을 따라 필요할 때 읽는다.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
CONTEXT_FILE="$REPO_ROOT/SESSION_CONTEXT.md"

if [[ ! -r "$CONTEXT_FILE" ]]; then
  exit 0
fi

printf '%s\n' '=== SESSION_CONTEXT.md (짧은 활성 컨텍스트) ==='
sed -n '1,$p' "$CONTEXT_FILE"
