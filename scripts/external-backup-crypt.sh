#!/bin/bash
# 외장 SSD의 rclone crypt 사본을 생성·검증·집계하는 공용 진입점.
# 암호화 열쇠는 rclone.conf의 [agitssdcrypt]에만 있고 이 스크립트에는 없다.
set -euo pipefail

RCLONE="${RCLONE:-/opt/homebrew/bin/rclone}"
REMOTE="${EXTERNAL_BACKUP_REMOTE:-agitssdcrypt:}"
EXPECTED_FILES="${EXTERNAL_BACKUP_EXPECTED_FILES:-7}"

usage() {
  echo "usage: $0 sync|check|count [source-dir] YYYYMMDD" >&2
  exit 2
}

validate_day() {
  [[ "$1" =~ ^[0-9]{8}$ ]] || usage
}

ensure_remote() {
  "$RCLONE" listremotes 2>/dev/null | grep -Fxq "$REMOTE" \
    || { echo "외장 SSD 암호화 원격 없음: $REMOTE" >&2; exit 1; }
}

remote_count() {
  local day="$1"
  "$RCLONE" lsf --files-only "${REMOTE}${day}" 2>/dev/null | grep -c . | tr -d ' '
}

check_copy() {
  local source_dir="$1" day="$2" count
  [ -d "$source_dir" ] || { echo "원본 백업 디렉터리 없음" >&2; return 1; }
  count=$(remote_count "$day" || true)
  [ "${count:-0}" = "$EXPECTED_FILES" ] \
    || { echo "외장 SSD 암호화 사본 개수 불일치: ${count:-0}/${EXPECTED_FILES}" >&2; return 1; }
  "$RCLONE" cryptcheck "$source_dir" "${REMOTE}${day}" --one-way
}

mode="${1:-}"
case "$mode" in
  sync)
    [ "$#" -eq 3 ] || usage
    source_dir="$2"
    day="$3"
    validate_day "$day"
    ensure_remote
    "$RCLONE" copy "$source_dir" "${REMOTE}${day}" --transfers 6
    check_copy "$source_dir" "$day"
    "$RCLONE" delete "$REMOTE" --min-age 30d || true
    "$RCLONE" rmdirs "$REMOTE" --leave-root || true
    ;;
  check)
    [ "$#" -eq 3 ] || usage
    source_dir="$2"
    day="$3"
    validate_day "$day"
    ensure_remote
    check_copy "$source_dir" "$day"
    ;;
  count)
    [ "$#" -eq 2 ] || usage
    day="$2"
    validate_day "$day"
    ensure_remote
    remote_count "$day"
    ;;
  *)
    usage
    ;;
esac
