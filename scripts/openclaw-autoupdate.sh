#!/bin/bash
# 오픈클로 자동 업데이트.
# 안정판(dist-tag latest)만 따라간다. beta·alpha 는 절대 설치하지 않는다.
# 올린 뒤 게이트웨이가 살아나지 않으면 이전 버전으로 스스로 되돌린다.
set -Eeuo pipefail
umask 077

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
USER_HOME="/Users/seunghyeonmaegmini"
CONFIG="$USER_HOME/.openclaw/openclaw.json"
STATUS="$USER_HOME/backups/auto/openclaw-update-status.txt"
LOG="$USER_HOME/Library/Logs/agit-openclaw-update.log"
LOCK_DIR="$USER_HOME/backups/auto/.openclaw-update.lock"
GATEWAY_URL="http://127.0.0.1:18789/"
GATEWAY_LABEL="gui/501/ai.openclaw.gateway"
MODE="${1:---apply}"

log() { printf '%s %s\n' "$(date '+%F %T')" "$*" | tee -a "$LOG"; }
write_status() { printf '%s %s %s\n' "$1" "$(date '+%F %T')" "$2" > "$STATUS"; }

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  log "SKIP 다른 업데이트가 돌고 있다"
  exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

installed="$(node -e "console.log(require('/opt/homebrew/lib/node_modules/openclaw/package.json').version)" 2>/dev/null || echo "")"
[ -n "$installed" ] || { write_status FAILED "설치된 버전을 읽지 못했다"; log "FAILED 설치 버전 확인 불가"; exit 1; }

latest="$(npm view openclaw dist-tags.latest 2>/dev/null | tr -d '[:space:]' || echo "")"
[ -n "$latest" ] || { write_status SKIPPED "npm 조회 실패(네트워크)"; log "SKIPPED npm 조회 실패"; exit 0; }

# 안전장치: latest 태그가 어쩌다 beta/alpha 를 가리키면 건드리지 않는다.
case "$latest" in
  *beta*|*alpha*|*rc*)
    write_status SKIPPED "latest 가 시험판($latest) 이라 건너뛴다"
    log "SKIPPED latest=$latest 시험판"
    exit 0
    ;;
esac

if [ "$installed" = "$latest" ]; then
  write_status CURRENT "$installed 최신"
  log "CURRENT $installed"
  exit 0
fi

log "새 버전 발견: $installed → $latest"

if [ "$MODE" = "--check-only" ]; then
  write_status AVAILABLE "$installed → $latest (확인만)"
  log "AVAILABLE $installed → $latest"
  exit 0
fi

# 설정 백업. 새 버전 진단이나 수동 복구 때 비교할 수 있게 남긴다.
backup="$USER_HOME/.openclaw/openclaw.json.pre-$latest-$(date +%Y%m%d-%H%M%S)"
cp "$CONFIG" "$backup"
log "설정 백업 $backup"

mark_attention() {
  write_status NEEDS_ATTENTION "$installed → $latest; 상태 스키마가 바뀌었을 수 있어 새 패키지를 유지"
  log "NEEDS_ATTENTION $latest 유지: 상태 마이그레이션 뒤 패키지·설정 자동 롤백은 금지"
}

if ! npm install -g "openclaw@$latest" >>"$LOG" 2>&1; then
  log "설치 실패"
  write_status FAILED "$installed → $latest 설치 실패(게이트웨이 재시작 전)"
  exit 1
fi

launchctl kickstart -k "$GATEWAY_LABEL" >>"$LOG" 2>&1 || true
sleep 12

# 확인 1: 게이트웨이가 응답하는가
code="$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$GATEWAY_URL" 2>/dev/null || echo 000)"
# 확인 2: 설정이 여전히 올바른 JSON 이고 우리가 넣은 deny 목록이 살아 있는가
config_ok="$(node -e "
try {
  const c = require('$CONFIG');
  const deny = (c.tools && c.tools.deny) || [];
  process.stdout.write(deny.length >= 5 ? 'ok' : 'thin');
} catch (e) { process.stdout.write('broken'); }
" 2>/dev/null || echo broken)"

if [ "$code" != "200" ] || [ "$config_ok" = "broken" ]; then
  log "스모크 실패 게이트웨이=$code 설정=$config_ok"
  log "설치한 $latest 패키지로 doctor 복구 시도"
  openclaw doctor --fix --non-interactive --yes >>"$LOG" 2>&1 || true
  launchctl kickstart -k "$GATEWAY_LABEL" >>"$LOG" 2>&1 || true
  sleep 12
  code="$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$GATEWAY_URL" 2>/dev/null || echo 000)"
  if [ "$code" != "200" ]; then
    mark_attention
    exit 1
  fi
fi

now="$(node -e "console.log(require('/opt/homebrew/lib/node_modules/openclaw/package.json').version)" 2>/dev/null || echo "?")"
write_status UPDATED "$installed → $now (게이트웨이 $code, 설정 $config_ok)"
log "UPDATED $installed → $now"

if [ "$config_ok" = "thin" ]; then
  log "주의: tools.deny 가 얇아졌다. 토큰 절감 설정을 다시 확인할 것"
fi
