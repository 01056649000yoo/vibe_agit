#!/bin/bash
# 도커 빌드 캐시를 기준을 넘을 때만 비운다.
#
# 왜 필요한가 (2026-09-02에 실제로 본 것):
#   맥 디스크는 93GB 여유인데 **도커 안쪽은 31.3GB 중 57%** 였다. 하루에 여러 앱을 다시 빌드하면
#   빌드 캐시만 9GB 넘게 쌓인다. 진짜 한도는 맥이 아니라 **도커 가상 디스크**인데
#   `preflight-disk.sh` 는 맥 쪽만 보고 있어 이 위험을 못 봤다.
#   도커 디스크가 차면 배포가 알 수 없는 오류로 죽고, DB 가 쓰기를 못 하기도 한다.
#
# 무엇을 지우나 — **빌드 캐시만** 지운다. 이미지·컨테이너·볼륨은 건드리지 않는다.
# 이미지는 되돌릴 수 없는 것이 섞여 있고(되돌림 지점 `rollback-*`), 되돌림 태그는
# `scripts/build-agit-app.sh` 가 최근 5개만 남기므로 여기서 또 손댈 이유가 없다.
#
#   1) **오래 안 쓴 빌드 캐시**: 기본 48시간. 언제나 지운다.
#      캐시는 쓰레기가 아니라 **다음 빌드를 빠르게 하는 재료**다. 그래서 통째로 비우지 않고
#      "이틀 넘게 아무 빌드도 손대지 않은 것"만 고른다. 최근 배포가 만든 캐시는 남으므로
#      배포가 느려지지 않으면서도 묵은 것은 이틀 안에 사라진다.
#
#   2) **기준을 넘을 때만**: 남은 캐시까지 통째로 비운다. 위 두 가지로도 못 막을 만큼
#      찼을 때의 안전망이다. 이때는 다음 배포가 `npm ci` 부터 다시 해서 몇 분 느려진다.
#
# 쓰는 법:
#   bash scripts/trim-docker-cache.sh            기본(사용률 60%·캐시 5GB·묵은 캐시 48시간)
#   bash scripts/trim-docker-cache.sh 70 8       사용률 70% 또는 캐시 8GB 넘을 때만
#   bash scripts/trim-docker-cache.sh 60 5 24h   묵은 캐시 기준을 하루로
set -uo pipefail

MAX_USE_PCT="${1:-60}"
MAX_CACHE_GB="${2:-5}"
STALE_AFTER="${3:-48h}"

command -v docker >/dev/null 2>&1 || { echo "도커가 없어 건너뜁니다."; exit 0; }
docker info >/dev/null 2>&1 || { echo "도커가 꺼져 있어 건너뜁니다."; exit 0; }

# 도커 가상 디스크 사용률 — 실행 중인 컨테이너 안에서 읽는다(추가 이미지를 받지 않는다).
read_use_pct() {
    local container
    container=$(docker ps --format '{{.Names}}' | head -1)
    [ -n "$container" ] || return 1
    docker exec "$container" df -P / 2>/dev/null | awk 'NR==2{gsub("%","",$5); print $5}'
}

cache_bytes() {
    docker system df --format '{{.Type}}\t{{.Size}}' 2>/dev/null \
        | awk -F'\t' '$1=="Build Cache"{print $2}' \
        | awk '{
            size=$0; unit=size; gsub(/[0-9.]/,"",unit); gsub(/[^0-9.]/,"",size);
            m=1; if (unit ~ /^kB/) m=1e3; else if (unit ~ /^MB/) m=1e6;
            else if (unit ~ /^GB/) m=1e9; else if (unit ~ /^TB/) m=1e12;
            printf "%d", size*m
        }'
}

# ── 1) 이틀 넘게 아무 빌드도 안 쓴 캐시 ───────────────────────────────────
# 최근 배포가 만든 캐시는 남긴다. 묵은 것만 고르므로 배포 속도를 해치지 않는다.
BEFORE_CACHE_B=$(cache_bytes); BEFORE_CACHE_B=${BEFORE_CACHE_B:-0}
if docker builder prune -f --filter "until=${STALE_AFTER}" >/dev/null 2>&1; then
    AFTER_STALE_B=$(cache_bytes); AFTER_STALE_B=${AFTER_STALE_B:-0}
    FREED_MB=$(( (BEFORE_CACHE_B - AFTER_STALE_B) / 1000000 ))
    [ "$FREED_MB" -gt 0 ] && echo "${STALE_AFTER} 넘게 안 쓴 빌드 캐시 ${FREED_MB}MB 를 지웠습니다."
fi

# ── 2) 기준을 넘을 때만 남은 캐시까지 통째로 ─────────────────────────────
USE_PCT=$(read_use_pct || echo "")
CACHE_B=$(cache_bytes)
CACHE_B=${CACHE_B:-0}
CACHE_GB=$((CACHE_B / 1000000000))
LIMIT_B=$((MAX_CACHE_GB * 1000000000))

echo "도커 디스크 사용률 ${USE_PCT:-?}% (기준 ${MAX_USE_PCT}%) · 빌드 캐시 ${CACHE_GB}GB (기준 ${MAX_CACHE_GB}GB)"

NEED_TRIM=0
[ -n "${USE_PCT:-}" ] && [ "$USE_PCT" -ge "$MAX_USE_PCT" ] && NEED_TRIM=1
[ "$CACHE_B" -ge "$LIMIT_B" ] && NEED_TRIM=1

if [ "$NEED_TRIM" -eq 0 ]; then
    echo "기준 안이라 그대로 둡니다."
    exit 0
fi

echo "기준을 넘어 빌드 캐시를 비웁니다(이미지·볼륨은 건드리지 않습니다)."
docker builder prune -a -f >/dev/null 2>&1 || { echo "⚠ 캐시 정리에 실패했습니다." >&2; exit 0; }

AFTER_PCT=$(read_use_pct || echo "")
echo "정리 완료 — 도커 디스크 사용률 ${USE_PCT:-?}% → ${AFTER_PCT:-?}%"
exit 0
