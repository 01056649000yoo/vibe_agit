#!/usr/bin/env bash
# SessionStart hook: AGENTS.md 전체 + WORKLOG.md 최신 항목 1개를 세션 컨텍스트에 강제로 주입한다.
# 목적: 사용자가 매번 "지침 읽어"라고 말 안 해도, 이 저장소의 작업 규칙과 직전 인수인계를
#       세션 시작 시 항상 확인하게 한다.
#
# [2026-08-10] `jq` 로 JSON 을 만들다가 **작업 PC 에 jq 가 없어 훅이 매번 죽고 있었다**
# (`jq: command not found`). 그래서 아무것도 주입되지 않았다.
# 새 환경마다 도구를 깔지 않아도 되도록, 이미 저장소가 쓰고 있는 Node 로 JSON 을 만든다.
#
# 실패해도 세션을 막지 않는다 — 필요한 것이 없으면 조용히 빠져나온다(exit 0).
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$REPO_ROOT" ] || exit 0
[ -r "$REPO_ROOT/AGENTS.md" ] && [ -r "$REPO_ROOT/WORKLOG.md" ] || exit 0
command -v node >/dev/null 2>&1 || exit 0

HOOK_REPO_ROOT="$REPO_ROOT" node -e '
const fs = require("fs");
const root = process.env.HOOK_REPO_ROOT;
const agents = fs.readFileSync(root + "/AGENTS.md", "utf8");
const worklog = fs.readFileSync(root + "/WORKLOG.md", "utf8");

// WORKLOG 는 최신이 맨 위다. 첫 "## " 부터 다음 "## " 직전까지가 최신 항목 1개.
const lines = worklog.split(/\r?\n/);
const start = lines.findIndex((l) => l.startsWith("## "));
let entry = "";
if (start >= 0) {
  const rest = lines.slice(start + 1);
  const next = rest.findIndex((l) => l.startsWith("## "));
  entry = [lines[start]].concat(next === -1 ? rest : rest.slice(0, next)).join("\n");
}

const context =
  "=== AGENTS.md (이 저장소의 작업 지침, 항상 준수) ===\n" + agents +
  "\n\n=== WORKLOG.md 최신 항목 (직전 세션 요약) ===\n" + entry +
  "\n\n(전체 ROADMAP.md·WORKLOG.md·ARCHITECTURE.md는 필요할 때 직접 Read할 것)";

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: context,
  },
}));
'
