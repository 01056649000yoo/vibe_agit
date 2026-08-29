#!/bin/bash
# 기존 [agitcrypt]의 obscured crypt 열쇠를 노출하지 않고 외장 SSD용 원격을 만든다.
set -euo pipefail

RCLONE="${RCLONE:-/opt/homebrew/bin/rclone}"
RCLONE_CONFIG="${RCLONE_CONFIG:-$HOME/.config/rclone/rclone.conf}"
SOURCE_REMOTE="${SOURCE_CRYPT_REMOTE:-agitcrypt}"
DEST_REMOTE="${EXTERNAL_CRYPT_REMOTE:-agitssdcrypt}"
TARGET_DIR="${EXTERNAL_CRYPT_DIR:-/Volumes/SHmaegmini/agit-backups-encrypted}"

[ -f "$RCLONE_CONFIG" ] || { echo "rclone 설정 파일 없음" >&2; exit 1; }
[ -d /Volumes/SHmaegmini ] || { echo "외장 SSD가 마운트되지 않음" >&2; exit 1; }

if "$RCLONE" listremotes 2>/dev/null | grep -Fxq "${DEST_REMOTE}:"; then
  echo "${DEST_REMOTE}: 원격이 이미 있어 변경하지 않음"
  exit 0
fi

read_value() {
  local key="$1"
  awk -v wanted="[$SOURCE_REMOTE]" -v key="$key" '
    /^\[/ { active = ($0 == wanted); next }
    active && $0 ~ "^" key "[[:space:]]*=" {
      sub(/^[^=]*=[[:space:]]*/, "")
      print
      exit
    }
  ' "$RCLONE_CONFIG"
}

password=$(read_value password)
password2=$(read_value password2)
[ -n "$password" ] && [ -n "$password2" ] \
  || { echo "기존 crypt 열쇠를 읽지 못함" >&2; exit 1; }

mkdir -p "$TARGET_DIR"
chmod 700 "$TARGET_DIR"
"$RCLONE" config create "$DEST_REMOTE" crypt \
  remote "$TARGET_DIR" \
  filename_encryption standard \
  directory_name_encryption true \
  password "$password" \
  password2 "$password2" \
  --no-obscure --no-output
chmod 600 "$RCLONE_CONFIG"
"$RCLONE" lsd "${DEST_REMOTE}:" >/dev/null
echo "${DEST_REMOTE}: 외장 SSD 암호화 원격 준비 완료"
