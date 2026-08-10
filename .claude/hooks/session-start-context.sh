#!/usr/bin/env bash
# SessionStart hook: 공용 SESSION_CONTEXT.md만 세션 컨텍스트에 주입한다.
# 상세 규칙과 이력은 문서 안의 LLM 위키 라우팅을 따라 필요할 때 읽는다.
#
# [2026-08-10] `jq` 로 JSON 을 만들다가 **작업 PC 에 jq 가 없어 훅이 매번 죽고 있었다**
# (`jq: command not found`). 그래서 아무것도 주입되지 않았다.
# 새 환경마다 도구를 깔지 않아도 되도록, 이미 저장소가 쓰고 있는 Node 로 JSON 을 만든다.
#
# 실패해도 세션을 막지 않는다 — 필요한 것이 없으면 조용히 빠져나온다(exit 0).
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$REPO_ROOT" ] || exit 0
[ -r "$REPO_ROOT/SESSION_CONTEXT.md" ] || exit 0
command -v node >/dev/null 2>&1 || exit 0

HOOK_REPO_ROOT="$REPO_ROOT" node -e '
const fs = require("fs");
const root = process.env.HOOK_REPO_ROOT;
const context =
  "=== SESSION_CONTEXT.md (짧은 활성 컨텍스트) ===\n" +
  fs.readFileSync(root + "/SESSION_CONTEXT.md", "utf8");

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: context,
  },
}));
'
