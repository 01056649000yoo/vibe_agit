#!/usr/bin/env bash
# SessionStart hook: 코드 지도(Graphify)를 최신으로 만들어 둔다 — 세션을 막지 않게 **백그라운드**로, 출력은 없다(컨텍스트 토큰 0).
# 지도가 신선하면 몇십 ms 안에 끝나고, 낡았으면 4~6초 걸려도 세션은 기다리지 않는다.
# 도구가 없거나 실패해도 조용히 빠져나온다(exit 0). 설명: docs/wiki/CODE_MAP.md
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$REPO_ROOT" ] && [ -r "$REPO_ROOT/scripts/code-map.mjs" ] || exit 0
command -v node >/dev/null 2>&1 || exit 0
( cd "$REPO_ROOT" && nohup node scripts/code-map.mjs update --quiet >/dev/null 2>&1 & ) >/dev/null 2>&1
exit 0
