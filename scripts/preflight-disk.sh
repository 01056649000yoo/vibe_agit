#!/bin/bash
# 배포 전 디스크 점검 — 공간이 없으면 **빌드를 시작하지 않는다.**
#
# 2026-08-18에 호스트 디스크가 100% 찬 상태로 `docker build` 가 돌다가 도커 데몬이 통째로 물렸고,
# `docker rm -f agit-app` 은 끝났는데 이어지는 `docker run` 이 완료되지 못해 앱이 내려갔다.
# 공간이 없을 때 가장 위험한 순간은 **옛 컨테이너를 지운 뒤 새 컨테이너를 못 띄우는 사이**다.
# 그래서 막을 지점은 빌드가 아니라 그 앞이다.
#
# 쓰는 법:  bash scripts/preflight-disk.sh          (기본 기준 10GB)
#          bash scripts/preflight-disk.sh 20        (20GB 이상일 때만 통과)
set -uo pipefail

MIN_GB="${1:-10}"
VOL="/System/Volumes/Data"
[ -d "$VOL" ] || VOL="/"          # 리눅스 러너에서도 돌게 둔다

# ── 도커 쪽 먼저 본다 (2026-09-02 추가) ─────────────────────────────────────
# 왜: 이 맥에서 **도커 데이터는 외장 SSD 위 32GB 상한 파일** 안에 있다. 맥 내장 디스크가
# 93GB 남아 있어도 도커 안쪽은 꽉 찰 수 있고, 실제로 하루치 빌드로 57%까지 갔다.
# 그러니 아래 맥 디스크 검사만으로는 위험을 못 본다. 기준을 넘으면 빌드 캐시만 비운다.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$SCRIPT_DIR/trim-docker-cache.sh" || true

DOCKER_USE=""
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    RUNNING=$(docker ps --format '{{.Names}}' | head -1)
    [ -n "$RUNNING" ] && DOCKER_USE=$(docker exec "$RUNNING" df -P / 2>/dev/null | awk 'NR==2{gsub("%","",$5); print $5}')
fi
if [ -n "${DOCKER_USE:-}" ] && [ "$DOCKER_USE" -ge 90 ]; then
    cat >&2 <<MSG

✗ 배포를 중단합니다 — 캐시를 비운 뒤에도 **도커 디스크가 ${DOCKER_USE}%** 입니다.

  도커 데이터는 외장 SSD 위 32GB 상한 파일 안에 있습니다. 여기가 차면 빌드가 알 수 없는 오류로
  죽고 DB 가 쓰기를 못 합니다. 쓰지 않는 이미지를 먼저 정리하세요(캐시는 이미 비었습니다):

    docker images        # 무엇이 있는지 보고
    docker image prune   # 떠도는 것부터
    docker system df

MSG
    exit 1
fi


FREE_MB=$(df -m "$VOL" 2>/dev/null | awk 'NR==2{print $4}')
if [ -z "${FREE_MB:-}" ]; then
    echo "⚠ 디스크 여유를 읽지 못했습니다 — 점검을 건너뜁니다." >&2
    exit 0
fi
FREE_GB=$((FREE_MB / 1024))
MIN_MB=$((MIN_GB * 1024))

# inode(파일 개수)도 본다. 2026-08-18에는 용량보다 파일 1,036만 개가 더 위험했다.
IUSE=$(df -i "$VOL" 2>/dev/null | awk 'NR==2{print $8}' | tr -d '%')

echo "디스크 여유 ${FREE_GB}GB (기준 ${MIN_GB}GB) · inode 사용 ${IUSE:-?}%"

if [ "$FREE_MB" -lt "$MIN_MB" ]; then
    cat >&2 <<MSG

✗ 배포를 중단합니다 — 디스크 여유가 ${FREE_GB}GB 뿐입니다(기준 ${MIN_GB}GB).

  공간이 없는 채로 빌드하면 도커 데몬이 물려 **앱이 내려간 채 복구가 안 됩니다.**
  아래를 먼저 비우고 다시 시도하세요(전부 캐시라 기능에 영향 없음):

    docker builder prune -a -f
    rm -rf "\$(getconf DARWIN_USER_TEMP_DIR)node-compile-cache"
    du -sh ~/Library/Application\\ Support/* | sort -rh | head -5

MSG
    exit 1
fi

if [ -n "${IUSE:-}" ] && [ "$IUSE" -ge 80 ]; then
    echo "⚠ inode 사용률 ${IUSE}% — 용량은 남았지만 파일 개수가 많습니다. 캐시를 확인하세요." >&2
fi
exit 0
